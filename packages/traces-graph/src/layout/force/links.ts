/**
 * The links as the force layout uses them: an undirected simple graph. A layout has no use for a
 * link's direction, for a self-link (it pulls a node toward itself) or for seeing the same pair
 * twice, so self-links are dropped and the links between one pair of nodes, in either direction,
 * are merged into one whose weight is their sum. Degrees and connected components are counted on
 * the result.
 *
 * The merged links are sorted by their lower then their higher node index (two counting sorts, no
 * comparator), so the layout does not depend on the order the links were listed in.
 */
import type { LayoutGraph } from '../types.ts';

export interface PreparedLinks {
  /** Number of merged links. */
  readonly count: number;
  /** The lower and the higher node index of each link. */
  readonly source: Int32Array;
  readonly target: Int32Array;
  /**
   * Each link's weight relative to the median weight (1 for all when the weights are equal), so a
   * layout is the same whatever unit `link.value` is in.
   */
  readonly weight: Float64Array;
  /** Number of distinct neighbours of each node. */
  readonly degree: Int32Array;
  /** Connected component of each node, numbered from 0 in order of their lowest node. */
  readonly component: Int32Array;
  readonly components: number;
}

/** Stable counting sort of the link indices in `from` by `key`, into `to`. */
function sortBy(
  from: Int32Array,
  to: Int32Array,
  key: Int32Array,
  count: number,
  nodes: number,
): void {
  const starts = new Int32Array(nodes + 1);
  for (let k = 0; k < count; k++) starts[key[from[k]!]! + 1]!++;
  for (let i = 0; i < nodes; i++) starts[i + 1]! += starts[i]!;
  for (let k = 0; k < count; k++) {
    const link = from[k]!;
    to[starts[key[link]!]!++] = link;
  }
}

export function prepareLinks(graph: LayoutGraph): PreparedLinks {
  const n = Math.max(0, Math.floor(graph.nodes));
  const total = Math.min(graph.source.length, graph.target.length);

  // Usable links, as (lower, higher) pairs.
  const lo = new Int32Array(total);
  const hi = new Int32Array(total);
  const raw = new Float64Array(total);
  let kept = 0;
  let largest = 0;
  for (let k = 0; k < total; k++) {
    const s = graph.source[k]!;
    const t = graph.target[k]!;
    if (!(s >= 0 && s < n && t >= 0 && t < n) || s === t) continue;
    const w = graph.weight[k];
    const value = w !== undefined && w > 0 && w < Infinity ? w : 1;
    lo[kept] = s < t ? s : t;
    hi[kept] = s < t ? t : s;
    raw[kept] = value;
    if (value > largest) largest = value;
    kept++;
  }

  // Sort by (lower, higher): by the higher index first, then stably by the lower.
  const sorted = new Int32Array(kept);
  const byHigher = new Int32Array(kept);
  for (let k = 0; k < kept; k++) sorted[k] = k;
  sortBy(sorted, byHigher, hi, kept, n);
  sortBy(byHigher, sorted, lo, kept, n);

  // Merge equal pairs. Weights are scaled by the largest first, so their sum cannot overflow.
  const source = new Int32Array(kept);
  const target = new Int32Array(kept);
  const weight = new Float64Array(kept);
  let count = 0;
  for (let k = 0; k < kept; k++) {
    const link = sorted[k]!;
    const w = raw[link]! / largest;
    if (count > 0 && source[count - 1] === lo[link] && target[count - 1] === hi[link]) {
      weight[count - 1]! += w;
    } else {
      source[count] = lo[link]!;
      target[count] = hi[link]!;
      weight[count] = w;
      count++;
    }
  }
  // Relative to the median (the upper one of an even count): the typical link then behaves as
  // an unweighted one however heavy the heaviest is. A median that underflowed to 0 beside a
  // weight hundreds of orders of magnitude larger is no reference: the weights stay as scaled.
  const median = count > 0 ? weight.slice(0, count).sort()[count >> 1]! : 1;
  if (median > 0) {
    for (let k = 0; k < count; k++) weight[k]! /= median;
  }

  const degree = new Int32Array(n);
  // Union–find with the lower index as the root, so a component is named by its lowest node.
  const root = new Int32Array(n);
  for (let i = 0; i < n; i++) root[i] = i;
  const find = (i: number): number => {
    let r = i;
    while (root[r] !== r) r = root[r]!;
    while (root[i] !== r) {
      const next = root[i]!;
      root[i] = r;
      i = next;
    }
    return r;
  };
  for (let k = 0; k < count; k++) {
    const s = source[k]!;
    const t = target[k]!;
    degree[s]!++;
    degree[t]!++;
    const rs = find(s);
    const rt = find(t);
    if (rs < rt) root[rt] = rs;
    else if (rt < rs) root[rs] = rt;
  }
  const component = new Int32Array(n);
  let components = 0;
  for (let i = 0; i < n; i++) {
    const r = find(i);
    component[i] = r === i ? components++ : component[r]!;
  }

  return {
    count,
    source: source.subarray(0, count),
    target: target.subarray(0, count),
    weight: weight.subarray(0, count),
    degree,
    component,
    components,
  };
}
