/**
 * Sankey link ribbons (plan E13.5a), tessellated for the fill primitive: plotly.js'
 * `sankey/render.js` `linkPath` shapes as polygons, in the layout's flow frame (x along the flow).
 *
 * - A plain link is a cubic Bézier band of constant thickness across the flow: its top and bottom
 *   edges are the center curve from the source's right side to the target's left side (both
 *   control points halfway along, Plotly's curvature 0.5) shifted by ± half the width.
 * - An arrowhead (`link.arrowlen`, at most half the gap) ends the band `arrowlen` early with a
 *   triangle to the center of the target side.
 * - A circular link is a loop band: its center line ({@link CircularPath}) is an orthogonal route
 *   with rounded corners (circular arcs), offset by ± half the width, so the corners stay
 *   concentric arcs.
 *
 * Curves are flattened adaptively (more segments for longer curves), so a straight link is a
 * quad. Pure; the view maps the outlines to the screen.
 */
import type { CircularPath } from './layout.ts';

/** A closed polygon (flat coordinate lists, not repeated at the end). */
export interface Outline {
  readonly x: number[];
  readonly y: number[];
}

/** Plotly's link curvature: both control points halfway along. */
const CURVATURE = 0.5;

function cubic(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

/** Arrow length actually drawn on a band from `x0` to `x1` (at most half the gap, Plotly). */
export function arrowLength(x0: number, x1: number, arrowlen: number): number {
  return Math.max(0, Math.min(arrowlen, Math.abs((x1 - x0) / 2)));
}

/**
 * The band of a plain link from (`x0`, `y0`) to (`x1`, `y1`) (centers across the flow at the
 * source's right side and the target's left side), `width` thick, with an `arrowlen` arrowhead.
 */
export function bandOutline(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  width: number,
  arrowlen = 0,
): Outline {
  const a = arrowLength(x0, x1, arrowlen);
  const xe = x1 - a;
  const c1 = x0 + CURVATURE * (xe - x0);
  const c2 = x0 + (1 - CURVATURE) * (xe - x0);
  const h = width / 2;
  // The step count depends on the horizontal extent only: links stacked next to each other
  // between the same two columns get the same samples, so their shared edges match exactly (no
  // hairline gaps between neighbouring ribbons).
  const steps = y0 === y1 ? 1 : Math.min(48, Math.max(8, Math.ceil(Math.abs(xe - x0) / 6)));
  const x: number[] = [];
  const y: number[] = [];
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    x.push(cubic(x0, c1, c2, xe, t));
    y.push(cubic(y0, y0, y1, y1, t) - h);
  }
  if (a > 0) {
    x.push(xe + a);
    y.push(y1);
  }
  for (let s = steps; s >= 0; s--) {
    const t = s / steps;
    x.push(cubic(x0, c1, c2, xe, t));
    y.push(cubic(y0, y0, y1, y1, t) + h);
  }
  return { x, y };
}

/** Center of a plain band across the flow at flow position `x` (Plotly's hover test). */
export function bandCenterAt(x0: number, y0: number, x1: number, y1: number, x: number): number {
  const lo = Math.min(x0, x1);
  const hi = Math.max(x0, x1);
  if (hi === lo) return (y0 + y1) / 2;
  const c1 = x0 + CURVATURE * (x1 - x0);
  const c2 = x0 + (1 - CURVATURE) * (x1 - x0);
  const target = Math.max(lo, Math.min(hi, x));
  // x(t) is monotonic: bisect for the t at x.
  let a = 0;
  let b = 1;
  for (let i = 0; i < 30; i++) {
    const t = (a + b) / 2;
    const v = cubic(x0, c1, c2, x1, t);
    if (v < target === x1 > x0) a = t;
    else b = t;
  }
  return cubic(y0, y0, y1, y1, (a + b) / 2);
}

/** A center-line sample and its unit normal (the left side of the direction of travel). */
interface Sample {
  x: number;
  y: number;
  nx: number;
  ny: number;
}

/**
 * Sample an orthogonal route with rounded corners: `points` are the route's vertices, `radii` the
 * corner radius at each interior vertex (clamped so neighbouring corners fit their segments).
 */
export function roundedRoute(
  points: readonly (readonly [number, number])[],
  radii: readonly number[],
): Sample[] {
  // Drop repeated vertices (zero-length segments).
  const pts: [number, number][] = [];
  const rs: number[] = [];
  points.forEach((p, i) => {
    const last = pts[pts.length - 1];
    if (last && Math.abs(last[0] - p[0]) < 1e-9 && Math.abs(last[1] - p[1]) < 1e-9) return;
    pts.push([p[0], p[1]]);
    rs.push(i > 0 && i < points.length - 1 ? (radii[i - 1] ?? 0) : 0);
  });
  const n = pts.length;
  const out: { x: number; y: number }[] = [];
  if (n < 2) return pts.map(([x, y]) => ({ x, y, nx: 0, ny: 0 }));
  const len = (i: number): number =>
    Math.hypot(pts[i + 1]![0] - pts[i]![0], pts[i + 1]![1] - pts[i]![1]);
  out.push({ x: pts[0]![0], y: pts[0]![1] });
  for (let k = 1; k < n - 1; k++) {
    const [px, py] = pts[k - 1]!;
    const [cx, cy] = pts[k]!;
    const [qx, qy] = pts[k + 1]!;
    const lin = len(k - 1);
    const lout = len(k);
    const ix = (cx - px) / lin;
    const iy = (cy - py) / lin;
    const ox = (qx - cx) / lout;
    const oy = (qy - cy) / lout;
    const cross = ix * oy - iy * ox;
    const dot = ix * ox + iy * oy;
    const turn = Math.atan2(Math.abs(cross), dot);
    const tan = Math.tan(turn / 2);
    let r = rs[k]!;
    // Share segments between corners: each corner may use half of an inner segment.
    const inRoom = k - 1 === 0 ? lin : lin / 2;
    const outRoom = k + 1 === n - 1 ? lout : lout / 2;
    if (Math.abs(cross) < 1e-9 || !(tan > 0) || !(r > 0)) {
      out.push({ x: cx, y: cy });
      continue;
    }
    r = Math.min(r, inRoom / tan, outRoom / tan);
    const d = r * tan;
    const t1x = cx - ix * d;
    const t1y = cy - iy * d;
    const sign = cross > 0 ? 1 : -1;
    const ccx = t1x - iy * r * sign;
    const ccy = t1y + ix * r * sign;
    const a1 = Math.atan2(t1y - ccy, t1x - ccx);
    const steps = Math.max(3, Math.min(16, Math.ceil((turn * r) / 3)));
    for (let s = 0; s <= steps; s++) {
      const a = a1 + (sign * turn * s) / steps;
      out.push({ x: ccx + r * Math.cos(a), y: ccy + r * Math.sin(a) });
    }
  }
  out.push({ x: pts[n - 1]![0], y: pts[n - 1]![1] });
  // Normals from the neighbouring directions (exact on straight runs, near-exact on fine arcs).
  return out.map((p, i) => {
    const a = out[Math.max(0, i - 1)]!;
    const b = out[Math.min(out.length - 1, i + 1)]!;
    let tx = b.x - a.x;
    let ty = b.y - a.y;
    const l = Math.hypot(tx, ty) || 1;
    tx /= l;
    ty /= l;
    return { x: p.x, y: p.y, nx: ty, ny: -tx };
  });
}

/** The loop band of a circular link `width` thick, with an `arrowlen` arrowhead at the target. */
export function loopOutline(path: CircularPath, width: number, arrowlen = 0): Outline {
  const a = Math.max(0, arrowlen);
  const { sourceX, sourceY, targetX, targetY, rightX, rSource, rTarget, extent } = path;
  const leftX = path.leftX - a;
  const samples = roundedRoute(
    [
      [sourceX, sourceY],
      [rightX, sourceY],
      [rightX, extent],
      [leftX, extent],
      [leftX, targetY],
      [targetX - a, targetY],
    ],
    [rSource, rSource, rTarget, rTarget],
  );
  const h = width / 2;
  const x: number[] = [];
  const y: number[] = [];
  for (const s of samples) {
    x.push(s.x + s.nx * h);
    y.push(s.y + s.ny * h);
  }
  if (a > 0) {
    x.push(targetX);
    y.push(targetY);
  }
  for (let i = samples.length - 1; i >= 0; i--) {
    const s = samples[i]!;
    x.push(s.x - s.nx * h);
    y.push(s.y - s.ny * h);
  }
  return { x, y };
}

/** Bounding box of an outline: `[x0, y0, x1, y1]`. */
export function outlineBounds(o: Outline): [number, number, number, number] {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < o.x.length; i++) {
    const x = o.x[i]!;
    const y = o.y[i]!;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}

/** Even-odd point-in-polygon test on an outline. */
export function outlineContains(o: Outline, x: number, y: number): boolean {
  let inside = false;
  const n = o.x.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = o.x[i]!;
    const yi = o.y[i]!;
    const xj = o.x[j]!;
    const yj = o.y[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Signed area of an outline (shoelace), for tests. */
export function outlineArea(o: Outline): number {
  let area = 0;
  const n = o.x.length;
  for (let i = 0, j = n - 1; i < n; j = i++) area += (o.x[j]! + o.x[i]!) * (o.y[j]! - o.y[i]!);
  return area / 2;
}
