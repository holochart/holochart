/**
 * What a `graph` calc can leave for later (backlog G7): a layout that runs off the main thread,
 * and the bundling of the links. Calc is synchronous, so a calc that waits for either says so
 * (`GraphCalc.pending`) and is drawn with what it has: the nodes where a cheap placement puts
 * them (a force layout's own start, a circle for the others), or the links straight. The view
 * asks for the work (`stream.ts`), keeps the answer here under a key, and has calc run again
 * (`TracePlotContext.recalc`): the second calc finds the answer and is the calc a synchronous
 * layout would have returned. Nothing in the figure changes for it.
 *
 * ## The key
 *
 * A layout is kept under the calc's `layoutKey`, the fingerprint of everything the layout reads,
 * and bundled routes under that key and the bundling's own options. So a calc for another reason
 * (a label, a color, a size that the layout does not read) finds the answers again and waits for
 * nothing, and a change of what the layout reads asks again. The last few answers are kept
 * ({@link KEPT}); an older one is computed again when it is asked for.
 *
 * ## Which layouts run off the main thread: `worker`
 *
 * {@link layoutThread} is the rule. Never: `'custom'` (a registered layout is a function of the
 * page), `'preset'`, `'circular'` and `'grid'` (nothing to wait for), an arrangement with a real
 * axis (a timeline, a dendrogram with values: the positions the layout works in are not the ones
 * on the axis), `force.start` at rest (nothing is simulated), and a trace with `worker: false`.
 * With `'auto'`, the sizes below; with `true`, whenever it can.
 *
 * The thresholds are where the wait on the main thread passes a quarter of a second on the
 * machine they were measured on (Apple M1 Max, Node 26, `bench/force.bench.ts` and
 * `bench/layered.bench.ts`, CPU time):
 *
 * - `force`: 1,000 nodes and 5,000 links take 263 ms at the default 300 ticks (0.88 ms a tick);
 *   5,000 nodes 0.95 s; 10,000 nodes and 50,000 links 1.04 s at 90 ticks.
 * - `layered`: 1,000 nodes and 2,000 links take 14 to 36 ms, 5,000 and 10,000 take 88 to 360 ms
 *   by the shape of the graph: a threshold of 3,000 nodes is 50 to 200 ms.
 * - force-directed bundling: about 0.13 ms a link (5,000 links: 0.65 s), so 1,000 links are a
 *   good tenth of a second. Hierarchical bundling is 6 ms for 5,000 links and stays on the main
 *   thread.
 *
 * The trees, the arc diagram and the hive plot are linear in the size of the graph and take a
 * few milliseconds at 10,000 nodes: `'auto'` leaves them where they are.
 *
 * ## The code
 *
 * The worker's client and the bundling are not in the trace's first chunk: {@link loadLayoutCode}
 * imports them when a calc first waits for something, which is never for a figure that neither
 * bundles nor uses the worker. Hierarchical bundles follow a dragged node, which needs the
 * bundling at once: {@link bundlerNow} is it, once it is loaded.
 */
import type { BundleOptions, BundleResult } from '../layout/bundle/index.ts';
import type { ForceStart } from '../layout/force/warm.ts';
import type { BundleGraph, BundlePositions } from '../layout/bundle/types.ts';
import type { LayoutGraph, LayoutResult, LinkRoute } from '../layout/types.ts';
import type { GraphCalc } from './calc.ts';

type Container = Readonly<Record<string, unknown>>;

function part(trace: Container, key: string): Container {
  const v = trace[key];
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Container) : {};
}

// ---- The rule -------------------------------------------------------------------------------------

/** `worker: 'auto'`: a force layout runs off the main thread from this many nodes or links. */
export const WORKER_FORCE_NODES = 1000;
export const WORKER_FORCE_LINKS = 5000;
/** `worker: 'auto'`: a layered layout runs off the main thread from this many nodes or links. */
export const WORKER_LAYERED_NODES = 3000;
export const WORKER_LAYERED_LINKS = 6000;
/** `worker: 'auto'`: force-directed bundling runs off the main thread from this many links. */
export const WORKER_BUNDLE_LINKS = 1000;

/** The arrangements whose layout can run in the worker (see the module comment). */
const IN_WORKER: ReadonlySet<string> = new Set([
  'force',
  'layered',
  'tree',
  'radial',
  'dendrogram',
  'arc',
  'hive',
]);

/** What {@link layoutThread} reads of a trace's layout. */
export interface LayoutLoad {
  readonly arrangement: string;
  readonly nodes: number;
  readonly links: number;
  /** The arrangement keeps one axis as a real scale. */
  readonly real: boolean;
  /** `force.start` with `alpha: 0`: the positions are the layout. */
  readonly atRest: boolean;
}

/** The trace's `worker`: `true`, `false` or `'auto'` (anything else is `false`). */
export function workerOf(trace: Container): boolean | 'auto' {
  const v = trace['worker'];
  return v === true || v === 'auto' ? v : false;
}

/** Whether the layout of a trace with this `worker` runs off the main thread. */
export function layoutThread(worker: boolean | 'auto', load: LayoutLoad): 'worker' | 'main' {
  if (worker === false || !IN_WORKER.has(load.arrangement) || load.real || load.atRest) {
    return 'main';
  }
  if (worker === true) return 'worker';
  if (load.arrangement === 'force') {
    return load.nodes >= WORKER_FORCE_NODES || load.links >= WORKER_FORCE_LINKS ? 'worker' : 'main';
  }
  if (load.arrangement === 'layered') {
    return load.nodes >= WORKER_LAYERED_NODES || load.links >= WORKER_LAYERED_LINKS
      ? 'worker'
      : 'main';
  }
  return 'main';
}

/**
 * Whether the bundling of `links` links runs in the worker: force-directed bundling with
 * `worker: true`, or with `'auto'` from {@link WORKER_BUNDLE_LINKS} links. Hierarchical bundling
 * is cheap and stays on the main thread, and so does everything with `worker: false`.
 */
export function bundleThread(
  worker: boolean | 'auto',
  method: 'hierarchical' | 'force',
  links: number,
): 'worker' | 'main' {
  if (worker === false || method !== 'force') return 'main';
  return worker === true || links >= WORKER_BUNDLE_LINKS ? 'worker' : 'main';
}

// ---- Bundling: options and the space it works in -----------------------------------------------------

/** Hierarchical bundles follow the nodes while they move up to this many bundled links. */
export const LIVE_BUNDLE_LINKS = 5000;

/** The trace's `link.bundle`, when it bundles: the method asked for and the two numbers. */
export interface BundleAsk {
  readonly method: 'auto' | 'hierarchical' | 'force';
  readonly strength: number;
  readonly compatibility: number;
}

/** `link.bundle` of a defaulted trace; `undefined` when it bundles nothing. */
export function bundleAskOf(trace: Container): BundleAsk | undefined {
  const b = part(part(trace, 'link'), 'bundle');
  const method = b['method'];
  if (method !== 'auto' && method !== 'hierarchical' && method !== 'force') return undefined;
  const unit = (v: unknown, dflt: number): number =>
    typeof v === 'number' && v >= 0 && v <= 1 ? v : dflt;
  const strength = unit(b['strength'], 0.85);
  if (strength === 0) return undefined;
  return { method, strength, compatibility: unit(b['compatibility'], 0.6) };
}

/**
 * The space links are bundled in: positions in it are `(v − origin) × scale` of the calc's linear
 * coordinates, per axis. A computed arrangement is in layout units, a px each, and is bundled as
 * it is. Positions that are data (`'preset'`) may be anything on either axis, dates against
 * counts: they are bundled as they will be drawn, an estimate of their px in the plot area, so
 * that the angles and lengths the bundling compares are the ones on screen.
 */
export interface BundleSpace {
  readonly originX: number;
  readonly originY: number;
  readonly scaleX: number;
  readonly scaleY: number;
}

export const UNIT_SPACE: BundleSpace = { originX: 0, originY: 0, scaleX: 1, scaleY: 1 };

/** The px space of positions that are data, for a plot area of `width` × `height` px. */
export function dataSpace(
  x: Float64Array,
  y: Float64Array,
  width: number,
  height: number,
): BundleSpace {
  const extent = (values: Float64Array): [number, number] => {
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < values.length; i++) {
      const v = values[i]!;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    return hi > lo ? [lo, hi] : [Number.isFinite(lo) ? lo : 0, Number.isFinite(lo) ? lo : 0];
  };
  const [x0, x1] = extent(x);
  const [y0, y1] = extent(y);
  // An axis without an extent (every node at one value) takes the other's scale.
  let scaleX = x1 > x0 ? width / (x1 - x0) : 0;
  let scaleY = y1 > y0 ? height / (y1 - y0) : 0;
  if (scaleX === 0) scaleX = scaleY || 1;
  if (scaleY === 0) scaleY = scaleX;
  return { originX: x0, originY: y0, scaleX, scaleY };
}

/** `values` (linear coordinates along one axis) in the bundling space. */
export function toSpace(values: Float64Array, origin: number, scale: number): Float64Array {
  if (origin === 0 && scale === 1) return values;
  const out = new Float64Array(values.length);
  for (let i = 0; i < values.length; i++) out[i] = (values[i]! - origin) * scale;
  return out;
}

/** What calc knows of the bundling of a trace's links. */
export interface GraphBundle {
  readonly options: BundleOptions;
  /**
   * The links that are bundled, as positions in the model's links, when not all are (the others
   * have a route of the arrangement's own); and the graph the bundling is given, of those links.
   */
  readonly links: Int32Array | undefined;
  readonly graph: BundleGraph;
  readonly space: BundleSpace;
  /** The key the routes are kept under for a layout key: `${layoutKey}|${key}`. */
  readonly key: string;
  /** The routes the arrangement gave itself, which the bundled ones were laid over. */
  readonly base?: readonly (LinkRoute | undefined)[] | undefined;
  /** How the bundling went, once it has: the method that gave the routes, and a refusal. */
  readonly method?: BundleResult['method'] | undefined;
  readonly refused?: boolean | undefined;
}

/**
 * The routes of {@link GraphBundle.links} in the bundling space, as the calc's routes: in linear
 * coordinates, one entry per link of the model, over `base` (the arrangement's own routes, which
 * stay). `undefined` when no link has a route.
 */
export function bundledRoutes(
  bundle: Pick<GraphBundle, 'links' | 'space'>,
  routes: readonly (LinkRoute | undefined)[],
  links: number,
  base: readonly (LinkRoute | undefined)[] | undefined,
): readonly (LinkRoute | undefined)[] | undefined {
  const { originX, originY, scaleX, scaleY } = bundle.space;
  const unit = originX === 0 && originY === 0 && scaleX === 1 && scaleY === 1;
  const out: (LinkRoute | undefined)[] = new Array<LinkRoute | undefined>(links).fill(undefined);
  let any = false;
  if (base) {
    for (let k = 0; k < links; k++) {
      if (base[k]) {
        out[k] = base[k];
        any = true;
      }
    }
  }
  for (let j = 0; j < routes.length; j++) {
    const route = routes[j];
    const k = bundle.links ? bundle.links[j]! : j;
    if (!route || k >= links || out[k]) continue;
    any = true;
    if (unit) {
      out[k] = route;
      continue;
    }
    const points = new Float64Array(route.points.length);
    for (let i = 0; i + 1 < points.length; i += 2) {
      points[i] = route.points[i]! / scaleX + originX;
      points[i + 1] = route.points[i + 1]! / scaleY + originY;
    }
    out[k] = { points, kind: route.kind };
  }
  return any ? out : undefined;
}

/**
 * The routes to draw while the nodes of `calc` are at `at` and not where calc has them (a node
 * dragged, a layout settling, a glide): the arrangement's own routes `base`, and over them the
 * bundles again for these positions when they are hierarchical, few enough
 * ({@link LIVE_BUNDLE_LINKS}) and their code is loaded. Force-directed bundles are not made
 * again for a frame: their links are straight until the nodes rest.
 */
export function movingRoutes(
  calc: Pick<GraphCalc, 'bundle' | 'model'>,
  at: { readonly x: Float64Array; readonly y: Float64Array },
  base: readonly (LinkRoute | undefined)[] | undefined,
): readonly (LinkRoute | undefined)[] | undefined {
  const bundle = calc.bundle;
  const run = bundlerNow();
  if (
    !bundle ||
    !run ||
    bundle.method !== 'hierarchical' ||
    bundle.graph.source.length > LIVE_BUNDLE_LINKS
  ) {
    return base;
  }
  const { space } = bundle;
  const made = run(
    {
      x: toSpace(at.x, space.originX, space.scaleX),
      y: toSpace(at.y, space.originY, space.scaleY),
    },
    bundle.graph,
    bundle.options,
  );
  return bundledRoutes(bundle, made.routes, calc.model.links, base);
}

// ---- What a calc waits for ----------------------------------------------------------------------------

/** What a calc waits for: the request the view makes, and the key its answer is kept under. */
export interface GraphPending {
  readonly key: string;
  /**
   * `'layout'`: the nodes are at a cheap placement and the layout is to come. `'bundle'`: the
   * nodes are placed and the routes of the bundled links are to come.
   */
  readonly what: 'layout' | 'bundle';
  /** The arrangement to run (`'preset'` for bundling alone: the positions are in the graph). */
  readonly arrangement:
    'preset' | 'force' | 'layered' | 'tree' | 'radial' | 'dendrogram' | 'arc' | 'hive';
  readonly graph: LayoutGraph;
  readonly options: unknown;
  readonly start?: ForceStart | undefined;
  readonly bundle?: BundleOptions | undefined;
  /** In the worker, or on the main thread (in slices, through the same client). */
  readonly thread: 'worker' | 'main';
  /** The layout reports positions while it settles (`force`): the view can draw them. */
  readonly streams: boolean;
}

/** A layout that arrived, or the note that it failed (calc then runs it itself). */
export interface KeptLayout {
  readonly result?: LayoutResult | undefined;
  readonly failed?: boolean | undefined;
}

/** Bundled routes that arrived (in the bundling space, by bundled link). */
export interface KeptBundle {
  readonly routes: readonly (LinkRoute | undefined)[];
  readonly method: BundleResult['method'];
  readonly refused: boolean;
}

/** How many answers of each kind are kept. */
export const KEPT = 6;

class Kept<T> {
  readonly #map = new Map<string, T>();

  get(key: string): T | undefined {
    const hit = this.#map.get(key);
    if (hit !== undefined) {
      // The one used last is dropped last.
      this.#map.delete(key);
      this.#map.set(key, hit);
    }
    return hit;
  }

  set(key: string, value: T): void {
    this.#map.delete(key);
    this.#map.set(key, value);
    while (this.#map.size > KEPT) this.#map.delete(this.#map.keys().next().value as string);
  }

  clear(): void {
    this.#map.clear();
  }
}

/** The layouts that arrived, by `layoutKey`. */
export const LAYOUTS = new Kept<KeptLayout>();
/** The bundled routes that arrived, by `${layoutKey}|${bundle key}`. */
export const BUNDLES = new Kept<KeptBundle>();

// ---- The code -------------------------------------------------------------------------------------------

/** The lazy chunk: the worker's client and the bundling. */
export type LayoutCode = typeof import('./layout-code.ts');

let code: LayoutCode | undefined;
let loading: Promise<LayoutCode> | undefined;

/** Load the worker's client and the bundling, once. */
export function loadLayoutCode(): Promise<LayoutCode> {
  loading ??= import('./layout-code.ts').then((m) => (code = m));
  return loading;
}

/** Forget every answer, and that the code was loaded (for tests). */
export function clearPending(): void {
  LAYOUTS.clear();
  BUNDLES.clear();
  code = undefined;
  loading = undefined;
}

/**
 * The bundling, if its code is loaded: for the frames of a drag, which cannot wait, and for
 * calc, which makes hierarchical bundles itself once it can.
 */
export function bundlerNow():
  | ((positions: BundlePositions, graph: BundleGraph, options: BundleOptions) => BundleResult)
  | undefined {
  return code?.bundleLinks;
}
