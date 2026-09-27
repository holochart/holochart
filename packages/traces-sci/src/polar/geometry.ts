/**
 * Polar geometry (plan E11.4), pure: angles, where a subplot sits in its domain, the region it
 * covers (a disc, an annulus, a sector of either, or a polygon for `gridshape: 'linear'`), and
 * clipping lines and fills to that region. Ports of plotly.js `lib/angles.js`,
 * `plots/polar/helpers.js` and the geometry parts of `plots/polar/polar.js`.
 *
 * Coordinates here are "geometric" (Plotly's `g` space) in px: the subplot center is the origin, y
 * points up and angles are radians counterclockwise from +x. Container px are `(cx + x, cy - y)`.
 */

export const TAU = 2 * Math.PI;

export const deg2rad = (deg: number): number => (deg / 180) * Math.PI;
export const rad2deg = (rad: number): number => (rad / Math.PI) * 180;

/** `v` modulo `d`, in `[0, d)`. */
export function mod(v: number, d: number): number {
  const out = v % d;
  return out < 0 ? out + d : out;
}

/** `v` modulo `d`, in `(-d/2, d/2]` (Plotly's `modHalf`). */
export function modHalf(v: number, d: number): number {
  return Math.abs(v) > d / 2 ? v - Math.round(v / d) * d : v;
}

/** Whether a sector `[a0, a1]` (radians) spans the full circle (Plotly's `isFullCircle`). */
export function isFullCircle(sector: readonly [number, number]): boolean {
  return Math.abs(sector[1] - sector[0]) > TAU - 1e-14;
}

/** Signed smallest angle from `a` to `b`, in `(-π, π]`. */
export function angleDelta(a: number, b: number): number {
  return modHalf(b - a, TAU);
}

/** Smallest angle between `a` and `b`. */
export function angleDist(a: number, b: number): number {
  return Math.abs(angleDelta(a, b));
}

/** Whether angle `a` lies in the sector `[a0, a1]` (radians, either order; Plotly's rule). */
export function isAngleInsideSector(a: number, sector: readonly [number, number]): boolean {
  if (isFullCircle(sector)) return true;
  let s0 = Math.min(sector[0], sector[1]);
  let s1 = Math.max(sector[0], sector[1]);
  s0 = mod(s0, TAU);
  s1 = mod(s1, TAU);
  if (s0 > s1) s1 += TAU;
  const a0 = mod(a, TAU);
  const a1 = a0 + TAU;
  // A hair of tolerance: points exactly on a sector edge (theta at the sector end) stay inside.
  const eps = 1e-9;
  return (a0 >= s0 - eps && a0 <= s1 + eps) || (a1 >= s0 - eps && a1 <= s1 + eps);
}

/**
 * Bounding box `[x0, y0, x1, y1]` of the unit-radius sector `[s0, s1]` (degrees, `s0 < s1`),
 * counterclockwise (plotly.js `computeSectorBBox`).
 */
export function sectorBBox(sector: readonly [number, number]): [number, number, number, number] {
  const arc = sector[1] - sector[0];
  const a0 = mod(sector[0], 360);
  const a1 = a0 + arc;
  const ax0 = Math.cos(deg2rad(a0));
  const ay0 = Math.sin(deg2rad(a0));
  const ax1 = Math.cos(deg2rad(a1));
  const ay1 = Math.sin(deg2rad(a1));
  let x0: number;
  let y0: number;
  let x1: number;
  let y1: number;
  if ((a0 <= 90 && a1 >= 90) || (a0 > 90 && a1 >= 450)) y1 = 1;
  else if (ay0 <= 0 && ay1 <= 0) y1 = 0;
  else y1 = Math.max(ay0, ay1);
  if ((a0 <= 180 && a1 >= 180) || (a0 > 180 && a1 >= 540)) x0 = -1;
  else if (ax0 >= 0 && ax1 >= 0) x0 = 0;
  else x0 = Math.min(ax0, ax1);
  if ((a0 <= 270 && a1 >= 270) || (a0 > 270 && a1 >= 630)) y0 = -1;
  else if (ay0 >= 0 && ay1 >= 0) y0 = 0;
  else y0 = Math.min(ay0, ay1);
  if (a1 >= 360) x1 = 1;
  else if (ax0 <= 0 && ax1 <= 0) x1 = 0;
  else x1 = Math.max(ax0, ax1);
  return [x0, y0, x1, y1];
}

/**
 * `sector` (degrees) as Plotly draws it: sorted, and at most one turn (a wider sector is the full
 * circle starting at its first angle).
 */
export function normalizeSector(sector: readonly unknown[] | undefined): [number, number] {
  const a = typeof sector?.[0] === 'number' && Number.isFinite(sector[0]) ? sector[0] : 0;
  const b = typeof sector?.[1] === 'number' && Number.isFinite(sector[1]) ? sector[1] : 360;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  if (hi - lo >= 360 || hi === lo) return [lo, lo + 360];
  return [lo, hi];
}

/** Where a subplot sits: circle center in container px (top-left origin) and radii in px. */
export interface PolarPlacement {
  readonly cx: number;
  readonly cy: number;
  readonly radius: number;
  readonly innerRadius: number;
  /** The subplot box (the sector's bounding box), container px. */
  readonly box: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
}

/**
 * Place a subplot in its domain rect (container px): the largest sector of `sector` (degrees)
 * that fits, centered on the free axis (plotly.js `Polar.updateLayout`).
 */
export function placeSubplot(
  rect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  sector: readonly [number, number],
  hole: number,
): PolarPlacement {
  const bbox = sectorBBox(sector);
  const dxs = bbox[2] - bbox[0];
  const dys = bbox[3] - bbox[1];
  const xLength = Math.max(0, rect.width);
  const yLength = Math.max(0, rect.height);
  const arSector = Math.abs(dys / dxs);
  let x = rect.x;
  let y = rect.y;
  let w: number;
  let h: number;
  if (yLength / xLength > arSector) {
    w = xLength;
    h = xLength * arSector;
    y += (yLength - h) / 2;
  } else {
    w = yLength / arSector;
    h = yLength;
    x += (xLength - w) / 2;
  }
  const radius = w / dxs;
  return {
    cx: x - radius * bbox[0],
    cy: y + radius * bbox[3],
    radius,
    innerRadius: Math.max(0, Math.min(1, hole)) * radius,
    box: { x, y, width: w, height: h },
  };
}

/**
 * The region a subplot covers, in geometric px (center at the origin, y up): radii `r0 ≤ r1`, the
 * sector (radians, sorted) and, for polygon grids, the vertex angles (radians, counterclockwise).
 */
export interface PolarRegion {
  readonly r0: number;
  readonly r1: number;
  readonly sector: readonly [number, number];
  readonly vangles: readonly number[] | null;
}

// ---- Polygons (gridshape: 'linear'; plotly.js polar/helpers.js) ----------------------------------

/** Values within 1e-10 of zero, as zero. */
function clampTiny(v: number): number {
  return Math.abs(v) > 1e-10 ? v : 0;
}

/**
 * Where the ray from the origin at angle `a` crosses the line through the polygon vertices at
 * angles `v0` and `v1`, given a point `p` on that line.
 */
export function rayEdgeIntersection(
  v0: number,
  v1: number,
  a: number,
  p: readonly [number, number],
): [number, number] {
  const [xp, yp] = p;
  const dsin = clampTiny(Math.sin(v1) - Math.sin(v0));
  const dcos = clampTiny(Math.cos(v1) - Math.cos(v0));
  const tanA = Math.tan(a);
  const cotanA = clampTiny(1 / tanA);
  const m = dsin / dcos;
  const b = yp - m * xp;
  if (cotanA) {
    if (dsin && dcos) {
      const x = b / (tanA - m);
      return [x, tanA * x];
    }
    if (dcos) return [yp * cotanA, yp];
    return [xp, xp * tanA];
  }
  if (dsin && dcos) return [0, b];
  if (dcos) return [0, yp];
  return [NaN, NaN];
}

function indexOfMin(values: readonly number[], fn: (v: number) => number): number {
  let best = 0;
  let min = Infinity;
  for (let i = 0; i < values.length; i++) {
    const v = fn(values[i] as number);
    if (v < min) {
      min = v;
      best = i;
    }
  }
  return best;
}

/**
 * Vertices (geometric px) of the polygon of "radius" `r` through the vertex angles `vangles`,
 * limited to the sector `[a0, a1]`: the regular polygon for a full circle, else the part inside the
 * sector closed through the origin (plotly.js `makePolygon`). The first vertex is not repeated.
 */
export function polygonVertices(
  r: number,
  a0: number,
  a1: number,
  vangles: readonly number[],
): [number, number][] {
  const len = vangles.length;
  const at = (a: number): [number, number] => [r * Math.cos(a), r * Math.sin(a)];
  if (isFullCircle([a0, a1])) return vangles.map(at);
  const cycle = (i: number): number => mod(i, len);
  const inside = (v: number): boolean => isAngleInsideSector(v, [a0, a1]);
  const out: [number, number][] = [];
  const i0 = indexOfMin(vangles as number[], (v) => (inside(v) ? angleDist(v, a0) : Infinity));
  const va0 = vangles[i0] as number;
  out.push(rayEdgeIntersection(va0, vangles[cycle(i0 - 1)] as number, a0, at(va0)));
  for (let i = i0, j = 0; j < len; i++, j++) {
    const va = vangles[cycle(i)] as number;
    if (!inside(va)) break;
    out.push(at(va));
  }
  const iN = indexOfMin(vangles as number[], (v) => (inside(v) ? angleDist(v, a1) : Infinity));
  const vaN = vangles[iN] as number;
  out.push(rayEdgeIntersection(vaN, vangles[cycle(iN + 1)] as number, a1, at(vaN)));
  out.push([0, 0]);
  return out;
}

/** The vertex angles around angle `a` (plotly.js `findEnclosingVertexAngles`). */
export function enclosingVertexAngles(a: number, vangles: readonly number[]): [number, number] {
  const i0 = indexOfMin(vangles as number[], (v) => {
    const d = angleDelta(v, a);
    return d > 0 ? d : Infinity;
  });
  return [vangles[i0] as number, vangles[mod(i0 + 1, vangles.length)] as number];
}

/** The vertex angle closest to `a` (plotly.js `snapToVertexAngle`). */
export function snapToVertexAngle(a: number, vangles: readonly number[]): number {
  return vangles[indexOfMin(vangles as number[], (v) => angleDist(a, v))] as number;
}

/**
 * Distance from the center to the polygon grid of "radius" `r` along angle `a` (1 for circles):
 * where a polygon grid line at `r` crosses the ray at `a`, relative to `r`.
 */
export function polygonScale(a: number, vangles: readonly number[] | null): number {
  if (!vangles || vangles.length < 3) return 1;
  const [v0, v1] = enclosingVertexAngles(a, vangles);
  const p = rayEdgeIntersection(v0, v1, a, [Math.cos(v0), Math.sin(v0)]);
  const d = Math.hypot(p[0], p[1]);
  return Number.isFinite(d) && d > 0 ? d : 1;
}

function insidePolygon(
  poly: readonly (readonly [number, number])[],
  x: number,
  y: number,
): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i] as readonly [number, number];
    const [xj, yj] = poly[j] as readonly [number, number];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// ---- The region ----------------------------------------------------------------------------------

/** Relative tolerance of inside tests (a point on the outer circle is inside). */
const EDGE_EPS = 1e-7;

/** Precomputed tests for one region. */
export interface RegionTester {
  readonly region: PolarRegion;
  /** Whether the region is convex (a disc, or a sector of at most half a circle, without hole). */
  readonly convex: boolean;
  inside(x: number, y: number): boolean;
  /** Parameters `t ∈ (0, 1)` where the segment `a → b` crosses the region boundary. */
  crossings(ax: number, ay: number, bx: number, by: number, out: number[]): void;
}

function pushCircle(
  r: number,
  ax: number,
  ay: number,
  dx: number,
  dy: number,
  out: number[],
): void {
  const a = dx * dx + dy * dy;
  if (!(a > 0) || !(r > 0)) return;
  const b = 2 * (ax * dx + ay * dy);
  const c = ax * ax + ay * ay - r * r;
  const disc = b * b - 4 * a * c;
  if (!(disc > 0)) return;
  const s = Math.sqrt(disc);
  const t0 = (-b - s) / (2 * a);
  const t1 = (-b + s) / (2 * a);
  if (t0 > 0 && t0 < 1) out.push(t0);
  if (t1 > 0 && t1 < 1) out.push(t1);
}

function pushSegment(
  ax: number,
  ay: number,
  dx: number,
  dy: number,
  px: number,
  py: number,
  qx: number,
  qy: number,
  out: number[],
): void {
  const ex = qx - px;
  const ey = qy - py;
  const den = dx * ey - dy * ex;
  if (den === 0) return;
  const t = ((px - ax) * ey - (py - ay) * ex) / den;
  const u = ((px - ax) * dy - (py - ay) * dx) / den;
  if (t > 0 && t < 1 && u >= 0 && u <= 1) out.push(t);
}

/** Inside tests and boundary crossings of a region (see {@link RegionTester}). */
export function regionTester(region: PolarRegion): RegionTester {
  const { r0, r1, sector, vangles } = region;
  const full = isFullCircle(sector);
  if (vangles && vangles.length >= 3) {
    const outer = polygonVertices(r1, sector[0], sector[1], vangles);
    const inner = r0 > 0 ? polygonVertices(r0, sector[0], sector[1], vangles) : null;
    const edges = (
      poly: readonly [number, number][],
      ...args: [number, number, number, number, number[]]
    ): void => {
      const [ax, ay, dx, dy, out] = args;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const p = poly[j] as [number, number];
        const q = poly[i] as [number, number];
        pushSegment(ax, ay, dx, dy, p[0], p[1], q[0], q[1], out);
      }
    };
    return {
      region,
      convex: false,
      inside: (x, y) =>
        (insidePolygon(outer, x, y) || nearRing(outer, x, y)) &&
        !(inner && insidePolygon(inner, x, y) && !nearRing(inner, x, y)),
      crossings(ax, ay, bx, by, out) {
        edges(outer, ax, ay, bx - ax, by - ay, out);
        if (inner) edges(inner, ax, ay, bx - ax, by - ay, out);
      },
    };
  }
  const lo = r0 * (1 - EDGE_EPS) - 1e-9;
  const hi = r1 * (1 + EDGE_EPS) + 1e-9;
  const far = r1 * 4 + 1;
  const rays = full
    ? []
    : [sector[0], sector[1]].map((a) => [far * Math.cos(a), far * Math.sin(a)] as const);
  return {
    region,
    convex: r0 <= 0 && (full || sector[1] - sector[0] <= Math.PI + 1e-12),
    inside(x, y) {
      const r = Math.hypot(x, y);
      if (r > hi || r < lo) return false;
      return full || r === 0 || isAngleInsideSector(Math.atan2(y, x), sector);
    },
    crossings(ax, ay, bx, by, out) {
      const dx = bx - ax;
      const dy = by - ay;
      pushCircle(r1, ax, ay, dx, dy, out);
      if (r0 > 0) pushCircle(r0, ax, ay, dx, dy, out);
      for (const [qx, qy] of rays) pushSegment(ax, ay, dx, dy, 0, 0, qx, qy, out);
    },
  };
}

/** Whether `(x, y)` is on the ring's boundary (within a hair), for points on polygon grid lines. */
function nearRing(poly: readonly [number, number][], x: number, y: number): boolean {
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [px, py] = poly[j] as [number, number];
    const [qx, qy] = poly[i] as [number, number];
    const ex = qx - px;
    const ey = qy - py;
    const len2 = ex * ex + ey * ey;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - px) * ex + (y - py) * ey) / len2)) : 0;
    const d = Math.hypot(px + t * ex - x, py + t * ey - y);
    if (d <= 1e-6 * (1 + Math.hypot(px, py))) return true;
  }
  return false;
}

/**
 * Clip a polyline (NaN entries separate runs) to the region: the parts inside, NaN-separated.
 * Returns the input arrays unchanged when every segment is inside a convex region.
 */
export function clipPolyline(
  tester: RegionTester,
  x: ArrayLike<number>,
  y: ArrayLike<number>,
): { x: Float64Array; y: Float64Array } {
  const n = Math.min(x.length, y.length);
  let allInside = tester.convex;
  if (allInside) {
    for (let i = 0; i < n; i++) {
      const xi = x[i] as number;
      const yi = y[i] as number;
      if (Number.isFinite(xi) && Number.isFinite(yi) && !tester.inside(xi, yi)) {
        allInside = false;
        break;
      }
    }
  }
  if (allInside) {
    return {
      x: x instanceof Float64Array ? x : Float64Array.from(x),
      y: y instanceof Float64Array ? y : Float64Array.from(y),
    };
  }
  const ox: number[] = [];
  const oy: number[] = [];
  // Whether the output currently continues a run (its last vertex is the pen position).
  let open = false;
  const ts: number[] = [];
  const pen = (px: number, py: number): void => {
    ox.push(px);
    oy.push(py);
  };
  const lift = (): void => {
    if (open) {
      ox.push(NaN);
      oy.push(NaN);
      open = false;
    }
  };
  for (let i = 0; i + 1 < n; i++) {
    const ax = x[i] as number;
    const ay = y[i] as number;
    const bx = x[i + 1] as number;
    const by = y[i + 1] as number;
    if (
      !Number.isFinite(ax) ||
      !Number.isFinite(ay) ||
      !Number.isFinite(bx) ||
      !Number.isFinite(by)
    ) {
      lift();
      continue;
    }
    ts.length = 0;
    tester.crossings(ax, ay, bx, by, ts);
    ts.push(0, 1);
    ts.sort((p, q) => p - q);
    const dx = bx - ax;
    const dy = by - ay;
    // Where the open run continues from in this segment (-1: it doesn't).
    let from = open ? 0 : -1;
    for (let k = 0; k + 1 < ts.length; k++) {
      const t0 = ts[k] as number;
      const t1 = ts[k + 1] as number;
      if (t1 - t0 <= 1e-12) {
        if (from === t0) from = t1;
        continue;
      }
      const tm = (t0 + t1) / 2;
      if (!tester.inside(ax + tm * dx, ay + tm * dy)) {
        lift();
        from = -1;
        continue;
      }
      if (!open || from !== t0) {
        lift();
        pen(ax + t0 * dx, ay + t0 * dy);
        open = true;
      }
      pen(ax + t1 * dx, ay + t1 * dy);
      from = t1;
    }
  }
  while (ox.length > 0 && Number.isNaN(ox[ox.length - 1]!)) {
    ox.pop();
    oy.pop();
  }
  return { x: Float64Array.from(ox), y: Float64Array.from(oy) };
}

// ---- Outlines ------------------------------------------------------------------------------------

/** Chord length (px) arcs are resampled with. */
export const ARC_STEP_PX = 3;

/** Points of the arc of radius `r` from `a0` to `a1` (radians), both ends included. */
export function arcPoints(
  r: number,
  a0: number,
  a1: number,
  out: { x: number[]; y: number[] },
  step = ARC_STEP_PX,
): void {
  const span = a1 - a0;
  const n = Math.max(2, Math.min(2048, Math.ceil((Math.abs(span) * Math.max(r, 1)) / step)));
  for (let i = 0; i <= n; i++) {
    const a = a0 + (span * i) / n;
    out.x.push(r * Math.cos(a));
    out.y.push(r * Math.sin(a));
  }
}

/**
 * The grid line at radius `r`: an arc over the sector (a closed circle for a full one), or the
 * polygon through `vangles`, as a polyline (geometric px) appended to `out`.
 */
export function gridLinePoints(
  region: Pick<PolarRegion, 'sector' | 'vangles'>,
  r: number,
  out: { x: number[]; y: number[] },
): void {
  const [s0, s1] = region.sector;
  const vangles = region.vangles;
  if (vangles && vangles.length >= 3) {
    const poly = polygonVertices(r, s0, s1, vangles);
    const full = isFullCircle(region.sector);
    // A clipped polygon ends at the origin: the grid line is the part along the edges only.
    const last = full ? poly.length : poly.length - 1;
    for (let i = 0; i < last; i++) {
      out.x.push((poly[i] as [number, number])[0]);
      out.y.push((poly[i] as [number, number])[1]);
    }
    if (full) {
      out.x.push((poly[0] as [number, number])[0]);
      out.y.push((poly[0] as [number, number])[1]);
    }
    return;
  }
  arcPoints(r, s0, s1, out);
}

/**
 * The outline of the region (the angular axis line, and what the background fills): a closed
 * ring, or two rings (outer then inner) for a full annulus. Rings are counterclockwise except the
 * inner ring of an annulus, which is clockwise (a hole for nonzero fills).
 */
export function regionRings(region: PolarRegion): { x: number[]; y: number[]; rings: number[] } {
  const out = { x: [] as number[], y: [] as number[] };
  const rings: number[] = [0];
  const { r0, r1, sector, vangles } = region;
  const full = isFullCircle(sector);
  if (vangles && vangles.length >= 3) {
    const outer = polygonVertices(r1, sector[0], sector[1], vangles);
    for (const [px, py] of outer) {
      out.x.push(px);
      out.y.push(py);
    }
    if (r0 > 0) {
      rings.push(out.x.length);
      const inner = polygonVertices(r0, sector[0], sector[1], vangles).reverse();
      for (const [px, py] of inner) {
        out.x.push(px);
        out.y.push(py);
      }
    }
    return { ...out, rings };
  }
  if (full) {
    arcPoints(r1, 0, TAU, out);
    out.x.pop();
    out.y.pop();
    if (r0 > 0) {
      rings.push(out.x.length);
      arcPoints(r0, TAU, 0, out);
      out.x.pop();
      out.y.pop();
    }
    return { ...out, rings };
  }
  arcPoints(r1, sector[0], sector[1], out);
  if (r0 > 0) arcPoints(r0, sector[1], sector[0], out);
  else {
    out.x.push(0);
    out.y.push(0);
  }
  return { ...out, rings };
}

/** Twice the signed area of a ring (positive: counterclockwise). */
export function signedArea(
  x: ArrayLike<number>,
  y: ArrayLike<number>,
  start: number,
  end: number,
): number {
  let s = 0;
  for (let i = start, j = end - 1; i < end; j = i++) {
    s += (x[j] as number) * (y[i] as number) - (x[i] as number) * (y[j] as number);
  }
  return s;
}
