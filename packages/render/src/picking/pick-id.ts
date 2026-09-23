/**
 * Pick id encoding and id-range layout for GPU picking (ADR-010).
 *
 * The GPU picker renders into an RGBA8 target and reads bytes back, so a pick id is a 32-bit
 * unsigned integer spread over the four channels (R = most significant byte). The stored value is
 * `id + 1`, so the cleared background (all zero) decodes as "no hit".
 */

/** Largest encodable pick id: 32 bits, minus the reserved background value 0. */
export const MAX_PICK_ID = 0xfffffffe;

/**
 * Bias added to each byte before normalizing. GLES 3.0 §2.1.6.1 lets a float → unorm8 conversion
 * return either of the two nearest integers (round-to-nearest is only "preferred"), so `k / 255`
 * can come back as `k - 1` on a truncating implementation. `(k + 0.25) / 255` converts to `k` under
 * both rounding and truncation. {@link PICK_ENCODE_GLSL} applies the same bias.
 */
const BYTE_BIAS = 0.25;

function encodeByte(k: number): number {
  return Math.min(1, (k + BYTE_BIAS) / 255);
}

/**
 * Encode a pick id as normalized RGBA floats (0–1), e.g. for a custom pick material's color
 * uniform. Output order is R, G, B, A with R the most significant byte of `id + 1`.
 *
 * @throws RangeError if `id` is not an integer in `[0, MAX_PICK_ID]`.
 */
export function encodePickId(id: number): Float32Array;
export function encodePickId<T extends Float32Array | number[]>(
  id: number,
  out: T,
  offset?: number,
): T;
export function encodePickId(
  id: number,
  out: Float32Array | number[] = new Float32Array(4),
  offset = 0,
): Float32Array | number[] {
  if (!Number.isInteger(id) || id < 0 || id > MAX_PICK_ID) {
    throw new RangeError(`pick id out of range [0, ${MAX_PICK_ID}]: ${id}`);
  }
  const v = id + 1;
  out[offset] = encodeByte(Math.floor(v / 0x1000000) & 0xff);
  out[offset + 1] = encodeByte((v >>> 16) & 0xff);
  out[offset + 2] = encodeByte((v >>> 8) & 0xff);
  out[offset + 3] = encodeByte(v & 0xff);
  return out;
}

/** Decode a pick id from read-back RGBA bytes (0–255). Returns -1 for the background (all zero). */
export function decodePickId(r: number, g: number, b: number, a: number): number {
  return ((((r & 0xff) << 24) | ((g & 0xff) << 16) | ((b & 0xff) << 8) | (a & 0xff)) >>> 0) - 1;
}

/** One contiguous id range: ids `[base, base + size)` belong to `entry`, element = `id - base`. */
export interface PickIdRange<T> {
  base: number;
  size: number;
  /** Null only in an unfilled scratch range. */
  entry: T | null;
}

/**
 * Contiguous id-range layout, rebuilt for every pick: each pickable draw gets `size` ids starting
 * right after the previous one (instanced markers need one per instance, meshes one per vertex /
 * triangle / instance, or one for the whole object). Rebuilding per pick keeps the id space
 * compact with no bookkeeping when counts change, and costs O(pickables). Ranges are stored in
 * reused arrays, so the steady state does not allocate.
 */
export class PickIdLayout<T> {
  readonly #bases: number[] = [];
  readonly #sizes: number[] = [];
  readonly #entries: (T | null)[] = [];
  #count = 0;
  #next = 0;

  /** Number of ranges. */
  get count(): number {
    return this.#count;
  }

  /** Total ids allocated. */
  get total(): number {
    return this.#next;
  }

  /** Forget all ranges (keeps capacity). */
  reset(): void {
    // Drop references so entries of removed pickables can be collected.
    for (let i = 0; i < this.#count; i++) this.#entries[i] = null;
    this.#count = 0;
    this.#next = 0;
  }

  /**
   * Append a range of `size` ids for `entry` and return its base id.
   *
   * @throws RangeError when the id space (2³² − 1 ids) is exhausted.
   */
  allocate(entry: T, size: number): number {
    const n = Math.max(0, Math.floor(size));
    const base = this.#next;
    if (base + n - 1 > MAX_PICK_ID) {
      throw new RangeError(`pick id space exhausted (${base} + ${n} > ${MAX_PICK_ID + 1})`);
    }
    const i = this.#count++;
    this.#bases[i] = base;
    this.#sizes[i] = n;
    this.#entries[i] = entry;
    this.#next = base + n;
    return base;
  }

  /**
   * Find the range containing `id` (binary search; bases are ascending). Writes it into `out` and
   * returns true, or returns false when no range contains `id`.
   */
  lookup(id: number, out: PickIdRange<T>): boolean {
    if (!(id >= 0) || id >= this.#next) return false;
    let lo = 0;
    let hi = this.#count - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.#bases[mid]! <= id) lo = mid;
      else hi = mid - 1;
    }
    // The search lands on the LAST range with base <= id, so a zero-sized range (which shares
    // its base with the next one) is never chosen over the range that actually holds `id`.
    const base = this.#bases[lo]!;
    const size = this.#sizes[lo]!;
    if (id < base || id >= base + size) return false;
    out.base = base;
    out.size = size;
    out.entry = this.#entries[lo]!;
    return true;
  }
}
