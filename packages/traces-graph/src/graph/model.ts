/**
 * The model of a `graph` trace (backlog G1, ADR-029): what calc builds from the defaulted trace
 * before anything is placed. Nodes and links are counted and validated once, here, and everything
 * per node or per link is a typed array, so a graph of 100,000 nodes costs a few megabytes and no
 * objects.
 *
 * ## Nodes
 *
 * With `node` / `link` input the node count is the length of the longest per-node data array
 * (`node.label`, `x`, `y`, `group`, `customdata`, and `size` / `color` when they are arrays).
 * Without any of them it is one more than the largest index a link names, as for sankey.
 *
 * With tree input (`parents`, and no `link.source`) every row is a node, its id is `ids[i]`, else
 * `labels[i]`, and every row with a parent gets a link from the parent to it. A parent id that is
 * no row's id becomes a node of its own after the rows (the root that treemap data often leaves
 * out). A row that names itself, or a chain of parents that comes back to its start, is cut where
 * it closes, and the link is counted as dropped.
 *
 * ## Links
 *
 * A link is kept when both its ends are node indices (whole numbers in range; numeric strings
 * count). The others are dropped and counted (`dropped`), and `linkIndex` maps the kept links back
 * to the trace's arrays. Self-links and parallel links are kept: `loop` numbers the self-links of
 * a node and `fan` holds the curvature that tells parallel links apart.
 */
import { isArrayLike, type FullTrace } from '@mk7s/holochart-core';
import { TEXT_DEFAULT_FONT, type TextFont, type TextFontWeight } from '@mk7s/holochart-render';
import { labelContent, measureLabel } from '@mk7s/holochart-traces-basic';
import type { LayoutGraph } from '../layout/types.ts';

/** Line height of node labels, as a multiple of the font size (scatter's text labels). */
export const LABEL_LINE_HEIGHT = 1.3;
/** Room between a box node's label and its edge, in px. */
export const BOX_PAD_X = 8;
export const BOX_PAD_Y = 5;
/** The smallest box node (one without a label), half its width and height in px. */
const BOX_MIN_HALF_WIDTH = 10;
const BOX_MIN_HALF_HEIGHT = 8;
/** Curvature step between two parallel links (see `link.curve`). */
export const FAN_STEP = 0.2;

/** @experimental */
export interface GraphModel {
  /** Number of nodes: the rows the trace gives, then the parents tree input implied. */
  readonly nodes: number;
  /** How many of the nodes the trace gives (the others are implied parents). */
  readonly given: number;
  /** Number of links kept. */
  readonly links: number;
  /** Node index of each kept link's ends. */
  readonly source: Int32Array;
  readonly target: Int32Array;
  /** Index of each kept link in the trace's link arrays (tree input: the child's row). */
  readonly linkIndex: Int32Array;
  /** `link.value` where it is a positive number, else 1: the weight layouts use. */
  readonly weight: Float64Array;
  /** `link.value` as given; `NaN` where a link has none. */
  readonly value: Float64Array;
  /** Links left out because an end is not a node (or closes a cycle of parents). */
  readonly dropped: number;
  /**
   * Link ends at each node: `indegree` counts the links that end at it, `outdegree` those that
   * start at it, and `degree` is their sum (so a self-link counts twice, as in graph theory).
   */
  readonly degree: Int32Array;
  readonly indegree: Int32Array;
  readonly outdegree: Int32Array;
  /** Group index of each node (`node.group`), -1 for none, and the groups' names by index. */
  readonly group: Int32Array;
  readonly groupNames: readonly string[];
  /** Drawn diameter of each node in px (a box node: its larger side). */
  readonly size: Float32Array;
  /** Half the extent of each node in px: the radius twice, or half a box's width and height. */
  readonly halfWidth: Float64Array;
  readonly halfHeight: Float64Array;
  /** Nodes are boxes around their labels (`node.shape: 'box'`). */
  readonly box: boolean;
  /** Tree input: each node's parent, -1 for a root. Unset for `node` / `link` input. */
  readonly parent: Int32Array | undefined;
  /** Curvature that fans out the links between the same two nodes; 0 for a single link. */
  readonly fan: Float32Array;
  /** For a self-link, its number among its node's self-links (0, 1, …); -1 for other links. */
  readonly loop: Int32Array;
  /** Where labels come from: `node.label`, else `labels`; and the labels of implied parents. */
  readonly labels: ArrayLike<unknown> | undefined;
  readonly implied: readonly string[];
  /**
   * `node.value` as numbers, `NaN` where a node has none; unset when the trace gives no finite
   * value at all. What a dendrogram's heights, `tree.sort: 'value'` and `hive.position: 'value'`
   * read.
   */
  readonly nodeValue: Float64Array | undefined;
}

type Container = Readonly<Record<string, unknown>>;

function container(trace: Container, key: string): Container {
  const v = trace[key];
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Container) : {};
}

function arrayOf(v: unknown): ArrayLike<unknown> | undefined {
  return isArrayLike(v) && typeof v !== 'string' ? (v as ArrayLike<unknown>) : undefined;
}

/** A node index: a whole number ≥ 0, or a numeric string of one. -1 otherwise. */
function nodeIndex(v: unknown): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isInteger(n) && n >= 0 ? n : -1;
}

/** An id or a parent of tree input: set unless empty (`0` is an id, as in the hierarchy traces). */
function keyOf(v: unknown): string | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  return typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean'
    ? String(v)
    : undefined;
}

/** Whether the trace gives a tree (`parents`) and no links of its own. */
export function isTreeInput(trace: Container): boolean {
  const parents = arrayOf(trace['parents']);
  return (
    parents !== undefined && parents.length > 0 && !arrayOf(container(trace, 'link')['source'])
  );
}

/** The per-node data arrays that set the node count. */
const NODE_ARRAYS = ['label', 'x', 'y', 'group', 'value', 'customdata', 'size', 'color'] as const;

/**
 * The number of nodes the trace gives (see the module comment), before tree input implies any.
 * Reads the user's trace or the defaulted one alike.
 */
export function givenNodeCount(trace: Container): number {
  if (isTreeInput(trace)) {
    return Math.max(
      arrayOf(trace['parents'])!.length,
      arrayOf(trace['labels'])?.length ?? 0,
      arrayOf(trace['ids'])?.length ?? 0,
    );
  }
  const node = container(trace, 'node');
  let count = 0;
  for (const key of NODE_ARRAYS) count = Math.max(count, arrayOf(node[key])?.length ?? 0);
  if (count > 0) return count;
  const link = container(trace, 'link');
  const s = arrayOf(link['source']);
  const t = arrayOf(link['target']);
  if (!s || !t) return 0;
  let max = -1;
  for (let k = 0; k < Math.min(s.length, t.length); k++) {
    const a = nodeIndex(s[k]);
    const b = nodeIndex(t[k]);
    if (a >= 0 && b >= 0) max = Math.max(max, a, b);
  }
  return max + 1;
}

/** The label font of the trace (`node.textfont`), for measuring and drawing. */
export function labelFont(trace: Container): TextFont {
  const f = container(container(trace, 'node'), 'textfont');
  return {
    family: typeof f['family'] === 'string' ? f['family'] : TEXT_DEFAULT_FONT.family,
    size: typeof f['size'] === 'number' ? f['size'] : TEXT_DEFAULT_FONT.size,
    ...(f['weight'] !== undefined ? { weight: f['weight'] as TextFontWeight } : {}),
    ...(f['style'] === 'italic' ? { style: 'italic' as const } : {}),
    ...(typeof f['shadow'] === 'string' && f['shadow'] !== 'none' ? { shadow: f['shadow'] } : {}),
  };
}

/** The label of node `i` as text (`''` for none). */
export function nodeLabel(model: GraphModel, i: number): string {
  if (i >= model.given) return model.implied[i - model.given] ?? '';
  const v = model.labels?.[i];
  return v === undefined || v === null ? '' : String(v);
}

interface Links {
  source: Int32Array;
  target: Int32Array;
  linkIndex: Int32Array;
  value: Float64Array;
  dropped: number;
}

/** The kept links of `node` / `link` input. */
function linksOf(trace: Container, nodes: number): Links {
  const link = container(trace, 'link');
  const s = arrayOf(link['source']);
  const t = arrayOf(link['target']);
  const v = arrayOf(link['value']);
  const n = s && t ? Math.min(s.length, t.length) : 0;
  const source = new Int32Array(n);
  const target = new Int32Array(n);
  const linkIndex = new Int32Array(n);
  const value = new Float64Array(n);
  let kept = 0;
  for (let k = 0; k < n; k++) {
    const a = nodeIndex(s![k]);
    const b = nodeIndex(t![k]);
    if (a < 0 || b < 0 || a >= nodes || b >= nodes) continue;
    source[kept] = a;
    target[kept] = b;
    linkIndex[kept] = k;
    const raw = v?.[k];
    value[kept] = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
    kept++;
  }
  return {
    source: source.subarray(0, kept),
    target: target.subarray(0, kept),
    linkIndex: linkIndex.subarray(0, kept),
    value: value.subarray(0, kept),
    dropped: n - kept,
  };
}

interface Tree extends Links {
  parent: Int32Array;
  implied: string[];
}

/** Tree input → parents and one link per node with a parent. */
function treeOf(trace: Container, given: number): Tree {
  const ids = arrayOf(trace['ids']);
  const labels = arrayOf(trace['labels']);
  const parents = arrayOf(trace['parents'])!;
  const byId = new Map<string, number>();
  for (let i = 0; i < given; i++) {
    const id = keyOf(ids?.[i]) ?? keyOf(labels?.[i]);
    // The first row of an id is the one children attach to.
    if (id !== undefined && !byId.has(id)) byId.set(id, i);
  }
  const implied: string[] = [];
  const parentOf: number[] = new Array<number>(given).fill(-1);
  let dropped = 0;
  for (let i = 0; i < given; i++) {
    const p = keyOf(parents[i]);
    if (p === undefined) continue;
    let at = byId.get(p);
    if (at === undefined) {
      at = given + implied.length;
      byId.set(p, at);
      implied.push(p);
    }
    if (at === i) dropped++;
    else parentOf[i] = at;
  }
  const nodes = given + implied.length;
  const parent = new Int32Array(nodes).fill(-1);
  parent.set(parentOf);
  // Cut every cycle of parents where it closes: 1 = on the path being walked, 2 = known to end.
  const state = new Uint8Array(nodes);
  for (let i = 0; i < nodes; i++) {
    if (state[i] !== 0) continue;
    let j = i;
    while (j >= 0 && state[j] === 0) {
      state[j] = 1;
      const up = parent[j]!;
      if (up >= 0 && state[up] === 1) {
        parent[j] = -1;
        dropped++;
        break;
      }
      j = up;
    }
    for (j = i; j >= 0 && state[j] === 1; j = parent[j]!) state[j] = 2;
  }
  let count = 0;
  for (let i = 0; i < nodes; i++) if (parent[i]! >= 0) count++;
  const source = new Int32Array(count);
  const target = new Int32Array(count);
  const linkIndex = new Int32Array(count);
  let k = 0;
  for (let i = 0; i < nodes; i++) {
    if (parent[i]! < 0) continue;
    source[k] = parent[i]!;
    target[k] = i;
    linkIndex[k] = i;
    k++;
  }
  return {
    parent,
    implied,
    source,
    target,
    linkIndex,
    value: new Float64Array(count).fill(NaN),
    dropped,
  };
}

/** `node.group` → an index per node and the group names, in order of first appearance. */
function groupsOf(values: ArrayLike<unknown> | undefined, nodes: number) {
  const group = new Int32Array(nodes).fill(-1);
  const groupNames: string[] = [];
  if (!values) return { group, groupNames };
  const index = new Map<string, number>();
  for (let i = 0; i < Math.min(nodes, values.length); i++) {
    const key = keyOf(values[i]);
    if (key === undefined) continue;
    let g = index.get(key);
    if (g === undefined) {
      g = groupNames.length;
      index.set(key, g);
      groupNames.push(key);
    }
    group[i] = g;
  }
  return { group, groupNames };
}

/**
 * The curvature that fans out parallel links, and the numbering of self-links. The `k` links
 * between two nodes get curvatures a step apart, centered on straight, measured for the direction
 * from the lower node index to the higher: a link that runs the other way has the sign flipped,
 * so that two opposite links bow apart instead of lying on each other.
 */
function fanOf(source: Int32Array, target: Int32Array, nodes: number) {
  const n = source.length;
  const fan = new Float32Array(n);
  const loop = new Int32Array(n).fill(-1);
  const count = new Map<number, number>();
  const pair = (k: number): number => {
    const a = source[k]!;
    const b = target[k]!;
    return a < b ? a * nodes + b : b * nodes + a;
  };
  for (let k = 0; k < n; k++) count.set(pair(k), (count.get(pair(k)) ?? 0) + 1);
  const seen = new Map<number, number>();
  for (let k = 0; k < n; k++) {
    const key = pair(k);
    const total = count.get(key)!;
    const j = seen.get(key) ?? 0;
    seen.set(key, j + 1);
    if (source[k] === target[k]) loop[k] = j;
    else if (total > 1) {
      const offset = (j - (total - 1) / 2) * FAN_STEP;
      fan[k] = source[k]! < target[k]! ? offset : -offset;
    }
  }
  return { fan, loop };
}

/** Node diameters from `node.size`, or from the degrees with `node.sizeby`. */
function sizesOf(
  node: Container,
  nodes: number,
  degree: { degree: Int32Array; indegree: Int32Array; outdegree: Int32Array },
): Float32Array {
  const size = new Float32Array(nodes);
  const by = node['sizeby'];
  if (by === 'degree' || by === 'indegree' || by === 'outdegree') {
    const range = arrayOf(node['sizerange']);
    const lo = typeof range?.[0] === 'number' ? range[0] : 6;
    const hi = typeof range?.[1] === 'number' ? range[1] : 30;
    const counts = degree[by];
    let max = 0;
    for (let i = 0; i < nodes; i++) if (counts[i]! > max) max = counts[i]!;
    // Areas, not diameters, are proportional to the count.
    for (let i = 0; i < nodes; i++) {
      size[i] = max > 0 ? lo + (hi - lo) * Math.sqrt(counts[i]! / max) : lo;
    }
    return size;
  }
  const given = node['size'];
  const values = arrayOf(given);
  const one = typeof given === 'number' && given >= 0 ? given : 10;
  for (let i = 0; i < nodes; i++) {
    const v = values ? values[i] : one;
    const s = typeof v === 'number' ? v : typeof v === 'string' && v !== '' ? Number(v) : NaN;
    size[i] = Number.isFinite(s) && s >= 0 ? s : values ? 0 : one;
  }
  return size;
}

/** `node.value` as numbers (numeric strings count), or `undefined` when none is finite. */
function nodeValuesOf(values: ArrayLike<unknown> | undefined, nodes: number) {
  if (!values) return undefined;
  const out = new Float64Array(nodes).fill(NaN);
  let any = false;
  for (let i = 0; i < Math.min(nodes, values.length); i++) {
    const v = values[i];
    const n =
      typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
    if (!Number.isFinite(n)) continue;
    out[i] = n;
    any = true;
  }
  return any ? out : undefined;
}

/**
 * The id of every node of tree input (`ids[i]`, else `labels[i]`; an implied parent's id is the
 * name the rows gave it), mapped to its node index: the first row of an id wins, as children
 * attach to it. Empty for `node` / `link` input, whose nodes are known by index only.
 */
export function treeNodeIds(trace: Container, model: GraphModel): Map<string, number> {
  const out = new Map<string, number>();
  if (!model.parent) return out;
  const ids = arrayOf(trace['ids']);
  const labels = arrayOf(trace['labels']);
  for (let i = 0; i < model.given; i++) {
    const id = keyOf(ids?.[i]) ?? keyOf(labels?.[i]);
    if (id !== undefined && !out.has(id)) out.set(id, i);
  }
  model.implied.forEach((id, k) => {
    if (!out.has(id)) out.set(id, model.given + k);
  });
  return out;
}

/** Build the model of a defaulted `graph` trace. */
export function buildGraphModel(trace: FullTrace): GraphModel {
  const node = container(trace, 'node');
  const given = givenNodeCount(trace);
  const tree = isTreeInput(trace) ? treeOf(trace, given) : undefined;
  const nodes = given + (tree?.implied.length ?? 0);
  const links = tree ?? linksOf(trace, nodes);
  const count = links.source.length;

  const degree = new Int32Array(nodes);
  const indegree = new Int32Array(nodes);
  const outdegree = new Int32Array(nodes);
  const weight = new Float64Array(count);
  for (let k = 0; k < count; k++) {
    const a = links.source[k]!;
    const b = links.target[k]!;
    outdegree[a]!++;
    indegree[b]!++;
    degree[a]!++;
    degree[b]!++;
    const v = links.value[k]!;
    weight[k] = Number.isFinite(v) && v > 0 ? v : 1;
  }

  const labels = arrayOf(node['label']) ?? arrayOf(trace['labels']);
  const box = node['shape'] === 'box';
  const size = sizesOf(node, nodes, { degree, indegree, outdegree });
  const halfWidth = new Float64Array(nodes);
  const halfHeight = new Float64Array(nodes);
  const partial: Pick<GraphModel, 'given' | 'labels' | 'implied'> = {
    given,
    labels,
    implied: tree?.implied ?? [],
  };
  if (box) {
    const font = labelFont(trace);
    for (let i = 0; i < nodes; i++) {
      const text = nodeLabel(partial as GraphModel, i);
      let hw = BOX_MIN_HALF_WIDTH;
      let hh = BOX_MIN_HALF_HEIGHT;
      if (text !== '') {
        const m = measureLabel(labelContent(text, font), LABEL_LINE_HEIGHT);
        hw = Math.max(hw, m.width / 2 + BOX_PAD_X);
        hh = Math.max(hh, m.height / 2 + BOX_PAD_Y);
      }
      halfWidth[i] = hw;
      halfHeight[i] = hh;
      size[i] = 2 * Math.max(hw, hh);
    }
  } else {
    for (let i = 0; i < nodes; i++) halfWidth[i] = halfHeight[i] = size[i]! / 2;
  }

  return {
    nodes,
    ...partial,
    links: count,
    source: links.source,
    target: links.target,
    linkIndex: links.linkIndex,
    weight,
    value: links.value,
    dropped: links.dropped,
    degree,
    indegree,
    outdegree,
    ...groupsOf(arrayOf(node['group']), nodes),
    size,
    halfWidth,
    halfHeight,
    box,
    parent: tree?.parent,
    ...fanOf(links.source, links.target, nodes),
    nodeValue: nodeValuesOf(arrayOf(node['value']), nodes),
  };
}

/**
 * The graph as a layout sees it, with the positions the figure gives (`x` / `y`: one value per
 * node, `NaN` for none). `extents` replaces the nodes' own half extents: the room a layout keeps
 * for a node when its label counts too.
 */
export function layoutGraphOf(
  model: GraphModel,
  x: Float64Array,
  y: Float64Array,
  extents?: { readonly halfWidth: Float64Array; readonly halfHeight: Float64Array },
): LayoutGraph {
  return {
    nodes: model.nodes,
    source: model.source,
    target: model.target,
    weight: model.weight,
    halfWidth: extents?.halfWidth ?? model.halfWidth,
    halfHeight: extents?.halfHeight ?? model.halfHeight,
    x,
    y,
    ...(model.groupNames.length > 0 ? { group: model.group, groups: model.groupNames.length } : {}),
    ...(model.parent ? { parent: model.parent } : {}),
    ...(model.nodeValue ? { value: model.nodeValue } : {}),
  };
}
