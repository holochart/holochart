/**
 * Contour levels and contour lines of `surface` (plan E14.3). Pure: no three.js.
 *
 * - **Levels** (plotly.js `surface/convert.js` `setContourLevels`): with `start`, `end` and `size`
 *   (`size > 0`, `end > start`) the levels are `start, start + size, …` below `end`; otherwise the
 *   axis' tick values (Plotly's `scene.contourLevels`). Levels are evenly spaced, so the shader
 *   draws them with one `(start, size, count)` triple per axis.
 * - **Lines** ({@link contourLines}): marching triangles over the grid, split into the same two
 *   triangles per cell as the drawn surface, so the lines are the exact level sets of the drawn
 *   (piecewise linear) surface, like the lines the shader draws on it. Used for the projections
 *   onto the walls (`contours.*.project`), which need geometry.
 */

/** Evenly spaced levels: `start + k · size` for `k` in `[0, count)`. */
export interface ContourLevels {
  readonly start: number;
  readonly size: number;
  readonly count: number;
}

/** Most levels drawn per axis (Plotly has no limit; a million lines draw nothing useful). */
export const MAX_CONTOUR_LEVELS = 1000;

function finite(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * The levels of a `contours.x` / `.y` / `.z` container (see the module comment): its own
 * `start` / `end` / `size`, else `ticks` (sorted linear tick values; uneven ticks, e.g. months,
 * are spread evenly between the first and the last). `null` when there are none.
 */
export function contourLevels(
  c: Readonly<Record<string, unknown>>,
  ticks: readonly number[],
): ContourLevels | null {
  const { start, end, size } = c;
  if (finite(start) && finite(end) && finite(size) && size > 0 && end > start) {
    // Plotly's `for (j = start; j < end; j += size)`.
    const count = Math.min(MAX_CONTOUR_LEVELS, Math.ceil((end - start) / size - 1e-9));
    return count > 0 ? { start, size, count } : null;
  }
  const t = ticks.filter(Number.isFinite);
  if (t.length === 0) return null;
  if (t.length === 1) return { start: t[0]!, size: 1, count: 1 };
  const first = t[0]!;
  const last = t[t.length - 1]!;
  const step = (last - first) / (t.length - 1);
  return step > 0 ? { start: first, size: step, count: t.length } : null;
}

/** The levels as a list. */
export function levelValues(levels: ContourLevels): number[] {
  return Array.from({ length: levels.count }, (_, k) => levels.start + k * levels.size);
}

/** A grid of 3D points (row-major, `nx · ny`) and the field to contour. */
export interface ContourGrid {
  readonly nx: number;
  readonly ny: number;
  /** Positions of grid point `k = j · nx + i` (NaN: a gap). */
  readonly x: ArrayLike<number>;
  readonly y: ArrayLike<number>;
  readonly z: ArrayLike<number>;
  /** The contoured values per grid point (e.g. `z`, or `x` for x contours). */
  readonly field: ArrayLike<number>;
  /** Values interpolated along the lines too (e.g. the color values), optional. */
  readonly value?: ArrayLike<number> | undefined;
}

/** Polylines, NaN-separated (one NaN point between lines), in the grid's coordinates. */
export interface ContourPolylines {
  x: number[];
  y: number[];
  z: number[];
  /** {@link ContourGrid.value} at each point (with a `value` grid). */
  v?: number[];
}

/**
 * The triangles of cell `(i, j)` as grid point indices, as the shader splits it:
 * `(i, j) (i+1, j) (i+1, j+1)` and `(i, j) (i+1, j+1) (i, j+1)`.
 */
export function cellTriangles(nx: number, i: number, j: number): [number[], number[]] {
  const k00 = j * nx + i;
  const k10 = k00 + 1;
  const k01 = k00 + nx;
  const k11 = k01 + 1;
  return [
    [k00, k10, k11],
    [k00, k11, k01],
  ];
}

/**
 * Edge id of the grid edge between grid points `a` and `b` of one cell (horizontal, vertical or
 * diagonal from the lower one), unique over the grid.
 */
function edgeId(a: number, b: number, nx: number): number {
  const lo = Math.min(a, b);
  const d = Math.max(a, b) - lo;
  return lo * 3 + (d === 1 ? 0 : d === nx ? 1 : 2);
}

/**
 * The contour lines of `grid.field` at each of `levels` (see the module comment), appended to
 * `out` as NaN-separated polylines.
 */
export function contourLines(
  grid: ContourGrid,
  levels: readonly number[],
  out: ContourPolylines = { x: [], y: [], z: [] },
): ContourPolylines {
  const { nx, ny, x, y, z, field, value } = grid;
  if (value) out.v ??= [];
  const valid = (k: number): boolean =>
    Number.isFinite(x[k]!) &&
    Number.isFinite(y[k]!) &&
    Number.isFinite(z[k]!) &&
    Number.isFinite(field[k]!);
  for (const level of levels) {
    // Crossing points by edge, and segments as pairs of edges.
    const points = new Map<number, number[]>();
    const segs: number[] = [];
    const cross = (a: number, b: number): number => {
      const fa = field[a]!;
      const t = (level - fa) / (field[b]! - fa);
      // A crossing at a grid point (a value exactly at the level) is that point, whichever edge
      // found it, so lines through grid points stay joined (ids < 0: points; ≥ 0: edges).
      const at = t <= 0 ? a : t >= 1 ? b : -1;
      const id = at >= 0 ? -1 - at : edgeId(a, b, nx);
      if (!points.has(id)) {
        const lerp = (v: ArrayLike<number>): number =>
          at >= 0 ? v[at]! : v[a]! + (v[b]! - v[a]!) * t;
        points.set(id, [lerp(x), lerp(y), lerp(z), value ? lerp(value) : NaN]);
      }
      return id;
    };
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        for (const tri of cellTriangles(nx, i, j)) {
          const [a, b, c] = tri as [number, number, number];
          if (!valid(a) || !valid(b) || !valid(c)) continue;
          const ua = field[a]! >= level;
          const ub = field[b]! >= level;
          const uc = field[c]! >= level;
          if (ua === ub && ub === uc) continue;
          const ends: number[] = [];
          if (ua !== ub) ends.push(cross(a, b));
          if (ub !== uc) ends.push(cross(b, c));
          if (uc !== ua) ends.push(cross(c, a));
          // A segment collapsed onto one grid point draws nothing.
          if (ends[0] !== ends[1]) segs.push(ends[0]!, ends[1]!);
        }
      }
    }
    chain(segs, points, out);
  }
  return out;
}

/** Join segments (pairs of edge ids) into polylines through their shared edges. */
function chain(
  segs: readonly number[],
  points: ReadonlyMap<number, readonly number[]>,
  out: ContourPolylines,
): void {
  const count = segs.length / 2;
  // Up to two segments meet at an edge.
  const at = new Map<number, number[]>();
  for (let s = 0; s < count; s++) {
    for (const e of [segs[2 * s]!, segs[2 * s + 1]!]) {
      const list = at.get(e);
      if (list) list.push(s);
      else at.set(e, [s]);
    }
  }
  const used = new Uint8Array(count);
  const push = (e: number): void => {
    const p = points.get(e)!;
    out.x.push(p[0]!);
    out.y.push(p[1]!);
    out.z.push(p[2]!);
    out.v?.push(p[3]!);
  };
  /** Walk from segment `s` leaving through edge `e`: the edges passed, in order. */
  const walk = (s: number, e: number): number[] => {
    const edges: number[] = [];
    let cur = s;
    let edge = e;
    for (;;) {
      edges.push(edge);
      const next = at.get(edge)?.find((t) => t !== cur && !used[t]);
      if (next === undefined) return edges;
      used[next] = 1;
      edge = segs[2 * next] === edge ? segs[2 * next + 1]! : segs[2 * next]!;
      cur = next;
    }
  };
  for (let s = 0; s < count; s++) {
    if (used[s]) continue;
    used[s] = 1;
    const forward = walk(s, segs[2 * s + 1]!);
    const backward = walk(s, segs[2 * s]!);
    if (out.x.length > 0) {
      out.x.push(NaN);
      out.y.push(NaN);
      out.z.push(NaN);
      out.v?.push(NaN);
    }
    for (let k = backward.length - 1; k >= 0; k--) push(backward[k]!);
    for (const e of forward) push(e);
  }
}
