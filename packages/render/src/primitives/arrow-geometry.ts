/**
 * Arrow and rotated-box geometry of annotations (plan E5.4), pure and text-free, in container px
 * (y down, angles in degrees clockwise). Follows plotly.js `annotations/draw.js` (the arrow runs
 * from the text box edge to the head, backed off for `standoff`/`startstandoff`) and
 * `draw_arrow_head.js` (arrowheads scaled by `arrowwidth × arrowsize`, their tips on the arrow
 * ends). Used by the annotations component; it lives here so the 3D add-on can reuse it.
 */

const DEG = Math.PI / 180;

/** A point in container px. */
export interface ScreenPoint2D {
  x: number;
  y: number;
}

/** Rotate a screen vector clockwise by `deg` (screen y points down). */
export function rotateScreenPoint(x: number, y: number, deg: number): ScreenPoint2D {
  const c = Math.cos(deg * DEG);
  const s = Math.sin(deg * DEG);
  return { x: x * c - y * s, y: x * s + y * c };
}

/** A rotated rectangle: center, half sizes, clockwise angle in degrees. */
export interface RotatedBox {
  cx: number;
  cy: number;
  hw: number;
  hh: number;
  angle: number;
}

/** The 4 corners of a rotated box (clockwise from top-left), optionally inset. */
export function rotatedBoxCorners(b: RotatedBox, inset = 0): ScreenPoint2D[] {
  const hw = Math.max(0, b.hw - inset);
  const hh = Math.max(0, b.hh - inset);
  return [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ].map(([x, y]) => {
    const r = rotateScreenPoint(x as number, y as number, b.angle);
    return { x: b.cx + r.x, y: b.cy + r.y };
  });
}

/** Whether a container point lies inside a rotated box (with `slop` px of tolerance). */
export function inRotatedBox(b: RotatedBox, x: number, y: number, slop = 0): boolean {
  const p = rotateScreenPoint(x - b.cx, y - b.cy, -b.angle);
  return Math.abs(p.x) <= b.hw + slop && Math.abs(p.y) <= b.hh + slop;
}

/**
 * Where a ray from `from` in direction `d` (unit) leaves the box: the parameter of the exit
 * point, or 0 when `from` is outside the box.
 */
export function rotatedBoxExit(b: RotatedBox, from: ScreenPoint2D, d: ScreenPoint2D): number {
  const p = rotateScreenPoint(from.x - b.cx, from.y - b.cy, -b.angle);
  const v = rotateScreenPoint(d.x, d.y, -b.angle);
  let t0 = -Infinity;
  let t1 = Infinity;
  for (const [pc, vc, h] of [
    [p.x, v.x, b.hw],
    [p.y, v.y, b.hh],
  ] as const) {
    if (Math.abs(vc) < 1e-12) {
      if (Math.abs(pc) > h) return 0;
      continue;
    }
    const a = (-h - pc) / vc;
    const c = (h - pc) / vc;
    t0 = Math.max(t0, Math.min(a, c));
    t1 = Math.min(t1, Math.max(a, c));
  }
  return t0 <= 0 && t1 >= 0 ? t1 : 0;
}

/** An arrowhead shape in arrow-width units: tip along +x, `backoff` = how far the tip reaches. */
interface HeadShape {
  points: readonly (readonly [number, number])[];
  backoff: number;
  noRotate?: boolean;
}

function circle(r: number, n = 16): [number, number][] {
  return Array.from({ length: n }, (_, i) => {
    const t = (2 * Math.PI * i) / n;
    return [r * Math.cos(t), r * Math.sin(t)] as [number, number];
  });
}

/**
 * Plotly's arrowheads (`annotations/arrow_paths.js`) as polygons. 8, which Plotly's list does not
 * define, is a bar across the arrow end.
 */
export const ARROWHEADS: readonly HeadShape[] = /* @__PURE__ */ ((): readonly HeadShape[] => [
  { points: [], backoff: 0 },
  {
    points: [
      [-2.4, -3],
      [-2.4, 3],
      [0.6, 0],
    ],
    backoff: 0.6,
  },
  {
    points: [
      [-3.7, -2.5],
      [-3.7, 2.5],
      [1.3, 0],
    ],
    backoff: 1.3,
  },
  {
    points: [
      [-4.45, -3],
      [-1.65, -0.2],
      [-1.65, 0.2],
      [-4.45, 3],
      [1.55, 0],
    ],
    backoff: 1.55,
  },
  {
    points: [
      [-2.2, -2.2],
      [-0.2, -0.2],
      [-0.2, 0.2],
      [-2.2, 2.2],
      [-1.4, 3],
      [1.6, 0],
      [-1.4, -3],
    ],
    backoff: 1.6,
  },
  {
    points: [
      [-4.4, -2.1],
      [-0.6, -0.2],
      [-0.6, 0.2],
      [-4.4, 2.1],
      [-4, 3],
      [2, 0],
      [-4, -3],
    ],
    backoff: 2,
  },
  { points: circle(2), backoff: 0, noRotate: true },
  {
    points: [
      [2, 2],
      [2, -2],
      [-2, -2],
      [-2, 2],
    ],
    backoff: 0,
    noRotate: true,
  },
  {
    points: [
      [-0.5, -3],
      [0.5, -3],
      [0.5, 3],
      [-0.5, 3],
    ],
    backoff: 0.5,
  },
])();

/** Options of {@link arrowGeometry}. */
export interface ArrowOptions {
  arrowside: string;
  arrowhead: number;
  startarrowhead: number;
  arrowsize: number;
  startarrowsize: number;
  arrowwidth: number;
  standoff: number;
  startstandoff: number;
}

/** The drawn arrow: a line segment (if any length is left) and head polygons, container px. */
export interface ArrowGeometry {
  line: [ScreenPoint2D, ScreenPoint2D] | undefined;
  heads: ScreenPoint2D[][];
}

function placeHead(
  shape: HeadShape,
  at: ScreenPoint2D,
  angle: number,
  scale: number,
): ScreenPoint2D[] {
  const rot = shape.noRotate === true ? 0 : angle;
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return shape.points.map(([px, py]) => ({
    x: at.x + (px * c - py * s) * scale,
    y: at.y + (px * s + py * c) * scale,
  }));
}

/**
 * The arrow from `tail` to `head` (container px): it starts where it leaves `box` (plus
 * `startstandoff`), ends `standoff` before the head, and is shortened further by each drawn head's
 * back-off, so the heads' tips land exactly on the (stood-off) ends.
 */
export function arrowGeometry(
  tail: ScreenPoint2D,
  head: ScreenPoint2D,
  box: RotatedBox | undefined,
  o: ArrowOptions,
): ArrowGeometry {
  const dx = head.x - tail.x;
  const dy = head.y - tail.y;
  const length = Math.hypot(dx, dy);
  if (!(length > 0)) return { line: undefined, heads: [] };
  const d = { x: dx / length, y: dy / length };
  const angle = Math.atan2(dy, dx);
  const doEnd = o.arrowside.includes('end');
  const doStart = o.arrowside.includes('start');
  const endShape = ARROWHEADS[doEnd ? o.arrowhead : 0] ?? (ARROWHEADS[0] as HeadShape);
  const startShape = ARROWHEADS[doStart ? o.startarrowhead : 0] ?? (ARROWHEADS[0] as HeadShape);
  const endScale = o.arrowwidth * o.arrowsize;
  const startScale = o.arrowwidth * o.startarrowsize;
  const t0 = (box ? rotatedBoxExit(box, tail, d) : 0) + o.startstandoff;
  const t1 = length - o.standoff;
  if (t1 <= t0) return { line: undefined, heads: [] };
  const at = (t: number): ScreenPoint2D => ({ x: tail.x + d.x * t, y: tail.y + d.y * t });
  const lineStart = t0 + startShape.backoff * startScale;
  const lineEnd = t1 - endShape.backoff * endScale;
  const heads: ScreenPoint2D[][] = [];
  if (startShape.points.length > 0) {
    heads.push(placeHead(startShape, at(lineStart), angle + Math.PI, startScale));
  }
  if (endShape.points.length > 0) heads.push(placeHead(endShape, at(lineEnd), angle, endScale));
  const line: [ScreenPoint2D, ScreenPoint2D] | undefined =
    lineEnd > lineStart ? [at(lineStart), at(lineEnd)] : undefined;
  return { line, heads };
}
