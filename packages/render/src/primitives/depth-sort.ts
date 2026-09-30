/**
 * Back-to-front ordering of translucent 3D points (plan E14.2: `Markers3D` and `SphereSet` with
 * `depthSort`), part of the lazily loaded 3D chunk. No WebGL: the sort is pure and unit-tested.
 *
 * Points are sorted by view-space depth, which is an affine function of the data coordinates for a
 * given camera and transform: `depth = kx·x + ky·y + kz·z + k0` ({@link viewDepthCoefficients}).
 * Keys are computed in float64, stored as float32 and sorted with a two-pass 16-bit LSD radix sort
 * (O(n), stable, ~10 ms for 1M points), so re-sorting while the camera orbits stays affordable.
 * {@link DepthSorter} watches the camera from `onBeforeRender` and re-sorts through a leading +
 * trailing throttle when the view changes.
 */
import { Matrix4, type Camera, type Object3D } from 'three';
import type { DataTransform } from '../types.ts';
import { createThrottle, type ThrottleClock } from './line-buffers.ts';

/** `depth = k[0]·x + k[1]·y + k[2]·z + k[3]` (view-space z; larger is nearer the camera). */
export type DepthCoefficients = [number, number, number, number];

/**
 * View-space z of a data point as an affine function of its coordinates: row 2 of the model-view
 * matrix (column-major `modelView`, three.js `Matrix4.elements`) composed with the data → world
 * transform.
 */
export function viewDepthCoefficients(
  modelView: ArrayLike<number>,
  transform: Readonly<DataTransform>,
  out: DepthCoefficients = [0, 0, 0, 0],
): DepthCoefficients {
  const m0 = modelView[2]!;
  const m1 = modelView[6]!;
  const m2 = modelView[10]!;
  const m3 = modelView[14]!;
  const sz = transform.scaleZ ?? 1;
  const oz = transform.offsetZ ?? 0;
  out[0] = m0 * transform.scaleX;
  out[1] = m1 * transform.scaleY;
  out[2] = m2 * sz;
  out[3] = m0 * transform.offsetX + m1 * transform.offsetY + m2 * oz + m3;
  return out;
}

/** Scratch buffers of {@link depthOrder}, reused between sorts. */
export interface DepthSortScratch {
  keys: Uint32Array;
  tmpKeys: Uint32Array;
  tmpOrder: Uint32Array;
  counts: Uint32Array;
}

/** Allocate (or grow) scratch space for sorting `count` points. */
export function depthSortScratch(count: number, prev?: DepthSortScratch): DepthSortScratch {
  if (prev && prev.keys.length >= count) return prev;
  return {
    keys: new Uint32Array(count),
    tmpKeys: new Uint32Array(count),
    tmpOrder: new Uint32Array(count),
    counts: prev?.counts ?? new Uint32Array(65536),
  };
}

const f32 = new Float32Array(1);
const u32 = new Uint32Array(f32.buffer);

/** Unsigned key whose integer order is the float order (NaN sorts first). */
export function floatSortKey(value: number): number {
  if (value !== value) return 0;
  f32[0] = value;
  const bits = u32[0]!;
  return (bits & 0x80000000 ? ~bits : bits | 0x80000000) >>> 0;
}

/**
 * Write into `order[0..count)` the point indices sorted **back to front** (farthest first: ascending
 * view depth, see {@link viewDepthCoefficients}). Points with a non-finite coordinate go first
 * (they are not drawn). Stable: equal depths keep their data order.
 */
export function depthOrder(
  x: ArrayLike<number>,
  y: ArrayLike<number>,
  z: ArrayLike<number> | null,
  count: number,
  k: Readonly<DepthCoefficients>,
  order: Uint32Array,
  scratch: DepthSortScratch = depthSortScratch(count),
): Uint32Array {
  const { keys, tmpKeys, tmpOrder, counts } = scratch;
  for (let i = 0; i < count; i++) {
    const d = k[0] * x[i]! + k[1] * y[i]! + k[2] * (z ? z[i]! : 0) + k[3];
    keys[i] = Number.isFinite(d) ? floatSortKey(d) : 0;
    order[i] = i;
  }
  radixPass(keys, order, tmpKeys, tmpOrder, count, 0, counts);
  radixPass(tmpKeys, tmpOrder, keys, order, count, 16, counts);
  return order;
}

/** One stable counting-sort pass over 16 bits of the keys, `src` → `dst`. */
function radixPass(
  srcKeys: Uint32Array,
  srcOrder: Uint32Array,
  dstKeys: Uint32Array,
  dstOrder: Uint32Array,
  count: number,
  shift: number,
  counts: Uint32Array,
): void {
  counts.fill(0);
  for (let i = 0; i < count; i++) counts[(srcKeys[i]! >>> shift) & 0xffff]!++;
  let sum = 0;
  for (let b = 0; b < 65536; b++) {
    const c = counts[b]!;
    counts[b] = sum;
    sum += c;
  }
  for (let i = 0; i < count; i++) {
    const key = srcKeys[i]!;
    const at = counts[(key >>> shift) & 0xffff]!++;
    dstKeys[at] = key;
    dstOrder[at] = srcOrder[i]!;
  }
}

/**
 * Keeps a back-to-front order for one primitive: {@link observe} (from `onBeforeRender`) notices
 * view changes and calls `resort` through a throttle (default 100 ms: the first change at once,
 * then at most every interval, and always once after the camera stops); the primitive then calls
 * {@link sort} with its data and rewrites its instances in that order.
 */
export class DepthSorter {
  /** Depth coefficients of the last observed view (NaN before the first frame). */
  readonly coefficients: DepthCoefficients = [NaN, NaN, NaN, NaN];
  #order = new Uint32Array(0);
  #scratch: DepthSortScratch | undefined;
  readonly #throttle: ReturnType<typeof createThrottle>;
  readonly #matrix = new Matrix4();
  readonly #next: DepthCoefficients = [0, 0, 0, 0];

  constructor(resort: () => void, intervalMs = 100, clock?: ThrottleClock) {
    this.#throttle = createThrottle(resort, intervalMs, clock);
  }

  /** Note the view `camera` draws `object` with; requests a re-sort when the order may change. */
  observe(camera: Camera, object: Object3D, transform: Readonly<DataTransform>): void {
    const mv = this.#matrix.multiplyMatrices(camera.matrixWorldInverse, object.matrixWorld);
    const k = viewDepthCoefficients(mv.elements, transform, this.#next);
    const prev = this.coefficients;
    let changed = false;
    for (let i = 0; i < 4; i++) {
      if (!(Math.abs(prev[i]! - k[i]!) <= 1e-9 * Math.max(1, Math.abs(k[i]!)))) changed = true;
      prev[i] = k[i]!;
    }
    if (changed) this.#throttle.request();
  }

  /**
   * The back-to-front order of the points for the last observed view (data order before the first
   * observed frame). The returned array is reused by the next call.
   */
  sort(
    x: ArrayLike<number>,
    y: ArrayLike<number>,
    z: ArrayLike<number> | null,
    count: number,
  ): Uint32Array {
    if (this.#order.length < count) this.#order = new Uint32Array(count);
    const order = this.#order.subarray(0, count);
    if (Number.isNaN(this.coefficients[0])) {
      for (let i = 0; i < count; i++) order[i] = i;
      return order;
    }
    this.#scratch = depthSortScratch(count, this.#scratch);
    return depthOrder(x, y, z, count, this.coefficients, order, this.#scratch);
  }

  /** Stop pending re-sorts. */
  cancel(): void {
    this.#throttle.cancel();
  }
}
