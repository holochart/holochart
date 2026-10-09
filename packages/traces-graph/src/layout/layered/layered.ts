/**
 * The layered layout of the `graph` trace (story G3, ADR-029): a directed graph drawn in ranks,
 * links pointing one way, after Sugiyama, Tagawa and Toda (1981). Pipelines, dependency graphs,
 * lineage, state machines. Our own implementation, no dependency; each step is a published
 * algorithm in a file of its own:
 *
 * 1. `acyclic.ts`: break cycles (strong components, then the greedy order of Eades, Lin and
 *    Smyth). The links turned around are laid out reversed and reported in `reversed`; their
 *    routes still run from the real source to the real target.
 * 2. `rank.ts`: a rank per node (network simplex of Gansner et al., or its cheaper starting
 *    points).
 * 3. Connected parts are laid out one by one from here (`layers.ts`: long links become chains of
 *    dummy nodes).
 * 4. `order.ts`: order the layers to reduce crossings (barycenter sweeps and transposition).
 * 5. `position.ts`: coordinates across the layers (Brandes and Köpf), then `clusters.ts` when
 *    clusters are on.
 * 6. Rank coordinates: each rank is as thick as its thickest node, `ranksep` apart, with room for
 *    cluster frames where one starts or ends.
 * 7. `route.ts`: link routes through the dummies, self-link loops.
 * 8. `pack.ts`: the parts side by side; the whole drawing centered on the origin.
 *
 * Steps 4 to 7 work in a frame of their own (`c` across the layers, `r` along the ranks) that is
 * turned at the very end: `'TB'` maps (c, r) to (c, −r), `'BT'` to (c, r), `'LR'` to (r, −c) and
 * `'RL'` to (−r, −c). So `'LR'` is `'TB'` with x and y exchanged when the nodes' widths and
 * heights are exchanged too, and `'BT'` / `'RL'` are mirror images.
 *
 * Node sizes come from the graph (`halfWidth`, `halfHeight`): no two nodes of a rank are closer
 * than `nodesep`, no two ranks closer than `ranksep`, whatever the sizes. Positions the figure
 * gives (`graph.x`, `graph.y`) are ignored: this layout places every node.
 *
 * Deterministic: no randomness, no clock, no hashed iteration; ties go to the lower index.
 */
import type { GraphLayout, LayoutCluster, LayoutGraph, LayoutResult, LinkRoute } from '../types.ts';
import { feedbackLinks } from './acyclic.ts';
import { separateClusters } from './clusters.ts';
import { buildLayers, REAL } from './layers.ts';
import { resolveLayeredOptions, type LayeredOptions } from './options.ts';
import { orderLayers } from './order.ts';
import { packShelves } from './pack.ts';
import { assignCross } from './position.ts';
import { assignRanks, type RankStats } from './rank.ts';
import { loopRoom, loopRoute, routeEdges } from './route.ts';

/** What a run did and how long each step took (ms), for the benchmark and the tests. */
export interface LayeredStats {
  acyclic: number;
  rank: number;
  order: number;
  position: number;
  route: number;
  total: number;
  /** Links turned around. */
  reversed: number;
  /** Tree links the network simplex exchanged. */
  exchanges: number;
  /** Connected parts laid out. */
  parts: number;
  /** Ranks of the deepest part. */
  ranks: number;
  /** Dummy nodes over all parts. */
  dummies: number;
  /** Crossings left between segments, over all parts. */
  crossings: number;
}

export const emptyStats = (): LayeredStats => ({
  acyclic: 0,
  rank: 0,
  order: 0,
  position: 0,
  route: 0,
  total: 0,
  reversed: 0,
  exchanges: 0,
  parts: 0,
  ranks: 0,
  dummies: 0,
  crossings: 0,
});

/** A usable half extent: finite and positive, else 0. */
const extent = (values: Float64Array | undefined, v: number): number => {
  const value = values?.[v];
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : 0;
};

/** The layered layout; `stats`, when given, is filled in. See {@link layeredLayout}. */
export function runLayered(
  graph: LayoutGraph,
  options?: LayeredOptions | null,
  stats?: LayeredStats,
): LayoutResult {
  const o = resolveLayeredOptions(options);
  const n = graph.nodes;
  const { source, target } = graph;
  const m = source.length;
  const now = stats ? () => performance.now() : () => 0;
  const began = now();

  const x = new Float64Array(n);
  const y = new Float64Array(n);
  const routes: (LinkRoute | undefined)[] = new Array<LinkRoute | undefined>(m).fill(undefined);
  const groupOn = o.clusters && graph.group !== undefined;
  if (n === 0) {
    return { x, y, routes, reversed: new Uint8Array(m), ...(groupOn ? { clusters: [] } : {}) };
  }

  const horizontal = o.rankdir === 'LR' || o.rankdir === 'RL';
  /** Half extents across the layers and along the ranks. */
  const nodeHalf = new Float64Array(n);
  const nodeThick = new Float64Array(n);
  for (let v = 0; v < n; v++) {
    nodeHalf[v] = extent(horizontal ? graph.halfHeight : graph.halfWidth, v);
    nodeThick[v] = extent(horizontal ? graph.halfWidth : graph.halfHeight, v);
  }

  // 1. Cycles. From here on a link runs from `tail` to `head`, self-links apart.
  let clock = now();
  const reversed = feedbackLinks(n, source, target);
  const selfCount = new Int32Array(n);
  let proper = 0;
  for (let k = 0; k < m; k++) {
    if (source[k] === target[k]) selfCount[source[k]!]!++;
    else proper++;
  }
  const linkOf = new Int32Array(proper);
  const tail = new Int32Array(proper);
  const head = new Int32Array(proper);
  const weight = new Float64Array(proper);
  for (let k = 0, e = 0; k < m; k++) {
    if (source[k] === target[k]) continue;
    const turned = reversed[k] === 1;
    linkOf[e] = k;
    tail[e] = turned ? target[k]! : source[k]!;
    head[e] = turned ? source[k]! : target[k]!;
    const w = graph.weight[k];
    weight[e] = w !== undefined && Number.isFinite(w) && w > 0 ? w : 1;
    e++;
  }
  if (stats) {
    stats.acyclic += now() - clock;
    for (let k = 0; k < m; k++) stats.reversed += reversed[k]!;
  }

  // 2. Ranks.
  clock = now();
  const rankStats: RankStats = { exchanges: 0 };
  const rank = assignRanks(n, tail, head, weight, o.ranker, rankStats);
  if (stats) {
    stats.rank += now() - clock;
    stats.exchanges = rankStats.exchanges;
  }

  // 3. Connected parts; with clusters, the nodes of a group are one part whatever their links.
  const group = groupOn ? graph.group! : undefined;
  let groupCount = 0;
  if (group) for (let v = 0; v < n; v++) groupCount = Math.max(groupCount, group[v]! + 1);
  const parent = new Int32Array(n);
  for (let v = 0; v < n; v++) parent[v] = v;
  const find = (v: number): number => {
    while (parent[v] !== v) {
      parent[v] = parent[parent[v]!]!;
      v = parent[v]!;
    }
    return v;
  };
  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra < rb) parent[rb] = ra;
    else if (rb < ra) parent[ra] = rb;
  };
  for (let e = 0; e < proper; e++) union(tail[e]!, head[e]!);
  if (group) {
    const first = new Int32Array(groupCount).fill(-1);
    for (let v = 0; v < n; v++) {
      const k = group[v]!;
      if (k < 0) continue;
      if (first[k]! < 0) first[k] = v;
      else union(first[k]!, v);
    }
  }
  // Parts are numbered by their first node; nodes and links listed per part, in index order.
  const partOf = new Int32Array(n);
  let parts = 0;
  for (let v = 0; v < n; v++) partOf[v] = find(v) === v ? parts++ : partOf[find(v)]!;
  const nodeStart = new Int32Array(parts + 1);
  const edgeStart = new Int32Array(parts + 1);
  for (let v = 0; v < n; v++) nodeStart[partOf[v]! + 1]!++;
  for (let e = 0; e < proper; e++) edgeStart[partOf[tail[e]!]! + 1]!++;
  for (let p = 0; p < parts; p++) {
    nodeStart[p + 1]! += nodeStart[p]!;
    edgeStart[p + 1]! += edgeStart[p]!;
  }
  const partNodes = new Int32Array(n);
  const partEdges = new Int32Array(proper);
  const nodeCursor = nodeStart.slice(0, parts);
  const edgeCursor = edgeStart.slice(0, parts);
  for (let v = 0; v < n; v++) partNodes[nodeCursor[partOf[v]!]!++] = v;
  for (let e = 0; e < proper; e++) partEdges[edgeCursor[partOf[tail[e]!]!]!++] = e;

  // Padding of a cluster frame on each of its sides; the title is at the top of the drawing.
  const pad = o.clusterPadding;
  const padBefore = pad + (horizontal ? o.clusterLabelHeight : 0);
  const padAfter = pad;
  const padRankStart = pad + (o.rankdir === 'TB' ? o.clusterLabelHeight : 0);
  const padRankEnd = pad + (o.rankdir === 'BT' ? o.clusterLabelHeight : 0);

  // 4 to 7, per part, in the part's own frame.
  const c = new Float64Array(n);
  const r = new Float64Array(n);
  const local = new Int32Array(n);
  const paths: (Float64Array | undefined)[] = new Array<Float64Array | undefined>(m).fill(
    undefined,
  );
  const minC = new Float64Array(parts);
  const maxC = new Float64Array(parts);
  const minR = new Float64Array(parts);
  const maxR = new Float64Array(parts);
  const frames: { group: number; part: number; c0: number; c1: number; r0: number; r1: number }[] =
    [];
  const groupLocal = new Int32Array(groupCount).fill(-1);

  for (let p = 0; p < parts; p++) {
    const nodes = partNodes.subarray(nodeStart[p]!, nodeStart[p + 1]!);
    const edgeList = partEdges.subarray(edgeStart[p]!, edgeStart[p + 1]!);
    const first = nodes[0]!;
    if (nodes.length === 1 && edgeList.length === 0 && !(group && group[first]! >= 0)) {
      // A node on its own (the common case in a sparse graph): nothing to order or place.
      minC[p] = -nodeHalf[first]!;
      maxC[p] = nodeHalf[first]! + loopRoom(selfCount[first]!);
      minR[p] = -nodeThick[first]!;
      maxR[p] = nodeThick[first]!;
      continue;
    }

    const count = nodes.length;
    let firstRank = Infinity;
    for (const v of nodes) firstRank = Math.min(firstRank, rank[v]!);
    const partRank = new Int32Array(count);
    const partGroup = group ? new Int32Array(count).fill(-1) : undefined;
    const groupIds: number[] = [];
    for (let i = 0; i < count; i++) {
      const v = nodes[i]!;
      local[v] = i;
      partRank[i] = rank[v]! - firstRank;
      if (partGroup && group![v]! >= 0) {
        const k = group![v]!;
        if (groupLocal[k]! < 0) {
          groupLocal[k] = groupIds.length;
          groupIds.push(k);
        }
        partGroup[i] = groupLocal[k]!;
      }
    }
    for (const k of groupIds) groupLocal[k] = -1;
    const edgeTail = new Int32Array(edgeList.length);
    const edgeHead = new Int32Array(edgeList.length);
    for (let j = 0; j < edgeList.length; j++) {
      edgeTail[j] = local[tail[edgeList[j]!]!]!;
      edgeHead[j] = local[head[edgeList[j]!]!]!;
    }
    const g = buildLayers({
      nodes: count,
      rank: partRank,
      edgeTail,
      edgeHead,
      group: partGroup,
      groups: groupIds.length,
    });

    // 4. Order.
    clock = now();
    const crossings = orderLayers(g, o.orderRounds);
    if (stats) {
      stats.order += now() - clock;
      stats.crossings += crossings;
      stats.dummies += g.count - count;
      stats.ranks = Math.max(stats.ranks, g.ranks);
    }

    // 5. Coordinates across the layers.
    clock = now();
    const half = new Float64Array(g.count);
    const thick = new Float64Array(g.count);
    const before = new Float64Array(g.count);
    const after = new Float64Array(g.count);
    for (let i = 0; i < count; i++) {
      const v = nodes[i]!;
      half[i] = before[i] = nodeHalf[v]!;
      after[i] = nodeHalf[v]! + loopRoom(selfCount[v]!);
      thick[i] = nodeThick[v]!;
    }
    const gap = new Float64Array(g.count);
    for (const layer of g.layers) {
      for (let i = 1; i < layer.length; i++) {
        const a = layer[i - 1]!;
        const b = layer[i]!;
        let free =
          ((g.kind[a] === REAL ? o.nodesep : o.edgesep) +
            (g.kind[b] === REAL ? o.nodesep : o.edgesep)) /
          2;
        if (g.groups > 0 && g.group[a] !== g.group[b]) {
          free += (g.group[a]! >= 0 ? padAfter : 0) + (g.group[b]! >= 0 ? padBefore : 0);
        }
        gap[b] = after[a]! + free + before[b]!;
      }
    }
    const cross = assignCross(g, gap, before, after);
    const framesAcross =
      g.groups > 0
        ? separateClusters(g, cross, gap, before, after, padBefore, padAfter)
        : undefined;
    if (stats) stats.position += now() - clock;

    // 6. Coordinates along the ranks.
    clock = now();
    const rankHalf = new Float64Array(g.ranks);
    const starts = new Uint8Array(g.ranks);
    const ends = new Uint8Array(g.ranks);
    const groupFirst = new Int32Array(g.groups).fill(g.ranks);
    const groupLast = new Int32Array(g.groups).fill(-1);
    for (let i = 0; i < count; i++) {
      const at = g.rank[i]!;
      if (thick[i]! > rankHalf[at]!) rankHalf[at] = thick[i]!;
      const k = g.group[i]!;
      if (k < 0) continue;
      if (at < groupFirst[k]!) groupFirst[k] = at;
      if (at > groupLast[k]!) groupLast[k] = at;
    }
    for (let k = 0; k < g.groups; k++) {
      starts[groupFirst[k]!] = 1;
      ends[groupLast[k]!] = 1;
    }
    const rankCenter = new Float64Array(g.ranks);
    const channelStart = new Float64Array(Math.max(0, g.ranks - 1));
    const channelEnd = new Float64Array(Math.max(0, g.ranks - 1));
    for (let at = 1; at < g.ranks; at++) {
      channelStart[at - 1] =
        rankCenter[at - 1]! + rankHalf[at - 1]! + (ends[at - 1] ? padRankEnd : 0);
      channelEnd[at - 1] = channelStart[at - 1]! + o.ranksep;
      rankCenter[at] = channelEnd[at - 1]! + (starts[at] ? padRankStart : 0) + rankHalf[at]!;
    }

    // 7. Routes.
    const partRoutes = routeEdges({
      g,
      cross,
      half,
      thick,
      rankCenter,
      rankHalf,
      channelStart,
      channelEnd,
      edgesep: o.edgesep,
      routing: o.routing,
    });
    for (let j = 0; j < edgeList.length; j++) paths[linkOf[edgeList[j]!]!] = partRoutes[j];
    if (stats) stats.route += now() - clock;

    // The part's nodes, frames and bounding box.
    let lowC = Infinity;
    let highC = -Infinity;
    let lowR = Infinity;
    let highR = -Infinity;
    for (let i = 0; i < g.count; i++) {
      const at = rankCenter[g.rank[i]!]!;
      lowC = Math.min(lowC, cross[i]! - before[i]!);
      highC = Math.max(highC, cross[i]! + after[i]!);
      lowR = Math.min(lowR, at - thick[i]!);
      highR = Math.max(highR, at + thick[i]!);
      if (i < count) {
        c[nodes[i]!] = cross[i]!;
        r[nodes[i]!] = at;
      }
    }
    if (framesAcross) {
      const frameLow = new Float64Array(g.groups).fill(Infinity);
      const frameHigh = new Float64Array(g.groups).fill(-Infinity);
      for (let i = 0; i < count; i++) {
        const k = g.group[i]!;
        if (k < 0) continue;
        const at = rankCenter[g.rank[i]!]!;
        frameLow[k] = Math.min(frameLow[k]!, at - thick[i]! - padRankStart);
        frameHigh[k] = Math.max(frameHigh[k]!, at + thick[i]! + padRankEnd);
      }
      for (let k = 0; k < g.groups; k++) {
        const c0 = framesAcross.start[k]!;
        const c1 = framesAcross.end[k]!;
        frames.push({ group: groupIds[k]!, part: p, c0, c1, r0: frameLow[k]!, r1: frameHigh[k]! });
        lowC = Math.min(lowC, c0);
        highC = Math.max(highC, c1);
        lowR = Math.min(lowR, frameLow[k]!);
        highR = Math.max(highR, frameHigh[k]!);
      }
    }
    minC[p] = lowC;
    maxC[p] = highC;
    minR[p] = lowR;
    maxR[p] = highR;
  }

  // 8. Parts side by side, the largest first; then the whole drawing around the origin.
  const sizes = new Int32Array(parts);
  for (let p = 0; p < parts; p++) sizes[p] = nodeStart[p + 1]! - nodeStart[p]!;
  const byPlace = Array.from({ length: parts }, (_, p) => p).sort(
    (a, b) => sizes[b]! - sizes[a]! || a - b,
  );
  const widths = Float64Array.from(byPlace, (p) => maxC[p]! - minC[p]!);
  const heights = Float64Array.from(byPlace, (p) => maxR[p]! - minR[p]!);
  const packing = packShelves(
    widths,
    heights,
    o.componentsep,
    horizontal ? 1 / o.aspect : o.aspect,
  );
  const shiftC = new Float64Array(parts);
  const shiftR = new Float64Array(parts);
  for (let i = 0; i < parts; i++) {
    const p = byPlace[i]!;
    shiftC[p] = packing.across[i]! - minC[p]! - packing.width / 2;
    shiftR[p] = packing.along[i]! - minR[p]! - packing.height / 2;
  }
  // `0 - …` rather than a unary minus: no negative zero in the output.
  const toX = (cv: number, rv: number): number =>
    horizontal ? (o.rankdir === 'LR' ? rv : 0 - rv) : cv;
  const toY = (cv: number, rv: number): number =>
    horizontal ? 0 - cv : o.rankdir === 'TB' ? 0 - rv : rv;

  for (let v = 0; v < n; v++) {
    const p = partOf[v]!;
    c[v]! += shiftC[p]!;
    r[v]! += shiftR[p]!;
    x[v] = toX(c[v]!, r[v]!);
    y[v] = toY(c[v]!, r[v]!);
  }

  const kind = o.routing === 'spline' ? 'spline' : 'polyline';
  const loops = new Int32Array(n);
  for (let k = 0; k < m; k++) {
    const s = source[k]!;
    let points: Float64Array;
    if (s === target[k]) {
      points = loopRoute(c[s]!, r[s]!, nodeHalf[s]!, nodeThick[s]!, loops[s]!++, o.routing);
    } else {
      points = paths[k]!;
      const p = partOf[s]!;
      for (let i = 0; i < points.length; i += 2) {
        points[i]! += shiftC[p]!;
        points[i + 1]! += shiftR[p]!;
      }
    }
    const count = points.length >> 1;
    const turned = reversed[k] === 1;
    const out = new Float64Array(points.length);
    for (let i = 0; i < count; i++) {
      const from = turned ? count - 1 - i : i;
      out[2 * i] = toX(points[2 * from]!, points[2 * from + 1]!);
      out[2 * i + 1] = toY(points[2 * from]!, points[2 * from + 1]!);
    }
    routes[k] = { points: out, kind };
  }

  let clusters: LayoutCluster[] | undefined;
  if (groupOn) {
    clusters = [];
    for (const frame of frames) {
      const c0 = frame.c0 + shiftC[frame.part]!;
      const c1 = frame.c1 + shiftC[frame.part]!;
      const r0 = frame.r0 + shiftR[frame.part]!;
      const r1 = frame.r1 + shiftR[frame.part]!;
      const xa = toX(c0, r0);
      const xb = toX(c1, r1);
      const ya = toY(c0, r0);
      const yb = toY(c1, r1);
      clusters.push({
        group: frame.group,
        x0: Math.min(xa, xb),
        y0: Math.min(ya, yb),
        x1: Math.max(xa, xb),
        y1: Math.max(ya, yb),
      });
    }
    clusters.sort((a, b) => a.group - b.group);
  }

  if (stats) {
    stats.parts = parts;
    stats.total += now() - began;
  }
  return { x, y, routes, reversed, ...(clusters ? { clusters } : {}) };
}

/**
 * The layered layout as the `graph` trace calls it: `layered: { rankdir, ranksep, nodesep, … }`
 * (see {@link LayeredOptions}). Returns a position per node, a route per link (also for straight
 * ones: routes end on the nodes' outlines), the links it reversed, and the cluster frames when
 * `clusters` is on.
 */
export const layeredLayout: GraphLayout<LayeredOptions | null | undefined> = (graph, options) =>
  runLayered(graph, options);
