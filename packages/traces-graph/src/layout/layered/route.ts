/**
 * Link routing, the last Sugiyama step (story G3): the path of every link through the places of
 * its dummy nodes, from the outline of its tail to the outline of its head.
 *
 * Everything here is in the layout's own frame: `c` runs across the layers, `r` along the ranks
 * (later ranks have larger `r`); `layered.ts` turns the frame for the `rankdir` asked for. Routes
 * are flat `[c0, r0, c1, r1, …]` from the link's tail (earlier rank) to its head.
 *
 * **Ports.** A link leaves its tail on the side that faces the next rank and enters its head on
 * the side that faces the rank before. The links on one side of a node are spread over the middle
 * 80 % of that side, `edgesep` apart when there is room and closer when not, in the order of their
 * other ends, so they neither cross next to the node nor share an end point. A single link sits
 * in the middle of the side.
 *
 * **Way points.** Port, then for each dummy the point where the link enters the dummy's rank and
 * the point where it leaves it (the same coordinate across, so the link runs straight through the
 * band of the rank, past that rank's nodes), then port. A node that is thinner than its rank's
 * band gets a straight stub from its port to the band's edge for the same reason. So a route
 * changes its coordinate across only in the free channel between two ranks and never enters the
 * box of a node that is not one of its ends.
 *
 * - `'spline'`: one cubic Bézier per pair of way points, `3k + 1` control points for `k` pieces.
 *   The curve is the monotone cubic interpolant of Fritsch and Carlson (1980, slopes as in
 *   Fritsch and Butland 1984) of `c` over `r`, with slope 0 at both ends: it is smooth, it never
 *   swings past the way points sideways (so not into the neighbours of a dummy), it meets the
 *   nodes at a right angle, and where dummies are aligned it is a straight line.
 * - `'polyline'`: straight segments through the way points that are not on a straight run.
 * - `'orthogonal'`: axis-aligned segments. A link changes its coordinate across only between two
 *   ranks, with one segment across at a level of its own in the free channel there: links that
 *   run right are stacked from the nearest rank in the order that keeps them from crossing each
 *   other, then the links that run left.
 *
 * **Parallel links** over one rank get neighbouring ports; where the ports are closer than
 * `edgesep` (small nodes), splines and polylines also bow apart in the middle. Over several
 * ranks they have dummies of their own, `edgesep` apart. Orthogonal parallel links differ by
 * their ports only.
 *
 * **Self-links** are loops on the node's far side across the layers (the right in `'TB'`), each
 * further out than the one before; the node is given room for them in its layer.
 */
import { REAL, type LayerGraph } from './layers.ts';
import type { LayeredRouting } from './options.ts';

/** How far the first loop of a node reaches out of it, and how much further each next one. */
export const LOOP_REACH = 18;
export const LOOP_STEP = 8;
/** Share of a node's side that ports are spread over. */
const PORT_SHARE = 0.8;

/** Room beside a node for `count` self-links. */
export const loopRoom = (count: number): number =>
  count > 0 ? LOOP_REACH + LOOP_STEP * (count - 1) : 0;

/**
 * The route of the `index`-th self-link of a node centered at (`c`, `r`) with half extents `half`
 * across and `thick` along the ranks: 4 points, Bézier control points for `'spline'`.
 */
export function loopRoute(
  c: number,
  r: number,
  half: number,
  thick: number,
  index: number,
  routing: LayeredRouting,
): Float64Array {
  const reach = LOOP_REACH + LOOP_STEP * index;
  const d = thick * Math.min(0.9, 0.35 + 0.2 * index);
  const side = c + half;
  if (routing !== 'spline') {
    return Float64Array.of(side, r - d, side + reach, r - d, side + reach, r + d, side, r + d);
  }
  // Control points 4/3 of the reach out: the curve's furthest point is `reach` from the side.
  const out = side + (4 / 3) * reach;
  const flare = 0.4 * reach;
  return Float64Array.of(side, r - d, out, r - d - flare, out, r + d + flare, side, r + d);
}

export interface RouteGeometry {
  readonly g: LayerGraph;
  /** Coordinate across the layers, per layout node. */
  readonly cross: Float64Array;
  /** Half extent across the layers and along the ranks, per layout node (0 for dummies). */
  readonly half: Float64Array;
  readonly thick: Float64Array;
  /** Center and half thickness of each rank's band. */
  readonly rankCenter: Float64Array;
  readonly rankHalf: Float64Array;
  /** The free channel between rank `r` and rank `r + 1`: from `channelStart[r]` to `channelEnd[r]`. */
  readonly channelStart: Float64Array;
  readonly channelEnd: Float64Array;
  readonly edgesep: number;
  readonly routing: LayeredRouting;
}

/** The route of every link of the layered graph, tail to head, in the layout's frame. */
export function routeEdges(geometry: RouteGeometry): Float64Array[] {
  const { g, cross, half, thick, rankCenter, rankHalf, edgesep, routing } = geometry;
  const { real, segments, segTop, segBot, segVirtual, kind, rank } = g;

  // Ports: an offset across the node's side per segment end, and the bow of parallel links.
  const portTop = new Float64Array(segments);
  const portBot = new Float64Array(segments);
  const stepTop = new Float64Array(segments);
  const stepBot = new Float64Array(segments);
  const bow = new Float64Array(segments);
  const spread = (
    v: number,
    start: Int32Array,
    list: Int32Array,
    port: Float64Array,
    step: Float64Array,
  ): void => {
    let n = 0;
    for (let i = start[v]!; i < start[v + 1]!; i++) if (!segVirtual[list[i]!]) n++;
    if (n === 0) return;
    const d = Math.min(edgesep, (2 * PORT_SHARE * half[v]!) / n);
    let at = 0;
    for (let i = start[v]!; i < start[v + 1]!; i++) {
      const s = list[i]!;
      if (segVirtual[s]) continue;
      port[s] = (at - (n - 1) / 2) * d;
      step[s] = d;
      at++;
    }
  };
  for (let v = 0; v < real; v++) {
    spread(v, g.downStart, g.downSeg, portTop, stepTop);
    spread(v, g.upStart, g.upSeg, portBot, stepBot);
    // Runs of segments to the same real node: parallel links over one rank.
    for (let i = g.downStart[v]!; i < g.downStart[v + 1]!;) {
      const w = segBot[g.downSeg[i]!]!;
      let j = i + 1;
      while (j < g.downStart[v + 1]! && segBot[g.downSeg[j]!] === w) j++;
      if (j - i > 1 && kind[w] === REAL) {
        for (let k = i; k < j; k++) bow[g.downSeg[k]!] = k - i - (j - i - 1) / 2;
      }
      i = j;
    }
  }
  for (let s = 0; s < segments; s++) {
    if (bow[s] !== 0) bow[s]! *= Math.max(0, edgesep - Math.min(stepTop[s]!, stepBot[s]!));
  }

  /** Coordinate across of a segment's end: the dummy's, or the node's port. */
  const topC = (s: number): number => cross[segTop[s]!]! + portTop[s]!;
  const botC = (s: number): number => cross[segBot[s]!]! + portBot[s]!;

  // Orthogonal: the level of each segment's stretch across, in the channel below its top's rank.
  const level = new Float64Array(routing === 'orthogonal' ? segments : 0).fill(NaN);
  if (routing === 'orthogonal') {
    const gaps = Math.max(0, g.ranks - 1);
    const start = new Int32Array(gaps + 1);
    const bends = (s: number): boolean => !segVirtual[s] && Math.abs(topC(s) - botC(s)) > 1e-9;
    for (let s = 0; s < segments; s++) if (bends(s)) start[rank[segTop[s]!]! + 1]!++;
    for (let r = 0; r < gaps; r++) start[r + 1]! += start[r]!;
    const list = new Int32Array(start[gaps]!);
    const cursor = start.slice(0, gaps);
    for (let s = 0; s < segments; s++) if (bends(s)) list[cursor[rank[segTop[s]!]!]!++] = s;
    for (let r = 0; r < gaps; r++) {
      const row = list.subarray(start[r]!, start[r + 1]!);
      row.sort((a, b) => {
        const rightA = botC(a) > topC(a);
        const rightB = botC(b) > topC(b);
        if (rightA !== rightB) return rightA ? -1 : 1;
        const sign = rightA ? -1 : 1;
        return sign * (topC(a) - topC(b)) || sign * (botC(a) - botC(b)) || a - b;
      });
      const from = geometry.channelStart[r]!;
      const room = geometry.channelEnd[r]! - from;
      for (let t = 0; t < row.length; t++)
        level[row[t]!] = from + ((t + 1) * room) / (row.length + 1);
    }
  }

  const routes: Float64Array[] = [];
  // Way points of the longest link fit here: two per dummy and the two ports.
  const wc: number[] = [];
  const wr: number[] = [];
  const slope: number[] = [];
  for (let e = 0; e < g.edges; e++) {
    const tail = g.edgeTail[e]!;
    const head = g.edgeHead[e]!;
    const span = rank[head]! - rank[tail]!;
    const first = g.edgeSeg[e]!;
    const last = first + span - 1;
    const startR = rankCenter[rank[tail]!]! + thick[tail]!;
    const endR = rankCenter[rank[head]!]! - thick[head]!;

    if (routing === 'orthogonal') {
      const points: number[] = [topC(first), startR];
      for (let s = first; s <= last; s++) {
        if (Number.isNaN(level[s]!)) continue;
        points.push(topC(s), level[s]!, botC(s), level[s]!);
      }
      points.push(botC(last), endR);
      routes.push(Float64Array.from(points));
      continue;
    }

    // Way points. Next to a thicker node of its rank a link first runs straight to the edge of
    // the rank's band, so it cannot cut that node's corner.
    wc.length = wr.length = 0;
    wc.push(topC(first));
    wr.push(startR);
    const tailBand = rankCenter[rank[tail]!]! + rankHalf[rank[tail]!]!;
    if (tailBand > startR) {
      wc.push(topC(first));
      wr.push(tailBand);
    }
    /** The piece that crosses the channel of a link over one rank: the one that may bow. */
    const bowed = wc.length - 1;
    for (let j = 1; j < span; j++) {
      const d = g.edgeDummy[e]! + j - 1;
      const band = rankHalf[rank[d]!]!;
      const center = rankCenter[rank[d]!]!;
      if (band > 0) {
        wc.push(cross[d]!, cross[d]!);
        wr.push(center - band, center + band);
      } else {
        wc.push(cross[d]!);
        wr.push(center);
      }
    }
    const headBand = rankCenter[rank[head]!]! - rankHalf[rank[head]!]!;
    if (headBand < endR) {
      wc.push(botC(last));
      wr.push(headBand);
    }
    wc.push(botC(last));
    wr.push(endR);
    const n = wc.length;
    const bulge = span === 1 ? bow[first]! : 0;

    if (routing === 'polyline') {
      const points: number[] = [wc[0]!, wr[0]!];
      for (let i = 1; i < n; i++) {
        if (bulge !== 0 && i === bowed + 1) {
          points.push((wc[i - 1]! + wc[i]!) / 2 + bulge, (wr[i - 1]! + wr[i]!) / 2);
        }
        // A point between two others with the same coordinate across adds nothing.
        if (i === n - 1 || (wc[i - 1] === wc[i] && wc[i] === wc[i + 1])) continue;
        points.push(wc[i]!, wr[i]!);
      }
      points.push(wc[n - 1]!, wr[n - 1]!);
      routes.push(Float64Array.from(points));
      continue;
    }

    // Spline: slopes of the monotone cubic through the way points, 0 at both ends.
    slope.length = 0;
    slope.push(0);
    for (let i = 1; i < n - 1; i++) {
      const h0 = wr[i]! - wr[i - 1]!;
      const h1 = wr[i + 1]! - wr[i]!;
      const d0 = h0 > 1e-12 ? (wc[i]! - wc[i - 1]!) / h0 : 0;
      const d1 = h1 > 1e-12 ? (wc[i + 1]! - wc[i]!) / h1 : 0;
      if (d0 * d1 <= 0) {
        slope.push(0);
      } else {
        const w0 = 2 * h1 + h0;
        const w1 = h1 + 2 * h0;
        slope.push((w0 + w1) / (w0 / d0 + w1 / d1));
      }
    }
    slope.push(0);
    const points = new Float64Array(2 * (3 * (n - 1) + 1));
    points[0] = wc[0]!;
    points[1] = wr[0]!;
    for (let i = 0; i + 1 < n; i++) {
      const third = (wr[i + 1]! - wr[i]!) / 3;
      const at = 6 * i + 2;
      const aside = i === bowed ? bulge : 0;
      points[at] = wc[i]! + slope[i]! * third + aside;
      points[at + 1] = wr[i]! + third;
      points[at + 2] = wc[i + 1]! - slope[i + 1]! * third + aside;
      points[at + 3] = wr[i + 1]! - third;
      points[at + 4] = wc[i + 1]!;
      points[at + 5] = wr[i + 1]!;
    }
    routes.push(points);
  }
  return routes;
}
