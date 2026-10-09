/**
 * Chord ribbons (backlog G8, ADR-029) as polygons for the fill primitive, after d3-chord's
 * `ribbon` and `ribbonArrow`, in container px (y down) with the layout's angles (radians clockwise
 * from 12 o'clock, see `layout.ts`).
 *
 * - A ribbon is the shape between two spans of the ring: along the source span, a quadratic
 *   Bézier whose control point is the center to the start of the target span, along the target
 *   span, and a second such curve back. The four ends follow each other around the ring, so the
 *   outline never crosses itself.
 * - An arrowhead (`arrow` px long) replaces the target span with a point: the sides end `arrow`
 *   short of the target radius and meet at the middle of the span on it.
 * - The two ends have radii of their own, so the target end can stop short of the ring.
 * - Two spans that meet end to end (a link between neighbouring arcs, without a gap) have no
 *   side there: the outline runs along one span and on along the other.
 * - A self-link is a hill on its one span: the span, and a curve back whose control point is
 *   pulled towards the center by the span's chord, so a hill is about half as high as it is wide.
 *
 * Arcs and curves are flattened by length. A side depends on its two end points only, so two
 * ribbons that share a side (links between the same two nodes) get the same points on it and no
 * hairline shows between them. Pure; the view hands the outlines to the fill primitive.
 */

/** A closed polygon (flat coordinate lists, the first point not repeated at the end). */
export interface Outline {
  readonly x: number[];
  readonly y: number[];
}

/** Px of ring per segment of a flattened arc, and of a flattened side. */
const ARC_STEP = 4;
const CURVE_STEP = 8;
const CURVE_STEPS = [8, 48] as const;

/** Container px of the point at `angle` and `radius` around (`cx`, `cy`). */
export function ringPoint(cx: number, cy: number, radius: number, angle: number): [number, number] {
  return [cx + radius * Math.sin(angle), cy - radius * Math.cos(angle)];
}

/** The angle (as the layout's) and the radius of container point (`x`, `y`) around (`cx`, `cy`). */
export function ringCoordinates(
  cx: number,
  cy: number,
  x: number,
  y: number,
): { angle: number; radius: number } {
  return { angle: Math.atan2(x - cx, cy - y), radius: Math.hypot(x - cx, y - cy) };
}

/** Whether `angle` is on the span from `start` to `end` (either direction, any turn). */
export function spanContains(start: number, end: number, angle: number): boolean {
  const span = Math.abs(end - start);
  if (span >= Math.PI * 2 - 1e-9) return true;
  const from = Math.min(start, end);
  const tau = Math.PI * 2;
  const rel = (((angle - from) % tau) + tau) % tau;
  return rel <= span;
}

/** What a ribbon is drawn from. */
export interface RibbonShape {
  readonly cx: number;
  readonly cy: number;
  /** Radius of the source end and of the target end, px. */
  readonly sourceRadius: number;
  readonly targetRadius: number;
  readonly sourceStart: number;
  readonly sourceEnd: number;
  readonly targetStart: number;
  readonly targetEnd: number;
  /** Length of the arrowhead at the target end, px; 0 for none. */
  readonly arrow?: number;
}

/** Append the arc from `a0` to `a1` at `radius`, with or without its first point. */
function arc(
  out: Outline,
  cx: number,
  cy: number,
  radius: number,
  a0: number,
  a1: number,
  first: boolean,
): void {
  const steps = Math.max(1, Math.ceil((Math.abs(a1 - a0) * radius) / ARC_STEP));
  for (let s = first ? 0 : 1; s <= steps; s++) {
    const [x, y] = ringPoint(cx, cy, radius, a0 + ((a1 - a0) * s) / steps);
    out.x.push(x);
    out.y.push(y);
  }
}

/**
 * Append the quadratic Bézier from (`x0`, `y0`) to (`x1`, `y1`) with control point (`qx`, `qy`),
 * without its two end points. The point count depends on the three points only.
 */
function curve(
  out: Outline,
  x0: number,
  y0: number,
  qx: number,
  qy: number,
  x1: number,
  y1: number,
): void {
  const length = Math.hypot(x0 - qx, y0 - qy) + Math.hypot(x1 - qx, y1 - qy);
  const steps = Math.min(CURVE_STEPS[1], Math.max(CURVE_STEPS[0], Math.ceil(length / CURVE_STEP)));
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    const u = 1 - t;
    out.x.push(u * u * x0 + 2 * u * t * qx + t * t * x1);
    out.y.push(u * u * y0 + 2 * u * t * qy + t * t * y1);
  }
}

/** The arrowhead actually drawn: at most the target radius. */
export function arrowLength(shape: RibbonShape): number {
  const a = shape.arrow ?? 0;
  return Number.isFinite(a) && a > 0 ? Math.min(a, Math.max(0, shape.targetRadius)) : 0;
}

/** Whether two points are the same place (two spans that meet end to end). */
const same = (x0: number, y0: number, x1: number, y1: number): boolean =>
  Math.abs(x0 - x1) < 1e-9 && Math.abs(y0 - y1) < 1e-9;

/** The outline of a ribbon between two spans (see the module comment). */
export function ribbonOutline(shape: RibbonShape): Outline {
  const { cx, cy, sourceRadius: rs, targetRadius: rt } = shape;
  const out: Outline = { x: [], y: [] };
  arc(out, cx, cy, rs, shape.sourceStart, shape.sourceEnd, true);
  const head = arrowLength(shape);
  const [sx, sy] = ringPoint(cx, cy, rs, shape.sourceEnd);
  const [tx, ty] = ringPoint(cx, cy, rt - head, shape.targetStart);
  // Where the source span ends at the start of the target span, the side between them would run
  // to the center and back along one line: the outline goes straight on instead.
  const joined = same(sx, sy, tx, ty);
  if (!joined) curve(out, sx, sy, cx, cy, tx, ty);
  if (head > 0) {
    if (!joined) {
      out.x.push(tx);
      out.y.push(ty);
    }
    const [px, py] = ringPoint(cx, cy, rt, (shape.targetStart + shape.targetEnd) / 2);
    out.x.push(px);
    out.y.push(py);
    const [ex, ey] = ringPoint(cx, cy, rt - head, shape.targetEnd);
    out.x.push(ex);
    out.y.push(ey);
  } else {
    arc(out, cx, cy, rt, shape.targetStart, shape.targetEnd, !joined);
  }
  const [bx, by] = ringPoint(cx, cy, rt - head, shape.targetEnd);
  const [ax, ay] = ringPoint(cx, cy, rs, shape.sourceStart);
  if (!same(bx, by, ax, ay)) curve(out, bx, by, cx, cy, ax, ay);
  else if (out.x.length > 1) {
    // The target span ends where the outline started: that point is there already.
    out.x.pop();
    out.y.pop();
  }
  return out;
}

/** A point of the quadratic Bézier from `p0` to `p1` whose control point is `q`. */
function quadratic(p0: number, q: number, p1: number, t: number): number {
  const u = 1 - t;
  return u * u * p0 + 2 * u * t * q + t * t * p1;
}

/**
 * The same ribbon cut across into `count` strips from its source end to its target end, for a
 * color that changes along it: strip `j` lies between the points at `j / count` and
 * `(j + 1) / count` of the two sides, the first one takes the source span and the last one the
 * target end. Neighbouring strips share the two points of their common edge exactly.
 */
export function ribbonStrips(shape: RibbonShape, count: number): Outline[] {
  const { cx, cy, sourceRadius: rs, targetRadius: rt } = shape;
  const n = Math.max(1, Math.floor(count));
  const head = arrowLength(shape);
  // Side A runs from the end of the source span to the start of the target span, side B from
  // the start of the source span to the end of the target span.
  const a0 = ringPoint(cx, cy, rs, shape.sourceEnd);
  const a1 = ringPoint(cx, cy, rt - head, shape.targetStart);
  const b0 = ringPoint(cx, cy, rs, shape.sourceStart);
  const b1 = ringPoint(cx, cy, rt - head, shape.targetEnd);
  const ax: number[] = [];
  const ay: number[] = [];
  const bx: number[] = [];
  const by: number[] = [];
  for (let j = 0; j <= n; j++) {
    const t = j / n;
    ax.push(quadratic(a0[0], cx, a1[0], t));
    ay.push(quadratic(a0[1], cy, a1[1], t));
    bx.push(quadratic(b0[0], cx, b1[0], t));
    by.push(quadratic(b0[1], cy, b1[1], t));
  }
  const strips: Outline[] = [];
  for (let j = 0; j < n; j++) {
    const out: Outline = { x: [], y: [] };
    // Along the source end (the span itself for the first strip), then side A …
    if (j === 0) arc(out, cx, cy, rs, shape.sourceStart, shape.sourceEnd, true);
    else {
      out.x.push(bx[j]!, ax[j]!);
      out.y.push(by[j]!, ay[j]!);
    }
    out.x.push(ax[j + 1]!);
    out.y.push(ay[j + 1]!);
    // … along the target end (the span or the arrowhead for the last strip), and back on side B.
    if (j === n - 1) {
      if (head > 0) {
        const [px, py] = ringPoint(cx, cy, rt, (shape.targetStart + shape.targetEnd) / 2);
        out.x.push(px);
        out.y.push(py);
      } else {
        arc(out, cx, cy, rt, shape.targetStart, shape.targetEnd, false);
        out.x.pop();
        out.y.pop();
      }
    }
    out.x.push(bx[j + 1]!);
    out.y.push(by[j + 1]!);
    strips.push(out);
  }
  return strips;
}

/** The outline of a self-link: a hill on the span from `start` to `end` at `radius`. */
export function hillOutline(
  cx: number,
  cy: number,
  radius: number,
  start: number,
  end: number,
): Outline {
  const out: Outline = { x: [], y: [] };
  arc(out, cx, cy, radius, start, end, true);
  const half = Math.min(Math.abs(end - start), Math.PI) / 2;
  // The control point: on the bisector, the span's chord length inside the chord.
  const reach = Math.max(0, radius * Math.cos(half) - 2 * radius * Math.sin(half));
  const [qx, qy] = ringPoint(cx, cy, reach, (start + end) / 2);
  const [x1, y1] = ringPoint(cx, cy, radius, end);
  const [x0, y0] = ringPoint(cx, cy, radius, start);
  curve(out, x1, y1, qx, qy, x0, y0);
  return out;
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

/** Signed area of an outline (shoelace). */
export function outlineArea(o: Outline): number {
  let area = 0;
  const n = o.x.length;
  for (let i = 0, j = n - 1; i < n; j = i++) area += (o.x[j]! + o.x[i]!) * (o.y[j]! - o.y[i]!);
  return area / 2;
}

/**
 * A point inside a ribbon to anchor its hover label at: halfway along the line between the
 * middles of its two ends, pulled to the center as the sides are (a self-link: under its hill).
 */
export function ribbonAnchor(shape: RibbonShape, self: boolean): [number, number] {
  const { cx, cy } = shape;
  const sm = (shape.sourceStart + shape.sourceEnd) / 2;
  if (self) {
    const half = Math.min(Math.abs(shape.sourceEnd - shape.sourceStart), Math.PI) / 2;
    const r = shape.sourceRadius;
    return ringPoint(cx, cy, Math.max(0, r * Math.cos(half) - (r * Math.sin(half)) / 2), sm);
  }
  const [x0, y0] = ringPoint(cx, cy, shape.sourceRadius, sm);
  const [x1, y1] = ringPoint(cx, cy, shape.targetRadius, (shape.targetStart + shape.targetEnd) / 2);
  // The quadratic's midpoint with the center as control point.
  return [(x0 + 2 * cx + x1) / 4, (y0 + 2 * cy + y1) / 4];
}
