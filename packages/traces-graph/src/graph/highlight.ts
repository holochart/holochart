/**
 * What a `graph` trace emphasizes (backlog G5): the neighbourhood of the node or link under the
 * pointer, and a shortest path between two nodes. Pure: from the model and the `highlight`
 * attributes to an {@link Emphasis}, the flags of the nodes and links that keep their look while
 * the rest is dimmed. `style.ts` turns the flags into opacities and colors, and the view only
 * uploads those: nothing is laid out or built again for a highlight.
 *
 * - **Hover** (`highlight.mode` has `'neighbors'`): over a node, the node, the links followed
 *   from it within `highlight.hops` and the nodes they reach, along `highlight.direction`; over a
 *   link, the link and its two ends. Skipped for a graph of more than {@link HIGHLIGHT_MAX} nodes
 *   and links together.
 * - **Given nodes** (`highlight.nodes`): the same neighbourhood, of the nodes the figure names,
 *   without a pointer and whatever the mode or the size of the graph.
 * - **Path**: `highlight.path: [from, to]`, else (with `'path'` in `highlight.mode`) the two
 *   nodes of a selection of exactly two. Fewest links, or with `highlight.pathweight: 'value'`
 *   the smallest sum of `link.value`; along the links' direction with `highlight.pathdirected`.
 *
 * A hover comes first while it lasts, then the given nodes, then a path. Nodes that are not drawn (a hidden group, a folded
 * subtree) are not there: nothing passes through them.
 *
 * {@link graphPath} is the path as an app reads it, from a defaulted trace (`chart.fullData[i]`):
 * node and link indices are the trace's own.
 */
import { isArrayLike, toRGBA, type RGBAColor } from '@mk7s/holochart-core';
import { buildGraphModel, type GraphModel } from './model.ts';
import {
  buildAdjacency,
  neighborCounts,
  neighborhood,
  shortestPath,
  type Adjacency,
  type GraphPath,
  type GraphSubset,
  type LinkDirection,
} from './neighbors.ts';

/** Above this many nodes and links together, a hover highlights nothing. */
export const HIGHLIGHT_MAX = 50_000;

/** The nodes and links that keep their look while the others are dimmed. */
export interface Emphasis extends GraphSubset {
  /** Opacity factor of what is not in it. */
  readonly dim: number;
  /** The color of its links, when they do not keep their own. */
  readonly color: RGBAColor | null;
  /**
   * The nodes it is about (the hovered node, the two ends of a link or of a path): their labels
   * are placed before every other, the other emphasized nodes' next.
   */
  readonly focus?: readonly number[];
}

/** What the pointer is over: a node, or a kept link (a position in the model's link arrays). */
export type GraphHit =
  { readonly kind: 'node'; readonly i: number } | { readonly kind: 'link'; readonly k: number };

type Container = Readonly<Record<string, unknown>>;

function part(trace: Container, key: string): Container {
  const v = trace[key];
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Container) : {};
}

/** The `highlight` attributes of a defaulted trace, read once per use. */
export interface HighlightOptions {
  /** Hover highlighting is on. */
  readonly neighbors: boolean;
  /** Two selected nodes highlight a path. */
  readonly selectedPath: boolean;
  readonly hops: number;
  readonly direction: LinkDirection;
  readonly dim: number;
  readonly color: RGBAColor | null;
  /** `highlight.nodes`: the node indices it names (whole numbers; empty for none). */
  readonly nodes: readonly number[];
  /** `highlight.path`, when it names two node indices. */
  readonly path: readonly [number, number] | undefined;
  readonly weighted: boolean;
  readonly directed: boolean;
}

export function highlightOptions(trace: Container): HighlightOptions {
  const h = part(trace, 'highlight');
  const mode = typeof h['mode'] === 'string' ? h['mode'].split('+') : ['neighbors', 'path'];
  const hops = h['hops'];
  const dim = h['dim'];
  const direction = h['direction'];
  const path = h['path'];
  const ends =
    isArrayLike(path) && typeof path !== 'string' && path.length >= 2
      ? ([path[0], path[1]] as const)
      : undefined;
  const whole = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;
  const named = h['nodes'];
  const nodes =
    isArrayLike(named) && typeof named !== 'string'
      ? Array.from(named as ArrayLike<unknown>).filter(whole)
      : [];
  return {
    neighbors: mode.includes('neighbors'),
    selectedPath: mode.includes('path'),
    hops: typeof hops === 'number' && hops >= 0 ? Math.floor(hops) : 1,
    direction: direction === 'out' || direction === 'in' ? direction : 'both',
    dim: typeof dim === 'number' && dim >= 0 && dim <= 1 ? dim : 0.15,
    color: typeof h['color'] === 'string' ? toRGBA(h['color']) : null,
    nodes,
    path: ends && whole(ends[0]) && whole(ends[1]) ? [ends[0], ends[1]] : undefined,
    weighted: h['pathweight'] === 'value',
    directed: h['pathdirected'] === true,
  };
}

const ADJACENCY = new WeakMap<GraphModel, Adjacency>();
const NEIGHBORS = new WeakMap<GraphModel, Int32Array>();

/** The adjacency of a model's kept links, built on first use. */
export function adjacencyOf(model: GraphModel): Adjacency {
  let adjacency = ADJACENCY.get(model);
  if (!adjacency) {
    adjacency = buildAdjacency(model.nodes, model.source, model.target);
    ADJACENCY.set(model, adjacency);
  }
  return adjacency;
}

/** How many other nodes each node is linked to, counted on first use. */
export function neighborsOf(model: GraphModel): Int32Array {
  let counts = NEIGHBORS.get(model);
  if (!counts) {
    counts = neighborCounts(adjacencyOf(model));
    NEIGHBORS.set(model, counts);
  }
  return counts;
}

/** What a highlight leaves out of the graph: the nodes and links that are not drawn. */
export interface Undrawn {
  readonly hidden?: Uint8Array | undefined;
  readonly omitted?: Uint8Array | undefined;
}

/** Whether hover highlighting runs for this model (see the module comment). */
export function hoverHighlights(model: GraphModel, options: HighlightOptions): boolean {
  return options.neighbors && model.nodes + model.links <= HIGHLIGHT_MAX;
}

/** The emphasis of a hover on `hit`, or `undefined` when hovering highlights nothing. */
export function hoverEmphasis(
  model: GraphModel,
  hit: GraphHit | undefined,
  options: HighlightOptions,
  undrawn: Undrawn = {},
): Emphasis | undefined {
  if (!hit || !hoverHighlights(model, options)) return undefined;
  const { dim, color } = options;
  if (hit.kind === 'link') {
    if (!(hit.k >= 0 && hit.k < model.links)) return undefined;
    const node = new Uint8Array(model.nodes);
    const link = new Uint8Array(model.links);
    link[hit.k] = 1;
    const a = model.source[hit.k]!;
    const b = model.target[hit.k]!;
    node[a] = 1;
    node[b] = 1;
    return { node, link, dim, color, focus: [a, b] };
  }
  if (!(hit.i >= 0 && hit.i < model.nodes)) return undefined;
  const subset = neighborhood(adjacencyOf(model), [hit.i], options.hops, options.direction, {
    hiddenNodes: undrawn.hidden,
    hiddenLinks: undrawn.omitted,
  });
  return { ...subset, dim, color, focus: [hit.i] };
}

/** The emphasis of `highlight.nodes`: their neighbourhood; `undefined` when it names no node. */
export function givenEmphasis(
  model: GraphModel,
  options: HighlightOptions,
  undrawn: Undrawn = {},
): Emphasis | undefined {
  const seeds = options.nodes.filter((i) => i < model.nodes && undrawn.hidden?.[i] !== 1);
  if (seeds.length === 0) return undefined;
  const subset = neighborhood(adjacencyOf(model), seeds, options.hops, options.direction, {
    hiddenNodes: undrawn.hidden,
    hiddenLinks: undrawn.omitted,
  });
  return { ...subset, dim: options.dim, color: options.color, focus: seeds };
}

/**
 * The two nodes a path is asked between: `highlight.path`, else the selection when it is exactly
 * two nodes and `highlight.mode` has `'path'`. A selection has no first and last node: its path
 * runs from the lower index to the higher, and when the links' direction counts and there is no
 * such path, the other way.
 */
export function pathEnds(
  options: HighlightOptions,
  selectedPoints: readonly number[] | null | undefined,
): { from: number; to: number; either: boolean } | undefined {
  if (options.path) return { from: options.path[0], to: options.path[1], either: false };
  if (!options.selectedPath || !selectedPoints || selectedPoints.length !== 2) return undefined;
  const a = selectedPoints[0]!;
  const b = selectedPoints[1]!;
  if (a === b) return undefined;
  return { from: Math.min(a, b), to: Math.max(a, b), either: true };
}

/** The path the trace highlights, in the model's link positions; `undefined` for none. */
export function modelPath(
  model: GraphModel,
  options: HighlightOptions,
  selectedPoints: readonly number[] | null | undefined,
  undrawn: Undrawn = {},
): GraphPath | undefined {
  const ends = pathEnds(options, selectedPoints);
  if (!ends) return undefined;
  const adjacency = adjacencyOf(model);
  const walk = {
    directed: options.directed,
    cost: options.weighted ? model.weight : undefined,
    hiddenNodes: undrawn.hidden,
    hiddenLinks: undrawn.omitted,
  };
  const path = shortestPath(adjacency, ends.from, ends.to, walk);
  if (path || !ends.either || !options.directed) return path;
  return shortestPath(adjacency, ends.to, ends.from, walk);
}

/** The emphasis of a path: its nodes and its links. */
export function pathEmphasis(
  model: GraphModel,
  path: GraphPath,
  options: HighlightOptions,
): Emphasis {
  const node = new Uint8Array(model.nodes);
  const link = new Uint8Array(model.links);
  for (const i of path.nodes) node[i] = 1;
  for (const k of path.links) link[k] = 1;
  return {
    node,
    link,
    dim: options.dim,
    color: options.color,
    focus: [path.nodes[0]!, path.nodes[path.nodes.length - 1]!],
  };
}

/** A highlighted path as an app reads it: indices are the trace's own. @experimental */
export interface GraphPathInfo {
  /** Node indices from the first node of the path to its last. */
  readonly nodes: number[];
  /** The link between each node and the next, as indices into the trace's `link` arrays. */
  readonly links: number[];
  /**
   * What the path costs: the number of its links, or with `highlight.pathweight: 'value'` the
   * sum of their `link.value`.
   */
  readonly length: number;
}

/** `path` with its links as indices into the trace's link arrays. */
export function pathInfo(model: GraphModel, path: GraphPath): GraphPathInfo {
  return {
    nodes: [...path.nodes],
    links: path.links.map((k) => model.linkIndex[k]!),
    length: path.length,
  };
}

const MODELS = new WeakMap<object, GraphModel>();

/**
 * The path a `graph` trace highlights: between the two nodes of `highlight.path`, else between
 * the two selected nodes (`selectedpoints`) when exactly two are and `highlight.mode` has
 * `'path'`. `trace` is a defaulted trace, `chart.fullData[i]`, which holds the selection made on
 * the chart; read it in a `selected` listener or after an update. `undefined`: no path is asked
 * for, or there is none between the two nodes.
 *
 * It counts every node of the trace; the chart leaves out the nodes that are not drawn (a group
 * hidden through the legend, a folded subtree).
 * @experimental
 */
export function graphPath(trace: Readonly<Record<string, unknown>>): GraphPathInfo | undefined {
  if (trace === null || typeof trace !== 'object' || trace['type'] !== 'graph') return undefined;
  const options = highlightOptions(trace);
  const selected = trace['selectedpoints'];
  const points =
    isArrayLike(selected) && typeof selected !== 'string'
      ? Array.from(selected as ArrayLike<unknown>).filter((v): v is number => typeof v === 'number')
      : null;
  if (!pathEnds(options, points)) return undefined;
  let model = MODELS.get(trace);
  if (!model) {
    model = buildGraphModel(trace as Parameters<typeof buildGraphModel>[0]);
    MODELS.set(trace, model);
  }
  const path = modelPath(model, options, points);
  return path ? pathInfo(model, path) : undefined;
}

/** The most labels a highlight adds to those that are drawn anyway. */
export const EMPHASIS_LABELS_MAX = 200;

/**
 * The emphasized nodes in the order their labels are placed: the nodes the emphasis is about
 * first, then the others as `order` has them (node indices in label priority). Placed among
 * themselves, their labels show even where the culling of all labels had left them out.
 */
export function emphasizedOrder(
  order: Uint32Array,
  emphasis: Pick<Emphasis, 'node' | 'focus'>,
): number[] {
  const { node } = emphasis;
  const out: number[] = [];
  const first = new Set<number>();
  for (const i of emphasis.focus ?? []) {
    if (i >= 0 && i < node.length && node[i] === 1 && !first.has(i)) {
      first.add(i);
      out.push(i);
    }
  }
  for (let k = 0; k < order.length; k++) {
    const i = order[k]!;
    if (node[i] === 1 && !first.has(i)) out.push(i);
  }
  return out;
}
