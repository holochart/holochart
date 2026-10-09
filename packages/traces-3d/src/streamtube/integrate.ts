/**
 * Streamline integration of a `streamtube` (plan E14.6), after gl-streamtube3d (`streamtube.js`)
 * as plotly.js `streamtube/convert.js` drives it. Pure (no three.js, no DOM), so it can move to a
 * worker; all coordinates are Plotly's scaled ones (each axis divided by the field's data span,
 * vectors too), in which gl-streamtube3d works.
 *
 * - **Starts** ({@link defaultStreamStarts}): `starts.{x, y, z}`, or by default the x–z plane at
 *   the grid's lowest y: every x and z node except the first and last (the middle between two
 *   nodes, the node with one).
 * - **Step** ({@link streamStepSize}): tubes are sampled every `h = 10 · |bounds| / maxLength`
 *   (`|bounds|` the diagonal of the stopping box, `maxLength` = `maxdisplayed`, default 1000), so
 *   a tube is at most ten box diagonals long. gl-streamtube3d moves each step by the vector itself
 *   (Euler, time step 1) clamped to `h` and records a sample once it is `h` away from the last one.
 *   Here each step integrates the same time step, `min(1, h / |v|)` (the same displacement on
 *   straight flow), with classical Runge–Kutta (RK4), split into substeps of at most
 *   `1 / (4 |J|)` (`J` the field's Jacobian: accurate on curved flow, stable near sinks); a step
 *   of the full length `h` is always recorded, a shorter one once the point is `h` away from the
 *   last sample.
 * - **Stopping rules** ({@link integrateStreams}): a tube stops after `maxLength` samples; when the
 *   point leaves the stopping box ({@link streamBounds}: the grid and the starts, padded by the
 *   first and last cell of each axis — the last sample may lie up to one step outside, as in
 *   Plotly); at a zero or non-finite vector; after `100 · maxLength` steps (Plotly's budget); and
 *   (Holochart) when the flow stalls, slower than `h / (100 · maxLength)` per time unit, where
 *   Plotly would spend its step budget without recording anything.
 * - **Divergence** per sample: gl-streamtube3d's `|Σⱼ ∂V/∂Xⱼ|`, the length of the sum of the
 *   field's partial derivatives (not the scalar `∇·V`), in scaled coordinates (see `grid.ts`).
 * - **Tube radius** ({@link streamTubeScale}): `tubeScale · divergence`, `tubeScale = sizeref ·
 *   0.5 · minDistance / maxDivergence` (`minDistance`: the smallest separation between distinct
 *   start coordinates on any axis, {@link minStartSeparation}), so the thickest tubes of adjacent
 *   starts touch at `sizeref: 1`; a field without divergence gets `0.05 · minDistance ·
 *   sizeref · 0.5 · minDistance` everywhere, as in gl-streamtube3d.
 */
import { sampleStreamGrid, type StreamGrid } from './grid.ts';
import type { Vec3 } from '@mk7s/holochart-render';

/** Plotly's default starts: the x–z plane at the grid's lowest y (3 floats per start). */
export function defaultStreamStarts(grid: StreamGrid): Float64Array {
  const inner = (a: Float64Array): number[] =>
    a.length > 2
      ? Array.from(a.subarray(1, a.length - 1))
      : a.length === 2
        ? [(a[0]! + a[1]!) / 2]
        : Array.from(a);
  const sx = inner(grid.xs);
  const sz = inner(grid.zs);
  const y0 = grid.ys[0] ?? 0;
  const out = new Float64Array(sx.length * sz.length * 3);
  let m = 0;
  for (const x of sx) {
    for (const z of sz) {
      out[m++] = x;
      out[m++] = y0;
      out[m++] = z;
    }
  }
  return out;
}

/**
 * The stopping box: the grid's and the starts' extent, padded by the first and last cell of each
 * axis (0.5 for a single node), as plotly.js `convert.js` (`getBoundPads`).
 */
export function streamBounds(grid: StreamGrid, starts: Float64Array): [Vec3, Vec3] {
  const lo: Vec3 = [Infinity, Infinity, Infinity];
  const hi: Vec3 = [-Infinity, -Infinity, -Infinity];
  const axes = [grid.xs, grid.ys, grid.zs];
  for (let a = 0; a < 3; a++) {
    const nodes = axes[a]!;
    const n = nodes.length;
    if (n > 0) {
      lo[a] = nodes[0]!;
      hi[a] = nodes[n - 1]!;
    }
    for (let i = a; i < starts.length; i += 3) {
      const s = starts[i]!;
      if (s < lo[a]!) lo[a] = s;
      if (s > hi[a]!) hi[a] = s;
    }
    lo[a]! -= n > 1 ? nodes[1]! - nodes[0]! : 0.5;
    hi[a]! += n > 1 ? nodes[n - 1]! - nodes[n - 2]! : 0.5;
  }
  return [lo, hi];
}

/** The sampling step `10 · |bounds| / maxLength` (gl-streamtube3d's `maxStepSize`). */
export function streamStepSize(bounds: readonly [Vec3, Vec3], maxLength: number): number {
  const [lo, hi] = bounds;
  return (10 * Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2])) / maxLength;
}

/**
 * The smallest separation of distinct start coordinates along any axis (1 for fewer than two
 * starts, or without any), gl-streamtube3d's `calculateMinPositionDistance`. Coordinates closer
 * than 1e-9 of the largest coordinate magnitude count as equal (gl-streamtube3d compares exact
 * values, so rounding noise, e.g. starts on a circle, would make every tube vanish).
 */
export function minStartSeparation(starts: Float64Array): number {
  const count = Math.floor(starts.length / 3);
  if (count < 2) return 1;
  let min = Infinity;
  for (let a = 0; a < 3; a++) {
    const values = Float64Array.from({ length: count }, (_, i) => starts[i * 3 + a]!).sort();
    let size = 0;
    for (const v of values) if (Math.abs(v) > size) size = Math.abs(v);
    const tolerance = 1e-9 * (size || 1);
    for (let i = 1; i < count; i++) {
      const d = values[i]! - values[i - 1]!;
      if (d > tolerance && d < min) min = d;
    }
  }
  return Number.isFinite(min) ? min : 1;
}

/** Integrated streamlines: samples of every tube, one after another. @experimental */
export interface StreamSet {
  /** Tube `t` holds samples `offsets[t]` to `offsets[t + 1] − 1` (one entry per start, + 1). */
  readonly offsets: Uint32Array;
  /** Sample positions (3 per sample). */
  readonly position: Float64Array;
  /** The field's vector at each sample (3 per sample). */
  readonly velocity: Float64Array;
  /** gl-streamtube3d's divergence at each sample (see the module comment). */
  readonly divergence: Float64Array;
  /** Largest finite divergence (0 without samples). */
  readonly maxDivergence: number;
  /** Integration steps taken (all tubes). */
  readonly steps: number;
}

/** Why a tube ended (for tests and diagnostics). */
export type StreamStop = 'length' | 'bounds' | 'zero' | 'budget' | 'stall';

export interface StreamOptions {
  /** Most samples per tube (`maxdisplayed`, 0 → 1000). */
  readonly maxLength: number;
  /** The stopping box (default {@link streamBounds}). */
  readonly bounds?: readonly [Vec3, Vec3];
  /** Called with each tube's stopping reason. */
  readonly onStop?: (tube: number, reason: StreamStop) => void;
}

/** Growable float64 storage. */
class Floats {
  data = new Float64Array(1024);
  length = 0;
  push3(a: number, b: number, c: number): void {
    if (this.length + 3 > this.data.length) this.#grow();
    this.data[this.length++] = a;
    this.data[this.length++] = b;
    this.data[this.length++] = c;
  }
  push(a: number): void {
    if (this.length + 1 > this.data.length) this.#grow();
    this.data[this.length++] = a;
  }
  result(): Float64Array {
    return this.data.slice(0, this.length);
  }
  #grow(): void {
    const next = new Float64Array(this.data.length * 2);
    next.set(this.data);
    this.data = next;
  }
}

/** `|Σⱼ ∂V/∂Xⱼ|` of a Jacobian `J[3·i + j]`. */
function divergenceOf(j: Float64Array): number {
  return Math.hypot(j[0]! + j[1]! + j[2]!, j[3]! + j[4]! + j[5]!, j[6]! + j[7]! + j[8]!);
}

/** Frobenius norm of a Jacobian. */
function jacobianNorm(j: Float64Array): number {
  let s = 0;
  for (let i = 0; i < 9; i++) s += j[i]! * j[i]!;
  return Math.sqrt(s);
}

/** Most RK4 substeps per step. */
const MAX_SUBSTEPS = 64;

/** One classical RK4 step of `dt` from `p` (`v` = the vector at `p`). */
function rk4(
  grid: StreamGrid,
  px: number,
  py: number,
  pz: number,
  v: Float64Array,
  dt: number,
  k2: Float64Array,
  k3: Float64Array,
  k4: Float64Array,
): [number, number, number] {
  const half = dt / 2;
  sampleStreamGrid(grid, px + half * v[0]!, py + half * v[1]!, pz + half * v[2]!, k2);
  sampleStreamGrid(grid, px + half * k2[0]!, py + half * k2[1]!, pz + half * k2[2]!, k3);
  sampleStreamGrid(grid, px + dt * k3[0]!, py + dt * k3[1]!, pz + dt * k3[2]!, k4);
  const s = dt / 6;
  return [
    px + s * (v[0]! + 2 * k2[0]! + 2 * k3[0]! + k4[0]!),
    py + s * (v[1]! + 2 * k2[1]! + 2 * k3[1]! + k4[1]!),
    pz + s * (v[2]! + 2 * k2[2]! + 2 * k3[2]! + k4[2]!),
  ];
}

/** Integrate a streamline from every start (3 floats each). See the module comment. @internal */
export function integrateStreams(
  grid: StreamGrid,
  starts: Float64Array,
  options: StreamOptions,
): StreamSet {
  const maxLength = Math.floor(options.maxLength) > 0 ? Math.floor(options.maxLength) : 1000;
  const bounds = options.bounds ?? streamBounds(grid, starts);
  const [lo, hi] = bounds;
  const h = streamStepSize(bounds, maxLength);
  const h2 = h * h;
  const stall = h / (100 * maxLength);
  const budget = maxLength * 100;
  const inBounds = (x: number, y: number, z: number): boolean =>
    x >= lo[0] && x <= hi[0] && y >= lo[1] && y <= hi[1] && z >= lo[2] && z <= hi[2];

  const count = Math.floor(starts.length / 3);
  const offsets = new Uint32Array(count + 1);
  const position = new Floats();
  const velocity = new Floats();
  const divergence = new Floats();
  let maxDivergence = 0;
  let steps = 0;
  const v = new Float64Array(3);
  const jac = new Float64Array(9);
  const k2 = new Float64Array(3);
  const k3 = new Float64Array(3);
  const k4 = new Float64Array(3);

  const record = (x: number, y: number, z: number): void => {
    sampleStreamGrid(grid, x, y, z, v, jac);
    position.push3(x, y, z);
    velocity.push3(v[0]!, v[1]!, v[2]!);
    const d = divergenceOf(jac);
    divergence.push(d);
    if (Number.isFinite(d) && d > maxDivergence) maxDivergence = d;
  };

  for (let t = 0; t < count; t++) {
    let px = starts[t * 3]!;
    let py = starts[t * 3 + 1]!;
    let pz = starts[t * 3 + 2]!;
    offsets[t] = position.length / 3;
    if (!Number.isFinite(px + py + pz)) {
      options.onStop?.(t, 'bounds');
      continue;
    }
    record(px, py, pz);
    let samples = 1;
    let [lx, ly, lz] = [px, py, pz];
    let reason: StreamStop = 'budget';
    for (let j = 0; ; j++) {
      if (j >= budget) break;
      if (samples >= maxLength) {
        reason = 'length';
        break;
      }
      if (!inBounds(px, py, pz)) {
        reason = 'bounds';
        break;
      }
      steps++;
      sampleStreamGrid(grid, px, py, pz, v, jac);
      const speed = Math.hypot(v[0]!, v[1]!, v[2]!);
      if (!(speed > 0) || !Number.isFinite(speed)) {
        reason = 'zero';
        break;
      }
      if (speed < stall) {
        reason = 'stall';
        break;
      }
      const full = speed > h;
      const dt = full ? h / speed : 1;
      // RK4 substeps keeping |J| · dt ≤ 1/4 (accurate on curved flow, stable near sinks).
      const m = Math.min(MAX_SUBSTEPS, Math.max(1, Math.ceil(4 * jacobianNorm(jac) * dt)));
      let nx = px;
      let ny = py;
      let nz = pz;
      for (let sub = 0; sub < m; sub++) {
        if (sub > 0) sampleStreamGrid(grid, nx, ny, nz, v);
        [nx, ny, nz] = rk4(grid, nx, ny, nz, v, dt / m, k2, k3, k4);
      }
      if (!Number.isFinite(nx + ny + nz)) {
        reason = 'zero';
        break;
      }
      const d2 = (nx - lx) ** 2 + (ny - ly) ** 2 + (nz - lz) ** 2;
      // gl-streamtube3d's test: `|p − last|² − h² > −1e-4 h²`.
      if (full || d2 - h2 > -1e-4 * h2) {
        record(nx, ny, nz);
        samples++;
        [lx, ly, lz] = [nx, ny, nz];
      }
      [px, py, pz] = [nx, ny, nz];
    }
    options.onStop?.(t, reason);
  }
  offsets[count] = position.length / 3;
  return {
    offsets,
    position: position.result(),
    velocity: velocity.result(),
    divergence: divergence.result(),
    maxDivergence,
    steps,
  };
}

/**
 * The tube radius per sample (scaled units): `tubeScale · divergence`, or with no divergence
 * anywhere `tubeScale · 0.05 · minDistance` (gl-streamtube3d), and `tubeScale` itself.
 */
export function streamTubeScale(
  sizeref: number,
  minDistance: number,
  maxDivergence: number,
): number {
  return (sizeref * 0.5 * minDistance) / (maxDivergence > 0 ? maxDivergence : 1);
}

/** Radii of every sample (see {@link streamTubeScale}). */
export function streamTubeRadii(
  streams: StreamSet,
  sizeref: number,
  minDistance: number,
): { radius: Float64Array; tubeScale: number } {
  const tubeScale = streamTubeScale(sizeref, minDistance, streams.maxDivergence);
  const n = streams.divergence.length;
  const radius = new Float64Array(n);
  const flat = streams.maxDivergence > 0 ? -1 : 0.05 * minDistance;
  for (let i = 0; i < n; i++) {
    const d = streams.divergence[i]!;
    radius[i] = tubeScale * (flat >= 0 ? flat : Number.isFinite(d) ? d : 0);
  }
  return { radius, tubeScale };
}
