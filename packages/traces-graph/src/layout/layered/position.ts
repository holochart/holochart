/**
 * Coordinate assignment, the fourth Sugiyama step (story G3): where each node sits along its
 * layer, given the order of the layers. The method is Brandes and Köpf's ("Fast and simple
 * horizontal coordinate assignment", 2001), with node sizes and separations of our own:
 *
 * 1. **Conflicts.** A segment between two dummies (an "inner" segment, the middle of a long link)
 *    that is crossed by a segment with a real end wins: the other one is marked and never
 *    aligned, so long links stay straight.
 * 2. **Vertical alignment**, four times: from the top down or from the bottom up, preferring the
 *    left or the right. Each node is aligned with its median neighbour in the layer before (the
 *    left or right one of two medians first), unless that segment is marked or would cross an
 *    alignment already made. Aligned nodes form a **block** that shares one coordinate.
 * 3. **Horizontal compaction** of each alignment: blocks are placed as far towards the preferred
 *    side as the separations allow. Blocks are grouped in **classes** (a block joins the class of
 *    the first neighbour it leans on); a class is placed in itself first and then moved up
 *    against the classes it must stay clear of, which is what keeps the drawing compact. The class
 *    offsets are worked out over the whole class graph in dependency order (the corrected
 *    procedure of Brandes, Walter and Zink, "Erratum: Fast and simple horizontal coordinate
 *    assignment", 2020, in spirit: the 2001 pseudocode can leave classes overlapping). Should the
 *    class graph ever be cyclic, that alignment is compacted without classes instead, which is
 *    always feasible.
 * 4. **Balancing**: the four layouts are shifted onto the narrowest one (left ones by their left
 *    edge, right ones by their right edge) and each node takes the mean of its two middle values.
 *
 * Guarantee: each of the four layouts keeps every pair of neighbours in a layer at least their
 * required distance apart, and so does the balanced result (order statistics of feasible layouts
 * are feasible). `gap[v]` is that distance for `v` and the node before it in its layer, between
 * their centers; the caller folds node extents, `nodesep`, `edgesep` and cluster padding into it.
 */
import { REAL, type LayerGraph } from './layers.ts';

/** Marks the segments that cross an inner segment and are not inner themselves (type 1 conflicts). */
function markConflicts(g: LayerGraph): Uint8Array {
  const { layers, pos, kind, upStart, upSeg, segTop } = g;
  const marked = new Uint8Array(g.segments);
  for (let r = 1; r < g.ranks; r++) {
    const upper = layers[r - 1]!;
    const lower = layers[r]!;
    let k0 = -1;
    let l = 0;
    for (let l1 = 0; l1 < lower.length; l1++) {
      const v = lower[l1]!;
      // The place of the upper end of the inner segment that ends at `v`, if there is one.
      let inner = -1;
      if (kind[v] !== REAL) {
        for (let i = upStart[v]!; i < upStart[v + 1]!; i++) {
          const u = segTop[upSeg[i]!]!;
          if (kind[u] !== REAL) inner = pos[u]!;
        }
      }
      if (l1 < lower.length - 1 && inner < 0) continue;
      const k1 = inner >= 0 ? inner : upper.length;
      for (; l <= l1; l++) {
        const w = lower[l]!;
        for (let i = upStart[w]!; i < upStart[w + 1]!; i++) {
          const s = upSeg[i]!;
          const k = pos[segTop[s]!]!;
          if (k < k0 || k > k1) marked[s] = 1;
        }
      }
      k0 = k1;
    }
  }
  return marked;
}

/**
 * One of the four layouts: aligned with the layer above (`down`) or below, preferring the left or
 * the `right`. Returns a coordinate per layout node.
 */
function alignedLayout(
  g: LayerGraph,
  gap: Float64Array,
  marked: Uint8Array,
  down: boolean,
  right: boolean,
): Float64Array {
  const { count, ranks, layers, pos, rank } = g;
  const start = down ? g.upStart : g.downStart;
  const list = down ? g.upSeg : g.downSeg;
  const far = down ? g.segTop : g.segBot;

  // Vertical alignment.
  const root = new Int32Array(count);
  const align = new Int32Array(count);
  for (let v = 0; v < count; v++) root[v] = align[v] = v;
  for (let step = 1; step < ranks; step++) {
    const layer = layers[down ? step : ranks - 1 - step]!;
    // The furthest place (towards the preferred side's far end) an alignment has reached.
    let reached = -Infinity;
    for (let step2 = 0; step2 < layer.length; step2++) {
      const v = layer[right ? layer.length - 1 - step2 : step2]!;
      const from = start[v]!;
      const degree = start[v + 1]! - from;
      if (degree === 0) continue;
      const low = (degree - 1) >> 1;
      const high = degree >> 1;
      for (let m = 0; m < 2 && align[v] === v; m++) {
        if (m === 1 && low === high) break;
        const s = list[from + ((m === 0) !== right ? low : high)]!;
        const u = far[s]!;
        const place = right ? -pos[u]! : pos[u]!;
        if (marked[s] || place <= reached) continue;
        align[u] = v;
        root[v] = root[u]!;
        align[v] = root[v]!;
        reached = place;
      }
    }
  }

  // The node before `v` in its layer on the preferred side, and the distance it must keep.
  const previous = (v: number): number => {
    const layer = layers[rank[v]!]!;
    const p = pos[v]!;
    if (right) return p + 1 < layer.length ? layer[p + 1]! : -1;
    return p > 0 ? layer[p - 1]! : -1;
  };
  const distance = (v: number, before: number): number => (right ? gap[before]! : gap[v]!);

  // Blocks in an order in which every block comes after the blocks before it in any layer.
  const waiting = new Int32Array(count);
  for (let v = 0; v < count; v++) if (previous(v) >= 0) waiting[root[v]!]!++;
  const queue = new Int32Array(count);
  let size = 0;
  for (let v = 0; v < count; v++) if (root[v] === v && waiting[v] === 0) queue[size++] = v;
  const following = (v: number): number => {
    const layer = layers[rank[v]!]!;
    const p = pos[v]!;
    if (right) return p > 0 ? layer[p - 1]! : -1;
    return p + 1 < layer.length ? layer[p + 1]! : -1;
  };
  for (let i = 0; i < size; i++) {
    const block = queue[i]!;
    let w = block;
    do {
      const next = following(w);
      if (next >= 0 && --waiting[root[next]!]! === 0) queue[size++] = root[next]!;
      w = align[w]!;
    } while (w !== block);
  }

  const x = new Float64Array(count);
  let blocks = 0;
  for (let v = 0; v < count; v++) if (root[v] === v) blocks++;
  if (size < blocks) {
    // Unreachable as long as alignments do not cross; kept so that the result is always usable.
    for (const layer of layers) {
      let at = 0;
      for (let i = 0; i < layer.length; i++) {
        const v = layer[right ? layer.length - 1 - i : i]!;
        if (i > 0) at += distance(v, previous(v));
        x[v] = right ? -at : at;
      }
    }
    return x;
  }

  /** Compaction; with `classes` off every block leans on all of its neighbours. */
  const compact = (classes: boolean): boolean => {
    const sink = new Int32Array(count);
    const offset = new Float64Array(count);
    for (let i = 0; i < size; i++) {
      const block = queue[i]!;
      sink[block] = block;
      let at = 0;
      let w = block;
      do {
        const before = previous(w);
        if (before >= 0) {
          const u = root[before]!;
          if (sink[block] === block) sink[block] = sink[u]!;
          if (!classes || sink[block] === sink[u]) {
            at = Math.max(at, offset[u]! + distance(w, before));
          }
        }
        w = align[w]!;
      } while (w !== block);
      offset[block] = at;
    }
    const shift = new Float64Array(count);
    if (classes) {
      // Class `a` must stay `room` or more before class `b`: shift[a] ≤ shift[b] + room.
      const first = new Int32Array(count).fill(-1);
      const next: number[] = [];
      const left: number[] = [];
      const room: number[] = [];
      const pending = new Int32Array(count);
      let constraints = 0;
      for (let v = 0; v < count; v++) {
        const before = previous(v);
        if (before < 0) continue;
        const a = sink[root[before]!]!;
        const b = sink[root[v]!]!;
        if (a === b) continue;
        left.push(a);
        room.push(offset[root[v]!]! - offset[root[before]!]! - distance(v, before));
        next.push(first[b]!);
        first[b] = constraints++;
        pending[a]!++;
      }
      if (constraints > 0) {
        shift.fill(Infinity);
        const ready = new Int32Array(count);
        let readySize = 0;
        let classCount = 0;
        for (let v = 0; v < count; v++) {
          if (root[v] !== v || sink[v] !== v) continue;
          classCount++;
          if (pending[v] === 0) ready[readySize++] = v;
        }
        for (let i = 0; i < readySize; i++) {
          const b = ready[i]!;
          if (shift[b] === Infinity) shift[b] = 0;
          for (let c = first[b]!; c >= 0; c = next[c]!) {
            const a = left[c]!;
            shift[a] = Math.min(shift[a]!, shift[b]! + room[c]!);
            if (--pending[a]! === 0) ready[readySize++] = a;
          }
        }
        if (readySize < classCount) return false;
      }
    }
    for (let v = 0; v < count; v++) {
      const at = offset[root[v]!]! + shift[sink[root[v]!]!]!;
      x[v] = right ? -at : at;
    }
    return true;
  };
  if (!compact(true)) compact(false);
  return x;
}

/**
 * A coordinate per layout node along its layer, balanced over the four alignments. `gap[v]` is
 * the least distance between the centers of `v` and the node before it in its layer (unused for
 * the first node of a layer); `before` and `after` are each node's extents to either side, used
 * to measure the four layouts' widths. Rows of segments must be sorted (`order.ts`).
 */
export function assignCross(
  g: LayerGraph,
  gap: Float64Array,
  before: Float64Array,
  after: Float64Array,
): Float64Array {
  const { count } = g;
  const result = new Float64Array(count);
  if (count === 0) return result;
  const marked = markConflicts(g);
  const layouts = [
    alignedLayout(g, gap, marked, true, false),
    alignedLayout(g, gap, marked, true, true),
    alignedLayout(g, gap, marked, false, false),
    alignedLayout(g, gap, marked, false, true),
  ];
  // Left and right edge of each layout; the narrowest one is the reference.
  const low = [0, 0, 0, 0];
  const high = [0, 0, 0, 0];
  let narrowest = 0;
  for (let i = 0; i < 4; i++) {
    const x = layouts[i]!;
    let min = Infinity;
    let max = -Infinity;
    for (let v = 0; v < count; v++) {
      min = Math.min(min, x[v]! - before[v]!);
      max = Math.max(max, x[v]! + after[v]!);
    }
    low[i] = min;
    high[i] = max;
    if (max - min < high[narrowest]! - low[narrowest]!) narrowest = i;
  }
  const shift = [0, 0, 0, 0];
  for (let i = 0; i < 4; i++) {
    shift[i] = i % 2 === 0 ? low[narrowest]! - low[i]! : high[narrowest]! - high[i]!;
  }
  const [a, b, c, d] = layouts as [Float64Array, Float64Array, Float64Array, Float64Array];
  for (let v = 0; v < count; v++) {
    // Mean of the two middle values of four: the sum less the smallest and the largest.
    const p = a[v]! + shift[0]!;
    const q = b[v]! + shift[1]!;
    const r = c[v]! + shift[2]!;
    const s = d[v]! + shift[3]!;
    result[v] = (p + q + r + s - Math.min(p, q, r, s) - Math.max(p, q, r, s)) / 2;
  }
  return result;
}
