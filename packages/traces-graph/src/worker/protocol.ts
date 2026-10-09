/**
 * The messages between a page and the layout worker (backlog G7, ADR-011, ADR-029), and how a
 * graph and a layout result cross the thread boundary.
 *
 * The page sends {@link LayoutRequest}s and {@link LayoutCancel}s; the worker answers each request
 * with any number of `progress` messages and then exactly one of `done`, `error` or `cancelled`.
 * Every message carries the request's `id`, so an answer to a request the page has given up on is
 * recognised and dropped. The worker says `ready` once, when it has loaded.
 *
 * Who owns what:
 * - **The graph** is the worker's from the moment it is posted: its arrays are transferred, not
 *   cloned ({@link graphTransferables}). A caller that still needs them (the usual case: the trace
 *   draws from the same arrays) sends a copy ({@link copyGraph}), which is what the client does
 *   unless told to move them. One copy on the page and a transfer is cheaper than a structured
 *   clone, which copies on both sides.
 * - **Progress positions** are copies of the simulation's arrays, transferred to the page, which
 *   may keep them.
 * - **The result** is transferred to the page whole. Its routes travel as three flat arrays
 *   ({@link EncodedRoutes}) instead of one object per link, and are views into one buffer once
 *   decoded.
 *
 * Only built-in arrangements can run in the worker. A layout registered with
 * `registerGraphLayout` is a function of the page and cannot be sent; `arrangement: 'custom'`
 * stays on the main thread.
 */
import type { BundleOptions } from '../layout/bundle/index.ts';
import type { ForceStart } from '../layout/force/warm.ts';
import type { LayoutGraph, LayoutResult, LinkRoute } from '../layout/types.ts';

/** Version of this protocol: the worker reports it in `ready`, and the client checks it. */
export const LAYOUT_PROTOCOL = 2;

/** The arrangements the worker can run: every built-in one. */
export const WORKER_ARRANGEMENTS = [
  'preset',
  'force',
  'layered',
  'tree',
  'radial',
  'dendrogram',
  'circular',
  'grid',
  'arc',
  'hive',
] as const;

/** An arrangement the worker can run. */
export type WorkerArrangement = (typeof WORKER_ARRANGEMENTS)[number];

/** How often a simulation reports its positions. */
export interface LayoutProgressOptions {
  /** Ticks between two reports at least. Default 1. */
  readonly everyTicks?: number;
  /** Milliseconds between two reports at least. Default 16 (one frame at 60 Hz). */
  readonly interval?: number;
}

/** Page → worker: lay out a graph. */
export interface LayoutRequest {
  readonly type: 'layout';
  /** Chosen by the sender; every answer carries it. */
  readonly id: number;
  readonly arrangement: WorkerArrangement;
  /** The worker's from here on (see the file comment). */
  readonly graph: LayoutGraph;
  /**
   * The layout's own options (`ForceOptions`, `LayeredOptions`, …), as calc would pass them to
   * the layout. They are cloned, so they must hold data only: no functions.
   */
  readonly options?: unknown;
  /**
   * `force` only: positions the simulation goes on from instead of starting from the spiral, and
   * how warm it is there (the trace's `force.start`). The result is then what the simulation
   * ends on, neither centered nor cleared of overlaps afterwards.
   */
  readonly start?: ForceStart;
  /**
   * Bundle the links once the nodes are placed (`bundleLinks`): the result's `routes` are then
   * the bundled ones. The positions are reported first, in a `progress` with `settled`.
   */
  readonly bundle?: BundleOptions;
  /** `false`: no `progress` messages. Default: {@link LayoutProgressOptions}' defaults. */
  readonly progress?: LayoutProgressOptions | false;
  /**
   * Milliseconds of work between two looks at the message queue (for a `cancel`, and on the main
   * thread for everything else the page does). A tick is never cut, so a slice lasts at least one
   * tick. Default 8.
   */
  readonly slice?: number;
}

/** Page → worker: stop a request. The worker answers `cancelled`, unless it had already ended. */
export interface LayoutCancel {
  readonly type: 'cancel';
  readonly id: number;
}

/** Everything the page sends. */
export type LayoutMessage = LayoutRequest | LayoutCancel;

/** Worker → page, once: the worker has loaded and takes requests. */
export interface LayoutReady {
  readonly type: 'ready';
  readonly protocol: number;
}

/** Worker → page: where a simulation is. The arrays are the page's to keep. */
export interface LayoutProgressMessage {
  readonly type: 'progress';
  readonly id: number;
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly z?: Float64Array;
  /** How far from rest, 1 to 0. */
  readonly alpha: number;
  /** Ticks run so far and the ticks from start to rest. */
  readonly ticks: number;
  readonly totalTicks: number;
  /**
   * These are the final positions (overlaps removed, centered): only the bundled routes are still
   * to come. Sent once, and only for a request with `bundle`.
   */
  readonly settled: boolean;
}

/** Worker → page: the layout. */
export interface LayoutDone {
  readonly type: 'done';
  readonly id: number;
  readonly result: EncodedLayoutResult;
  /** Ticks run (0 for a layout that is not a simulation). */
  readonly ticks: number;
  /** Milliseconds spent computing, the pauses between slices left out. */
  readonly elapsed: number;
  /**
   * For a request with `bundle`: the method that gave the routes (`'none'`: no link got one), and
   * whether force bundling was refused because the graph is over its size cap.
   */
  readonly bundle?: LayoutBundleInfo;
}

/** How the bundling of a request went (see `BundleResult`). */
export interface LayoutBundleInfo {
  readonly method: 'hierarchical' | 'force' | 'none';
  readonly refused: boolean;
}

/** Worker → page: the layout threw. */
export interface LayoutFailed {
  readonly type: 'error';
  readonly id: number;
  readonly name: string;
  readonly message: string;
  readonly stack?: string;
}

/** Worker → page: the request was cancelled before it ended. */
export interface LayoutCancelled {
  readonly type: 'cancelled';
  readonly id: number;
}

/** Everything the worker sends. */
export type LayoutResponse =
  LayoutReady | LayoutProgressMessage | LayoutDone | LayoutFailed | LayoutCancelled;

/**
 * A list of routes as three arrays: route `k` is `kind[k]` (0: none, the link is straight; 1: a
 * polyline; 2: a spline) and its points are `points[start[k] … start[k + 1])`.
 */
export interface EncodedRoutes {
  readonly kind: Uint8Array;
  /** One more entry than there are routes. */
  readonly start: Uint32Array;
  readonly points: Float64Array;
}

/**
 * A {@link LayoutResult}, or what a layout returns on top of one (`order`, `hidden`, `valueAxis`,
 * …), ready to post: `fields` holds every property that is not a list of routes (typed arrays,
 * which are transferred, and plain values, which are cloned), `routes` every list of routes by
 * property name (`routes`, a tree's `parentRoutes`).
 */
export interface EncodedLayoutResult {
  readonly fields: Readonly<Record<string, unknown>>;
  readonly routes: Readonly<Record<string, EncodedRoutes>>;
}

const KIND_CODE = { polyline: 1, spline: 2 } as const;
const KIND_NAME = [undefined, 'polyline', 'spline'] as const;

const isRoute = (value: unknown): value is LinkRoute =>
  typeof value === 'object' &&
  value !== null &&
  (value as LinkRoute).points instanceof Float64Array &&
  ((value as LinkRoute).kind === 'polyline' || (value as LinkRoute).kind === 'spline');

/** A property that holds routes: by its name, or an array of nothing but routes and gaps. */
function isRouteList(name: string, value: unknown): value is readonly (LinkRoute | undefined)[] {
  if (!Array.isArray(value)) return false;
  let routes = 0;
  for (let k = 0; k < value.length; k++) {
    const entry: unknown = value[k];
    if (entry === undefined || entry === null) continue;
    if (!isRoute(entry)) return false;
    routes++;
  }
  return routes > 0 || name === 'routes' || name === 'parentRoutes';
}

/** `routes` as flat arrays (see {@link EncodedRoutes}). Missing entries of a sparse list are straight. */
export function encodeRoutes(routes: readonly (LinkRoute | undefined)[]): EncodedRoutes {
  const count = routes.length;
  const kind = new Uint8Array(count);
  const start = new Uint32Array(count + 1);
  let total = 0;
  for (let k = 0; k < count; k++) {
    const route = routes[k];
    start[k] = total;
    if (!route) continue;
    kind[k] = KIND_CODE[route.kind];
    total += route.points.length;
  }
  start[count] = total;
  const points = new Float64Array(total);
  for (let k = 0; k < count; k++) {
    const route = routes[k];
    if (route) points.set(route.points, start[k]!);
  }
  return { kind, start, points };
}

/**
 * The routes of {@link encodeRoutes}, one object per routed link again. Their `points` are views
 * into the one `encoded.points` buffer, not copies.
 */
export function decodeRoutes(encoded: EncodedRoutes): (LinkRoute | undefined)[] {
  const { kind, start, points } = encoded;
  const routes = new Array<LinkRoute | undefined>(kind.length).fill(undefined);
  for (let k = 0; k < kind.length; k++) {
    const name = KIND_NAME[kind[k]!];
    if (name) routes[k] = { points: points.subarray(start[k]!, start[k + 1]!), kind: name };
  }
  return routes;
}

/** `result` in the form it is posted in. Nothing is copied but the routes' points. */
export function encodeResult(result: LayoutResult): EncodedLayoutResult {
  const fields: Record<string, unknown> = {};
  const routes: Record<string, EncodedRoutes> = {};
  for (const [name, value] of Object.entries(result)) {
    if (value === undefined) continue;
    if (isRouteList(name, value)) routes[name] = encodeRoutes(value);
    else fields[name] = value;
  }
  return { fields, routes };
}

/** The result {@link encodeResult} was given, with the same properties. */
export function decodeResult<Result extends LayoutResult = LayoutResult>(
  encoded: EncodedLayoutResult,
): Result {
  const result: Record<string, unknown> = { ...encoded.fields };
  for (const [name, routes] of Object.entries(encoded.routes)) result[name] = decodeRoutes(routes);
  return result as unknown as Result;
}

/** The buffers of the typed arrays directly in `values`, each once; shared memory is left out. */
function buffersOf(values: Iterable<unknown>, into: Set<ArrayBuffer>): void {
  for (const value of values) {
    if (ArrayBuffer.isView(value) && value.buffer instanceof ArrayBuffer) into.add(value.buffer);
  }
}

/** What to transfer with a {@link LayoutRequest}: the buffers of the graph's arrays. */
export function graphTransferables(graph: LayoutGraph): ArrayBuffer[] {
  const buffers = new Set<ArrayBuffer>();
  buffersOf(Object.values(graph), buffers);
  return [...buffers];
}

/** What to transfer with a `done` message: the buffers of the result's arrays and routes. */
export function resultTransferables(encoded: EncodedLayoutResult): ArrayBuffer[] {
  const buffers = new Set<ArrayBuffer>();
  buffersOf(Object.values(encoded.fields), buffers);
  for (const routes of Object.values(encoded.routes)) buffersOf(Object.values(routes), buffers);
  return [...buffers];
}

/**
 * `graph` with a copy of each of its arrays, for a caller that sends a graph to the worker and
 * keeps its own. A view of part of a larger buffer is copied as that part alone.
 */
export function copyGraph(graph: LayoutGraph): LayoutGraph {
  const copy: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(graph)) {
    copy[name] = ArrayBuffer.isView(value)
      ? (value as unknown as { slice(): unknown }).slice()
      : value;
  }
  return copy as unknown as LayoutGraph;
}
