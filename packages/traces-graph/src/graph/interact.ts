/**
 * What the pointer does to a `graph` view beyond the chart's own hover, click, zoom and selection
 * (backlog G5): it highlights what it is over, and it drags nodes. The view (`plot.ts`) owns the
 * primitives and calls in here at a few places ({@link GraphInteraction}); this module owns the
 * state and decides, and calls back to have something drawn ({@link InteractionHost}).
 *
 * ## Highlighting
 *
 * Every plain move of the pointer is hit-tested the way hover labels are (`graphHitAt`). When
 * what is under it changes, the emphasis changes (`highlight.ts`) and the view applies its styles
 * again: opacities and colors only. Without a hover, the emphasis is that of `highlight.nodes`,
 * else the path the trace highlights, if any. {@link GraphInteraction.emphasis} is what the view
 * draws with.
 *
 * ## Dragging
 *
 * `drag.ts` is the gesture; here is what it moves, by how the nodes drag (`dragKind`):
 *
 * - **Positions that are data** (`'preset'`), and a custom layout's: the node follows the pointer
 *   in a frame of its own (`frame.ts`), redrawn once per animation frame, and the release
 *   restyles its position.
 * - **`'force'`, shown at rest**: the same while the node moves, and nothing else does, then or
 *   afterwards. The release pins the node and writes the picture on screen as `force.start`, at
 *   rest: the calc that comes back is that picture (`warm.ts` says why no layout runs).
 * - **`'force'` with `force.simulate`** (and motion allowed): the drag runs a simulation from
 *   the picture on screen with the node held at the pointer, which the view's `ForceAnimation`
 *   shows, so the other nodes give way while it moves. The release restyles the same two things,
 *   and the simulation goes on under the calc that comes back (`ForceAnimation.carry`). When it
 *   has come to rest, `force.start` is restyled once more with where it ended, so the figure is
 *   again the picture on screen.
 *
 * A double click on a pinned node releases it: its position is unset and the layout warms up
 * again from the picture on screen (`REHEAT_ALPHA`), in calc for a layout shown at rest (the view
 * glides to it), on screen with `force.simulate`.
 *
 * ## Gliding
 *
 * A release changes the figure, and the calc that comes back may put things elsewhere than they
 * were on screen: the layout gave way around a pin, or autorange fitted the axes to the new
 * extent. The view does not jump there: for {@link GLIDE_MS} it draws positions on the way from
 * where every node was on screen (through the old transform) to where it is now, or to where a
 * simulation that is still running has it at that moment. Without motion it draws the new calc at
 * once.
 */
import type { ComponentPointerEvent, TracePlotContext } from '@mk7s/holochart-runtime';
import type { ForceRun } from '../layout/force/index.ts';
import type { GraphCalc } from './calc.ts';
import {
  axisSnap,
  axisValue,
  dragKind,
  GraphDrag,
  pinnedNodes,
  positionUpdate,
  roundUnit,
  startUpdate,
  type DragKind,
} from './drag.ts';
import { frameOf, showFrame } from './frame.ts';
import {
  givenEmphasis,
  highlightOptions,
  hoverEmphasis,
  hoverHighlights,
  modelPath,
  pathEmphasis,
  type Emphasis,
  type GraphHit,
} from './highlight.ts';
import { graphHitAt, LINK_REACH } from './hover.ts';
import type { GraphPath } from './neighbors.ts';
import { movingRoutes } from './pending.ts';
import type { ForceAnimation } from './simulate.ts';
import { glide, throughTransform } from './tween.ts';
import { REHEAT_ALPHA, warmForceRun } from './warm.ts';

/** How long the picture takes to glide to a new calc after a release, in ms. */
export const GLIDE_MS = 300;
/** A glide over less than this, in px, is not worth a frame. */
const GLIDE_MIN = 0.5;

type Ctx = TracePlotContext<GraphCalc>;
type Transform = { scaleX: number; scaleY: number; offsetX: number; offsetY: number };
type Positions = { readonly x: Float64Array; readonly y: Float64Array };

/** What the interaction needs of its chart. */
export interface InteractionChart {
  readonly destroyed: boolean;
  restyle(
    update: Record<string, unknown>,
    traces: number[],
    options: { gui: boolean },
  ): Promise<unknown>;
  unhover(): void;
}

/** What the interaction needs of its view. */
export interface InteractionHost {
  /** The context of the view's last update. */
  ctx(): Ctx;
  /** The chart of the last pointer event, once there was one. */
  chart(): InteractionChart | undefined;
  /** Whether the chart may move things (reduced motion, no animation frames). */
  motion(): boolean;
  /** The view's `force.simulate` animation. */
  readonly animation: ForceAnimation;
  /**
   * Draw the frame that was just put in place (`showFrame`): `rest` when it is the calc itself
   * again and everything is to be brought up to date.
   */
  draw(rest: boolean): void;
  /** Apply the styles again: the emphasis changed. */
  recolor(): void;
  requestFrame(callback: () => void): number;
  cancelFrame(id: number): void;
  now(): number;
}

function snapshot(t: Readonly<Transform>): Transform {
  return { scaleX: t.scaleX, scaleY: t.scaleY, offsetX: t.offsetX, offsetY: t.offsetY };
}

function sameHit(a: GraphHit | undefined, b: GraphHit | undefined): boolean {
  if (a === b) return true;
  if (!a || !b || a.kind !== b.kind) return false;
  return a.kind === 'node' ? a.i === (b as typeof a).i : a.k === (b as typeof a).k;
}

/** The emphasis of a context, with what it was worked out from. */
interface Resolved {
  readonly trace: unknown;
  readonly calc: GraphCalc;
  readonly selected: unknown;
  readonly hover: GraphHit | undefined;
  readonly hidden: Uint8Array;
  readonly path: GraphPath | undefined;
  readonly emphasis: Emphasis | undefined;
}

/** A drag in progress: how the node drags, where it was, and where the pointer has every node. */
interface Moving {
  readonly kind: DragKind;
  readonly node: number;
  /** The simulation of a drag under `force.simulate`. */
  readonly run: ForceRun | undefined;
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly originX: number;
  readonly originY: number;
  readonly wasPinned: boolean;
  /** The frame the drag drew last (its stamp), or the one it started from. */
  stamp: number;
}

/** The pointer state of one graph view (see the module comment). */
export class GraphInteraction {
  readonly #host: InteractionHost;
  readonly #drag: GraphDrag;
  /** What the pointer is over. */
  #hover: GraphHit | undefined;
  /** The emphasis last worked out, and what it was worked out from. */
  #memo: Resolved | undefined;
  /** The drag in progress. */
  #moving: Moving | undefined;
  /** An animation frame is asked for to draw the node where the pointer has it. */
  #dragFrame = 0;
  /** The calc that comes next is the answer to a restyle made here: the view glides to it. */
  #dropped = false;
  /**
   * The simulation of a drag or a release is still settling: the figure has the picture as it
   * was at the release, and gets the one it ends on when it is at rest.
   */
  #unsettled = false;
  /** What was on screen last: the calc (its frame is what was drawn) and the transform. */
  #seen: { calc: GraphCalc; transform: Transform } | undefined;
  /** A glide in progress: where the nodes come from, and when it started (-1: not drawn yet). */
  #glide: { from: Positions; start: number } | undefined;
  #glideFrame = 0;

  constructor(host: InteractionHost) {
    this.#host = host;
    this.#drag = new GraphDrag({
      pick: (event) => this.#pick(event),
      locate: (event) => this.#locate(event),
      position: (i) => {
        const frame = frameOf(this.#host.ctx().calc);
        return [frame.x[i]!, frame.y[i]!];
      },
      begin: (i) => this.#begin(i),
      move: (i, x, y) => this.#move(i, x, y),
      drop: (i, x, y) => this.#drop(i, x, y),
      cancel: () => this.#cancel(),
      pinned: (i) => {
        const ctx = this.#host.ctx();
        return pinnedNodes(ctx.trace, ctx.calc)?.[i] === 1;
      },
      release: (i) => this.#release(i),
    });
  }

  // ---- What the view asks --------------------------------------------------------------------------

  /** Whether something here keeps the picture moving (a node dragged, a glide). */
  get moving(): boolean {
    return this.#moving !== undefined || this.#glide !== undefined;
  }

  /** Whether the picture is gliding to its calc. */
  get gliding(): boolean {
    return this.#glide !== undefined;
  }

  /** The node a drag is pinning (a force layout's, before the figure says so); -1 for none. */
  get pinning(): number {
    return this.#moving?.kind === 'force' ? this.#moving.node : -1;
  }

  /**
   * The nodes and links to draw in full while the others are dimmed: those of the hover, else
   * those of `highlight.nodes`, else those of the path the trace highlights; `undefined` when
   * nothing is highlighted.
   */
  emphasis(ctx: Ctx): Emphasis | undefined {
    return this.#resolve(ctx).emphasis;
  }

  /** The path the trace highlights now (in the model's link positions), if there is one. */
  path(ctx: Ctx): GraphPath | undefined {
    return this.#resolve(ctx).path;
  }

  #resolve(ctx: Ctx): Resolved {
    const { trace, calc } = ctx;
    const selected = ctx.selectedPoints ?? null;
    const { hidden } = frameOf(calc);
    const memo = this.#memo;
    if (
      memo &&
      memo.trace === trace &&
      memo.calc === calc &&
      memo.selected === selected &&
      memo.hover === this.#hover &&
      memo.hidden === hidden
    ) {
      return memo;
    }
    const options = highlightOptions(trace);
    const undrawn = { hidden, omitted: calc.omitted };
    const path = modelPath(calc.model, options, selected, undrawn);
    const emphasis =
      hoverEmphasis(calc.model, this.#hover, options, undrawn) ??
      givenEmphasis(calc.model, options, undrawn) ??
      (path ? pathEmphasis(calc.model, path, options) : undefined);
    this.#memo = { trace, calc, selected, hover: this.#hover, hidden, path, emphasis };
    return this.#memo;
  }

  /**
   * A new context arrived, before the view draws it. With a new calc: what was hovered or dragged
   * is of the old one and is forgotten, and if the calc answers a restyle made here, the view
   * will glide to it from what was on screen.
   */
  arrive(ctx: Ctx, calcChanged: boolean): void {
    if (!calcChanged) return;
    const dropped = this.#dropped;
    this.#dropped = false;
    // Another calc than the one asked for here: whatever was settling starts over from it.
    if (!dropped) this.#unsettled = false;
    this.#hover = undefined;
    this.#drag.reset();
    this.#moving = undefined;
    this.#cancelDragFrame();
    this.#stopGlide();
    const seen = this.#seen;
    if (!dropped || !seen || seen.calc.length !== ctx.calc.length || !this.#host.motion()) return;
    const was = frameOf(seen.calc);
    const from = throughTransform(
      { x: was.x, y: was.y, hidden: was.hidden, routes: undefined },
      seen.transform,
      ctx.transform,
    );
    // Copies: a frame of the simulation is drawn from arrays it writes again for the next one.
    this.#glide = {
      from: { x: Float64Array.from(from.x), y: Float64Array.from(from.y) },
      start: -1,
    };
  }

  /**
   * After the view put the new calc's frame in place, before it draws: start the glide that
   * {@link arrive} prepared, unless the simulation is running (its frames glide by themselves:
   * {@link through}).
   */
  settle(ctx: Ctx): void {
    const g = this.#glide;
    if (!g || this.#host.animation.running) return;
    const { calc } = ctx;
    // A layout that is still to come is drawn as it arrives: there is nothing to glide to yet.
    if (calc.pending?.what === 'layout' || !this.#far(g.from, calc, ctx.transform)) {
      this.#glide = undefined;
      return;
    }
    showFrame(calc, {
      ...g.from,
      hidden: calc.hidden,
      routes: movingRoutes(calc, g.from, calc.bundle?.base),
    });
    this.#glideFrame = this.#host.requestFrame(this.#glideStep);
  }

  /**
   * The next calc answers something the view asked for (a layout that ran off the main thread):
   * it is glided to from what is on screen, like the answer to a restyle made here.
   */
  expect(): void {
    this.#dropped = true;
  }

  /**
   * What was on screen last, in the linear coordinates that put it on the same pixels under
   * `ctx`'s transform; `undefined` before anything was drawn, or when it had other nodes.
   */
  onScreen(ctx: Ctx): Positions | undefined {
    const seen = this.#seen;
    if (!seen || seen.calc.length !== ctx.calc.length) return undefined;
    const was = frameOf(seen.calc);
    const at = throughTransform(
      { x: was.x, y: was.y, hidden: was.hidden, routes: undefined },
      seen.transform,
      ctx.transform,
    );
    return { x: Float64Array.from(at.x), y: Float64Array.from(at.y) };
  }

  /** The view drew `ctx`: remember what is on screen. */
  seen(ctx: Ctx): void {
    this.#seen = { calc: ctx.calc, transform: snapshot(ctx.transform) };
  }

  /**
   * The positions to draw for a frame of the simulation: `positions` themselves, or while a glide
   * is in progress, on the way to them.
   */
  through(positions: Positions): Positions {
    const g = this.#glide;
    if (!g) return positions;
    const now = this.#host.now();
    if (g.start < 0) g.start = now;
    const t = (now - g.start) / GLIDE_MS;
    if (t >= 1) {
      this.#glide = undefined;
      return positions;
    }
    return glide(g.from, positions, t);
  }

  /**
   * The simulation came to rest and would show the calc. `last` is what is on screen, `ended`
   * where the simulation stopped. Returns `true` when showing the calc is taken care of here:
   *
   * - a node is still held: the calc is not the picture (its restyle is still to come);
   * - the simulation of a drag or a release ended: the figure gets where it ended, and the frame
   *   on screen stays until the calc that answers arrives;
   * - the simulation ended a little off the calc: the view glides the rest of the way.
   */
  rest(last: Positions | undefined, ended?: Positions): boolean {
    if (this.#moving) return true;
    const ctx = this.#host.ctx();
    const { calc } = ctx;
    if (this.#unsettled) {
      this.#unsettled = false;
      const at = ended ?? last;
      // Where the simulation ended is the picture now: the figure says so, at rest.
      if (at && this.#restyle(startUpdate({ x: at.x, y: at.y, alpha: 0 }))) {
        this.#host.animation.carry();
        return true;
      }
    }
    if (!last || !this.#host.motion() || last.x.length !== calc.length) return false;
    if (!this.#far(last, calc, ctx.transform)) return false;
    this.#stopGlide();
    this.#glide = {
      from: { x: Float64Array.from(last.x), y: Float64Array.from(last.y) },
      start: -1,
    };
    this.#glideFrame = this.#host.requestFrame(this.#glideStep);
    return true;
  }

  dispose(): void {
    this.#cancelDragFrame();
    this.#stopGlide();
    this.#moving = undefined;
    this.#drag.reset();
  }

  // ---- The pointer -----------------------------------------------------------------------------------

  /**
   * One pointer event, before the chart's own handling. `true` when it is taken: the press on a
   * node that drags and what follows it, and the double click that releases a pinned node.
   */
  handlePointer(event: ComponentPointerEvent): boolean {
    const taken = this.#drag.handle(event);
    if (taken || this.#drag.active) return taken;
    if (event.type === 'leave') {
      this.#setHover(undefined);
      return false;
    }
    if (event.type !== 'move') return false;
    const ctx = this.#host.ctx();
    const hit = this.#hitAt(event, hoverHighlights(ctx.calc.model, highlightOptions(ctx.trace)));
    this.#setHover(hit);
    if (hit?.kind === 'node' && dragKind(ctx.trace, ctx.calc) !== 'none') event.cursor = 'grab';
    // Hover labels come from `hoverPoints`: a plain move is never taken.
    return false;
  }

  /** The pointer of an event in the viewport's px (y up) and in linear coordinates. */
  #pointer(
    event: ComponentPointerEvent,
    clamp: boolean,
  ): { px: number; py: number; xl: number; yl: number } | undefined {
    const ctx = this.#host.ctx();
    const rect = ctx.subplot?.rect;
    const t = ctx.transform;
    if (!rect || !(t.scaleX !== 0) || !(t.scaleY !== 0)) return undefined;
    let px = event.x - rect.x;
    let py = rect.height - (event.y - rect.y);
    if (clamp) {
      px = Math.min(rect.width, Math.max(0, px));
      py = Math.min(rect.height, Math.max(0, py));
    } else if (px < 0 || py < 0 || px > rect.width || py > rect.height) {
      return undefined;
    }
    return { px, py, xl: (px - t.offsetX) / t.scaleX, yl: (py - t.offsetY) / t.scaleY };
  }

  #hitAt(event: ComponentPointerEvent, links: boolean): GraphHit | undefined {
    const at = this.#pointer(event, false);
    if (!at) return undefined;
    const ctx = this.#host.ctx();
    const hit = graphHitAt(ctx.calc, ctx.trace, { ...at, distance: LINK_REACH }, ctx, links);
    if (!hit) return undefined;
    return hit.kind === 'node' ? { kind: 'node', i: hit.i } : { kind: 'link', k: hit.k };
  }

  #setHover(hit: GraphHit | undefined): void {
    if (sameHit(hit, this.#hover)) return;
    const ctx = this.#host.ctx();
    const before = this.#resolve(ctx).emphasis;
    this.#hover = hit;
    if (this.#resolve(ctx).emphasis !== before) this.#host.recolor();
  }

  // ---- Dragging --------------------------------------------------------------------------------------

  #pick(event: ComponentPointerEvent): number {
    const ctx = this.#host.ctx();
    if (dragKind(ctx.trace, ctx.calc) === 'none' || !this.#host.chart()) return -1;
    const hit = this.#hitAt(event, false);
    return hit?.kind === 'node' ? hit.i : -1;
  }

  #locate(event: ComponentPointerEvent): readonly [number, number] | undefined {
    const at = this.#pointer(event, true);
    return at ? [at.xl, at.yl] : undefined;
  }

  /** Where the pointer may have the node: on the axes' own terms when positions are data. */
  #snap(m: Moving, x: number, y: number): [number, number] {
    if (m.kind !== 'preset') return [x, y];
    const ctx = this.#host.ctx();
    return [axisSnap(ctx.xaxis, x, m.originX), axisSnap(ctx.yaxis, y, m.originY)];
  }

  #begin(i: number): void {
    const ctx = this.#host.ctx();
    const { calc, trace } = ctx;
    const kind = dragKind(trace, calc);
    const frame = frameOf(calc);
    this.#stopGlide();
    this.#setHover(undefined);
    // The label of the node hovered at the press would stay where the node no longer is.
    this.#host.chart()?.unhover();
    const x = Float64Array.from(frame.x);
    const y = Float64Array.from(frame.y);
    const live = kind === 'force' && calc.force?.simulate === true && this.#host.motion();
    this.#moving = {
      kind,
      node: i,
      run: live ? this.#liveRun(calc, { x, y }) : undefined,
      x,
      y,
      originX: x[i]!,
      originY: y[i]!,
      wasPinned: pinnedNodes(trace, calc)?.[i] === 1,
      stamp: frame.stamp,
    };
    const run = this.#moving.run;
    if (run) {
      run.simulation.pin(i, x[i]!, y[i]!);
      this.#host.animation.adopt(run);
    }
  }

  /** A simulation that goes on from `start`, the picture on screen, warm (`warm.ts`). */
  #liveRun(calc: GraphCalc, start: Positions): ForceRun | undefined {
    const force = calc.force;
    if (!force) return undefined;
    return warmForceRun(force.graph, force.options, { ...start, alpha: REHEAT_ALPHA });
  }

  #move(i: number, x: number, y: number): void {
    const m = this.#moving;
    if (!m) return;
    [x, y] = this.#snap(m, x, y);
    m.x[i] = x;
    m.y[i] = y;
    if (m.run) {
      const { animation } = this.#host;
      m.run.simulation.pin(i, x, y);
      m.run.simulation.reheat(REHEAT_ALPHA);
      // A node held still long enough lets the simulation come to rest: it starts again.
      if (animation.running) animation.resume();
      else animation.adopt(m.run);
      return;
    }
    if (this.#dragFrame === 0) this.#dragFrame = this.#host.requestFrame(this.#drawDrag);
  }

  /** Draw the node where the pointer has it (a drag without a simulation). */
  readonly #drawDrag = (): void => {
    this.#dragFrame = 0;
    const m = this.#moving;
    if (!m || m.run) return;
    const { calc } = this.#host.ctx();
    const at = { x: Float64Array.from(m.x), y: Float64Array.from(m.y) };
    // A custom layout's routes were made for where the nodes were: the links are drawn straight.
    // Bundles are made for where the nodes are now, or not drawn until the node is dropped.
    const routes =
      m.kind === 'custom'
        ? undefined
        : calc.bundle?.method
          ? movingRoutes(calc, at, calc.bundle.base)
          : calc.routes;
    // The frame before with one node moved, when nothing else changed: its links alone are
    // placed again (`links.ts`).
    const before = frameOf(calc);
    const shown = showFrame(calc, {
      ...at,
      hidden: calc.hidden,
      routes,
      moved:
        before.stamp === m.stamp && before.routes === routes
          ? { from: before.stamp, nodes: [m.node] }
          : undefined,
    });
    m.stamp = shown.stamp;
    this.#host.draw(false);
  };

  #cancelDragFrame(): void {
    if (this.#dragFrame !== 0) this.#host.cancelFrame(this.#dragFrame);
    this.#dragFrame = 0;
  }

  /** Restyle from here: the calc that comes back is glided to. */
  #restyle(update: Record<string, unknown>): boolean {
    const chart = this.#host.chart();
    if (!chart || chart.destroyed) return false;
    this.#dropped = true;
    chart.restyle(update, [this.#host.ctx().index], { gui: true }).catch(() => {
      this.#dropped = false;
    });
    return true;
  }

  #drop(i: number, x: number, y: number): void {
    const m = this.#moving;
    if (!m) return;
    const ctx = this.#host.ctx();
    const { trace } = ctx;
    const count = ctx.calc.model.given;
    [x, y] = this.#snap(m, x, y);
    m.x[i] = x;
    m.y[i] = y;
    let update: Record<string, unknown>;
    if (m.run) {
      m.run.simulation.pin(i, x, y);
      m.run.simulation.reheat(REHEAT_ALPHA);
      const { animation } = this.#host;
      if (animation.running) animation.resume();
      else animation.adopt(m.run);
      const at = animation.positions() ?? m;
      // The picture as it is now; the one the simulation ends on follows (`rest`).
      update = positionUpdate(trace, count, i, roundUnit(x), roundUnit(y), { ...at, alpha: 0 });
      animation.carry();
      this.#unsettled = true;
    } else {
      this.#cancelDragFrame();
      this.#drawDrag();
      update =
        m.kind === 'preset'
          ? positionUpdate(trace, count, i, axisValue(ctx.xaxis, x), axisValue(ctx.yaxis, y))
          : positionUpdate(
              trace,
              count,
              i,
              roundUnit(x),
              roundUnit(y),
              m.kind === 'force' ? { x: m.x, y: m.y, alpha: 0 } : undefined,
            );
    }
    // The node is not held any more; its frame stays on screen until the calc arrives.
    this.#moving = undefined;
    if (!this.#restyle(update)) this.#back();
  }

  #cancel(): void {
    const m = this.#moving;
    if (!m) return;
    this.#moving = undefined;
    this.#cancelDragFrame();
    if (m.run) {
      // Let go where it was: held there again if it was pinned, else free to settle back.
      if (m.wasPinned) m.run.simulation.pin(m.node, m.originX, m.originY);
      else m.run.simulation.unpin(m.node);
      m.run.simulation.reheat(REHEAT_ALPHA);
      this.#host.animation.resume();
      return;
    }
    this.#back();
  }

  /** Back to the calc as it is. */
  #back(): void {
    showFrame(this.#host.ctx().calc, undefined);
    this.#host.draw(true);
  }

  /**
   * A double click on pinned node `i`: unset its position and warm the layout up again from the
   * picture on screen.
   */
  #release(i: number): void {
    const ctx = this.#host.ctx();
    const { calc, trace } = ctx;
    if (dragKind(trace, calc) !== 'force') return;
    const chart = this.#host.chart();
    if (!chart || chart.destroyed) return;
    this.#stopGlide();
    const frame = frameOf(calc);
    const start = { x: Float64Array.from(frame.x), y: Float64Array.from(frame.y) };
    const { animation } = this.#host;
    const live = calc.force?.simulate === true && this.#host.motion();
    const run = live ? this.#liveRun(calc, start) : undefined;
    if (run) {
      // On screen: the simulation goes on without the pin, under the calc that comes back
      // (the picture as it is), and the figure gets where it ends (`rest`).
      run.simulation.unpin(i);
      animation.adopt(run);
      animation.carry();
      this.#unsettled = true;
    }
    // Without a simulation to show, calc runs the warm layout and the view glides to it.
    const alpha = run ? 0 : REHEAT_ALPHA;
    this.#restyle(positionUpdate(trace, calc.model.given, i, null, null, { ...start, alpha }));
  }

  // ---- Gliding ---------------------------------------------------------------------------------------

  /** Whether some node of `calc` is drawn more than {@link GLIDE_MIN} px from `from`. */
  #far(from: Positions, calc: GraphCalc, t: Readonly<Transform>): boolean {
    const sx = Math.abs(t.scaleX);
    const sy = Math.abs(t.scaleY);
    for (let i = 0; i < calc.length; i++) {
      if (calc.hidden[i] === 1) continue;
      const dx = (calc.x[i]! - from.x[i]!) * sx;
      const dy = (calc.y[i]! - from.y[i]!) * sy;
      if (Math.abs(dx) > GLIDE_MIN || Math.abs(dy) > GLIDE_MIN) return true;
    }
    return false;
  }

  #stopGlide(): void {
    if (this.#glideFrame !== 0) this.#host.cancelFrame(this.#glideFrame);
    this.#glideFrame = 0;
    this.#glide = undefined;
  }

  /** One frame of a glide to the calc (the simulation is not running). */
  readonly #glideStep = (): void => {
    this.#glideFrame = 0;
    const g = this.#glide;
    if (!g) return;
    const host = this.#host;
    // The simulation started again (another drag): its frames go on with the glide.
    if (host.animation.running) return;
    const { calc } = host.ctx();
    const now = host.now();
    if (g.start < 0) g.start = now;
    const t = (now - g.start) / GLIDE_MS;
    if (t >= 1 || g.from.x.length !== calc.length) {
      this.#glide = undefined;
      showFrame(calc, undefined);
      host.draw(true);
      return;
    }
    const at = glide(g.from, calc, t);
    showFrame(calc, {
      ...at,
      hidden: calc.hidden,
      routes: movingRoutes(calc, at, calc.bundle?.base),
    });
    host.draw(false);
    this.#glideFrame = host.requestFrame(this.#glideStep);
  };
}
