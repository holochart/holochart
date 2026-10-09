/**
 * `graph` renderer (backlog G1–G4, ADR-029). A trace draws two batches whatever its size: every
 * link in one line primitive and every node in one instanced marker set, nodes above links. The
 * others exist only when asked for:
 *
 * - the arrowheads (a second marker set of rotated arrow symbols, between the links and the
 *   nodes);
 * - the boxes of `node.shape: 'box'` (one rect primitive, in place of the node markers);
 * - the labels (one batched text primitive, on top), with the titles of frames and guide lines;
 * - the secondary links (`link.secondary`: the links a layered layout turned around, the links
 *   of a tree arrangement that are not tree edges), a second line primitive, because a line has
 *   one dash;
 * - the frames a layout put around groups (`LayoutResult.clusters`): one rect each under the
 *   links, tinted in its group's color, with the group's name in the strip the layout kept for it;
 * - the guide lines of an arrangement (the axes of a hive plot), under everything;
 * - a ring around every collapsed node of a tree (a marker set; a collapsed box has a frame).
 *
 * Everything is stored in the linear coordinates of the trace's axes, so a pan or a zoom sets
 * the transform and uploads nothing. What is sized in pixels follows the zoom separately:
 *
 * - Links with arrowheads, loops or routes that end on node outlines are rebuilt when the scale
 *   changes (the arrow tips sit on the node outlines, which are px), curved links when the aspect
 *   of the two axis scales changes; straight links never are (`geometryStale`).
 * - Box nodes are rects in linear coordinates, resized when the scale changes. Under a computed
 *   arrangement they shrink with the axes below one px per layout unit, text and all, so that a
 *   diagram larger than the plot area is drawn smaller instead of with its boxes run together
 *   (`nodeScaleOf`).
 * - Labels are culled again when the scale changes, and on a large graph also when a pan leaves
 *   the margin the last pass covered.
 *
 * Not all of this is done on every frame of a zoom. On a large graph (more than {@link LARGE}
 * nodes or links) it all runs once the zoom has been still for {@link SETTLE_MS}; until then the
 * primitives keep the geometry of the previous scale under the new transform. Labels wait for
 * the zoom to settle from {@link LABELS_SETTLE_MIN} nodes up: placing and typesetting a few
 * hundred labels takes most of a frame, and a label drawn where it was placed a moment ago is
 * still on its node.
 *
 * ## What moves
 *
 * The view draws a **frame** of its calc (`frame.ts`): at rest the calc's own positions, and
 * while something moves the positions of that moment. Two things move, each on its own
 * `requestAnimationFrame` chain that ends by itself and is cancelled in `dispose`; every frame
 * ends in `ctx.invalidate()` (ADR-007):
 *
 * - `force.simulate`: the force layout settling (`simulate.ts`);
 * - a tree folding or unfolding after a click on a node that has children (`tween.ts`). The click
 *   restyles `tree.collapsed` like any change made on the chart (`{ gui: true }`: `uirevision`
 *   keeps it, `restyle` is emitted), and the calc that comes back is tweened to from what was on
 *   screen. Other changes of `tree.collapsed` snap.
 *
 * Neither runs without motion (`config.a11y.reducedMotion`, else `prefers-reduced-motion`), nor on
 * a static plot (`config.staticPlot`: an image export shows where things end up). While one runs,
 * links and nodes are redrawn every frame; labels follow up to {@link LABELS_MOVING_MAX} nodes
 * and are hidden above, until the picture is at rest.
 *
 * ## What is still to come (G7)
 *
 * A calc may wait for its layout, which runs off the main thread, or for the routes of its
 * bundled links (`GraphCalc.pending`, `pending.ts`). The view draws what the calc has, asks for
 * the rest and has calc run again when it arrives (`#stream`, `stream.ts`); a `force` layout is
 * drawn while it settles, from the positions the worker reports, which is a third thing that
 * moves. The chart is not "ready" meanwhile ({@link PendingLayout}). The frames of a stream are
 * in the calc's frame like any other, so hover and selection answer for what is on screen; nodes
 * are not dragged until the layout is there (`dragKind`: the calc has no `force` yet).
 *
 * ## Level of detail (G7)
 *
 * On a large graph (`lod`, `lod.ts`) the view draws less while the graph is small on screen:
 * no labels and no arrowheads below a zoom, smaller nodes without outlines where they are dense,
 * fainter links where they cover the plot. `#resolveLod` measures the frame shown at the current
 * zoom before anything is drawn and publishes the result (`setLod`), which the node styles, the
 * link geometry (`links.ts`), the labels and hover (`hover.ts`) read; `#follow` applies a change
 * that a zoom brings, with the rest of what follows the zoom. An emphasis is spared the fading:
 * what a hover highlights is drawn in full (`#linkOpacity`, `#colorsOf`).
 *
 * ## What the pointer does (G5)
 *
 * Highlighting and node dragging live in `interact.ts` (`#interaction`), which the view calls at
 * a few places, each a hook of a line or two:
 *
 * - `handlePointer` offers it every event first (a press on a node that drags is taken there);
 * - `#animate` tells it of a new context before anything is drawn (`arrive`, then `settle`), and
 *   `update` of what was drawn (`seen`): a release of a node changes the figure, and the view
 *   glides to the calc that comes back instead of jumping there;
 * - the frames of the simulation pass through it (`through`, `rest`) for the same reason;
 * - everything that is styled asks it for the emphasis (`#emphasis`: the nodes and links a hover
 *   or a path keeps in full, `highlight.ts`), and `#highlight` applies the styles again when it
 *   changes: colors and opacities only. The labels that are drawn stay, dimmed like their
 *   nodes, and those of the emphasized nodes that culling had left out are added;
 * - `#syncRings` rings the pinned nodes with the collapsed ones.
 *
 * What it asks back is drawn with `#showMoving`, like any frame.
 */
import { reducedMotion, toRGBA, type FullTrace, type RGBAColor } from '@mk7s/holochart-core';
import {
  createMarkers,
  createRectPrimitive,
  createTextPrimitive,
  LinePrimitive,
  measureText,
  type ColorInput,
  type DataTransform,
  type MarkerSet,
  type Primitive,
  type RectPrimitive,
  type TextLabel,
  type TextPrimitive,
} from '@mk7s/holochart-render';
import {
  getChart,
  type Chart,
  type ComponentPointerEvent,
  type TracePlotContext,
  type TraceRenderer,
  type TraceUpdatePlan,
  type TraceView,
} from '@mk7s/holochart-runtime';
import { labelContent, measureLabel, traceRenderOrder } from '@mk7s/holochart-traces-basic';
import { Object3D } from 'three';
import { GUIDE_TITLE_GAP, type GraphCalc } from './calc.ts';
import { pinnedNodes } from './drag.ts';
import { frameOf, nodeScaleOf, showFrame, type GraphFrame } from './frame.ts';
import { splitGeometry, type LinkGeometry } from './geometry.ts';
import { EMPHASIS_LABELS_MAX, emphasizedOrder, type Emphasis } from './highlight.ts';
import { nodeAt } from './hover.ts';
import { GraphInteraction } from './interact.ts';
import { cullLabels, LABEL_GAP, labelPriority, nodePlacements } from './labels.ts';
import { currentLinks, drawnLinks, type DrawnLinks } from './links.ts';
import {
  FULL_LOD,
  LOD,
  lodApplies,
  lodMeasures,
  lodMode,
  lodOf,
  lodStats,
  nextLod,
  sameLod,
  setLod,
  type GraphLod,
  type LodStats,
} from './lod.ts';
import { LABEL_LINE_HEIGHT, labelFont, nodeLabel } from './model.ts';
import { collapseToggle, RING_REACH } from './options.ts';
import { loadLayoutCode, movingRoutes } from './pending.ts';
import { ForceAnimation } from './simulate.ts';
import { LayoutStream } from './stream.ts';
import {
  arrowColors,
  colorAt,
  contrastColor,
  groupColors,
  linkColors,
  linkLineStyle,
  linkVertexColors,
  linkWidths,
  nodeBoxStyle,
  nodeFillColors,
  nodeMarkerStyle,
  nodeOpacities,
  part,
  RING_WIDTH,
  ringColor,
  secondaryDash,
  selectionMask,
  traceOpacity,
} from './style.ts';
import { throughTransform, treeTween, type TweenEnd } from './tween.ts';

/** Draw order inside the trace (added to the trace's render order). */
const LAYER = {
  guides: 0.02,
  frames: 0.05,
  links: 0.1,
  secondary: 0.12,
  arrows: 0.2,
  rings: 0.28,
  nodes: 0.3,
  text: 0.4,
} as const;

/** Above this many nodes or links, work that follows the zoom waits for the zoom to settle. */
export const LARGE = 20_000;
/** How long a zoom must be still before a large graph is brought up to date, in ms. */
export const SETTLE_MS = 80;
/** From this many nodes up, labels are placed again only once a zoom has settled. */
export const LABELS_SETTLE_MIN = 500;
/** Up to this many nodes every label is a candidate; above, only those in the view. */
const CULL_ALL_MAX = 3000;
/** Corner radius of box nodes, in px. */
const BOX_RADIUS = 4;
/** The color of a frame whose group has none. */
const FRAME_COLOR: RGBAColor = [0.5, 0.5, 0.5, 1];
/** Where a frame's title starts from its top left corner, in px. */
const FRAME_TITLE_INSET: readonly [number, number] = [8, 4];
/** Opacity of the guide lines and of the titles of frames and guides, on the text color. */
const GUIDE_OPACITY = 0.35;
const TITLE_OPACITY = 0.8;
/** How long a tree takes to fold or unfold, in ms. */
export const FOLD_MS = 500;
/** Text smaller than this is not drawn, in px (the boxes of a diagram drawn much smaller). */
const MIN_TEXT = 3;
/** Up to this many nodes the labels follow the nodes while they move; above, they wait. */
export const LABELS_MOVING_MAX = 150;

type Ctx = TracePlotContext<GraphCalc>;
type Transform = { scaleX: number; scaleY: number; offsetX: number; offsetY: number };

/** Node positions for drawing: the frame's, with the nodes that are not drawn at `NaN`. */
function drawnPositions(frame: GraphFrame): { x: Float64Array; y: Float64Array } {
  const n = frame.x.length;
  let any = false;
  for (let i = 0; i < n && !any; i++) any = frame.hidden[i] === 1;
  if (!any) return { x: frame.x, y: frame.y };
  const x = Float64Array.from(frame.x);
  const y = Float64Array.from(frame.y);
  for (let i = 0; i < n; i++) if (frame.hidden[i] === 1) x[i] = y[i] = NaN;
  return { x, y };
}

/**
 * Whether the chart may move things (see the module comment): not under reduced motion, and not
 * on a static plot (`config.staticPlot`), which is what an image export draws: it shows where
 * everything ends up.
 */
function motionAllowed(ctx: Ctx): boolean {
  return (
    typeof requestAnimationFrame === 'function' &&
    !reducedMotion(ctx.fullLayout) &&
    ctx.fullLayout._staticPlot !== true
  );
}

/**
 * A primitive that draws nothing and whose `ready` is the layout a view waits for: the chart is
 * not "ready" (`chart.ready`, the promises of updates, image export) while a primitive's `ready`
 * is unsettled, which is how it waits for text, and for the data of a map.
 */
class PendingLayout implements Primitive<never> {
  readonly object = new Object3D();
  readonly ready: Promise<void>;
  constructor(ready: Promise<void>) {
    this.ready = ready;
    this.object.visible = false;
  }
  update(): void {}
  setTransform(): void {}
  setViewport(): void {}
  dispose(): void {}
}

/** The node sizes and outlines of `style` as the level of detail draws them (`lod.ts`). */
function lodNodeStyle<S extends { size?: unknown; lineWidth?: unknown }>(
  style: S,
  lod: GraphLod,
): S {
  if (lod === FULL_LOD) return style;
  const out = { ...style };
  if (lod.points) out.size = LOD.point;
  else if (lod.nodeScale !== 1) {
    const size = style.size;
    out.size =
      typeof size === 'number'
        ? Math.max(LOD.point, size * lod.nodeScale)
        : size instanceof Float32Array
          ? size.map((v) => Math.max(LOD.point, v * lod.nodeScale))
          : size;
  }
  if (!lod.outlines) out.lineWidth = 0;
  return out;
}

/** The chart that owns a pointer event's target (the canvas inside the chart's element). */
function chartOf(event: ComponentPointerEvent): Chart | undefined {
  let node = (event.native?.target ?? null) as Node | null;
  while (node) {
    if (typeof HTMLElement !== 'undefined' && node instanceof HTMLElement) {
      const chart = getChart(node);
      if (chart) return chart;
    }
    node = node.parentNode;
  }
  return undefined;
}

function snapshot(t: Readonly<Transform>): Transform {
  return { scaleX: t.scaleX, scaleY: t.scaleY, offsetX: t.offsetX, offsetY: t.offsetY };
}

function changed(a: number, b: number): boolean {
  return !(Math.abs(a / b - 1) <= 0.005);
}

class GraphView implements TraceView<GraphCalc> {
  #ctx: Ctx;
  #guides: LinePrimitive | undefined;
  #links: LinePrimitive | undefined;
  #secondary: LinePrimitive | undefined;
  #arrows: MarkerSet | undefined;
  #nodes: MarkerSet | undefined;
  #rings: MarkerSet | undefined;
  #boxes: RectPrimitive | undefined;
  #text: TextPrimitive | undefined;
  #frames: RectPrimitive | undefined;
  /** The links as the primitives hold them, their two halves when some are secondary, and their colors. */
  #drawn: DrawnLinks | undefined;
  #halves: { rest: LinkGeometry; marked: LinkGeometry } | undefined;
  #linkColors: ColorInput = [0, 0, 0, 1];
  /** The scales the box rects were built for. */
  #boxScale: { x: number; y: number } | undefined;
  /** Box fill colors (the text on a box contrasts with it). */
  #boxFills: ColorInput | undefined;
  /** Label widths in px by node (`NaN`: not measured yet), and the nodes in label priority. */
  #labelWidths: Float32Array | undefined;
  #labelOrder: Uint32Array | undefined;
  /** What the last label pass was made for, and the size it drew the text of boxes at. */
  #culled: { scaleX: number; scaleY: number; offsetX: number; offsetY: number } | undefined;
  #textScale = 1;
  #timer: ReturnType<typeof setTimeout> | undefined;
  /** `force.simulate`: the layout settling on screen. */
  readonly #animation: ForceAnimation;
  /**
   * A tree folding or unfolding: the frame at a time, when it started (the time of its first
   * animation frame, so that a slow first draw of the new tree takes nothing off the move; -1
   * before that), and its animation frame.
   */
  #fold: { frameAt: (t: number) => Omit<GraphFrame, 'stamp'>; start: number } | undefined;
  #foldFrame = 0;
  /** The tree as it was last drawn at rest, and the transform it was drawn with. */
  #rest: { end: TweenEnd; transform: Transform } | undefined;
  /** A click asked for the `tree.collapsed` that the next calc brings: its arrival is tweened. */
  #pending = false;
  #chart: Chart | undefined;
  /** Highlighting and node dragging (see the module comment). */
  readonly #interaction: GraphInteraction;
  /** The emphasis the labels were last placed for. */
  #labelsFor: Emphasis | undefined;
  /**
   * The node labels culling kept last, and what they were culled for: a highlight changes how
   * they are drawn, not which of them are.
   */
  #kept: { key: string; nodes: number[] } | undefined;
  /** The layout the calc waits for, when it runs off the main thread (`stream.ts`). */
  readonly #stream: LayoutStream;
  /** Keeps the chart from being ready while that layout is under way. */
  #hold: PendingLayout | undefined;
  /**
   * And while the picture glides to a layout that has just arrived: the chart is ready when the
   * layout is where it stays. `done` ends the wait.
   */
  #gliding: { hold: PendingLayout; done: () => void } | undefined;
  /** The stream's result is the next calc: its layout is on screen already. */
  #streamed = false;
  #disposed = false;
  /**
   * The level of detail (`lod.ts`): what was resolved last (the hysteresis starts from it), what
   * the primitives were last drawn at, and the stats of the frame it was measured on.
   */
  #lod: GraphLod | undefined;
  #lodDrawn: GraphLod = FULL_LOD;
  /** The labels are still to be placed for it, once the zoom has settled. */
  #textLate = false;
  #lodStats: { calc: GraphCalc; stamp: number; trace: FullTrace; stats: LodStats } | undefined;
  /**
   * A press on a node that drags is taken by the view; released without a move, it is still the
   * chart's click on the node (`ComponentView.clickThrough`).
   */
  readonly clickThrough = true;

  constructor(ctx: Ctx) {
    this.#ctx = ctx;
    this.#animation = new ForceAnimation({
      show: (positions, ended) => {
        const now = this.#ctx;
        if (!positions) {
          // At rest. A node still held, or a last stretch to glide, keeps the frame for now.
          if (this.#interaction.rest(frameOf(now.calc), ended)) return;
          showFrame(now.calc, undefined);
          this.#showMoving(now, true);
          return;
        }
        const at = this.#interaction.through(positions);
        showFrame(now.calc, {
          x: at.x,
          y: at.y,
          hidden: now.calc.hidden,
          routes: movingRoutes(now.calc, at, now.calc.bundle?.base),
        });
        this.#showMoving(now, false);
      },
      requestFrame: (callback) => requestAnimationFrame(callback),
      cancelFrame: (id) => cancelAnimationFrame(id),
    });
    this.#interaction = new GraphInteraction({
      ctx: () => this.#ctx,
      chart: () => (this.#chart && !this.#chart.destroyed ? this.#chart : undefined),
      motion: () => motionAllowed(this.#ctx),
      animation: this.#animation,
      draw: (rest) => {
        this.#showMoving(this.#ctx, rest);
        // At rest, or the glide gave way to something else (a node was picked up).
        if (rest || !this.#interaction.gliding) this.#arrive();
      },
      recolor: () => this.#highlight(),
      requestFrame: (callback) => requestAnimationFrame(callback),
      cancelFrame: (id) => cancelAnimationFrame(id),
      now: () => performance.now(),
    });
    this.#stream = new LayoutStream({
      calc: () => this.#ctx.calc,
      motion: () => motionAllowed(this.#ctx),
      draw: () => this.#showMoving(this.#ctx, false),
      hold: (ready) => this.#holdFor(ready),
      arrived: () => {
        this.#streamed = true;
        this.#interaction.expect();
      },
      recalc: () => this.#ctx.recalc?.(),
      load: loadLayoutCode,
      requestFrame: (callback) => requestAnimationFrame(callback),
      cancelFrame: (id) => cancelAnimationFrame(id),
      now: () => performance.now(),
    });
    this.#sync(ctx, true);
    this.#interaction.seen(ctx);
  }

  /**
   * Whether something is moving on screen (a layout settling, here or off the main thread, a
   * tree folding, a node dragged).
   */
  get moving(): boolean {
    return (
      this.#animation.running ||
      this.#fold !== undefined ||
      this.#interaction.moving ||
      this.#stream.running
    );
  }

  /** Hold the chart's readiness for `ready` (see {@link PendingLayout}), or let it go. */
  #holdFor(ready: Promise<void> | undefined): void {
    // On the way out the runtime removes every primitive itself.
    if (this.#disposed) return;
    if (this.#hold) this.#ctx.remove(this.#hold);
    this.#hold = ready ? new PendingLayout(ready) : undefined;
    if (this.#hold) this.#ctx.add(this.#hold);
  }

  /** The picture is where it stays: a chart that waited for the glide is let go. */
  #arrive(): void {
    const gliding = this.#gliding;
    if (!gliding) return;
    this.#gliding = undefined;
    if (!this.#disposed) this.#ctx.remove(gliding.hold);
    gliding.done();
  }

  update(ctx: Ctx, plan: TraceUpdatePlan): void {
    this.#ctx = ctx;
    if (plan.calc || plan.plot) {
      this.#sync(ctx, plan.calc);
    } else {
      if (plan.style || plan.selection) this.#restyle(ctx);
      if (plan.transform) this.#setTransform(ctx, false);
    }
    this.#interaction.seen(ctx);
  }

  dispose(): void {
    this.#disposed = true;
    this.#arrive();
    if (this.#timer !== undefined) clearTimeout(this.#timer);
    this.#timer = undefined;
    this.#stream.stop();
    this.#animation.stop();
    this.#stopFold();
    this.#interaction.dispose();
  }

  /**
   * Highlighting and node drags first (`interact.ts`: a press on a node that drags is taken, with
   * the gesture that follows). Then: a click on a node that has children folds or unfolds it
   * (`tree.collapsible`), and the pointer shows a hand over such a node. Those events are never
   * consumed: the chart's own hover, click and drags go on as for any trace.
   */
  handlePointer(event: ComponentPointerEvent): boolean {
    if (event.native) this.#chart = chartOf(event) ?? this.#chart;
    if (this.#interaction.handlePointer(event)) return true;
    const ctx = this.#ctx;
    const tree = ctx.calc.tree;
    if (!tree || part(ctx.trace, 'tree')['collapsible'] === false) return false;
    if (event.type !== 'move' && !(event.type === 'click' && event.button === 0)) return false;
    const i = this.#pointerNode(event);
    if (i < 0 || tree.children[i] === 0) return false;
    if (event.type === 'move') {
      event.cursor = 'pointer';
      return false;
    }
    const chart = this.#chart;
    // A click while the tree is still moving does nothing, as in the hierarchy traces.
    if (!chart || chart.destroyed || this.#fold) return false;
    const update = collapseToggle(ctx.trace, ctx.calc.model, tree, i);
    if (!update) return false;
    this.#pending = true;
    chart.restyle(update, [ctx.index], { gui: true }).catch(() => undefined);
    return false;
  }

  /** The drawn node under a pointer event (container px), -1 for none. */
  #pointerNode(event: ComponentPointerEvent): number {
    const ctx = this.#ctx;
    const rect = ctx.subplot?.rect;
    const t = ctx.transform;
    if (!rect || !(t.scaleX !== 0) || !(t.scaleY !== 0)) return -1;
    const px = event.x - rect.x;
    const py = rect.height - (event.y - rect.y);
    if (px < 0 || py < 0 || px > rect.width || py > rect.height) return -1;
    const hit = nodeAt(
      ctx.calc,
      { xl: (px - t.offsetX) / t.scaleX, yl: (py - t.offsetY) / t.scaleY, distance: 0 },
      ctx,
    );
    return hit ? hit[0] : -1;
  }

  // ---- What moves ---------------------------------------------------------------------------------

  /**
   * Start, go on with or stop what moves, for a new calc (`calcChanged`) or a new trace, and put
   * the frame to draw in place.
   */
  #animate(ctx: Ctx, calcChanged: boolean): void {
    const { calc } = ctx;
    const motion = motionAllowed(ctx);
    // A layout that is still to come starts from what was on screen, when it had these nodes.
    const from =
      calcChanged && calc.pending?.what === 'layout' ? this.#interaction.onScreen(ctx) : undefined;
    this.#interaction.arrive(ctx, calcChanged);
    const streamed = calcChanged && this.#streamed;
    if (calcChanged) {
      // The layout a stream has just drawn is not shown settling a second time.
      if (streamed) this.#animation.carry();
      this.#streamed = false;
      const pending = this.#pending;
      this.#pending = false;
      this.#stopFold();
      const rest = this.#rest;
      const tree = calc.tree;
      if (pending && motion && rest && tree && rest.end.x.length === calc.length) {
        const frameAt = treeTween(
          throughTransform(rest.end, rest.transform, ctx.transform),
          { x: tree.x, y: tree.y, hidden: calc.hidden, routes: calc.routes },
          calc.model.source,
          calc.model.target,
        );
        this.#fold = { frameAt, start: -1 };
        showFrame(calc, frameAt(0));
        this.#foldFrame = requestAnimationFrame(this.#foldStep);
      }
    }
    if (this.#animation.sync(calc, motion)) {
      const now = this.#animation.positions();
      const at = now ? this.#interaction.through(now) : undefined;
      if (at) {
        showFrame(calc, {
          x: at.x,
          y: at.y,
          hidden: calc.hidden,
          routes: movingRoutes(calc, at, calc.bundle?.base),
        });
      }
    }
    this.#stream.follow(calc, from);
    this.#interaction.settle(ctx);
    // A layout that has just arrived is glided to: the chart is ready when the glide is over.
    if (calcChanged) {
      this.#arrive();
      if (streamed && this.#interaction.moving) {
        let done = (): void => {};
        const hold = new PendingLayout(new Promise<void>((resolve) => (done = resolve)));
        this.#gliding = { hold, done };
        ctx.add(hold);
      }
    }
  }

  // ---- Level of detail --------------------------------------------------------------------------------

  /**
   * The level of detail for the frame shown and the current zoom (`lod.ts`), which hover and the
   * link geometry read from here on (`setLod`). The same object as before when nothing changed.
   */
  #resolveLod(ctx: Ctx): GraphLod {
    const { trace, calc } = ctx;
    const { model } = calc;
    if (!lodApplies(lodMode(trace), model.nodes, model.links)) {
      this.#lod = undefined;
      setLod(calc, FULL_LOD);
      return FULL_LOD;
    }
    const frame = frameOf(calc);
    let kept = this.#lodStats;
    // One node moved since the frame the stats are of (a drag): they still hold.
    if (kept && kept.calc === calc && kept.trace === trace && frame.moved?.from === kept.stamp) {
      kept = this.#lodStats = { ...kept, stamp: frame.stamp };
    }
    if (!kept || kept.calc !== calc || kept.stamp !== frame.stamp || kept.trace !== trace) {
      // The widths only change with the trace: the links as drawn have them, once drawn.
      const widths = this.#drawn?.trace === trace ? this.#drawn.widths : linkWidths(model, trace);
      kept = { calc, stamp: frame.stamp, trace, stats: lodStats(frame, model, widths) };
      this.#lodStats = kept;
    }
    const t = ctx.transform;
    const next = nextLod(
      this.#lod,
      lodMeasures(kept.stats, t.scaleX, t.scaleY),
      kept.stats,
      model.box,
    );
    const lod = this.#lod && sameLod(this.#lod, next) ? this.#lod : next;
    this.#lod = lod;
    setLod(calc, lod);
    return lod;
  }

  /**
   * The opacity of the links and their arrowheads: `link.opacity`, and the level of detail's
   * factor unless something is emphasized (the links that are not are then dimmed by it in their
   * colors, and the emphasized ones drawn in full: `linkColors`).
   */
  #linkOpacity(ctx: Ctx): number {
    const opacity = part(ctx.trace, 'link')['opacity'];
    const faint = this.#emphasis(ctx) ? 1 : lodOf(ctx.calc).linkAlpha;
    return (typeof opacity === 'number' ? opacity : 1) * traceOpacity(ctx.trace) * faint;
  }

  /** The colors of the links for the context (see `linkColors`). */
  #colorsOf(ctx: Ctx): ColorInput {
    const { calc } = ctx;
    return linkColors(
      calc,
      ctx.trace,
      ctx.selectedPoints ?? null,
      frameOf(calc).fade,
      this.#emphasis(ctx),
      lodOf(calc).linkAlpha,
    );
  }

  /** The nodes and links a hover or a path keeps in full (`highlight.ts`); `undefined`: none. */
  #emphasis(ctx: Ctx): Emphasis | undefined {
    return this.#interaction.emphasis(ctx);
  }

  /**
   * The emphasis changed: the opacities of the nodes and the colors of the links again, and the
   * labels with them. Less than a restyle (`#restyle`), which reads every style again: this runs
   * whenever the pointer comes over another node.
   */
  #highlight(): void {
    const ctx = this.#ctx;
    const { trace, calc } = ctx;
    const emphasis = this.#emphasis(ctx);
    const drawn = this.#drawn;
    const fade = frameOf(calc).fade;
    const selected = ctx.selectedPoints ?? null;
    if (drawn) {
      this.#linkColors = this.#colorsOf(ctx);
      // With an emphasis the links are not faded as one (see `#linkOpacity`).
      const opacity = this.#linkOpacity(ctx);
      const rest = this.#halves?.rest ?? drawn.geometry;
      this.#links?.update({ color: linkVertexColors(rest, this.#linkColors), opacity });
      if (this.#halves) {
        this.#secondary?.update({
          color: linkVertexColors(this.#halves.marked, this.#linkColors),
          opacity,
        });
      }
      this.#arrows?.update({ color: arrowColors(drawn.geometry, this.#linkColors), opacity });
    }
    this.#nodes?.update({
      opacity: nodeOpacities(
        trace,
        calc.length,
        selectionMask(calc.length, selected),
        fade,
        emphasis,
      ),
    });
    if (this.#rings) this.#syncRings(ctx, traceRenderOrder(trace, ctx.index));
    if (this.#boxes) this.#syncBoxes(ctx, false);
    if (this.#text) {
      this.#syncLabels(ctx);
      this.#text.setTransform(ctx.transform);
    }
    ctx.invalidate();
  }

  #stopFold(): void {
    if (this.#foldFrame !== 0) cancelAnimationFrame(this.#foldFrame);
    this.#foldFrame = 0;
    this.#fold = undefined;
  }

  readonly #foldStep = (): void => {
    this.#foldFrame = 0;
    const fold = this.#fold;
    const ctx = this.#ctx;
    if (!fold) return;
    const now = performance.now();
    if (fold.start < 0) fold.start = now;
    const t = (now - fold.start) / FOLD_MS;
    if (t >= 1) {
      this.#fold = undefined;
      showFrame(ctx.calc, undefined);
      this.#showMoving(ctx, true);
      return;
    }
    showFrame(ctx.calc, fold.frameAt(t));
    this.#showMoving(ctx, false);
    this.#foldFrame = requestAnimationFrame(this.#foldStep);
  };

  /**
   * Draw the frame that was just put in place (`showFrame`): the nodes, the links and what hangs
   * on them. `rest`: it is the calc itself again, and everything is brought up to date.
   */
  #showMoving(ctx: Ctx, rest: boolean): void {
    const order = traceRenderOrder(ctx.trace, ctx.index);
    const lod = this.#resolveLod(ctx);
    const same = lod === this.#lodDrawn;
    this.#syncLinks(ctx, order);
    // One node moved and nothing else changed (a drag): the positions alone are uploaded.
    if (frameOf(ctx.calc).moved && same && this.#nodes && !rest) {
      this.#nodes.update(drawnPositions(frameOf(ctx.calc)));
      this.#syncRings(ctx, order);
    } else {
      this.#syncNodes(ctx, order);
    }
    this.#syncText(ctx, order);
    this.#lodDrawn = lod;
    if (rest) this.#remember(ctx);
    this.#applyTransform(ctx);
    ctx.invalidate();
  }

  /** Keep the tree as it is drawn now, at rest, for the next fold to start from. */
  #remember(ctx: Ctx): void {
    const { calc } = ctx;
    this.#rest =
      calc.tree && !this.moving
        ? {
            end: { x: calc.tree.x, y: calc.tree.y, hidden: calc.hidden, routes: calc.routes },
            transform: snapshot(ctx.transform),
          }
        : undefined;
  }

  // ---- Drawing --------------------------------------------------------------------------------------

  /** Create, remove or fully refresh every primitive to match the trace. */
  #sync(ctx: Ctx, calcChanged: boolean): void {
    const { trace } = ctx;
    const order = traceRenderOrder(trace, ctx.index);
    this.#labelWidths = undefined;
    this.#labelOrder = undefined;
    this.#culled = undefined;
    this.#kept = undefined;
    this.#boxScale = undefined;
    this.#animate(ctx, calcChanged);
    this.#lodDrawn = this.#resolveLod(ctx);

    this.#syncGuides(ctx, order);
    this.#syncFrames(ctx, order);
    this.#syncLinks(ctx, order);
    this.#syncNodes(ctx, order);
    this.#syncText(ctx, order);
    this.#remember(ctx);
    this.#applyTransform(ctx);
  }

  /** The text primitive, there while there are labels to draw, and its labels. */
  #syncText(ctx: Ctx, order: number): void {
    this.#textLate = false;
    if (!this.#wantsLabels(ctx)) {
      this.#text = this.#drop(ctx, this.#text);
      return;
    }
    if (!this.#text) {
      const text = createTextPrimitive(ctx.primitives, { mode: 'fixed', sizing: 'screen' });
      this.#text = this.#add(ctx, text);
    }
    this.#text.object.renderOrder = order + LAYER.text;
    this.#syncLabels(ctx);
  }

  /** The nodes (markers, or boxes) and the rings of the collapsed ones, from the frame shown. */
  #syncNodes(ctx: Ctx, order: number): void {
    const { trace, calc } = ctx;
    const frame = frameOf(calc);
    if (calc.model.box) {
      this.#nodes = this.#drop(ctx, this.#nodes);
      this.#rings = this.#drop(ctx, this.#rings);
      this.#syncBoxes(ctx, true);
      this.#boxes!.object.renderOrder = order + LAYER.nodes;
      return;
    }
    this.#boxes = this.#drop(ctx, this.#boxes);
    this.#boxFills = undefined;
    const data = {
      ...drawnPositions(frame),
      ...lodNodeStyle(
        nodeMarkerStyle(
          calc,
          trace,
          ctx.fullLayout,
          ctx.selectedPoints ?? null,
          frame.fade,
          this.#emphasis(ctx),
        ),
        lodOf(calc),
      ),
    };
    if (!this.#nodes) this.#nodes = this.#add(ctx, createMarkers(ctx.primitives, data));
    else this.#nodes.update(data);
    this.#nodes.object.renderOrder = order + LAYER.nodes;
    this.#syncRings(ctx, order);
  }

  /**
   * A ring around every collapsed node that is drawn (it holds a subtree) and around every pinned
   * node of a force layout whose nodes drag (a double click releases it), the one a drag is
   * pinning included.
   */
  #syncRings(ctx: Ctx, order: number): void {
    const { trace, calc } = ctx;
    const frame = frameOf(calc);
    const collapsed = calc.tree?.collapsed;
    const pinned = pinnedNodes(trace, calc);
    const held = this.#interaction.pinning;
    const at: number[] = [];
    if (collapsed || pinned || held >= 0) {
      for (let i = 0; i < calc.length; i++) {
        if (frame.hidden[i] === 1) continue;
        if (collapsed?.[i] === 1 || pinned?.[i] === 1 || i === held) at.push(i);
      }
    }
    if (at.length === 0) {
      this.#rings = this.#drop(ctx, this.#rings);
      return;
    }
    const fills = nodeFillColors(calc, trace, ctx.fullLayout);
    const color = new Float32Array(4 * at.length);
    at.forEach((i, k) => color.set(colorAt(fills, i), 4 * k));
    // A ring shows as much as its node: faded while a tree folds, dimmed outside a highlight.
    const shown = nodeOpacities(trace, calc.length, undefined, frame.fade, this.#emphasis(ctx));
    const data = {
      x: Float64Array.from(at, (i) => frame.x[i]!),
      y: Float64Array.from(at, (i) => frame.y[i]!),
      // Around the node as it is drawn (smaller under the level of detail).
      size: Float32Array.from(
        at,
        (i) => calc.model.size[i]! * lodOf(calc).nodeScale + 2 * RING_REACH - RING_WIDTH,
      ),
      symbol: 'circle-open',
      color,
      lineWidth: RING_WIDTH,
      opacity: typeof shown === 'number' ? shown : Float32Array.from(at, (i) => shown[i]!),
    };
    if (!this.#rings) this.#rings = this.#add(ctx, createMarkers(ctx.primitives, data));
    else this.#rings.update(data);
    this.#rings.object.renderOrder = order + LAYER.rings;
  }

  /** The guide lines of the arrangement (the axes of a hive plot), in the figure's text color. */
  #syncGuides(ctx: Ctx, order: number): void {
    const guides = ctx.calc.guides;
    if (!guides || guides.x.length < 2) {
      this.#guides = this.#drop(ctx, this.#guides);
      return;
    }
    const color = ringColor(ctx.fullLayout);
    this.#guides ??= this.#add(ctx, new LinePrimitive(ctx.primitives));
    this.#guides.update({
      x: guides.x,
      y: guides.y,
      starts: guides.starts,
      color: [color[0], color[1], color[2], color[3] * GUIDE_OPACITY],
      width: 1,
      dash: 'solid',
      opacity: traceOpacity(ctx.trace),
      cap: 'butt',
    });
    this.#guides.object.renderOrder = order + LAYER.guides;
  }

  /** The frames a layout put around groups: a tinted rect with an outline, in the group's color. */
  #syncFrames(ctx: Ctx, order: number): void {
    const { calc, trace } = ctx;
    const clusters = (calc.clusters ?? []).filter((c) => !calc.hiddenGroups.has(c.group));
    if (clusters.length === 0) {
      this.#frames = this.#drop(ctx, this.#frames);
      return;
    }
    const colors = groupColors(calc.model, ctx.fullLayout).map((c) => toRGBA(c) ?? FRAME_COLOR);
    const fill = new Float32Array(4 * clusters.length);
    const border = new Float32Array(4 * clusters.length);
    clusters.forEach((c, k) => {
      const color = colors[c.group] ?? FRAME_COLOR;
      fill.set([color[0], color[1], color[2], 0.08], 4 * k);
      border.set([color[0], color[1], color[2], 0.6], 4 * k);
    });
    const data = {
      x0: Float64Array.from(clusters, (c) => Math.min(c.x0, c.x1)),
      y0: Float64Array.from(clusters, (c) => Math.min(c.y0, c.y1)),
      x1: Float64Array.from(clusters, (c) => Math.max(c.x0, c.x1)),
      y1: Float64Array.from(clusters, (c) => Math.max(c.y0, c.y1)),
      fill,
      borderColor: border,
      borderWidth: 1,
      cornerRadius: 6,
      opacity: traceOpacity(trace),
    };
    if (!this.#frames) this.#frames = this.#add(ctx, createRectPrimitive(ctx.primitives, data));
    else this.#frames.update(data);
    this.#frames.object.renderOrder = order + LAYER.frames;
  }

  /**
   * The lines of the links and the arrowheads, from the geometry for the current scales and the
   * frame shown. With secondary links the geometry is drawn as two lines, one per dash.
   */
  #syncLinks(ctx: Ctx, order: number): void {
    const { trace, calc } = ctx;
    const t = ctx.transform;
    const drawn = drawnLinks(calc, trace, t.scaleX, t.scaleY);
    this.#drawn = drawn;
    const { geometry } = drawn;
    this.#linkColors = this.#colorsOf(ctx);
    this.#halves = calc.secondary ? splitGeometry(geometry, calc.secondary) : undefined;
    const rest = this.#halves?.rest ?? geometry;
    this.#links = this.#syncLine(ctx, this.#links, rest, undefined, order + LAYER.links);
    this.#secondary = this.#syncLine(
      ctx,
      this.#secondary,
      this.#halves?.marked,
      secondaryDash(trace),
      order + LAYER.secondary,
    );
    const arrows = geometry.arrows;
    if (arrows.count > 0) {
      const data = {
        x: arrows.x,
        y: arrows.y,
        size: arrows.size,
        angle: arrows.angle,
        symbol: 'arrow',
        color: arrowColors(geometry, this.#linkColors),
        opacity: this.#linkOpacity(ctx),
        lineWidth: 0,
      };
      if (!this.#arrows) this.#arrows = this.#add(ctx, createMarkers(ctx.primitives, data));
      else this.#arrows.update(data);
      this.#arrows.object.renderOrder = order + LAYER.arrows;
    } else {
      this.#arrows = this.#drop(ctx, this.#arrows);
    }
  }

  /** One line primitive for the links of `geometry` (none when it has no vertices). */
  #syncLine(
    ctx: Ctx,
    line: LinePrimitive | undefined,
    geometry: LinkGeometry | undefined,
    dash: string | undefined,
    order: number,
  ): LinePrimitive | undefined {
    if (!geometry || geometry.x.length < 2 || !this.#drawn) return this.#drop(ctx, line);
    const out = line ?? this.#add(ctx, new LinePrimitive(ctx.primitives));
    out.update({
      x: geometry.x,
      y: geometry.y,
      starts: geometry.starts,
      ...linkLineStyle(ctx.trace, geometry, this.#linkColors, this.#drawn.widths, dash),
      opacity: this.#linkOpacity(ctx),
    });
    out.object.renderOrder = order;
    return out;
  }

  /** The rects of box nodes: `geometry` rebuilds them for the current scales. */
  #syncBoxes(ctx: Ctx, geometry: boolean): void {
    const { trace, calc } = ctx;
    const { model } = calc;
    const frame = frameOf(calc);
    const style = nodeBoxStyle(
      calc,
      trace,
      ctx.fullLayout,
      ctx.selectedPoints ?? null,
      frame.fade,
      this.#emphasis(ctx),
      // A pinned box has a frame, as a collapsed one has.
      pinnedNodes(trace, calc),
    );
    this.#boxFills = style.fills;
    const t = ctx.transform;
    const k = nodeScaleOf(calc, t.scaleX, t.scaleY);
    const data: Record<string, unknown> = {
      fill: style.fill,
      borderColor: style.borderColor,
      borderWidth: style.borderWidth,
      cornerRadius: BOX_RADIUS * k,
    };
    if (geometry || !this.#boxes) {
      const sx = (Math.abs(t.scaleX) || 1) / k;
      const sy = (Math.abs(t.scaleY) || 1) / k;
      const n = model.nodes;
      const x0 = new Float64Array(n);
      const y0 = new Float64Array(n);
      const x1 = new Float64Array(n);
      const y1 = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        const drawn = frame.hidden[i] !== 1;
        const cx = drawn ? frame.x[i]! : NaN;
        const cy = drawn ? frame.y[i]! : NaN;
        x0[i] = cx - model.halfWidth[i]! / sx;
        x1[i] = cx + model.halfWidth[i]! / sx;
        y0[i] = cy - model.halfHeight[i]! / sy;
        y1[i] = cy + model.halfHeight[i]! / sy;
      }
      Object.assign(data, { x0, y0, x1, y1 });
      this.#boxScale = { x: Math.abs(t.scaleX) || 1, y: Math.abs(t.scaleY) || 1 };
    }
    if (!this.#boxes) this.#boxes = this.#add(ctx, createRectPrimitive(ctx.primitives, data));
    else this.#boxes.update(data);
  }

  /** Whether the nodes have labels to draw. */
  #wantsNodeLabels(ctx: Ctx): boolean {
    const { trace, calc } = ctx;
    if (calc.model.labels === undefined && calc.model.implied.length === 0) return false;
    if (calc.model.box) return true;
    // Under the level of detail the labels wait for the zoom that has room for them (`lod.ts`).
    return part(trace, 'node')['textposition'] !== 'none' && lodOf(calc).labels;
  }

  #wantsLabels(ctx: Ctx): boolean {
    return this.#wantsNodeLabels(ctx) || this.#titles(ctx).length > 0;
  }

  /**
   * The titles that are not a node's: the name of every group frame, in the strip the layout
   * kept along its top, and the name at the end of every guide line. Never culled.
   */
  #titles(ctx: Ctx): TextLabel[] {
    const { calc, trace } = ctx;
    const clusters = calc.clusters ?? [];
    const guides = calc.guides?.titles ?? [];
    if (clusters.length === 0 && guides.length === 0) return [];
    // The frames of a diagram that is drawn smaller have smaller titles (see `nodeScaleOf`).
    const k = nodeScaleOf(calc, ctx.transform.scaleX, ctx.transform.scaleY);
    const base = labelFont(trace);
    const font = { ...base, size: base.size * k };
    const ink = ringColor(ctx.fullLayout);
    const color: RGBAColor = [ink[0], ink[1], ink[2], ink[3] * TITLE_OPACITY * traceOpacity(trace)];
    const out: TextLabel[] = [];
    const push = (text: string, x: number, y: number, style: Partial<TextLabel>): void => {
      if (text === '' || font.size < MIN_TEXT) return;
      const content = labelContent(text, font);
      out.push({
        text: content.text,
        x,
        y,
        lineHeight: LABEL_LINE_HEIGHT,
        font: { ...content.font, weight: 600 },
        color,
        ...(content.runs ? { runs: content.runs } : {}),
        ...style,
      });
    };
    for (const c of clusters) {
      if (calc.hiddenGroups.has(c.group)) continue;
      push(calc.model.groupNames[c.group] ?? '', Math.min(c.x0, c.x1), Math.max(c.y0, c.y1), {
        anchorX: 'left',
        anchorY: 'top',
        offset: [FRAME_TITLE_INSET[0] * k, FRAME_TITLE_INSET[1] * k],
      });
    }
    const sx = ctx.transform.scaleX < 0 ? -1 : 1;
    const sy = ctx.transform.scaleY < 0 ? -1 : 1;
    const half = (font.size * LABEL_LINE_HEIGHT) / 2;
    for (const g of guides) {
      // Centered beyond the end of the line, as far as the text reaches back along the line's
      // direction (offsets are y down).
      const width = measureLabel(labelContent(g.text, font), LABEL_LINE_HEIGHT).width;
      const reach = GUIDE_TITLE_GAP + Math.abs(g.ux) * (width / 2) + Math.abs(g.uy) * half;
      push(g.text, g.x, g.y, {
        anchorX: 'center',
        anchorY: 'middle',
        offset: [g.ux * sx * reach, -g.uy * sy * reach],
      });
    }
    return out;
  }

  /** Width of node `i`'s label in px (0 for none), measured on first use. */
  #labelWidth(ctx: Ctx, i: number): number {
    const widths = (this.#labelWidths ??= new Float32Array(ctx.calc.length).fill(NaN));
    let w = widths[i]!;
    if (Number.isNaN(w)) {
      const text = nodeLabel(ctx.calc.model, i);
      w =
        text === ''
          ? 0
          : measureLabel(labelContent(text, labelFont(ctx.trace)), LABEL_LINE_HEIGHT).width;
      widths[i] = w;
    }
    return w;
  }

  /**
   * Place the labels for the current transform and the frame shown: inside box nodes every label
   * is drawn; next to markers the labels are culled (see `labels.ts`). The titles of frames and
   * guides come with them. While something moves on a graph of more than
   * {@link LABELS_MOVING_MAX} nodes, the node labels wait for it to come to rest.
   */
  #syncLabels(ctx: Ctx): void {
    if (!this.#text) return;
    const { trace, calc } = ctx;
    const { model } = calc;
    const frame = frameOf(calc);
    const t = ctx.transform;
    const node = part(trace, 'node');
    const font = labelFont(trace);
    const opacity = traceOpacity(trace);
    const fontColor = part(node, 'textfont')['color'];
    const given = typeof fontColor === 'string' ? toRGBA(fontColor) : null;
    const labels: TextLabel[] = this.#titles(ctx);
    // The labels of what is emphasized are drawn in full and placed first; the others are dimmed.
    const emphasis = this.#emphasis(ctx);
    this.#labelsFor = emphasis;
    this.#culled = { scaleX: t.scaleX, scaleY: t.scaleY, offsetX: t.offsetX, offsetY: t.offsetY };
    const k = nodeScaleOf(calc, t.scaleX, t.scaleY);
    this.#textScale = k;
    if (!this.#wantsNodeLabels(ctx) || (this.moving && model.nodes > LABELS_MOVING_MAX)) {
      this.#text.update({ labels });
      return;
    }

    // The text of a box is drawn as much smaller as its box is.
    const drawn = k === 1 ? font : { ...font, size: font.size * k };
    const push = (i: number, style: Partial<TextLabel>, color: RGBAColor, dim = 1): void => {
      const content = labelContent(nodeLabel(model, i), drawn);
      const alpha = color[3] * opacity * dim * (frame.fade ? frame.fade[i]! : 1);
      labels.push({
        text: content.text,
        x: frame.x[i]!,
        y: frame.y[i]!,
        lineHeight: LABEL_LINE_HEIGHT,
        // A halo is drawn in full whatever the text's alpha: a dimmed label has none.
        font: dim < 1 ? { ...content.font, shadow: 'none' } : content.font,
        color: [color[0], color[1], color[2], alpha],
        ...(content.runs ? { runs: content.runs } : {}),
        ...style,
      });
    };

    if (model.box) {
      const fills = this.#boxFills ?? [0.4, 0.4, 0.4, 1];
      for (let i = 0; i < model.nodes && drawn.size >= MIN_TEXT; i++) {
        if (frame.hidden[i] === 1 || nodeLabel(model, i) === '') continue;
        push(
          i,
          { anchorX: 'center', anchorY: 'middle' },
          given ?? contrastColor(colorAt(fills, i)),
          emphasis && emphasis.node[i] !== 1 ? emphasis.dim : 1,
        );
      }
      this.#text.update({ labels });
      return;
    }

    const placement = nodePlacements(
      String(node['textposition'] ?? 'auto'),
      calc,
      t.scaleX,
      t.scaleY,
    );
    if (!placement) {
      this.#text.update({ labels });
      return;
    }
    const placementOf = typeof placement === 'function' ? placement : () => placement;
    const size = ctx.viewport.size;
    const all = model.nodes <= CULL_ALL_MAX;
    this.#labelOrder ??= labelPriority(model.degree);
    // Labels sit next to the nodes as they are drawn (smaller under the level of detail).
    const ns = lodOf(calc).nodeScale;
    const halfWidth = ns === 1 ? model.halfWidth : model.halfWidth.map((v) => v * ns);
    const halfHeight = ns === 1 ? model.halfHeight : model.halfHeight.map((v) => v * ns);
    const culling = {
      px: (i: number) => (frame.hidden[i] === 1 ? NaN : frame.x[i]! * t.scaleX + t.offsetX),
      // The viewport's y is up; culling works with y down, like the labels' offsets.
      py: (i: number) =>
        frame.hidden[i] === 1 ? NaN : size.height - (frame.y[i]! * t.scaleY + t.offsetY),
      halfWidth,
      halfHeight,
      width: (i: number) => this.#labelWidth(ctx, i),
      height: measureText('X', font, LABEL_LINE_HEIGHT).height,
      placement,
      view: { x0: 0, y0: 0, x1: size.width, y1: size.height },
      margin: all ? Infinity : cullMargin(size),
      // Nodes of a huge graph are dots: keeping labels off them would leave no label at all.
      avoidNodes: model.nodes <= LARGE,
    };
    const key = `${frame.stamp}|${t.scaleX}|${t.scaleY}|${t.offsetX}|${t.offsetY}|${size.width}|${size.height}|${ns}`;
    if (this.#kept?.key !== key) {
      this.#kept = { key, nodes: cullLabels({ ...culling, order: this.#labelOrder }) };
    }
    const kept = this.#kept.nodes;
    // With an emphasis the labels that are drawn anyway stay as they are, in the same order
    // (nothing is typeset again), dimmed unless they are among the emphasized nodes' labels,
    // which are placed among themselves and drawn in full; those that were not drawn are added
    // after the others.
    const lit = emphasis
      ? new Set(
          cullLabels({
            ...culling,
            order: emphasizedOrder(this.#labelOrder, emphasis),
            max: EMPHASIS_LABELS_MAX,
          }),
        )
      : undefined;
    const color = given ?? [0, 0, 0, 1];
    const place = (i: number, dim: number): void => {
      const at = placementOf(i);
      push(
        i,
        {
          anchorX: at.anchorX,
          anchorY: at.anchorY,
          offset: [at.dx * (halfWidth[i]! + LABEL_GAP), at.dy * (halfHeight[i]! + LABEL_GAP)],
          ...(at.angle !== undefined ? { angle: at.angle } : {}),
        },
        color,
        dim,
      );
    };
    for (const i of kept) {
      place(i, lit && emphasis && !lit.has(i) ? emphasis.dim : 1);
      lit?.delete(i);
    }
    for (const i of lit ?? []) place(i, 1);
    this.#text.update({ labels });
  }

  /** Style-only update: colors, outlines, opacities, the selection. Geometry is untouched. */
  #restyle(ctx: Ctx): void {
    const { trace, calc } = ctx;
    const drawn = this.#drawn;
    const fade = frameOf(calc).fade;
    const selected = ctx.selectedPoints ?? null;
    const emphasis = this.#emphasis(ctx);
    if (drawn) {
      this.#linkColors = this.#colorsOf(ctx);
      const opacity = this.#linkOpacity(ctx);
      const rest = this.#halves?.rest ?? drawn.geometry;
      this.#links?.update({
        ...linkLineStyle(trace, rest, this.#linkColors, drawn.widths),
        opacity,
      });
      if (this.#halves) {
        this.#secondary?.update({
          ...linkLineStyle(
            trace,
            this.#halves.marked,
            this.#linkColors,
            drawn.widths,
            secondaryDash(trace),
          ),
          opacity,
        });
      }
      this.#arrows?.update({ color: arrowColors(drawn.geometry, this.#linkColors), opacity });
    }
    this.#nodes?.update(
      lodNodeStyle(
        nodeMarkerStyle(calc, trace, ctx.fullLayout, selected, fade, emphasis),
        lodOf(calc),
      ),
    );
    if (this.#rings) this.#syncRings(ctx, traceRenderOrder(trace, ctx.index));
    if (this.#boxes) {
      this.#syncBoxes(ctx, false);
      // The text of a box follows its fill.
      this.#syncLabels(ctx);
    } else if (this.#text && emphasis !== this.#labelsFor) {
      // The labels follow the emphasis (see `#syncLabels`): the same labels, other opacities.
      this.#syncLabels(ctx);
      this.#text.setTransform(ctx.transform);
    }
  }

  /** Whether what is sized in px no longer fits the transform. */
  #stale(ctx: Ctx): { links: boolean; boxes: boolean; labels: boolean } {
    const t = ctx.transform;
    const { calc } = ctx;
    const links = !currentLinks(calc, ctx.trace, t.scaleX, t.scaleY);
    const b = this.#boxScale;
    const boxes =
      this.#boxes !== undefined &&
      b !== undefined &&
      (changed(Math.abs(t.scaleX), b.x) || changed(Math.abs(t.scaleY), b.y));
    let labels = false;
    const c = this.#culled;
    if (this.#text && calc.model.box) {
      // The text of boxes follows their size (and the titles of their frames with it).
      labels = changed(nodeScaleOf(calc, t.scaleX, t.scaleY), this.#textScale);
    } else if (this.#text && c) {
      labels = changed(t.scaleX, c.scaleX) || changed(t.scaleY, c.scaleY);
      if (!labels && calc.model.nodes > CULL_ALL_MAX) {
        const margin = cullMargin(ctx.viewport.size) / 2;
        labels =
          Math.abs(t.offsetX - c.offsetX) > margin || Math.abs(t.offsetY - c.offsetY) > margin;
      }
    }
    return { links, boxes, labels };
  }

  /**
   * Bring what follows the zoom up to date (see the module comment): everything, or with `now`
   * only what is done on every frame for this graph. Returns whether something is left for later.
   */
  #follow(ctx: Ctx, now: boolean): boolean {
    const { model } = ctx.calc;
    const large = now && (model.nodes > LARGE || model.links > LARGE);
    // The level of detail follows the zoom: how faint the links are at once (one number), the
    // rest (sizes, arrowheads, labels) with everything else that waits on a large graph.
    const lod = this.#resolveLod(ctx);
    if (lod !== this.#lodDrawn) {
      if (lod.linkAlpha !== this.#lodDrawn.linkAlpha && !this.#emphasis(ctx)) {
        const opacity = this.#linkOpacity(ctx);
        this.#links?.update({ opacity });
        this.#secondary?.update({ opacity });
        this.#arrows?.update({ opacity });
      }
      if (large) return true;
      const order = traceRenderOrder(ctx.trace, ctx.index);
      this.#kept = undefined;
      this.#syncLinks(ctx, order);
      this.#syncNodes(ctx, order);
      this.#lodDrawn = lod;
      // Labels to place wait for the zoom to settle, as on any graph of this size; labels that
      // go are gone at once.
      this.#textLate =
        now && model.nodes >= LABELS_SETTLE_MIN && !model.box && this.#wantsNodeLabels(ctx);
      if (!this.#textLate) this.#syncText(ctx, order);
      this.#applyTransform(ctx);
      return this.#textLate;
    }
    if (this.#textLate && !now) {
      this.#textLate = false;
      this.#syncText(ctx, traceRenderOrder(ctx.trace, ctx.index));
      this.#applyTransform(ctx);
    }
    const stale = this.#stale(ctx);
    const links = stale.links && !large;
    const boxes = stale.boxes && !large;
    const labels = stale.labels && !(now && model.nodes >= LABELS_SETTLE_MIN);
    if (links) this.#syncLinks(ctx, traceRenderOrder(ctx.trace, ctx.index));
    if (boxes) this.#syncBoxes(ctx, true);
    if (labels) this.#syncLabels(ctx);
    if (links || boxes || labels) this.#applyTransform(ctx);
    return (
      stale.links !== links || stale.boxes !== boxes || stale.labels !== labels || this.#textLate
    );
  }

  #setTransform(ctx: Ctx, synced: boolean): void {
    if (!synced && this.#follow(ctx, true)) this.#settle();
    // A fold starts from what is on screen: the tree at rest, under this transform.
    if (this.#rest && !this.moving) this.#rest.transform = snapshot(ctx.transform);
    this.#applyTransform(ctx);
  }

  /** Do the rest of {@link #follow} once the transform has been still for a moment. */
  #settle(): void {
    if (this.#timer !== undefined) clearTimeout(this.#timer);
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      this.#follow(this.#ctx, false);
      this.#ctx.invalidate();
    }, SETTLE_MS);
  }

  #applyTransform(ctx: Ctx): void {
    const t: Readonly<DataTransform> = ctx.transform;
    this.#guides?.setTransform(t);
    this.#frames?.setTransform(t);
    this.#links?.setTransform(t);
    this.#secondary?.setTransform(t);
    this.#arrows?.setTransform(t);
    this.#rings?.setTransform(t);
    this.#nodes?.setTransform(t);
    this.#boxes?.setTransform(t);
    this.#text?.setTransform(t);
  }

  #add<P extends Primitive<unknown>>(ctx: Ctx, primitive: P): P {
    ctx.add(primitive);
    return primitive;
  }

  #drop<P extends Primitive<unknown>>(ctx: Ctx, p: P | undefined): undefined {
    if (p) ctx.remove(p);
    return undefined;
  }
}

/** How far outside the view the labels of a large graph are placed, in px. */
function cullMargin(size: { width: number; height: number }): number {
  return Math.max(size.width, size.height) / 2;
}

/** The graph `plot` part: one view per visible trace. */
export const graphRenderer: TraceRenderer<GraphCalc> = {
  create: (ctx) => new GraphView(ctx),
};
