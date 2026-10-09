/**
 * Crossing reduction, the third Sugiyama step (story G3): the order of the nodes inside each
 * layer, chosen so that few segments cross.
 *
 * The method is the layer-by-layer sweep of Sugiyama, Tagawa and Toda (1981) with the refinements
 * of Gansner et al. (1993):
 *
 * - The start order is a depth-first walk from the top layer down, which already draws a tree
 *   without crossings.
 * - A sweep goes down the layers (each one sorted by the **barycenter** of its nodes' neighbours
 *   in the layer above, which stays fixed) or up (neighbours below). A node without neighbours on
 *   that side takes the barycenter of the node before it, so it stays where it was. Ties keep
 *   their order in two rounds out of four and are flipped in the other two, which gets the search
 *   out of some local minima.
 * - After each sweep, **transposition**: neighbours in a layer are swapped whenever that lowers
 *   the crossings with both adjoining layers, until nothing swaps or {@link TRANSPOSE_PASSES}
 *   passes are done.
 * - Crossings are counted after every round with the accumulator tree of Barth, Jünger and Mutzel
 *   ("Simple and efficient bilayer cross counting", 2002), here a Fenwick tree, in
 *   `O(segments × log layer)`. The best order seen is kept and restored at the end, so the result
 *   is never worse than the start order. The search stops at zero crossings, after `rounds`
 *   rounds, or after {@link PATIENCE} rounds that did not improve on the best.
 *
 * Clusters: the nodes of a group stay next to each other in every layer. A group is sorted as one
 * unit, by the mean barycenter of its nodes, and its nodes are sorted inside it. After each sweep
 * the groups are put in one common left-to-right order in every layer (by their mean place, see
 * {@link alignGroups}), and transposition never swaps two nodes of different groups, nor a node
 * into or out of a group. With the spacers of `layers.ts` this gives what `clusters.ts` builds
 * on: in every rank a group spans, the group is one run of nodes, and any two groups are the same
 * way round wherever they meet.
 *
 * Deterministic: the comparisons are total (the last key is the node's previous place).
 */
import type { LayerGraph } from './layers.ts';

/** Rounds without a new best before the search gives up. */
const PATIENCE = 4;
/** Upper bound on the transposition passes after one sweep. */
const TRANSPOSE_PASSES = 6;

/** Sorts the rows of segments above the nodes of layer `r` by the place of their top ends. */
function sortUp(g: LayerGraph, r: number, cursor: Int32Array): void {
  if (r === 0) return;
  const { upStart, upSeg, downStart, downSeg, segBot } = g;
  for (const v of g.layers[r]!) cursor[v] = upStart[v]!;
  for (const u of g.layers[r - 1]!) {
    for (let i = downStart[u]!; i < downStart[u + 1]!; i++) {
      const s = downSeg[i]!;
      upSeg[cursor[segBot[s]!]!++] = s;
    }
  }
}

/** Sorts the rows of segments below the nodes of layer `r` by the place of their bottom ends. */
function sortDown(g: LayerGraph, r: number, cursor: Int32Array): void {
  if (r === g.ranks - 1) return;
  const { upStart, upSeg, downStart, downSeg, segTop } = g;
  for (const v of g.layers[r]!) cursor[v] = downStart[v]!;
  for (const w of g.layers[r + 1]!) {
    for (let i = upStart[w]!; i < upStart[w + 1]!; i++) {
      const s = upSeg[i]!;
      downSeg[cursor[segTop[s]!]!++] = s;
    }
  }
}

/** Sorts every row of segments by the place of the other end (the state the later steps expect). */
export function sortAdjacency(g: LayerGraph): void {
  const cursor = new Int32Array(g.count);
  for (let r = 0; r < g.ranks; r++) {
    sortUp(g, r, cursor);
    sortDown(g, r, cursor);
  }
}

/**
 * Crossings between segments, over all pairs of neighbouring layers. Sorts the rows below each
 * layer first, or calls `sorted(r)` to have the rows below layer `r` sorted.
 */
export function countCrossings(g: LayerGraph, sorted?: (r: number) => void): number {
  const { downStart, downSeg, segBot, pos } = g;
  const cursor = sorted ? undefined : new Int32Array(g.count);
  let widest = 0;
  for (const layer of g.layers) widest = Math.max(widest, layer.length);
  const tree = new Int32Array(widest + 1);
  let crossings = 0;
  for (let r = 0; r + 1 < g.ranks; r++) {
    if (sorted) sorted(r);
    else sortDown(g, r, cursor!);
    const size = g.layers[r + 1]!.length;
    tree.fill(0, 0, size + 1);
    let inserted = 0;
    for (const u of g.layers[r]!) {
      for (let i = downStart[u]!; i < downStart[u + 1]!; i++) {
        const p = pos[segBot[downSeg[i]!]!]!;
        // Segments placed so far that end to the right of this one cross it.
        let atOrLeft = 0;
        for (let j = p + 1; j > 0; j -= j & -j) atOrLeft += tree[j]!;
        crossings += inserted - atOrLeft;
        for (let j = p + 1; j <= size; j += j & -j) tree[j]!++;
        inserted++;
      }
    }
  }
  return crossings;
}

/** Start order: layers filled in the order a depth-first walk from the top reaches the nodes. */
function startOrder(g: LayerGraph): void {
  const { count, downStart, downSeg, segBot, rank, pos, layers } = g;
  const seen = new Uint8Array(count);
  const filled = new Int32Array(g.ranks);
  const stack = new Int32Array(g.segments + 1);
  const starts = layers.map((layer) => layer.slice());
  for (const layer of starts) {
    for (const start of layer) {
      if (seen[start]) continue;
      let size = 0;
      stack[size++] = start;
      while (size > 0) {
        const v = stack[--size]!;
        if (seen[v]) continue;
        seen[v] = 1;
        const r = rank[v]!;
        pos[v] = filled[r]!;
        layers[r]![filled[r]!++] = v;
        // Pushed last to first, so the first segment's end is walked first.
        for (let i = downStart[v + 1]! - 1; i >= downStart[v]!; i--) {
          const w = segBot[downSeg[i]!]!;
          if (!seen[w]) stack[size++] = w;
        }
      }
    }
  }
}

/**
 * Orders the layers of `g` in place and returns the number of crossings left. `rounds` bounds the
 * sweeps. Afterwards every row of segments is sorted by the place of its other end.
 */
export function orderLayers(g: LayerGraph, rounds: number): number {
  const { count, ranks, layers, pos, group, upStart, upSeg, downStart, downSeg, segTop, segBot } =
    g;
  const grouped = g.groups > 0;
  const cursor = new Int32Array(count);
  const bary = new Float64Array(count);
  /** Barycenter and first place of the unit a node is sorted with (itself, or its group's run). */
  const unitBary = new Float64Array(count);
  const unitPlace = new Int32Array(count);
  let flip = false;
  const byBarycenter = (a: number, b: number): number => {
    const byUnit = unitBary[a]! - unitBary[b]!;
    if (byUnit !== 0) return byUnit;
    const byPlace = unitPlace[a]! - unitPlace[b]!;
    if (byPlace !== 0) return flip ? -byPlace : byPlace;
    const own = bary[a]! - bary[b]!;
    if (own !== 0) return own;
    return flip ? pos[b]! - pos[a]! : pos[a]! - pos[b]!;
  };

  // Book-keeping that saves most of the work of the later rounds, when few layers still change:
  // `moved[r]` is the tick of layer `r`'s last change of order. Rows are sorted again only when
  // the layer they point into has moved since, and transposition skips a layer that it left
  // without a swap as long as neither the layer nor its neighbours have moved.
  let tick = 1;
  const moved = new Int32Array(ranks).fill(1);
  const upAt = new Int32Array(ranks);
  const downAt = new Int32Array(ranks);
  const settled = new Int32Array(ranks);
  const rowsUp = (r: number): void => {
    if (r === 0 || upAt[r] === moved[r - 1]) return;
    sortUp(g, r, cursor);
    upAt[r] = moved[r - 1]!;
  };
  const rowsDown = (r: number): void => {
    if (r === ranks - 1 || downAt[r] === moved[r + 1]) return;
    sortDown(g, r, cursor);
    downAt[r] = moved[r + 1]!;
  };
  /** Records the places of layer `r` after a change of its order. */
  const place = (r: number): void => {
    const layer = layers[r]!;
    let changed = false;
    for (let i = 0; i < layer.length; i++) {
      if (pos[layer[i]!] === i) continue;
      pos[layer[i]!] = i;
      changed = true;
    }
    if (changed) moved[r] = ++tick;
  };

  /** Sorts layer `r` by the barycenters of its nodes' neighbours above (`down`) or below. */
  const sortLayer = (r: number, down: boolean): void => {
    const layer = layers[r]!;
    const start = down ? upStart : downStart;
    const list = down ? upSeg : downSeg;
    const far = down ? segTop : segBot;
    let before = -1;
    for (let i = 0; i < layer.length; i++) {
      const v = layer[i]!;
      const from = start[v]!;
      const to = start[v + 1]!;
      if (to > from) {
        let sum = 0;
        for (let j = from; j < to; j++) sum += pos[far[list[j]!]!]!;
        before = sum / (to - from);
      }
      bary[v] = before;
      unitBary[v] = before;
      unitPlace[v] = i;
    }
    if (grouped) {
      for (let i = 0; i < layer.length;) {
        const first = group[layer[i]!]!;
        let j = i + 1;
        if (first >= 0) {
          let sum = 0;
          let tied = 0;
          let all = 0;
          while (j < layer.length && group[layer[j]!] === first) j++;
          for (let k = i; k < j; k++) {
            const v = layer[k]!;
            all += bary[v]!;
            if (start[v + 1]! > start[v]!) {
              sum += bary[v]!;
              tied++;
            }
          }
          const mean = tied > 0 ? sum / tied : all / (j - i);
          for (let k = i; k < j; k++) {
            unitBary[layer[k]!] = mean;
            unitPlace[layer[k]!] = i;
          }
        }
        i = j;
      }
    }
    layer.sort(byBarycenter);
    place(r);
  };

  // Clusters: each group's nodes next to each other, and all groups the same way round everywhere.
  const groupKey = new Float64Array(g.groups);
  const groupSize = new Int32Array(g.groups);
  const gather = (): void => {
    // Start order only: pull each group's nodes of a layer together, at its first node's place.
    const firstPlace = new Int32Array(g.groups);
    for (const layer of layers) {
      firstPlace.fill(-1);
      for (let i = 0; i < layer.length; i++) {
        const v = layer[i]!;
        const k = group[v]!;
        if (k >= 0 && firstPlace[k]! < 0) firstPlace[k] = i;
        unitPlace[v] = k >= 0 ? firstPlace[k]! : i;
      }
      layer.sort((a, b) => unitPlace[a]! - unitPlace[b]! || pos[a]! - pos[b]!);
      for (let i = 0; i < layer.length; i++) pos[layer[i]!] = i;
    }
  };
  /**
   * Puts the groups in one order in every layer: by the mean relative place of their nodes over
   * all layers, the group index on a tie. Only groups move, into the places groups had.
   */
  const alignGroups = (): void => {
    groupKey.fill(0);
    groupSize.fill(0);
    for (let v = 0; v < count; v++) {
      const k = group[v]!;
      if (k < 0) continue;
      groupKey[k]! += (pos[v]! + 0.5) / layers[g.rank[v]!]!.length;
      groupSize[k]!++;
    }
    for (let k = 0; k < g.groups; k++) if (groupSize[k]! > 0) groupKey[k]! /= groupSize[k]!;
    const after = (a: number, b: number): boolean =>
      groupKey[a]! > groupKey[b]! || (groupKey[a] === groupKey[b] && a > b);
    for (let r = 0; r < ranks; r++) {
      const layer = layers[r]!;
      // The runs of groups in this layer: [start, end) pairs, in layer order.
      const runs: number[] = [];
      let sorted = true;
      for (let i = 0; i < layer.length;) {
        const k = group[layer[i]!]!;
        let j = i + 1;
        if (k >= 0) {
          while (j < layer.length && group[layer[j]!] === k) j++;
          if (runs.length > 0 && after(group[layer[runs[runs.length - 2]!]!]!, k)) sorted = false;
          runs.push(i, j);
        }
        i = j;
      }
      if (sorted) continue;
      const original = layer.slice();
      const order: number[] = [];
      for (let t = 0; t < runs.length; t += 2) order.push(t);
      order.sort((a, b) => {
        const ka = group[original[runs[a]!]!]!;
        const kb = group[original[runs[b]!]!]!;
        return after(ka, kb) ? 1 : -1;
      });
      let write = 0;
      let run = 0;
      for (let i = 0; i < original.length;) {
        if (run < runs.length && runs[run] === i) {
          const from = order[run / 2]!;
          for (let k = runs[from]!; k < runs[from + 1]!; k++) layer[write++] = original[k]!;
          i = runs[run + 1]!;
          run += 2;
        } else {
          layer[write++] = original[i++]!;
        }
      }
      place(r);
    }
  };
  /** Whether swapping the neighbours at `i` and `i + 1` keeps the groups whole and in order. */
  const mayTranspose = (layer: Int32Array, i: number): boolean => {
    const ka = group[layer[i]!]!;
    const kb = group[layer[i + 1]!]!;
    if (ka === kb) return true;
    if (ka >= 0 && kb >= 0) return false;
    // A node of a group and a foreign node: only when the group has no other node next to it.
    if (ka >= 0) return i === 0 || group[layer[i - 1]!] !== ka;
    return i + 2 >= layer.length || group[layer[i + 2]!] !== kb;
  };

  // Crossings between the rows of two neighbours, either way round, on one side.
  let leftFirst = 0;
  let rightFirst = 0;
  const compare = (
    a: number,
    b: number,
    start: Int32Array,
    list: Int32Array,
    far: Int32Array,
  ): void => {
    const endA = start[a + 1]!;
    const fromB = start[b]!;
    const endB = start[b + 1]!;
    if (endA === start[a] || endB === fromB) return;
    let below = fromB;
    let upTo = fromB;
    for (let i = start[a]!; i < endA; i++) {
      const p = pos[far[list[i]!]!]!;
      while (below < endB && pos[far[list[below]!]!]! < p) below++;
      while (upTo < endB && pos[far[list[upTo]!]!]! <= p) upTo++;
      leftFirst += below - fromB;
      rightFirst += endB - upTo;
    }
  };
  const transpose = (): void => {
    for (let pass = 0; pass < TRANSPOSE_PASSES; pass++) {
      let improved = false;
      for (let r = 0; r < ranks; r++) {
        const layer = layers[r]!;
        if (layer.length < 2) continue;
        const around = Math.max(moved[r - 1] ?? 0, moved[r]!, moved[r + 1] ?? 0);
        if (settled[r]! >= around) continue;
        rowsUp(r);
        rowsDown(r);
        let swapped = false;
        for (let i = 0; i + 1 < layer.length; i++) {
          if (grouped && !mayTranspose(layer, i)) continue;
          const a = layer[i]!;
          const b = layer[i + 1]!;
          leftFirst = rightFirst = 0;
          compare(a, b, upStart, upSeg, segTop);
          compare(a, b, downStart, downSeg, segBot);
          if (rightFirst < leftFirst) {
            layer[i] = b;
            layer[i + 1] = a;
            pos[b] = i;
            pos[a] = i + 1;
            swapped = true;
          }
        }
        if (swapped) {
          moved[r] = ++tick;
          improved = true;
        } else {
          settled[r] = tick;
        }
      }
      if (!improved) break;
    }
  };

  startOrder(g);
  if (grouped) {
    gather();
    alignGroups();
  }
  let best = countCrossings(g, rowsDown);
  let kept = layers.map((layer) => layer.slice());
  let stale = 0;
  for (let round = 0; round < rounds && best > 0 && stale < PATIENCE; round++) {
    flip = round % 4 >= 2;
    if (round % 2 === 0) for (let r = 1; r < ranks; r++) sortLayer(r, true);
    else for (let r = ranks - 2; r >= 0; r--) sortLayer(r, false);
    if (grouped) alignGroups();
    transpose();
    const crossings = countCrossings(g, rowsDown);
    if (crossings < best) {
      best = crossings;
      kept = layers.map((layer) => layer.slice());
      stale = 0;
    } else {
      stale++;
    }
  }
  for (let r = 0; r < ranks; r++) {
    const layer = layers[r]!;
    layer.set(kept[r]!);
    for (let i = 0; i < layer.length; i++) pos[layer[i]!] = i;
  }
  sortAdjacency(g);
  return best;
}
