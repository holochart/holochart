/**
 * Cluster frames of the layered layout (story G3): after coordinate assignment, the extent of
 * each group's frame across the layers, with the nodes moved apart where a frame would otherwise
 * take in a node that is not its own or run into another frame.
 *
 * What the earlier steps hand over (see `layers.ts` and `order.ts`): in every rank a group spans
 * it is one run of nodes, spacers standing in where it has none, and two groups are the same way
 * round in every rank they share. That makes "before" a partial order over frames and foreign
 * nodes, so the frames can be found as the solution of a system of difference constraints:
 *
 * - neighbours in a layer keep their distance (`gap`, as coordinate assignment did);
 * - a frame starts `padBefore` or more before each of its nodes and ends `padAfter` or more after;
 * - where a run of a group ends in a layer and another node follows, the frame ends before that
 *   node (or before that node's frame starts), by the free space the two would be given as
 *   neighbours; and the same at the run's start.
 *
 * Coordinate assignment already satisfies the first kind; the frames are bounding boxes over all
 * ranks, so the third kind can fail. The repair is the smallest one: the constraint graph is
 * walked once in topological order pushing everything right just as far as needed, once in
 * reverse pushing left, and the mean of the two is taken. Both are solutions, the constraints are
 * convex, so the mean is one too, and nodes that needed no repair stay where they were.
 *
 * If the constraint graph has a cycle (it cannot, given the order's guarantees) nothing is moved
 * and the frames are plain bounding boxes.
 */
import type { LayerGraph } from './layers.ts';

export interface ClusterExtents {
  /** Start and end of each group's frame across the layers (NaN for a group without nodes). */
  readonly start: Float64Array;
  readonly end: Float64Array;
}

/**
 * Moves `x` (in place) so that every group's frame is clear of foreign nodes and other frames, and
 * returns the frames' extents. `gap`, `before` and `after` are as in `assignCross`; `gap` includes
 * `padAfter` / `padBefore` wherever two neighbours are of different groups.
 */
export function separateClusters(
  g: LayerGraph,
  x: Float64Array,
  gap: Float64Array,
  before: Float64Array,
  after: Float64Array,
  padBefore: number,
  padAfter: number,
): ClusterExtents {
  const { count, groups, group, layers } = g;
  const start = new Float64Array(groups).fill(NaN);
  const end = new Float64Array(groups).fill(NaN);
  const bounds = (): void => {
    start.fill(Infinity);
    end.fill(-Infinity);
    for (let v = 0; v < count; v++) {
      const k = group[v]!;
      if (k < 0) continue;
      start[k] = Math.min(start[k]!, x[v]! - before[v]! - padBefore);
      end[k] = Math.max(end[k]!, x[v]! + after[v]! + padAfter);
    }
    for (let k = 0; k < groups; k++) {
      if (start[k]! > end[k]!) start[k] = end[k] = NaN;
    }
  };
  bounds();
  if (groups === 0) return { start, end };

  // Variables: the nodes, then each group's frame start and end. Constraints `to − from ≥ least`.
  const variables = count + 2 * groups;
  const from: number[] = [];
  const to: number[] = [];
  const least: number[] = [];
  const add = (a: number, b: number, d: number): void => {
    from.push(a);
    to.push(b);
    least.push(d);
  };
  for (let v = 0; v < count; v++) {
    const k = group[v]!;
    if (k < 0) continue;
    add(count + 2 * k, v, before[v]! + padBefore);
    add(v, count + 2 * k + 1, after[v]! + padAfter);
  }
  for (const layer of layers) {
    for (let i = 1; i < layer.length; i++) {
      const a = layer[i - 1]!;
      const b = layer[i]!;
      add(a, b, gap[b]!);
      const ka = group[a]!;
      const kb = group[b]!;
      if (ka === kb) continue;
      // The free space the two were given as neighbours, less the padding that is in `gap`.
      const free =
        gap[b]! - after[a]! - before[b]! - (ka >= 0 ? padAfter : 0) - (kb >= 0 ? padBefore : 0);
      if (ka >= 0 && kb >= 0) add(count + 2 * ka + 1, count + 2 * kb, free);
      else if (ka >= 0) add(count + 2 * ka + 1, b, free + before[b]!);
      else add(a, count + 2 * kb, free + after[a]!);
    }
  }

  // Topological order of the variables.
  const constraints = from.length;
  const outStart = new Int32Array(variables + 1);
  const waiting = new Int32Array(variables);
  for (let c = 0; c < constraints; c++) {
    outStart[from[c]! + 1]!++;
    waiting[to[c]!]!++;
  }
  for (let v = 0; v < variables; v++) outStart[v + 1]! += outStart[v]!;
  const out = new Int32Array(constraints);
  const cursor = outStart.slice(0, variables);
  for (let c = 0; c < constraints; c++) out[cursor[from[c]!]!++] = c;
  const order = new Int32Array(variables);
  let size = 0;
  for (let v = 0; v < variables; v++) if (waiting[v] === 0) order[size++] = v;
  for (let i = 0; i < size; i++) {
    const v = order[i]!;
    for (let j = outStart[v]!; j < outStart[v + 1]!; j++) {
      const w = to[out[j]!]!;
      if (--waiting[w]! === 0) order[size++] = w;
    }
  }
  if (size < variables) return { start, end };

  const value = new Float64Array(variables);
  value.set(x);
  for (let k = 0; k < groups; k++) {
    // A group without nodes has no constraints; any finite value will do.
    value[count + 2 * k] = Number.isNaN(start[k]!) ? 0 : start[k]!;
    value[count + 2 * k + 1] = Number.isNaN(end[k]!) ? 0 : end[k]!;
  }
  const pushedRight = value.slice();
  for (let i = 0; i < variables; i++) {
    const v = order[i]!;
    for (let j = outStart[v]!; j < outStart[v + 1]!; j++) {
      const c = out[j]!;
      const w = to[c]!;
      if (pushedRight[v]! + least[c]! > pushedRight[w]!)
        pushedRight[w] = pushedRight[v]! + least[c]!;
    }
  }
  const pushedLeft = value;
  for (let i = variables - 1; i >= 0; i--) {
    const v = order[i]!;
    for (let j = outStart[v]!; j < outStart[v + 1]!; j++) {
      const c = out[j]!;
      const w = to[c]!;
      if (pushedLeft[w]! - least[c]! < pushedLeft[v]!) pushedLeft[v] = pushedLeft[w]! - least[c]!;
    }
  }
  for (let v = 0; v < count; v++) x[v] = (pushedRight[v]! + pushedLeft[v]!) / 2;
  // The frames hug their nodes again: tighter than the solved frames, so still clear of the rest.
  bounds();
  return { start, end };
}
