/**
 * Grid handling of `surface` (plan E14.3; plotly.js `surface/convert.js`, `heatmap/interp2d.js`).
 * Pure: no three.js.
 *
 * - **Shape**: `z[row][column]`, rows along y. `nx` is the longest row, `ny` the number of rows;
 *   missing and non-numeric entries are gaps (NaN).
 * - **Coordinates**: `x` / `y` are vectors (one per column / row, like Plotly's `getXat` /
 *   `getYat`: entries past their end are gaps) or 2D arrays like `z` (a grid that is not
 *   rectangular in x and y). Without them, the column / row indices.
 * - **Gaps** (`connectgaps`): filled by {@link fillGaps}, Plotly's Laplace fill.
 *
 * Every grid is stored row-major, `v[j·nx + i]`, in the scene axes' linear coordinates.
 */
import { isArrayLike, type Scale } from '@mk7s/holochart-core';

/** A surface grid in linear coordinates (see the module comment). */
export interface SurfaceGrid {
  /** Columns (along x) and rows (along y). */
  readonly nx: number;
  readonly ny: number;
  /** `nx` values (a vector) or `nx · ny` (a matrix). */
  readonly x: Float64Array;
  readonly xMatrix: boolean;
  /** `ny` values (a vector) or `nx · ny` (a matrix). */
  readonly y: Float64Array;
  readonly yMatrix: boolean;
  /** Heights, `nx · ny`, NaN for gaps (filled with `connectgaps`). */
  readonly z: Float64Array;
}

/** Whether a data array is 2D (its first entry is an array). */
export function isMatrix(v: unknown): v is ArrayLike<ArrayLike<unknown>> {
  return isArrayLike(v) && v.length > 0 && isArrayLike((v as ArrayLike<unknown>)[0]);
}

/** `nx` (the longest row) and `ny` (rows) of a 2D `z`. */
export function gridShape(z: ArrayLike<ArrayLike<unknown>>): { nx: number; ny: number } {
  let nx = 0;
  for (let j = 0; j < z.length; j++) {
    const row = z[j];
    if (isArrayLike(row) && row.length > nx) nx = row.length;
  }
  return { nx, ny: z.length };
}

/** A number of a value (numbers and numeric strings), else NaN. */
export function toNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '') return Number(v);
  return NaN;
}

/** A value in `scale`'s linear coordinates (a fast path for numbers on linear axes). */
function linear(scale: Scale | undefined, v: unknown): number {
  if (!scale || (scale.type === 'linear' && typeof v === 'number')) {
    return typeof v === 'number' ? v : toNumber(v);
  }
  return scale.d2l(v);
}

/**
 * A 2D array (`nx` × `ny`) → row-major linear values (non-finite → NaN). `scale` undefined:
 * plain numbers.
 */
export function matrixValues(
  rows: ArrayLike<ArrayLike<unknown>>,
  nx: number,
  ny: number,
  scale?: Scale,
): Float64Array {
  const out = new Float64Array(nx * ny).fill(NaN);
  for (let j = 0; j < ny; j++) {
    const row = rows[j];
    if (!isArrayLike(row)) continue;
    const n = Math.min(nx, row.length);
    const o = j * nx;
    for (let i = 0; i < n; i++) {
      const v = linear(scale, row[i]);
      out[o + i] = Number.isFinite(v) ? v : NaN;
    }
  }
  return out;
}

/** A coordinate vector → `n` linear values (indices without data; gaps past its end). */
export function vectorValues(v: unknown, n: number, scale?: Scale): Float64Array {
  const out = new Float64Array(n);
  if (!isArrayLike(v)) {
    for (let i = 0; i < n; i++) out[i] = i;
    return out;
  }
  for (let i = 0; i < n; i++) {
    const l = i < v.length ? linear(scale, v[i]) : NaN;
    out[i] = Number.isFinite(l) ? l : NaN;
  }
  return out;
}

/** Scales of the three scene axes (`sceneScales`). */
export interface GridScales {
  readonly x?: Scale;
  readonly y?: Scale;
  readonly z?: Scale;
}

/** Build the grid of a defaulted trace (see the module comment). `null` without a usable `z`. */
export function buildSurfaceGrid(
  trace: Readonly<Record<string, unknown>>,
  scales: GridScales = {},
): SurfaceGrid | null {
  const zIn = trace['z'];
  if (!isMatrix(zIn)) return null;
  const { nx, ny } = gridShape(zIn);
  if (nx === 0 || ny === 0) return null;
  let z = matrixValues(zIn, nx, ny, scales.z);
  if (trace['connectgaps'] === true) z = fillGaps(z, nx, ny);
  const xIn = trace['x'];
  const yIn = trace['y'];
  const xMatrix = isMatrix(xIn);
  const yMatrix = isMatrix(yIn);
  return {
    nx,
    ny,
    x: xMatrix ? matrixValues(xIn, nx, ny, scales.x) : vectorValues(xIn, nx, scales.x),
    xMatrix,
    y: yMatrix ? matrixValues(yIn, nx, ny, scales.y) : vectorValues(yIn, ny, scales.y),
    yMatrix,
    z,
  };
}

/** x of grid point `(i, j)`. */
export function gridX(g: SurfaceGrid, i: number, j: number): number {
  return g.x[g.xMatrix ? j * g.nx + i : i]!;
}

/** y of grid point `(i, j)`. */
export function gridY(g: SurfaceGrid, i: number, j: number): number {
  return g.y[g.yMatrix ? j * g.nx + i : j]!;
}

/** `[min, max]` of the finite values, or `undefined`. */
export function finiteExtent(values: ArrayLike<number>): [number, number] | undefined {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return lo <= hi ? [lo, hi] : undefined;
}

const colorExtents = new WeakMap<object, [number, number] | null>();

/**
 * The finite extent of the values a surface is colored by (`surfacecolor`, else `z`), from the
 * defaulted trace (the colorbar hook and the color axes only see that); cached per data array.
 */
export function surfaceColorExtent(
  trace: Readonly<Record<string, unknown>>,
): [number, number] | undefined {
  const source = isMatrix(trace['surfacecolor']) ? trace['surfacecolor'] : trace['z'];
  if (!isMatrix(source)) return undefined;
  const hit = colorExtents.get(source);
  if (hit !== undefined) return hit ?? undefined;
  let lo = Infinity;
  let hi = -Infinity;
  for (let j = 0; j < source.length; j++) {
    const row = source[j];
    if (!isArrayLike(row)) continue;
    for (let i = 0; i < row.length; i++) {
      const v = toNumber(row[i]);
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  const extent: [number, number] | null = lo <= hi ? [lo, hi] : null;
  colorExtents.set(source, extent);
  return extent ?? undefined;
}

// ---- Gap filling (Plotly `heatmap/find_empties.js` + `heatmap/interp2d.js`) ------------------------
// A copy of traces-stats' `fillGaps` (the 3D package may not depend on traces-stats: the script-tag
// add-on only shares core, runtime, render and traces-basic with the main script).

const INTERP_THRESHOLD = 1e-2;
const MAX_PASSES = 100;

/** Plotly's `correctionOvershoot`: little overshoot until the iteration converges. */
function overshootFor(maxFractionalChange: number): number {
  return 0.5 - 0.25 * Math.min(1, maxFractionalChange * 0.5);
}

/** One averaging pass over `order` (`overshoot` undefined: the first pass); the largest change. */
function pass(
  z: Float64Array,
  nx: number,
  ny: number,
  order: Int32Array,
  overshoot: number | undefined,
): number {
  let maxFrac = 0;
  for (let p = 0; p < order.length; p++) {
    const idx = order[p]!;
    const i = idx % nx;
    const j = (idx - i) / nx;
    const initial = z[idx]!;
    let sum = 0;
    let count = 0;
    let lo = Infinity;
    let hi = -Infinity;
    // Plotly's neighbour order: row below, row above, column left, column right.
    for (let q = 0; q < 4; q++) {
      const ni = q < 2 ? i : q === 2 ? i - 1 : i + 1;
      const nj = q === 0 ? j - 1 : q === 1 ? j + 1 : j;
      if (ni < 0 || nj < 0 || ni >= nx || nj >= ny) continue;
      const v = z[nj * nx + ni]!;
      if (!Number.isFinite(v)) continue;
      sum += v;
      count++;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    if (count === 0) continue;
    let v = sum / count;
    if (overshoot === undefined) {
      if (count < 4) maxFrac = 1;
    } else {
      v = (1 + overshoot) * v - overshoot * initial;
      if (hi > lo) maxFrac = Math.max(maxFrac, Math.abs(v - initial) / (hi - lo));
    }
    z[idx] = v;
  }
  return maxFrac;
}

/**
 * Fill the non-finite cells of a row-major grid from their finite neighbours: Laplace's equation
 * with zero-derivative edges, cells next to data first, then over-relaxed averaging until the
 * largest change is below 1 % of the local spread (at most 100 passes). Returns a new array; a grid
 * without any finite value stays all NaN.
 */
export function fillGaps(z: ArrayLike<number>, nx: number, ny: number): Float64Array {
  const n = nx * ny;
  const out = new Float64Array(n);
  let empties = 0;
  for (let k = 0; k < n; k++) {
    const v = z[k];
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else {
      out[k] = NaN;
      empties++;
    }
  }
  if (empties === 0 || empties === n) return out;
  const known = new Uint8Array(n);
  const original = new Uint8Array(n);
  for (let k = 0; k < n; k++) known[k] = original[k] = Number.isFinite(out[k]) ? 1 : 0;
  const order = new Int32Array(empties);
  let filled = 0;
  // Cells whose four in-grid-or-edge neighbours are all original data: exact after pass one.
  const interior = new Uint8Array(n);
  let pending: number[] = [];
  for (let k = 0; k < n; k++) if (!original[k]) pending.push(k);
  const countKnown = (idx: number, mask: Uint8Array, edgesCount: boolean): number => {
    const i = idx % nx;
    const j = (idx - i) / nx;
    const edge = edgesCount ? 1 : 0;
    return (
      (i > 0 ? mask[idx - 1]! : edge) +
      (i < nx - 1 ? mask[idx + 1]! : edge) +
      (j > 0 ? mask[idx - nx]! : edge) +
      (j < ny - 1 ? mask[idx + nx]! : edge)
    );
  };
  for (const idx of pending) if (countKnown(idx, original, true) === 4) interior[idx] = 1;
  // Visiting order: in rounds, the empty cells next to known ones, most known neighbours first.
  while (pending.length > 0) {
    const round: [number, number][] = [];
    const rest: number[] = [];
    for (const idx of pending) {
      const c = countKnown(idx, known, false);
      if (c > 0) round.push([idx, c]);
      else rest.push(idx);
    }
    if (round.length === 0) break;
    round.sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    for (const [idx] of round) {
      order[filled++] = idx;
      known[idx] = 1;
    }
    pending = rest;
  }
  pass(out, nx, ny, order, undefined);
  let relaxCount = 0;
  for (let p = 0; p < filled; p++) if (!interior[order[p]!]) relaxCount++;
  if (relaxCount === 0) return out;
  const relax = new Int32Array(relaxCount);
  for (let p = 0, r = 0; p < filled; p++) {
    const idx = order[p]!;
    if (!interior[idx]) relax[r++] = idx;
  }
  let maxFrac = 1;
  for (let it = 0; it < MAX_PASSES && maxFrac > INTERP_THRESHOLD; it++) {
    maxFrac = pass(out, nx, ny, relax, overshootFor(maxFrac));
  }
  return out;
}
