/**
 * The rectilinear grid of `isosurface` and `volume` (plan E14.7, E14.8), after plotly.js
 * `streamtube/calc.js` `processGrid`: `x`, `y`, `z` and `value` are flattened columns, one entry
 * per grid point, the axes in any nesting order (`'xyz'`: x changes fastest, … `'zyx'`: z fastest)
 * and direction.
 *
 * - **Order** (`fill`, Plotly's `_gridFill`): the axes in the order they first change along the
 *   columns (an axis that never changes comes last), each with its direction (`'+x+y+z'`, `'-z+y+x'`,
 *   …; `-` when its last value is below its first).
 * - **Axis values** (`xs`, `ys`, `zs`, Plotly's `_Xs` …): the distinct values of each column,
 *   ascending (Plotly's `distinctVals`: values closer than span / count / 10⁴ are one value).
 *   Structured columns are read along their strides (O(n), no sort, which matters at 256³ points);
 *   others go through `distinctVals`.
 * - **Validation**: fewer points than `nx · ny · nz`, or a coordinate that doesn't increase (in the
 *   axis' direction) from one grid point to the next along its axis, leaves an empty grid (Plotly
 *   warns "Encountered arbitrary coordinates" and draws nothing).
 *
 * Grid point `(i, j, k)` (the indices along x, y and z in *data* order, i.e. `i = 0` is the first x
 * of the columns, the largest one for a descending axis) is point `i·si + j·sj + k·sk` of the columns
 * (Plotly's `getIndex`).
 */

/** A validated grid (see the module comment). Only typed arrays: it can be sent to a worker. */
export interface IsoGrid {
  /** Grid points: `nx · ny · nz` (0 for an empty grid). */
  readonly len: number;
  /** Distinct values per axis, ascending (linear coordinates). */
  readonly xs: Float64Array;
  readonly ys: Float64Array;
  readonly zs: Float64Array;
  /** Point strides of the x, y and z grid indices in the columns. */
  readonly strides: readonly [number, number, number];
  /** Whether each axis runs from its largest value (data order) down. */
  readonly descending: readonly [boolean, boolean, boolean];
  /** Plotly's `_gridFill`, e.g. `'+x+y+z'`. */
  readonly fill: string;
  /** Value per point, in column order (`len` of them). */
  readonly value: ArrayLike<number>;
  /** Finite min / max of `value` (Plotly's `_minValues` / `_maxValues`); NaN without any. */
  readonly valueMin: number;
  readonly valueMax: number;
}

/** An empty grid. */
export function emptyIsoGrid(value: ArrayLike<number> = new Float64Array(0)): IsoGrid {
  const none = new Float64Array(0);
  return {
    len: 0,
    xs: none,
    ys: none,
    zs: none,
    strides: [1, 1, 1],
    descending: [false, false, false],
    fill: '+x+y+z',
    value,
    valueMin: NaN,
    valueMax: NaN,
  };
}

/**
 * Plotly's `Lib.distinctVals`: the sorted distinct values of `values`, values within
 * `span / (count − 1) / 10⁴` of the previous one merged into it. Non-finite values are dropped.
 */
export function distinctValues(values: ArrayLike<number>): Float64Array {
  const sorted = Float64Array.from(values).filter(Number.isFinite).sort();
  const last = sorted.length - 1;
  if (last < 0) return new Float64Array(0);
  const errDiff = (sorted[last]! - sorted[0]! || 1) / (last || 1) / 10000;
  const out: number[] = [sorted[0]!];
  let prev = sorted[0]!;
  for (let i = 1; i <= last; i++) {
    const v = sorted[i]!;
    if (v - prev > errDiff) {
      out.push(v);
      prev = v;
    }
  }
  return Float64Array.from(out);
}

/** Index of the first entry of `a` (below `len`) that differs from `a[0]`; `len` without any. */
function firstChange(a: ArrayLike<number>, len: number): number {
  const first = a[0];
  for (let i = 1; i < len; i++) if (a[i] !== first) return i;
  return len;
}

/**
 * Distinct values of a structured column: `n` values `a[m · stride]`, ascending (reversed when the
 * axis descends), or null when they are not strictly monotonic.
 */
function strided(a: ArrayLike<number>, stride: number, n: number): Float64Array | null {
  const out = new Float64Array(n);
  for (let m = 0; m < n; m++) out[m] = a[m * stride]!;
  if (n > 1 && out[n - 1]! < out[0]!) out.reverse();
  for (let m = 1; m < n; m++) if (!(out[m]! > out[m - 1]!)) return null;
  if (n > 0 && !Number.isFinite(out[0]!)) return null;
  return out;
}

/** Whether every point's coordinate is its grid value (to the `distinctVals` tolerance). */
function onAxis(
  a: ArrayLike<number>,
  values: Float64Array,
  stride: number,
  descending: boolean,
  len: number,
): boolean {
  const n = values.length;
  const tol = ((values[n - 1]! - values[0]! || 1) / Math.max(1, n - 1) / 10000) * 1.000001;
  // Point p has the axis' m-th value for m = ⌊p / stride⌋ mod n: walk the runs, no division.
  for (let block = 0; block < len; block += stride * n) {
    for (let m = 0; m < n; m++) {
      const v = values[descending ? n - 1 - m : m]!;
      const from = block + m * stride;
      const to = Math.min(len, from + stride);
      for (let p = from; p < to; p++) if (!(Math.abs(a[p]! - v) <= tol)) return false;
    }
  }
  return true;
}

/**
 * Whether `a` increases (times `dir`) by `step` points from every cell corner: grid indices below
 * `cells` per axis, walked with the fastest axis (`order[0]`, stride 1) innermost.
 */
function increasing(
  a: ArrayLike<number>,
  dir: number,
  step: number,
  strides: readonly number[],
  cells: readonly number[],
  order: readonly number[],
): boolean {
  const [f, m, l] = order as [number, number, number];
  const [nf, nm, nl] = [cells[f]!, cells[m]!, cells[l]!];
  const [sf, sm, sl] = [strides[f]!, strides[m]!, strides[l]!];
  for (let c = 0; c < nl; c++) {
    for (let b = 0; b < nm; b++) {
      let q = c * sl + b * sm;
      for (let i = 0; i < nf; i++, q += sf) {
        if (!(a[q]! * dir < a[q + step]! * dir)) return false;
      }
    }
  }
  return true;
}

/**
 * Validate the columns as a grid (see the module comment). `x`, `y`, `z`: linear coordinates;
 * `len`: the points to use (Plotly: the shortest column).
 */
export function processIsoGrid(
  x: ArrayLike<number>,
  y: ArrayLike<number>,
  z: ArrayLike<number>,
  value: ArrayLike<number>,
  len = Math.min(x.length, y.length, z.length, value.length),
): IsoGrid {
  const cols = [x, y, z] as const;
  let valueMin = Infinity;
  let valueMax = -Infinity;
  for (let p = 0; p < len; p++) {
    const v = value[p]!;
    if (v < valueMin) valueMin = v;
    if (v > valueMax) valueMax = v;
  }
  const extent = valueMin <= valueMax ? { valueMin, valueMax } : { valueMin: NaN, valueMax: NaN };
  const empty = { ...emptyIsoGrid(value), ...extent };
  if (len === 0) return empty;
  // The nesting order: axes by where they first change (Plotly's `gridFill`).
  const change = cols.map((c) => firstChange(c, len));
  const order = [0, 1, 2].sort((a, b) => change[a]! - change[b]! || a - b);
  const descending = cols.map((c) => len > 1 && c[len - 1]! < c[0]!) as [boolean, boolean, boolean];
  const fill = order.map((a) => `${descending[a] ? '-' : '+'}${'xyz'[a]}`).join('');
  // Structured columns: strides 1, n₁, n₁·n₂ in nesting order.
  let values: Float64Array[] | null = null;
  const strides: [number, number, number] = [1, 1, 1];
  {
    const [a, b, c] = order as [number, number, number];
    const n1 = change[b]! < len ? change[b]! : change[a]! < len ? len : 1;
    const n2 = change[c]! < len ? change[c]! / n1 : change[b]! < len ? len / n1 : 1;
    const n3 = len / (n1 * n2);
    const counts = [n1, n2, n3];
    if (change[a] === (n1 > 1 ? 1 : len) && counts.every((n) => Number.isInteger(n) && n >= 1)) {
      strides[a] = 1;
      strides[b] = n1;
      strides[c] = n1 * n2;
      const found = [0, 1, 2].map((axis) =>
        strided(cols[axis]!, strides[axis]!, counts[order.indexOf(axis)]!),
      );
      if (
        found.every((v) => v !== null) &&
        found.every((v, axis) => onAxis(cols[axis]!, v!, strides[axis]!, descending[axis]!, len))
      ) {
        values = found as Float64Array[];
      }
    }
  }
  if (!values) {
    // Plotly's path: distinct values of whole columns, then the nesting order's strides.
    values = cols.map((c) => distinctValues(Array.prototype.slice.call(c, 0, len) as number[]));
    const counts = values.map((v) => v.length);
    strides[order[0]!] = 1;
    strides[order[1]!] = counts[order[0]!]!;
    strides[order[2]!] = counts[order[0]!]! * counts[order[1]!]!;
  }
  const [xs, ys, zs] = values as [Float64Array, Float64Array, Float64Array];
  const counts = [xs.length, ys.length, zs.length] as const;
  // Over-specified points (fewer than the grid needs) → nothing.
  if (len < counts[0] * counts[1] * counts[2]) return empty;
  // Plotly's check: every coordinate increases (in its direction) to the next point on its axis,
  // in every cell (each grid index below its axis' last).
  const cells = counts.map((n) => Math.max(0, n - 1));
  for (let a = 0; a < 3; a++) {
    if (!increasing(cols[a]!, descending[a] ? -1 : 1, strides[a]!, strides, cells, order)) {
      return empty;
    }
  }
  return {
    len: counts[0] * counts[1] * counts[2],
    xs,
    ys,
    zs,
    strides,
    descending,
    fill,
    value,
    ...extent,
  };
}

/** Linear coordinate of grid index `i` along axis `a` (data order). */
export function gridCoordinate(grid: IsoGrid, a: 0 | 1 | 2, i: number): number {
  const v = a === 0 ? grid.xs : a === 1 ? grid.ys : grid.zs;
  return v[grid.descending[a] ? v.length - 1 - i : i]!;
}

/** The column index of grid point `(i, j, k)`. */
export function gridIndex(grid: IsoGrid, i: number, j: number, k: number): number {
  return i * grid.strides[0] + j * grid.strides[1] + k * grid.strides[2];
}

/**
 * The grid index (data order) nearest to linear coordinate `v` along axis `a` (the snapped hover
 * point). Plotly's `findNearestOnAxis` takes the grid value at or above instead.
 */
export function nearestGridIndex(grid: IsoGrid, a: 0 | 1 | 2, v: number): number {
  const vals = a === 0 ? grid.xs : a === 1 ? grid.ys : grid.zs;
  const n = vals.length;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (vals[mid]! <= v) lo = mid;
    else hi = mid;
  }
  const m = Math.abs(vals[hi]! - v) < Math.abs(vals[lo]! - v) ? hi : lo;
  return grid.descending[a] ? n - 1 - m : m;
}

/**
 * Plotly's `findNearestOnAxis` (slice locations): the index `q` of the ascending values `arr`
 * with `arr[q − 1] < w ≤ arr[q]` and the distance ratio `(arr[q] − w) / (arr[q] − arr[q − 1])`;
 * `{ id: 0, distRatio: 0 }` when `w` is outside (or at the first value).
 */
export function findNearestOnAxis(
  w: number,
  arr: ArrayLike<number>,
): { id: number; distRatio: number } {
  for (let q = arr.length - 1; q > 0; q--) {
    const min = Math.min(arr[q]!, arr[q - 1]!);
    const max = Math.max(arr[q]!, arr[q - 1]!);
    if (max > min && min < w && w <= max) return { id: q, distRatio: (max - w) / (max - min) };
  }
  return { id: 0, distRatio: 0 };
}
