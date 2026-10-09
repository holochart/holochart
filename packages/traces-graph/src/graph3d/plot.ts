/**
 * The `graph3d` view (backlog G6), drawn in the trace's scene with the primitives `scatter3d`
 * draws with (render's lazily loaded 3D chunk and mesh primitive); nothing here has a shader of its
 * own:
 *
 * | Part                         | Primitive                                              | Picked |
 * | ---------------------------- | ------------------------------------------------------ | ------ |
 * | nodes (`render: 'sphere'`)   | `SphereSet`, sized in scene units: one draw call       | yes    |
 * | nodes (`render: 'sprite'`)   | `Markers3D`: SDF symbols, CSS px: one draw call        | yes    |
 * | links (`render: 'line'`)     | `Line3D`: one polyline with gaps, CSS px wide          | yes    |
 * | links (`'tube'`), arrowheads | the lazily loaded mesh primitive, lit: one mesh        | yes    |
 * | labels                       | `TextPrimitive`, `billboard` + `screen` sizing         | no     |
 * | planes (`layered`)           | `Line3D`: one rectangle per plane                      | no     |
 *
 * Node positions stay in linear coordinates under the scene's transform. What is shaped or sized in
 * scene units (the spheres, and the links: their curves and rings, the tubes and the arrowheads;
 * see `geometry.ts` and `sceneSizeUnit`) is built again when that transform or the size of the
 * scene changes: in a layout pass, never while the camera moves.
 *
 * Labels are culled on screen (`labels.ts`: the nodes with the most links first, a label kept when
 * it is clear of the labels before it and of every node), from the nodes' projections for the
 * camera of the moment. The pass runs again a moment after the camera has moved; until then the
 * labels that are up stay with their nodes, as they are billboards in the scene.
 *
 * ## Highlighting
 *
 * What the pointer is over comes from the scene's GPU picking, which answers a moment after the
 * pointer has moved and only to the module's `hoverPoints`; that function tells the view
 * (`watchHover` in `hover.ts`). The emphasis is the 2D trace's (`../graph/highlight.ts`: the
 * neighbourhood of the hovered node or link, else that of `highlight.nodes`, else the path of
 * `highlight.path`), and applying it changes colors only: the nodes and tubes that are not
 * emphasized are drawn in their color faded toward the background by `highlight.dim` (they are
 * lit and opaque, so they are not made transparent), the links drawn as lines by their alpha, and
 * the labels as in 2D. Nothing is built again and no pick is asked again for it.
 */
import { toRGBA, type FullTrace, type RGBAColor } from '@mk7s/holochart-core';
import {
  createLazyMeshPrimitive,
  createTextPrimitive,
  linesMarkers3DModule,
  loadLinesMarkers3D,
  measureText,
  type ColorInput,
  type LazyMeshPrimitive,
  type Line3D,
  type LinesMarkers3DModule,
  type MarkerData,
  type Markers3D,
  type Primitive,
  type ScalarInput,
  type SphereData,
  type SphereSet,
  type TextLabel,
  type TextPrimitive,
} from '@mk7s/holochart-render';
import type {
  ComponentPointerEvent,
  TracePlotContext,
  TraceRenderer,
  TraceUpdatePlan,
  TraceView,
} from '@mk7s/holochart-runtime';
import {
  acquireScene,
  invalidateScenePicks,
  registerScenePickable,
  sceneMeshLighting,
  sceneOf,
  unregisterScenePickable,
  type Scene3D,
} from '@mk7s/holochart-traces-3d';
import { labelContent, measureLabel } from '@mk7s/holochart-traces-basic';
import { Object3D, type OrthographicCamera, type PerspectiveCamera } from 'three';
import { backgroundOf } from '../graph/defaults.ts';
import { LOOP_REACH, LOOP_STEP } from '../graph/geometry.ts';
import {
  EMPHASIS_LABELS_MAX,
  emphasizedOrder,
  givenEmphasis,
  highlightOptions,
  hoverEmphasis,
  modelPath,
  pathEmphasis,
  type Emphasis,
  type GraphHit,
} from '../graph/highlight.ts';
import { LABEL_GAP, labelPlacement, labelPriority } from '../graph/labels.ts';
import { arrowsOf } from '../graph/links.ts';
import { LABEL_LINE_HEIGHT, labelFont, nodeLabel } from '../graph/model.ts';
import {
  arrowSizes,
  colorAt,
  linkColors,
  linkCurves,
  linkWidths,
  nodeFillColors,
  nodeMarkerStyle,
  part,
  traceOpacity,
} from '../graph/style.ts';
import { as2d, type Graph3dCalc } from './calc.ts';
import {
  drawnLinks3d,
  keepLinkPaths,
  linkLines,
  linkMesh,
  linkPaths,
  planeOutlines,
  sizeUnit,
} from './geometry.ts';
import { PICK_LINKS, PICK_TAG, watchHover } from './hover.ts';
import { cullLabels3d } from './labels.ts';

type Ctx = TracePlotContext<Graph3dCalc>;

const FULL: TraceUpdatePlan = { calc: true, plot: true, style: true, transform: true };

/** Translucent nodes above this count are not depth-sorted (the CPU sort would stall). */
const MAX_SORTED = 200_000;
/** `link.render: 'auto'`: tubes from this width up, and up to this many links. */
export const AUTO_TUBE_WIDTH = 3;
export const AUTO_TUBE_LINKS = 5000;
/** The nodes whose labels are candidates in a culling pass (those with the most links). */
const LABEL_CANDIDATES = 600;
/** Up to this many nodes, every node on screen is in the way of a label; above, the candidates. */
const LABEL_OBSTACLES = 50_000;
/** How long the camera rests before the labels are culled for its new view, ms. */
const LABEL_REST_MS = 120;
/**
 * How long a highlight stays after picking stopped finding what it is of, ms. Every place the
 * pointer comes to is picked afresh, and until that pick answers hover has nothing: without the
 * wait a highlight would go and come back at every step of the pointer along a link.
 */
const HOVER_LEAVE_MS = 150;
/** Tubes and arrowheads: Plotly's mesh model with enough directional contrast to read as round. */
const LINK_LIGHTING = {
  lighting: { ambient: 0.55, diffuse: 0.7, specular: 0.12, roughness: 0.45, fresnel: 0.15 },
};
/** The identity transform: the link mesh is built in scene units. */
const WORLD = { scaleX: 1, scaleY: 1, scaleZ: 1, offsetX: 0, offsetY: 0, offsetZ: 0 };

/** Render order of the trace's parts (after the axes' walls and lines, as `scatter3d`'s). */
function orders(index: number): { planes: number; links: number; nodes: number; text: number } {
  const base = 10 + index * 8;
  return { planes: base, links: base + 1, nodes: base + 2, text: base + 3 };
}

/**
 * Stands in for the view's primitives while render's 3D chunk loads: the chart waits for its
 * `ready`, so `chart.ready` means drawn (as `scatter3d` does).
 */
class LoadingPrimitive implements Primitive<never> {
  readonly object = new Object3D();
  readonly ready: Promise<void>;
  constructor(ready: Promise<void>) {
    this.ready = ready;
  }
  update(): void {}
  setTransform(): void {}
  setViewport(): void {}
  dispose(): void {}
}

/** Marker style → sphere data (colors, colorscale, opacity); sizes are set in scene units. */
function sphereStyle(style: Partial<MarkerData>): Partial<SphereData> {
  const out: Partial<SphereData> = {};
  if (style.opacity !== undefined) out.opacity = style.opacity;
  if (style.color !== undefined) out.color = style.color;
  out.colorValues = style.colorValues ?? null;
  out.colorscale = style.colorscale ?? null;
  if (style.cmin !== undefined) out.cmin = style.cmin;
  if (style.cmax !== undefined) out.cmax = style.cmax;
  if (style.cmid !== undefined) out.cmid = style.cmid;
  if (style.reversescale !== undefined) out.reversescale = style.reversescale;
  return out;
}

/** How the links of a defaulted trace are drawn: tubes, or lines. */
export function linkRender3d(
  trace: FullTrace,
  widths: Float32Array,
  links: number,
): 'line' | 'tube' {
  const render = part(trace, 'link')['render'];
  if (render === 'line' || render === 'tube') return render;
  if (links > AUTO_TUBE_LINKS) return 'line';
  let widest = 0;
  for (const w of widths) if (w > widest) widest = w;
  return widest >= AUTO_TUBE_WIDTH ? 'tube' : 'line';
}

/**
 * Colors for lit geometry, which is opaque: a translucent color (the default link color is one,
 * so that links stand back) becomes the color it has over the background, at half its
 * transparency: a tube is shaded, and at the full transparency its dark side would be lost in the
 * background. `link.opacity` still fades the mesh as a whole.
 */
export function overBackground(colors: ColorInput, background: RGBAColor): ColorInput {
  const flat = (c: ArrayLike<number>, at: number, out: number[] | Float32Array): void => {
    const a = 0.5 + 0.5 * c[at + 3]!;
    for (let k = 0; k < 3; k++) out[at + k] = c[at + k]! * a + background[k]! * (1 - a);
    out[at + 3] = 1;
  };
  if (!(colors instanceof Float32Array)) {
    const out = [0, 0, 0, 1];
    flat(colors, 0, out);
    return out as unknown as RGBAColor;
  }
  const out = new Float32Array(colors.length);
  for (let i = 0; i + 3 < colors.length; i += 4) flat(colors, i, out);
  return out;
}

/**
 * Colors with those that are not `kept` faded toward `background`: a share `dim` of the way from
 * it to their own color, their alpha as it was. 4 floats per item.
 */
export function fadedColors(
  colors: ColorInput,
  count: number,
  kept: ArrayLike<number>,
  dim: number,
  background: RGBAColor,
): Float32Array {
  const out = new Float32Array(4 * count);
  for (let i = 0; i < count; i++) {
    const c = colorAt(
      colors,
      colors instanceof Float32Array ? Math.min(i, (colors.length >> 2) - 1) : i,
    );
    const share = kept[i] === 1 ? 1 : dim;
    for (let k = 0; k < 3; k++) out[4 * i + k] = background[k]! + (c[k]! - background[k]!) * share;
    out[4 * i + 3] = c[3];
  }
  return out;
}

/** Per-link colors spread over vertices (`link`: the kept link of each); one color as it is. */
function perVertex(colors: ColorInput, link: Int32Array): ColorInput {
  if (!(colors instanceof Float32Array)) return colors;
  const out = new Float32Array(4 * link.length);
  for (let v = 0; v < link.length; v++) {
    const from = 4 * link[v]!;
    out[4 * v] = colors[from]!;
    out[4 * v + 1] = colors[from + 1]!;
    out[4 * v + 2] = colors[from + 2]!;
    out[4 * v + 3] = colors[from + 3]!;
  }
  return out;
}

function sameHit(a: GraphHit | undefined, b: GraphHit | undefined): boolean {
  if (!a || !b) return a === b;
  return a.kind === 'node' ? b.kind === 'node' && a.i === b.i : b.kind === 'link' && a.k === b.k;
}

/**
 * Scene units per size unit in `scene` (see `sizeUnit`): one CSS px at the point the camera of the
 * first drawn view looks at. That camera, not the live one, so that sizes do not snap back when a
 * gesture is committed to the layout.
 */
export function sceneSizeUnit(scene: Pick<Scene3D, 'initial' | 'viewport'>): number {
  const { eye, center } = scene.initial.camera;
  const distance = Math.hypot(eye[0] - center[0], eye[1] - center[1], eye[2] - center[2]);
  const camera = scene.viewport.camera as Partial<PerspectiveCamera & OrthographicCamera>;
  const span =
    camera.isPerspectiveCamera === true
      ? 2 * distance * Math.tan(((camera.fov ?? 45) * Math.PI) / 360)
      : (camera.top ?? 1) - (camera.bottom ?? -1);
  return sizeUnit(span, scene.viewport.rect.height);
}

/** What the parts in scene units were built for: the transform, and the size unit. */
function worldKey(scene: Scene3D): string {
  const t = scene.transform;
  return [t.scaleX, t.offsetX, t.scaleY, t.offsetY, t.scaleZ, t.offsetZ, sceneSizeUnit(scene)].join(
    ',',
  );
}

class Graph3dView implements TraceView<Graph3dCalc> {
  #ctx: Ctx;
  #scene: Scene3D | undefined;
  #offCamera: (() => void) | undefined;
  #nodes: SphereSet | Markers3D | undefined;
  #nodesKind = '';
  #lines: Line3D | undefined;
  #mesh: LazyMeshPrimitive | undefined;
  #offRig: (() => void) | undefined;
  #planes: Line3D | undefined;
  #text: TextPrimitive | undefined;
  #loading: LoadingPrimitive | undefined;
  #disposed = false;
  /** What the parts in scene units were built for (see `worldKey`). */
  #worldKey = '';
  /** Per calc: the drawn links, the positions of the drawn nodes, widths, label priority. */
  #calc: Graph3dCalc | undefined;
  #drawn: Int32Array = new Int32Array(0);
  #pos: { x: Float64Array; y: Float64Array; z: Float64Array } | undefined;
  #widths: Float32Array = new Float32Array(0);
  #labelOrder: Uint32Array | undefined;
  #labelWidths: Float32Array | undefined;
  #labelTimer: ReturnType<typeof setTimeout> | undefined;
  /** The kept link of every vertex of the lines, and of the mesh: what a recoloring writes to. */
  #lineLinks: Int32Array | undefined;
  #meshLinks: Int32Array | undefined;
  /** What the pointer is over (see the module comment), and the emphasis worked out from it. */
  #hover: GraphHit | undefined;
  #hoverTimer: ReturnType<typeof setTimeout> | undefined;
  /** The timer is the wait before nothing is hovered. */
  #leaving = false;
  #memo:
    | {
        readonly trace: FullTrace;
        readonly calc: Graph3dCalc;
        readonly hover: GraphHit | undefined;
        readonly emphasis: Emphasis | undefined;
      }
    | undefined;

  constructor(ctx: Ctx) {
    this.#ctx = ctx;
    this.#sync(FULL);
  }

  update(ctx: Ctx, plan: TraceUpdatePlan): void {
    this.#ctx = ctx;
    this.#sync(plan);
  }

  /** The pointer left the chart: nothing is hovered. No event is taken. */
  handlePointer(event: ComponentPointerEvent): boolean {
    if (event.type === 'leave') {
      this.#dropHover();
      this.#setHover(undefined);
    }
    return false;
  }

  dispose(): void {
    this.#disposed = true;
    clearTimeout(this.#labelTimer);
    clearTimeout(this.#hoverTimer);
    this.#offCamera?.();
    this.#clear();
  }

  // ---- internals ----------------------------------------------------------------------------

  #sync(plan: TraceUpdatePlan): void {
    const ctx = this.#ctx;
    const scene = acquireScene(ctx, sceneOf(ctx.trace), ctx.calc.scene);
    if (!scene) return;
    let build = plan.calc || plan.plot || plan.style;
    if (scene !== this.#scene) {
      this.#offCamera?.();
      this.#clear();
      this.#scene = scene;
      this.#offCamera = scene.onCameraChange(() => this.#cameraMoved());
      build = true;
    }
    const m3d = linesMarkers3DModule();
    if (!m3d) {
      if (!this.#loading) {
        const ready = loadLinesMarkers3D().then(() => {
          const loading = this.#loading;
          this.#loading = undefined;
          if (this.#disposed) return;
          if (loading) this.#ctx.remove(loading);
          this.#sync(FULL);
        });
        this.#loading = new LoadingPrimitive(ready);
        ctx.add(this.#loading);
      }
      return;
    }
    watchHover(ctx.calc, this.#hovered);
    if (build) this.#build(m3d, scene);
    this.#placeWorld(m3d, scene, build);
    const t = scene.transform;
    for (const p of [this.#nodes, this.#lines, this.#planes, this.#text]) p?.setTransform(t);
    this.#cullLabels();
    // Everything the pick ids refer to may have changed: hover picks again.
    invalidateScenePicks(scene);
    ctx.invalidate();
  }

  #remove<P extends Primitive<never>>(p: P | undefined): undefined {
    if (!p) return undefined;
    if (this.#scene) unregisterScenePickable(this.#scene, p as unknown as Markers3D);
    this.#ctx.remove(p as unknown as Primitive<unknown>);
    return undefined;
  }

  #clear(): void {
    this.#nodes = this.#remove(this.#nodes as Primitive<never> | undefined);
    this.#nodesKind = '';
    this.#lines = this.#remove(this.#lines as Primitive<never> | undefined);
    this.#planes = this.#remove(this.#planes as Primitive<never> | undefined);
    this.#text = this.#remove(this.#text as Primitive<never> | undefined);
    this.#removeMesh();
    this.#calc = undefined;
  }

  #removeMesh(): void {
    this.#offRig?.();
    this.#offRig = undefined;
    this.#mesh = this.#remove(this.#mesh as Primitive<never> | undefined);
    this.#worldKey = '';
  }

  /** What depends on the calc alone, kept until the next one. */
  #perCalc(): void {
    const { calc, trace } = this.#ctx;
    this.#widths = linkWidths(calc.model, trace);
    if (calc === this.#calc) return;
    this.#calc = calc;
    this.#drawn = drawnLinks3d(calc);
    // Nodes hidden through the legend have a position: they are left out here.
    const pos = { x: calc.x, y: calc.y, z: calc.z };
    for (let i = 0; i < calc.length; i++) {
      if (calc.hidden[i] !== 1 || Number.isNaN(calc.x[i])) continue;
      if (pos.x === calc.x) {
        pos.x = Float64Array.from(calc.x);
        pos.y = Float64Array.from(calc.y);
        pos.z = Float64Array.from(calc.z);
      }
      pos.x[i] = pos.y[i] = pos.z[i] = NaN;
    }
    this.#pos = pos;
    this.#labelOrder = undefined;
    this.#labelWidths = undefined;
    // What was hovered is of the calc before.
    this.#dropHover();
    this.#hover = undefined;
  }

  // ---- highlighting ---------------------------------------------------------------------------

  /**
   * What picking found under the pointer for this trace (`hover.ts` calls it on every hover). It
   * is taken up after the hover that reports it: at once for a node or a link, and for nothing
   * after a wait (see `HOVER_LEAVE_MS`), which a hit in the meantime calls off. Hover runs inside
   * the chart's frame, where a redraw cannot be asked for.
   */
  readonly #hovered = (hit: GraphHit | undefined): void => {
    if (this.#disposed) return;
    if (!hit && (!this.#hover || this.#leaving)) return;
    clearTimeout(this.#hoverTimer);
    this.#leaving = !hit;
    this.#hoverTimer = setTimeout(
      () => {
        this.#leaving = false;
        if (!this.#disposed) this.#setHover(hit);
      },
      hit ? 0 : HOVER_LEAVE_MS,
    );
  };

  #dropHover(): void {
    clearTimeout(this.#hoverTimer);
    this.#leaving = false;
  }

  #setHover(hit: GraphHit | undefined): void {
    if (sameHit(hit, this.#hover)) return;
    const before = this.#emphasis();
    this.#hover = hit;
    if (this.#emphasis() !== before) this.#recolor();
  }

  /**
   * The nodes and links to draw in full while the others are dimmed: those of the hover, else of
   * `highlight.nodes`, else of the path of `highlight.path`; `undefined` for none.
   */
  #emphasis(): Emphasis | undefined {
    const { trace, calc } = this.#ctx;
    const memo = this.#memo;
    if (memo && memo.trace === trace && memo.calc === calc && memo.hover === this.#hover) {
      return memo.emphasis;
    }
    const options = highlightOptions(trace);
    const undrawn = { hidden: calc.hidden };
    let emphasis =
      hoverEmphasis(calc.model, this.#hover, options, undrawn) ??
      givenEmphasis(calc.model, options, undrawn);
    if (!emphasis) {
      const path = modelPath(calc.model, options, null, undrawn);
      if (path) emphasis = pathEmphasis(calc.model, path, options);
    }
    this.#memo = { trace, calc, hover: this.#hover, emphasis };
    return emphasis;
  }

  #background(): RGBAColor {
    return toRGBA(backgroundOf(this.#ctx.fullLayout)) ?? [1, 1, 1, 1];
  }

  /** The colors of the nodes: the style's, or with an emphasis each node's own, the others faded. */
  #nodeColors(style: Partial<MarkerData>): Partial<MarkerData> {
    const { trace, calc, fullLayout } = this.#ctx;
    const emphasis = this.#emphasis();
    if (!emphasis) {
      return {
        color: style.color ?? [0.4, 0.4, 0.4, 1],
        colorValues: style.colorValues ?? null,
        colorscale: style.colorscale ?? null,
      };
    }
    return {
      color: fadedColors(
        nodeFillColors(as2d(calc), trace, fullLayout),
        calc.length,
        emphasis.node,
        emphasis.dim,
        this.#background(),
      ),
      colorValues: null,
      colorscale: null,
    };
  }

  /** Per-link colors of the links drawn as lines: the emphasis is in their alpha, as in 2D. */
  #lineColors(): ColorInput {
    const { trace, calc } = this.#ctx;
    return linkColors(as2d(calc), trace, null, undefined, this.#emphasis());
  }

  /**
   * Per-link colors of the tubes and arrowheads (see `overBackground`). With an emphasis its
   * links have their own color in full (or `highlight.color`) and the others are faded.
   */
  #meshColors(): ColorInput {
    const { trace, calc } = this.#ctx;
    const own = linkColors(as2d(calc), trace);
    const background = this.#background();
    const base = overBackground(own, background);
    const emphasis = this.#emphasis();
    if (!emphasis) return base;
    const links = calc.model.links;
    const out = fadedColors(base, links, emphasis.link, emphasis.dim, background);
    for (let k = 0; k < links; k++) {
      if (emphasis.link[k] !== 1) continue;
      const c = emphasis.color ?? colorAt(own, k);
      out.set([c[0], c[1], c[2], 1], 4 * k);
    }
    return out;
  }

  /** The emphasis changed: colors again, and the labels. Nothing is built and no pick is lost. */
  #recolor(): void {
    if (!this.#scene || !this.#nodes) return;
    const { trace, calc, fullLayout } = this.#ctx;
    const colors = this.#nodeColors(nodeMarkerStyle(as2d(calc), trace, fullLayout));
    if (this.#spheres()) (this.#nodes as SphereSet).update(sphereStyle(colors));
    else (this.#nodes as Markers3D).update(colors);
    if (this.#lines && this.#lineLinks) {
      this.#lines.update({ color: perVertex(this.#lineColors(), this.#lineLinks) });
    }
    if (this.#mesh && this.#meshLinks) {
      this.#mesh.update({ color: perVertex(this.#meshColors(), this.#meshLinks) });
    }
    this.#cullLabels();
    this.#ctx.invalidate();
    // A highlight follows a pick, and the frame after a pick may not show it. GPU picking draws
    // the same geometries and puts three's frame counter back afterwards (render's
    // `gpu-picking.ts`, for the host's statistics); three uploads a geometry's buffers once per
    // frame number; so the frame that takes the pick's number leaves out what changed since the
    // pick. One more frame, asked for after that one, draws it.
    const again = (): void => {
      if (!this.#disposed) this.#ctx.invalidate();
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(again);
    else setTimeout(again, 16);
  }

  #spheres(): boolean {
    return part(this.#ctx.trace, 'node')['render'] !== 'sprite';
  }

  #tubes(): boolean {
    return linkRender3d(this.#ctx.trace, this.#widths, this.#drawn.length) === 'tube';
  }

  #build(m3d: LinesMarkers3DModule, scene: Scene3D): void {
    const ctx = this.#ctx;
    const { trace, calc, fullLayout } = ctx;
    this.#perCalc();
    const order = orders(ctx.index);
    const pos = this.#pos!;

    // Nodes.
    const marker = nodeMarkerStyle(as2d(calc), trace, fullLayout);
    const style = { ...marker, ...this.#nodeColors(marker) };
    const translucent = typeof style.opacity === 'number' ? style.opacity < 1 : true;
    const sorted = translucent && calc.length <= MAX_SORTED;
    const spheres = this.#spheres();
    const kind = `${spheres ? 'sphere' : 'sprite'}:${sorted}`;
    if (kind !== this.#nodesKind) {
      this.#nodes = this.#remove(this.#nodes as Primitive<never> | undefined);
      this.#nodesKind = kind;
      const options = { depthSort: sorted, renderOrder: order.nodes };
      this.#nodes = spheres
        ? m3d.createSpheres(ctx.primitives, {}, { ...options, sizing: 'world' })
        : m3d.createMarkers3D(ctx.primitives, {}, options);
      this.#nodes.object.userData[PICK_TAG] = 'nodes';
      ctx.add(this.#nodes, scene.viewport);
      // The spheres' sizes are in scene units: set with the transform (#placeWorld).
      this.#worldKey = '';
    }
    if (spheres) (this.#nodes as SphereSet).update({ ...pos, ...sphereStyle(style) });
    else (this.#nodes as Markers3D).update({ ...pos, ...style });
    registerScenePickable(scene, this.#nodes!, ctx.index);

    // The links are shaped in scene units: #placeWorld.
    const colors = linkColors(as2d(calc), trace);

    // The planes of a layered arrangement.
    const layered = part(trace, 'layered');
    const outlines =
      calc.planes && layered['showplanes'] !== false ? planeOutlines(pos, calc.planes) : undefined;
    if (outlines) {
      const given =
        typeof layered['planecolor'] === 'string' ? toRGBA(layered['planecolor']) : null;
      const base: RGBAColor = colors instanceof Float32Array ? [0.5, 0.5, 0.5, 0.4] : colors;
      const data = {
        ...outlines,
        connectGaps: false,
        color: given ?? ([base[0], base[1], base[2], base[3] * 0.6] as RGBAColor),
        width: 1,
        opacity: traceOpacity(trace),
        join: 'miter' as const,
      };
      if (!this.#planes) {
        this.#planes = m3d.createLine3D(ctx.primitives, data, { renderOrder: order.planes });
        ctx.add(this.#planes, scene.viewport);
      } else this.#planes.update(data);
    } else this.#planes = this.#remove(this.#planes as Primitive<never> | undefined);

    // Labels (filled by #cullLabels).
    const wanted =
      (calc.model.labels !== undefined || calc.model.implied.length > 0) &&
      part(trace, 'node')['textposition'] !== 'none';
    if (wanted && !this.#text) {
      this.#text = createTextPrimitive(ctx.primitives, { mode: 'billboard', sizing: 'screen' });
      this.#text.object.renderOrder = order.text;
      ctx.add(this.#text, scene.viewport);
    } else if (!wanted) this.#text = this.#remove(this.#text as Primitive<never> | undefined);
  }

  /**
   * The parts in scene units: sphere sizes, and the links (their paths, as lines or as tubes, and
   * the arrowheads); again when their key changed.
   */
  #placeWorld(m3d: LinesMarkers3DModule, scene: Scene3D, force: boolean): void {
    const key = worldKey(scene);
    if (!force && key === this.#worldKey) return;
    const ctx = this.#ctx;
    const { trace, calc } = ctx;
    const { model } = calc;
    const unit = sceneSizeUnit(scene);
    if (this.#spheres() && this.#nodes) {
      (this.#nodes as SphereSet).update({ size: Float32Array.from(model.size, (s) => s * unit) });
    }
    if (this.#drawn.length === 0) {
      this.#lines = this.#remove(this.#lines as Primitive<never> | undefined);
      this.#removeMesh();
      this.#worldKey = key;
      return;
    }
    const t = scene.transform;
    const n = calc.length;
    const x = new Float64Array(n);
    const y = new Float64Array(n);
    const z = new Float64Array(n);
    const radius = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      x[i] = calc.x[i]! * t.scaleX + t.offsetX;
      y[i] = calc.y[i]! * t.scaleY + t.offsetY;
      z[i] = calc.z[i]! * t.scaleZ + t.offsetZ;
      radius[i] = (model.size[i]! / 2) * unit;
    }
    const paths = linkPaths({
      x,
      y,
      z,
      radius,
      source: model.source,
      target: model.target,
      drawn: this.#drawn,
      curve: linkCurves(model, trace),
      loop: model.loop,
      loopReach: LOOP_REACH * unit,
      loopStep: LOOP_STEP * unit,
    });
    // Hover labels and keyboard stops point at the middle of a link as it is drawn.
    keepLinkPaths(calc, paths, t);
    const link = part(trace, 'link');
    const given = link['opacity'];
    const opacity = (typeof given === 'number' ? given : 1) * traceOpacity(trace);
    const widths = this.#widths;
    const order = orders(ctx.index);
    const tubes = this.#tubes();

    if (!tubes) {
      const lines = linkLines(paths, t);
      const vertices = lines.link.length;
      let width: ScalarInput = widths[0] ?? 1;
      if (widths.some((w) => w !== widths[0])) {
        const each = new Float32Array(vertices);
        for (let v = 0; v < vertices; v++) each[v] = widths[lines.link[v]!]!;
        width = each;
      }
      const data = {
        x: lines.x,
        y: lines.y,
        z: lines.z,
        connectGaps: false,
        color: perVertex(this.#lineColors(), lines.link),
        width,
        dash: typeof link['dash'] === 'string' ? link['dash'] : 'solid',
        opacity,
        join: 'round' as const,
      };
      if (!this.#lines) {
        this.#lines = m3d.createLine3D(ctx.primitives, data, { renderOrder: order.links });
        this.#lines.object.userData[PICK_TAG] = 'links';
        ctx.add(this.#lines, scene.viewport);
      } else this.#lines.update(data);
      this.#lineLinks = lines.link;
      this.#lines.object.userData[PICK_LINKS] = lines.link;
      registerScenePickable(scene, this.#lines, ctx.index);
    } else this.#lines = this.#remove(this.#lines as Primitive<never> | undefined);

    const arrows = arrowsOf(trace);
    if (!tubes && !arrows.end && !arrows.start) {
      this.#removeMesh();
      this.#worldKey = key;
      return;
    }
    const mesh = linkMesh({
      paths,
      x,
      y,
      z,
      radius,
      source: model.source,
      target: model.target,
      tube: tubes ? Float32Array.from(widths, (w) => (w / 2) * unit) : undefined,
      arrows:
        arrows.end || arrows.start
          ? { ...arrows, length: Float32Array.from(arrowSizes(trace, widths), (s) => s * unit) }
          : undefined,
      color: this.#meshColors(),
    });
    const data = {
      positions: mesh.positions,
      origin: mesh.origin,
      indices: mesh.indices,
      normals: mesh.normals,
      color: mesh.colors,
      opacity,
      ...sceneMeshLighting(LINK_LIGHTING),
    };
    if (!this.#mesh) {
      this.#mesh = createLazyMeshPrimitive(ctx.primitives, data);
      this.#mesh.object.userData[PICK_TAG] = 'links';
      ctx.add(this.#mesh, scene.viewport);
      this.#offRig = scene.useLightRig(this.#mesh);
    } else this.#mesh.update(data);
    this.#meshLinks = mesh.link;
    this.#mesh.object.userData[PICK_LINKS] = mesh.link;
    this.#mesh.object.renderOrder = order.links;
    this.#mesh.setTransform(WORLD);
    registerScenePickable(scene, this.#mesh, ctx.index);
    this.#worldKey = key;
  }

  #cameraMoved(): void {
    if (!this.#text || this.#disposed) return;
    clearTimeout(this.#labelTimer);
    this.#labelTimer = setTimeout(() => {
      if (this.#disposed) return;
      this.#cullLabels();
      this.#ctx.invalidate();
    }, LABEL_REST_MS);
  }

  /** Width of node `i`'s label in px (0 for none), measured on first use. */
  #labelWidth(i: number): number {
    const { calc, trace } = this.#ctx;
    const widths = (this.#labelWidths ??= new Float32Array(calc.length).fill(NaN));
    let w = widths[i]!;
    if (Number.isNaN(w)) {
      const text = nodeLabel(calc.model, i);
      w =
        text === ''
          ? 0
          : measureLabel(labelContent(text, labelFont(trace)), LABEL_LINE_HEIGHT).width;
      widths[i] = w;
    }
    return w;
  }

  /** The labels for the camera of the moment (see the module comment). */
  #cullLabels(): void {
    const scene = this.#scene;
    if (!this.#text || !scene) return;
    const { trace, calc } = this.#ctx;
    const { model } = calc;
    const node = part(trace, 'node');
    const position = String(node['textposition'] ?? 'auto');
    const placement = labelPlacement(position === 'auto' ? 'middle right' : position);
    const font = labelFont(trace);
    const spheres = this.#spheres();
    const unit = sceneSizeUnit(scene);

    // The candidates: the drawn, labelled nodes with the most links.
    this.#labelOrder ??= labelPriority(model.degree);
    const order: number[] = [];
    for (const i of this.#labelOrder) {
      if (calc.hidden[i] === 1 || nodeLabel(model, i) === '') continue;
      order.push(i);
      if (order.length >= LABEL_CANDIDATES) break;
    }
    // Where every drawn node is on screen, and how large (a sphere's radius in px at its depth):
    // all of them are in the way of a label. A huge graph is dots: only the candidates count.
    const n = calc.length;
    const sx = new Float32Array(n).fill(NaN);
    const sy = new Float32Array(n).fill(NaN);
    const half = new Float32Array(n);
    const up = scene.viewport.camera.matrixWorld.elements;
    const at = { x: 0, y: 0, depth: 0 };
    const edge = { x: 0, y: 0, depth: 0 };
    const place = (i: number): void => {
      if (calc.hidden[i] === 1) return;
      const w = scene.toWorld(calc.x[i]!, calc.y[i]!, calc.z[i]!);
      scene.project(w[0], w[1], w[2], at);
      if (!(at.depth > -1 && at.depth < 1)) return;
      sx[i] = at.x;
      sy[i] = at.y;
      const r = (model.size[i]! / 2) * unit;
      if (spheres) {
        scene.project(w[0] + up[4]! * r, w[1] + up[5]! * r, w[2] + up[6]! * r, edge);
        half[i] = Math.hypot(edge.x - at.x, edge.y - at.y);
      } else half[i] = model.size[i]! / 2;
    };
    // With an emphasis its nodes' labels are placed among themselves, the nodes it is about first.
    const emphasis = this.#emphasis();
    const emphasized = emphasis
      ? emphasizedOrder(this.#labelOrder, emphasis).filter(
          (i) => calc.hidden[i] !== 1 && nodeLabel(model, i) !== '',
        )
      : [];
    if (n <= LABEL_OBSTACLES) for (let i = 0; i < n; i++) place(i);
    else for (const i of [...order, ...emphasized]) place(i);
    const rect = scene.viewport.rect;
    const culling = {
      x: sx,
      y: sy,
      radius: half,
      width: (i: number) => this.#labelWidth(i),
      height: measureText('X', font, LABEL_LINE_HEIGHT).height,
      placement,
      view: { x0: rect.x, y0: rect.y, x1: rect.x + rect.width, y1: rect.y + rect.height },
    };
    const kept = cullLabels3d({ ...culling, order });
    // As in 2D: the labels that are drawn anyway stay where they are, dimmed unless they are
    // among the emphasized nodes' labels, and those of them that were not drawn are added.
    const lit = emphasis
      ? new Set(cullLabels3d({ ...culling, order: emphasized, max: EMPHASIS_LABELS_MAX }))
      : undefined;
    const fontColor = part(node, 'textfont')['color'];
    const given = typeof fontColor === 'string' ? toRGBA(fontColor) : null;
    const color = given ?? [0, 0, 0, 1];
    const opacity = traceOpacity(trace);
    const labels: TextLabel[] = [];
    const add = (i: number, dim: number): void => {
      const content = labelContent(nodeLabel(model, i), font);
      labels.push({
        text: content.text,
        x: calc.x[i]!,
        y: calc.y[i]!,
        z: calc.z[i]!,
        lineHeight: LABEL_LINE_HEIGHT,
        // A halo is drawn in full whatever the text's alpha: a dimmed label has none.
        font: dim < 1 ? { ...content.font, shadow: 'none' } : content.font,
        color: [color[0], color[1], color[2], color[3] * opacity * dim],
        anchorX: placement.anchorX,
        anchorY: placement.anchorY,
        offset: [placement.dx * (half[i]! + LABEL_GAP), placement.dy * (half[i]! + LABEL_GAP)],
        ...(content.runs ? { runs: content.runs } : {}),
      });
    };
    for (const i of kept) {
      add(i, lit && emphasis && !lit.has(i) ? emphasis.dim : 1);
      lit?.delete(i);
    }
    for (const i of lit ?? []) add(i, 1);
    this.#text.update({ labels });
  }
}

export const graph3dRenderer: TraceRenderer<Graph3dCalc> = {
  create: (ctx) => new Graph3dView(ctx),
};
