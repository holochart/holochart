/**
 * Gap filling before contouring (Plotly `heatmap/find_empties.js` + `heatmap/interp2d.js`). Pure.
 *
 * Empty (non-finite) cells get the solution of Laplace's equation with zero-derivative edges: a
 * first pass fills each empty cell with the average of its defined neighbours, visiting the cells
 * with the most original neighbours first (cells deep inside a gap come after the cells around
 * them), then over-relaxed averaging passes run until the largest change is below 1% of the local
 * neighbour spread (at most 100 passes). Cells whose four neighbours all hold data are exact after
 * the first pass and are not iterated.
 */

const INTERP_THRESHOLD = 1e-2;
const MAX_PASSES = 100;

/** Plotly's `correctionOvershoot`: little overshoot until the iteration converges. */
function overshootFor(maxFractionalChange: number): number {
  return 0.5 - 0.25 * Math.min(1, maxFractionalChange * 0.5);
}

/**
 * One averaging pass over `order` (Plotly's `iterateInterp2d`); `overshoot` undefined is the first
 * pass. Returns the largest change relative to the neighbour spread.
 */
function pass(
  z: Float64Array,
  nx: number,
  ny: number,
  order: Int32Array,
  overshoot: number | undefined,
): number {
  let maxFrac = 0;
  for (let p = 0; p < order.length; p++) {
    const idx = order[p] as number;
    const i = idx % nx;
    const j = (idx - i) / nx;
    const initial = z[idx] as number;
    let sum = 0;
    let count = 0;
    let lo = Infinity;
    let hi = -Infinity;
    // Plotly's neighbour order: row below, row above, column left, column right.
    for (let q = 0; q < 4; q++) {
      const ni = q < 2 ? i : q === 2 ? i - 1 : i + 1;
      const nj = q === 0 ? j - 1 : q === 1 ? j + 1 : j;
      if (ni < 0 || nj < 0 || ni >= nx || nj >= ny) continue;
      const v = z[nj * nx + ni] as number;
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
 * Fill the non-finite cells of a row-major grid (`z[j·nx + i]`) from their finite neighbours.
 * Returns a new array; the input is not modified. A grid without any finite value is returned
 * unchanged (all NaN).
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

  // Visiting order: in rounds, every empty cell next to a known one (original data or filled in an
  // earlier round), most known neighbours first. Each round's cells become known for the next.
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
    let c = 0;
    c += i > 0 ? (mask[idx - 1] as number) : edgesCount ? 1 : 0;
    c += i < nx - 1 ? (mask[idx + 1] as number) : edgesCount ? 1 : 0;
    c += j > 0 ? (mask[idx - nx] as number) : edgesCount ? 1 : 0;
    c += j < ny - 1 ? (mask[idx + nx] as number) : edgesCount ? 1 : 0;
    return c;
  };
  for (const idx of pending) if (countKnown(idx, original, true) === 4) interior[idx] = 1;
  while (pending.length > 0) {
    const round: [number, number][] = [];
    const rest: number[] = [];
    for (const idx of pending) {
      const c = countKnown(idx, known, false);
      if (c > 0) round.push([idx, c]);
      else rest.push(idx);
    }
    if (round.length === 0) break; // unreachable: some finite value exists
    round.sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    for (const [idx] of round) {
      order[filled++] = idx;
      known[idx] = 1;
    }
    pending = rest;
  }

  pass(out, nx, ny, order, undefined);
  let relaxCount = 0;
  for (let p = 0; p < filled; p++) if (!interior[order[p] as number]) relaxCount++;
  if (relaxCount === 0) return out;
  const relax = new Int32Array(relaxCount);
  for (let p = 0, r = 0; p < filled; p++) {
    const idx = order[p] as number;
    if (!interior[idx]) relax[r++] = idx;
  }
  let maxFrac = 1;
  for (let it = 0; it < MAX_PASSES && maxFrac > INTERP_THRESHOLD; it++) {
    maxFrac = pass(out, nx, ny, relax, overshootFor(maxFrac));
  }
  return out;
}
