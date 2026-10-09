/**
 * The layered graph the later Sugiyama steps work on (story G3): the ranked nodes of one connected
 * part, with every link that spans more than one rank cut into a chain of segments through dummy
 * nodes, so that every segment joins two neighbouring ranks ("proper layering"). Crossing
 * reduction orders the layers, coordinate assignment places real and dummy nodes alike, and the
 * dummies' places become the bends of the long links.
 *
 * Layout nodes are numbered with the real nodes first (`0 … real − 1`, the caller's local
 * indices), then the dummies of each link in turn (consecutive, from the tail's side), then the
 * spacers. Segments are numbered the same way: the segments of a link are consecutive, from the
 * tail down.
 *
 * Clusters add two things. The dummies of a link between two nodes of one group belong to that
 * group, so the link stays inside the group's frame. And a group that has no node in some rank
 * between its first and its last gets a **spacer** there, a node without size that belongs to the
 * group and is tied to the group's nodes in the ranks above and below by **virtual** segments
 * (they order and place like segments, and are not drawn). With spacers a group is present in
 * every rank it spans, which is what lets the order keep foreign nodes out of its frame (see
 * `order.ts` and `clusters.ts`).
 */

/** Kinds of layout node. */
export const REAL = 0;
export const DUMMY = 1;
export const SPACER = 2;

export interface LayerGraph {
  /** Layout nodes: real nodes, dummies and spacers. */
  readonly count: number;
  /** Real nodes: layout nodes `0 … real − 1`. */
  readonly real: number;
  readonly ranks: number;
  /** Rank of each layout node. */
  readonly rank: Int32Array;
  /** {@link REAL}, {@link DUMMY} or {@link SPACER}, per layout node. */
  readonly kind: Uint8Array;
  /** Group of each layout node (an index below {@link groups}), −1 for none. */
  readonly group: Int32Array;
  readonly groups: number;

  /** Segments between neighbouring ranks: `segTop` is one rank above `segBot`. */
  readonly segments: number;
  readonly segTop: Int32Array;
  readonly segBot: Int32Array;
  /** 1 for a spacer's segment: used to order and place, never drawn. */
  readonly segVirtual: Uint8Array;
  /**
   * Segments by node, in compressed rows: `upSeg[upStart[v] … upStart[v + 1] − 1]` are the
   * segments whose bottom is `v`, `downSeg[…]` those whose top is `v`. `order.ts` keeps each row
   * sorted by the place of the segment's other end in its layer.
   */
  readonly upStart: Int32Array;
  readonly upSeg: Int32Array;
  readonly downStart: Int32Array;
  readonly downSeg: Int32Array;

  /** The layout nodes of each rank, in order, and each node's place in its rank. */
  readonly layers: Int32Array[];
  readonly pos: Int32Array;

  /** The links: tail (the end in the earlier rank) and head, as real nodes. */
  readonly edges: number;
  readonly edgeTail: Int32Array;
  readonly edgeHead: Int32Array;
  /** First segment of each link; a link over `s` ranks has segments `edgeSeg … edgeSeg + s − 1`. */
  readonly edgeSeg: Int32Array;
  /** First dummy of each link (`s − 1` of them, consecutive); unused when `s` is 1. */
  readonly edgeDummy: Int32Array;
}

export interface LayerInput {
  readonly nodes: number;
  /** Rank per node, with `rank[edgeHead] > rank[edgeTail]` for every link. */
  readonly rank: Int32Array;
  readonly edgeTail: Int32Array;
  readonly edgeHead: Int32Array;
  /** Group per node (an index below `groups`, −1 for none) when clusters are on. */
  readonly group?: Int32Array | undefined;
  readonly groups?: number | undefined;
}

/** Builds the layered graph of one connected part; layers start in node order. */
export function buildLayers(input: LayerInput): LayerGraph {
  const { nodes: real, edgeTail, edgeHead } = input;
  const edges = edgeTail.length;
  const groups = input.group ? (input.groups ?? 0) : 0;
  const nodeGroup = groups > 0 ? input.group! : undefined;

  let ranks = 0;
  for (let v = 0; v < real; v++) ranks = Math.max(ranks, input.rank[v]! + 1);

  // Dummies and segments of the links.
  const edgeSeg = new Int32Array(edges);
  const edgeDummy = new Int32Array(edges);
  let dummies = 0;
  let segments = 0;
  for (let e = 0; e < edges; e++) {
    const span = input.rank[edgeHead[e]!]! - input.rank[edgeTail[e]!]!;
    edgeSeg[e] = segments;
    edgeDummy[e] = real + dummies;
    segments += span;
    dummies += span - 1;
  }

  // Spacers: per group, the node that stands for it in each rank from its first to its last.
  let spacers = 0;
  let virtual = 0;
  let groupFirst: Int32Array | undefined;
  let present: Int32Array | undefined;
  let presentStart: Int32Array | undefined;
  if (nodeGroup) {
    groupFirst = new Int32Array(groups).fill(ranks);
    const groupLast = new Int32Array(groups).fill(-1);
    for (let v = 0; v < real; v++) {
      const g = nodeGroup[v]!;
      if (g < 0) continue;
      const r = input.rank[v]!;
      if (r < groupFirst[g]!) groupFirst[g] = r;
      if (r > groupLast[g]!) groupLast[g] = r;
    }
    presentStart = new Int32Array(groups + 1);
    for (let g = 0; g < groups; g++) {
      const span = groupLast[g]! >= 0 ? groupLast[g]! - groupFirst[g]! + 1 : 0;
      presentStart[g + 1] = presentStart[g]! + span;
    }
    present = new Int32Array(presentStart[groups]!).fill(-1);
    for (let v = 0; v < real; v++) {
      const g = nodeGroup[v]!;
      if (g < 0) continue;
      const at = presentStart[g]! + input.rank[v]! - groupFirst[g]!;
      if (present[at]! < 0) present[at] = v;
    }
    for (let e = 0; e < edges; e++) {
      const g = nodeGroup[edgeTail[e]!]!;
      if (g < 0 || g !== nodeGroup[edgeHead[e]!]) continue;
      const from = input.rank[edgeTail[e]!]!;
      const span = input.rank[edgeHead[e]!]! - from;
      for (let j = 1; j < span; j++) {
        const at = presentStart[g]! + from + j - groupFirst[g]!;
        if (present[at]! < 0) present[at] = edgeDummy[e]! + j - 1;
      }
    }
    for (let g = 0; g < groups; g++) {
      for (let at = presentStart[g]!; at < presentStart[g + 1]!; at++) {
        if (present[at]! >= 0) continue;
        present[at] = real + dummies + spacers++;
      }
      for (let at = presentStart[g]!; at + 1 < presentStart[g + 1]!; at++) {
        if (present[at]! >= real + dummies || present[at + 1]! >= real + dummies) virtual++;
      }
    }
  }

  const count = real + dummies + spacers;
  const rank = new Int32Array(count);
  const kind = new Uint8Array(count);
  const group = new Int32Array(count).fill(-1);
  rank.set(input.rank.subarray(0, real));
  if (nodeGroup) group.set(nodeGroup.subarray(0, real));

  const total = segments + virtual;
  const segTop = new Int32Array(total);
  const segBot = new Int32Array(total);
  const segVirtual = new Uint8Array(total);
  for (let e = 0; e < edges; e++) {
    const tail = edgeTail[e]!;
    const head = edgeHead[e]!;
    const from = rank[tail]!;
    const span = rank[head]! - from;
    const inGroup = nodeGroup && nodeGroup[tail]! >= 0 && nodeGroup[tail] === nodeGroup[head];
    let s = edgeSeg[e]!;
    let above = tail;
    for (let j = 1; j < span; j++) {
      const d = edgeDummy[e]! + j - 1;
      rank[d] = from + j;
      kind[d] = DUMMY;
      if (inGroup) group[d] = nodeGroup[tail]!;
      segTop[s] = above;
      segBot[s] = d;
      s++;
      above = d;
    }
    segTop[s] = above;
    segBot[s] = head;
  }
  if (present && presentStart && groupFirst) {
    let s = segments;
    for (let g = 0; g < groups; g++) {
      for (let at = presentStart[g]!; at < presentStart[g + 1]!; at++) {
        const v = present[at]!;
        if (v < real + dummies) continue;
        rank[v] = groupFirst[g]! + at - presentStart[g]!;
        kind[v] = SPACER;
        group[v] = g;
      }
      for (let at = presentStart[g]!; at + 1 < presentStart[g + 1]!; at++) {
        const a = present[at]!;
        const b = present[at + 1]!;
        if (a < real + dummies && b < real + dummies) continue;
        segTop[s] = a;
        segBot[s] = b;
        segVirtual[s] = 1;
        s++;
      }
    }
  }

  // Rows of segments per node, in segment order.
  const upStart = new Int32Array(count + 1);
  const downStart = new Int32Array(count + 1);
  for (let s = 0; s < total; s++) {
    upStart[segBot[s]! + 1]!++;
    downStart[segTop[s]! + 1]!++;
  }
  for (let v = 0; v < count; v++) {
    upStart[v + 1]! += upStart[v]!;
    downStart[v + 1]! += downStart[v]!;
  }
  const upSeg = new Int32Array(total);
  const downSeg = new Int32Array(total);
  const upCursor = upStart.slice(0, count);
  const downCursor = downStart.slice(0, count);
  for (let s = 0; s < total; s++) {
    upSeg[upCursor[segBot[s]!]!++] = s;
    downSeg[downCursor[segTop[s]!]!++] = s;
  }

  // Layers, in node order to start with.
  const sizes = new Int32Array(ranks);
  for (let v = 0; v < count; v++) sizes[rank[v]!]!++;
  const layers: Int32Array[] = [];
  for (let r = 0; r < ranks; r++) layers.push(new Int32Array(sizes[r]!));
  const pos = new Int32Array(count);
  sizes.fill(0);
  for (let v = 0; v < count; v++) {
    const r = rank[v]!;
    pos[v] = sizes[r]!;
    layers[r]![sizes[r]!++] = v;
  }

  return {
    count,
    real,
    ranks,
    rank,
    kind,
    group,
    groups,
    segments: total,
    segTop,
    segBot,
    segVirtual,
    upStart,
    upSeg,
    downStart,
    downSeg,
    layers,
    pos,
    edges,
    edgeTail,
    edgeHead,
    edgeSeg,
    edgeDummy,
  };
}
