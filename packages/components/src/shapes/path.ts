/**
 * `layout.shapes[i].path` support, pure: parse the SVG-path-like string once into absolute
 * segments whose coordinates stay as written (data values, date strings, paper fractions or
 * pixels), then flatten to polylines after the caller maps each coordinate into a linear "class
 * space". Zoom/pan only re-runs {@link flattenPath}, never the parser.
 */

/**
 * A path parameter as written: a number, or a date token (Plotly writes
 * `2015-02-21_13:45:56.789`; returned with `_` replaced by a space: `'2015-02-21 13:45:56.789'`).
 */
export type PathValue = number | string;

/**
 * A normalized absolute segment. M/L: 1 point; Q: control, end; C: control1, control2, end;
 * Z: none (closes the current subpath).
 */
export interface PathSegment {
  type: 'M' | 'L' | 'Q' | 'C' | 'Z';
  x: PathValue[];
  y: PathValue[];
}

/** Result of {@link parsePath}. */
export interface ParsedPath {
  segments: PathSegment[];
  /** Set when the string is malformed: parsing stops there (SVG error handling: render up to the error). */
  error?: string;
}

/** One polyline per subpath, in class space. */
export interface FlatRing {
  x: number[];
  y: number[];
  /** The subpath ended with Z (the first point is not repeated). */
  closed: boolean;
}

/** How {@link flattenPath} maps coordinates and how finely it subdivides curves. */
export interface FlattenOptions {
  /** Coordinate → class-space number (non-finite results drop that point). */
  mapX(v: PathValue): number;
  /** Coordinate → class-space number (non-finite results drop that point). */
  mapY(v: PathValue): number;
  /** |screen px per class-space unit| along x, for the flattening tolerance. */
  scaleX: number;
  /** |screen px per class-space unit| along y, for the flattening tolerance. */
  scaleY: number;
  /** Max deviation from the true curve in px. Default 0.25. */
  tolerance?: number;
}

type Point = [PathValue, PathValue];

/** Command letters and their parameter counts. */
const COMMANDS = 'MLHVCSQTAZ';
const ARITY = [2, 2, 1, 1, 6, 4, 4, 2, 7, 0];
const SEP = /[\s,]/;
const NUM = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;
// Tried before NUM so `2015-02-21` is not read as 2015, -2, -21. The lookahead keeps `2015-2.5`
// numeric rather than a date followed by `.5`.
const DATE =
  /\d{4}-\d{1,2}(?:-\d{1,2})?(?:_\d{1,2}(?::\d{1,2}(?::\d{1,2}(?:\.\d*)?)?)?)?(?![\d.])/y;

const isNum = (v: PathValue | undefined): v is number => typeof v === 'number';

/**
 * Parses an SVG path string (full grammar: M L H V C S Q T A Z, absolute and relative, implicit
 * repetition, compact numbers and arc flags) into absolute M/L/Q/C/Z segments. H/V become L,
 * S/T become C/Q with reflected controls, arcs become ≤ 90° cubics. Date tokens are allowed only
 * where no arithmetic is needed (absolute M L H V C S Q T); anything else malformed stops parsing
 * with `error`, keeping the segments before it.
 */
export function parsePath(d: string): ParsedPath {
  const segments: PathSegment[] = [];
  let i = 0;
  let cmd = '';
  // Current point, subpath start, and the last C/Q control point (for S/T reflection).
  let cx: PathValue = 0;
  let cy: PathValue = 0;
  let sx: PathValue = 0;
  let sy: PathValue = 0;
  let lastC: Point | undefined;
  let lastQ: Point | undefined;
  let afterZ = false;
  const fail = (msg: string): ParsedPath => ({ segments, error: `${msg} at ${i}` });
  // Interleaved x, y values; the last pair becomes the current point.
  const emit = (type: PathSegment['type'], xy: readonly PathValue[]): void => {
    segments.push({
      type,
      x: xy.filter((_, k) => k % 2 === 0),
      y: xy.filter((_, k) => k % 2 === 1),
    });
    cx = xy[xy.length - 2] ?? cx;
    cy = xy[xy.length - 1] ?? cy;
  };
  // Reflect the previous control through the current point; without one (or with a date in
  // either), SVG uses the current point itself.
  const reflect = (c: Point | undefined): Point =>
    c && isNum(c[0]) && isNum(c[1]) && isNum(cx) && isNum(cy)
      ? [2 * cx - c[0], 2 * cy - c[1]]
      : [cx, cy];

  for (;;) {
    while (i < d.length && SEP.test(d.charAt(i))) i++;
    if (i >= d.length) return { segments };
    const ch = d.charAt(i);
    if (/[a-z]/i.test(ch)) {
      if (!COMMANDS.includes(ch.toUpperCase())) return fail(`unknown command '${ch}'`);
      cmd = ch;
      i++;
    } else if (cmd === '' || cmd === 'Z' || cmd === 'z') {
      return fail(`unexpected '${ch}'`);
    }
    const up = cmd.toUpperCase();
    if (segments.length === 0 && up !== 'M') return fail('path must start with M');
    if (up === 'Z') {
      emit('Z', []);
      [cx, cy] = [sx, sy];
      lastC = lastQ = undefined;
      afterZ = true;
      continue;
    }

    const p: PathValue[] = [];
    for (let k = 0; k < (ARITY[COMMANDS.indexOf(up)] ?? 0); k++) {
      while (i < d.length && SEP.test(d.charAt(i))) i++;
      if (up === 'A' && (k === 3 || k === 4)) {
        // Flags are single characters so `00` is two flags.
        const f = d.charAt(i);
        if (f !== '0' && f !== '1') return fail(`bad arc flag for '${cmd}'`);
        p.push(+f);
        i++;
        continue;
      }
      DATE.lastIndex = NUM.lastIndex = i;
      const date = DATE.exec(d);
      const m = date ?? NUM.exec(d);
      if (!m) return fail(`missing parameter for '${cmd}'`);
      i += m[0].length;
      p.push(date ? m[0].replace('_', ' ') : Number(m[0]));
    }
    const rel = cmd !== up;
    if ((rel || up === 'A') && ![...p, cx, cy].every(isNum)) {
      return fail(`'${cmd}' needs numeric values`);
    }
    // After Z a drawing command starts a new subpath at the old start: make that explicit.
    if (afterZ && up !== 'M') emit('M', [cx, cy]);
    afterZ = false;
    const X = (v: PathValue | undefined): PathValue => (rel ? Number(v) + Number(cx) : (v ?? 0));
    const Y = (v: PathValue | undefined): PathValue => (rel ? Number(v) + Number(cy) : (v ?? 0));
    const [a, b, c, e, f, g] = p;
    let nextC: Point | undefined;
    let nextQ: Point | undefined;
    if (up === 'M') {
      emit('M', [X(a), Y(b)]);
      [sx, sy] = [cx, cy];
      cmd = rel ? 'l' : 'L'; // extra pairs after M are line-tos
    } else if (up === 'L') emit('L', [X(a), Y(b)]);
    else if (up === 'H') emit('L', [X(a), cy]);
    else if (up === 'V') emit('L', [cx, Y(a)]);
    else if (up === 'C' || up === 'S') {
      const c1 = up === 'C' ? [X(a), Y(b)] : reflect(lastC);
      const rest = up === 'C' ? [X(c), Y(e), X(f), Y(g)] : [X(a), Y(b), X(c), Y(e)];
      nextC = [rest[0] ?? 0, rest[1] ?? 0];
      emit('C', [...c1, ...rest]);
    } else if (up === 'Q' || up === 'T') {
      nextQ = up === 'Q' ? [X(a), Y(b)] : reflect(lastQ);
      emit('Q', up === 'Q' ? [...nextQ, X(c), Y(e)] : [...nextQ, X(a), Y(b)]);
    } else {
      const arc = [...p.slice(0, 5), X(p[5]), Y(p[6])] as number[];
      for (const piece of arcToCubics(cx as number, cy as number, arc))
        emit(piece.length === 2 ? 'L' : 'C', piece);
    }
    lastC = nextC;
    lastQ = nextQ;
  }
}

/**
 * SVG arc (endpoint parameterization, spec F.6.5/F.6.6) → cubic pieces of ≤ 90° each, as
 * interleaved `[c1x, c1y, c2x, c2y, x, y]`; a zero radius gives a single `[x, y]` line and
 * identical endpoints give nothing. Angles run counter-clockwise in the path's own (y-up data)
 * coordinates, so `sweep = 1` is the positive-angle direction as in SVG.
 */
function arcToCubics(x1: number, y1: number, arc: readonly number[]): number[][] {
  const [, , rotDeg = 0, large = 0, sweep = 0, x2 = 0, y2 = 0] = arc;
  if (x1 === x2 && y1 === y2) return [];
  let rx = Math.abs(arc[0] ?? 0);
  let ry = Math.abs(arc[1] ?? 0);
  if (rx === 0 || ry === 0) return [[x2, y2]];
  const phi = (rotDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy;
  const y1p = -sin * dx + cos * dy;
  // Radii too small to reach the endpoint are scaled up uniformly until they just do.
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const coef = (large !== sweep ? 1 : -1) * Math.sqrt(Math.max(0, (rx * rx * ry * ry - den) / den));
  const cxp = (coef * rx * y1p) / ry;
  const cyp = (-coef * ry * x1p) / rx;
  const ccx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const ccy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number): number =>
    Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const ux = (x1p - cxp) / rx;
  const uy = (y1p - cyp) / ry;
  const t1 = angle(1, 0, ux, uy);
  let dt = angle(ux, uy, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  if (sweep && dt < 0) dt += 2 * Math.PI;
  const n = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2) - 1e-9));
  const step = dt / n;
  // Standard cubic approximation of a circular arc: handle length 4/3·tan(θ/4) of the radius.
  const h = (4 / 3) * Math.tan(step / 4);
  const at = (t: number): number[] => {
    const [c, s] = [Math.cos(t), Math.sin(t)];
    return [
      ccx + rx * c * cos - ry * s * sin,
      ccy + rx * c * sin + ry * s * cos,
      -rx * s * cos - ry * c * sin, // derivative
      -rx * s * sin + ry * c * cos,
    ];
  };
  const out: number[][] = [];
  for (let k = 0; k < n; k++) {
    const [px = 0, py = 0, pdx = 0, pdy = 0] = at(t1 + k * step);
    const [qx = 0, qy = 0, qdx = 0, qdy = 0] = at(t1 + (k + 1) * step);
    const last = k === n - 1; // land exactly on the written endpoint
    out.push([
      px + h * pdx,
      py + h * pdy,
      qx - h * qdx,
      qy - h * qdy,
      last ? x2 : qx,
      last ? y2 : qy,
    ]);
  }
  return out;
}

/** `ceil(v)` clamped to `[lo, hi]`, with NaN → `lo` (degenerate sizes or tolerances). */
const steps = (v: number, lo: number, hi: number): number => {
  const n = Math.ceil(v);
  return n > lo ? Math.min(n, hi) : lo;
};

/** De Casteljau evaluation of one coordinate of a Bézier curve. */
function bezier(p: readonly number[], t: number): number {
  const q = p.slice();
  for (let m = q.length - 1; m > 0; m--) {
    for (let j = 0; j < m; j++) q[j] = (q[j] ?? 0) + ((q[j + 1] ?? 0) - (q[j] ?? 0)) * t;
  }
  return q[0] ?? NaN;
}

/**
 * Flatten to polylines (one ring per subpath). Control points are mapped first, then curves are
 * subdivided in class space (like Plotly, which maps control points to pixels). Rings with fewer
 * than 2 points are dropped; on a closed ring a written-out copy of the first point is removed.
 */
export function flattenPath(segments: readonly PathSegment[], options: FlattenOptions): FlatRing[] {
  const { scaleX, scaleY, tolerance = 0.25 } = options;
  const rings: FlatRing[] = [];
  let ring: FlatRing | undefined;
  let px = NaN;
  let py = NaN;
  let sx = NaN;
  let sy = NaN;
  const add = (x: number, y: number): void => {
    [px, py] = [x, y];
    if (ring && Number.isFinite(x) && Number.isFinite(y)) {
      ring.x.push(x);
      ring.y.push(y);
    }
  };
  const done = (): void => {
    if (!ring) return;
    const { x, y, closed } = ring;
    const n = x.length;
    if (closed && n > 2 && x[n - 1] === x[0] && y[n - 1] === y[0]) {
      x.pop();
      y.pop();
    }
    if (x.length >= 2) rings.push(ring);
    ring = undefined;
  };
  for (const s of segments) {
    if (s.type === 'Z') {
      if (ring) ring.closed = true;
      [px, py] = [sx, sy];
      continue;
    }
    const xs = s.x.map((v) => options.mapX(v));
    const ys = s.y.map((v) => options.mapY(v));
    if (s.type === 'M' || !ring || ring.closed) {
      // A drawing segment without its own M (hand-built input) continues from the current point.
      done();
      ring = { x: [], y: [], closed: false };
      if (s.type === 'M') [sx, sy] = [xs[0] ?? NaN, ys[0] ?? NaN];
      add(s.type === 'M' ? sx : px, s.type === 'M' ? sy : py);
      if (s.type === 'M') continue;
    }
    const ex = xs[xs.length - 1] ?? NaN;
    const ey = ys[ys.length - 1] ?? NaN;
    const cxs = [px, ...xs];
    const cys = [py, ...ys];
    if (s.type === 'L' || ![...cxs, ...cys].every(Number.isFinite)) {
      add(ex, ey);
      continue;
    }
    // Piecewise-linear error with n steps is ≤ max|B''|/(8n²), and for a degree-k Bézier
    // max|B''| ≤ k(k-1)·max|second difference of the control points|, measured here in px.
    const deg = cxs.length - 1;
    let dd = 0;
    for (let k = 0; k + 2 <= deg; k++) {
      const ddx = ((cxs[k] ?? 0) - 2 * (cxs[k + 1] ?? 0) + (cxs[k + 2] ?? 0)) * scaleX;
      const ddy = ((cys[k] ?? 0) - 2 * (cys[k + 1] ?? 0) + (cys[k + 2] ?? 0)) * scaleY;
      dd = Math.max(dd, Math.hypot(ddx, ddy));
    }
    const n = steps(Math.sqrt((deg * (deg - 1) * dd) / (8 * tolerance)), 1, 256);
    for (let k = 1; k < n; k++) add(bezier(cxs, k / n), bezier(cys, k / n));
    add(ex, ey);
  }
  done();
  return rings;
}

/**
 * Points of an axis-aligned ellipse (center, radii in class-space units), counter-clockwise, not
 * repeating the first point; segment count adaptive to the px radius (min 8, max 512) so that the
 * chord sagitta r·(1 − cos(π/n)) stays within `tolerance` px.
 */
export function ellipsePoints(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  scaleX: number,
  scaleY: number,
  tolerance = 0.25,
): { x: number[]; y: number[] } {
  const r = Math.max(Math.abs(rx * scaleX), Math.abs(ry * scaleY));
  const n = steps(Math.PI / Math.acos(1 - tolerance / r), 8, 512);
  const x: number[] = [];
  const y: number[] = [];
  for (let k = 0; k < n; k++) {
    const t = (2 * Math.PI * k) / n;
    x.push(cx + rx * Math.cos(t));
    y.push(cy + ry * Math.sin(t));
  }
  return { x, y };
}
