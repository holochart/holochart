/**
 * Typed arrays as JSON, in Plotly's encoding (plan E18.3): `{ dtype, bdata, shape? }`, where
 * `bdata` is the base64 of the raw little-endian element bytes. This is what plotly.py emits and
 * what plotly.js (`Lib.decodeTypedArraySpec`) reads, so encoded figures move between the two.
 *
 * Pure: no `Buffer`, no DOM. Base64 is hand-written so the output is identical on every host.
 */
import type { TypedArray } from '../schema/types.ts';
import { isPlainObject } from '../util/objects.ts';

/** A typed array constructor ({@link TypedArray}). */
export type TypedArrayConstructor =
  | Float32ArrayConstructor
  | Float64ArrayConstructor
  | Int8ArrayConstructor
  | Int16ArrayConstructor
  | Int32ArrayConstructor
  | Uint8ArrayConstructor
  | Uint8ClampedArrayConstructor
  | Uint16ArrayConstructor
  | Uint32ArrayConstructor;

/** The dtypes {@link encodeTypedArray} writes; the same set plotly.js reads. */
export type Dtype = 'f8' | 'f4' | 'i4' | 'u4' | 'i2' | 'u2' | 'i1' | 'u1' | 'u1c';

/**
 * A typed array encoded for JSON.
 *
 * - `dtype` — element type (see {@link Dtype}). On decode, plotly's long names (`'float64'`,
 *   `'uint8c'`, …) and numpy's byte-order prefixes (`'<f8'`, `'|u1'`, `'=i4'`, and big-endian
 *   `'>f8'`) are accepted too.
 * - `bdata` — base64 of the element bytes, little-endian unless the dtype says `'>'`. Decoding also
 *   accepts an `ArrayBuffer`, as plotly.js does.
 * - `shape` — for 2D/3D data, the dimensions outermost first as a comma-separated string
 *   (`'rows,cols'`), which is the form plotly.js checks for. Decoding also accepts a number or an
 *   array of numbers. Absent for 1D data.
 */
export interface TypedArraySpec {
  dtype: string;
  bdata: string | ArrayBuffer;
  shape?: string | number | readonly number[];
}

/** What {@link encodeTypedArray} produces: a {@link TypedArraySpec} with a base64 string. */
export interface EncodedTypedArray {
  dtype: Dtype;
  bdata: string;
  shape?: string;
}

/** A decoded 2D or 3D spec: rows of typed arrays (views of one buffer), as plotly.js returns. */
export type DecodedArray = TypedArray | TypedArray[] | TypedArray[][];

const DTYPES: Readonly<Record<string, TypedArrayConstructor>> = {
  f8: Float64Array,
  f4: Float32Array,
  i4: Int32Array,
  u4: Uint32Array,
  i2: Int16Array,
  u2: Uint16Array,
  i1: Int8Array,
  u1: Uint8Array,
  u1c: Uint8ClampedArray,
  // plotly.js aliases
  float64: Float64Array,
  float32: Float32Array,
  int32: Int32Array,
  uint32: Uint32Array,
  int16: Int16Array,
  uint16: Uint16Array,
  int8: Int8Array,
  uint8: Uint8Array,
  uint8c: Uint8ClampedArray,
};

/** Parsed dtype: the constructor and whether the bytes are big-endian. */
interface ParsedDtype {
  readonly ctor: TypedArrayConstructor;
  readonly bigEndian: boolean;
}

function parseDtype(dtype: string): ParsedDtype | undefined {
  const c = dtype.charAt(0);
  const prefixed = c === '<' || c === '>' || c === '|' || c === '=';
  const name = prefixed ? dtype.slice(1) : dtype;
  const ctor = Object.hasOwn(DTYPES, name) ? DTYPES[name] : undefined;
  // numpy's '=' means "native order of the writer"; every numpy host that matters is x86/ARM.
  return ctor === undefined ? undefined : { ctor, bigEndian: c === '>' };
}

/** The {@link Dtype} for a typed array. `Uint8ClampedArray` is `'u1c'` (plotly.js reads it). */
export function dtypeOf(arr: TypedArray): Dtype {
  if (arr instanceof Float64Array) return 'f8';
  if (arr instanceof Float32Array) return 'f4';
  if (arr instanceof Int32Array) return 'i4';
  if (arr instanceof Uint32Array) return 'u4';
  if (arr instanceof Int16Array) return 'i2';
  if (arr instanceof Uint16Array) return 'u2';
  if (arr instanceof Int8Array) return 'i1';
  if (arr instanceof Uint8ClampedArray) return 'u1c';
  return 'u1';
}

/**
 * True for an object shaped like a {@link TypedArraySpec} with a known dtype: a plain object with a
 * string `dtype`, a string or `ArrayBuffer` `bdata`, and an optional string/number/array `shape`.
 * Specs with dtypes neither Holochart nor plotly.js knows (e.g. numpy's `'i8'`) are not specs.
 */
export function isTypedArraySpec(v: unknown): v is TypedArraySpec {
  if (!isPlainObject(v)) return false;
  const { dtype, bdata, shape } = v;
  return (
    typeof dtype === 'string' &&
    parseDtype(dtype) !== undefined &&
    (typeof bdata === 'string' || bdata instanceof ArrayBuffer) &&
    (shape === undefined ||
      typeof shape === 'string' ||
      typeof shape === 'number' ||
      (Array.isArray(shape) && shape.every((n) => typeof n === 'number')))
  );
}

// ---------------------------------------------------------------------------------------------
// Byte order
// ---------------------------------------------------------------------------------------------

/** True on little-endian hosts (all mainstream ones). */
export const HOST_LITTLE_ENDIAN = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;

/** Reverse the bytes of every `size`-byte element, in place. */
function swapBytes(bytes: Uint8Array, size: number): void {
  if (size === 1) return;
  for (let i = 0; i + size <= bytes.length; i += size) {
    for (let a = i, b = i + size - 1; a < b; a++, b--) {
      const t = bytes[a] as number;
      bytes[a] = bytes[b] as number;
      bytes[b] = t;
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Base64
// ---------------------------------------------------------------------------------------------

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LOOKUP = new Int16Array(128).fill(-1);
for (let i = 0; i < ALPHABET.length; i++) LOOKUP[ALPHABET.charCodeAt(i)] = i;
// URL-safe spellings decode too; some producers emit them.
LOOKUP[45] = 62; // '-'
LOOKUP[95] = 63; // '_'

/** Standard base64 (RFC 4648, with padding) of `bytes`. */
export function bytesToBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  let out = '';
  const n = bytes.length;
  let i = 0;
  for (; i + 2 < n; i += 3) {
    const v =
      ((bytes[i] as number) << 16) | ((bytes[i + 1] as number) << 8) | (bytes[i + 2] as number);
    out +=
      ALPHABET[v >> 18] +
      (ALPHABET[(v >> 12) & 63] as string) +
      (ALPHABET[(v >> 6) & 63] as string) +
      (ALPHABET[v & 63] as string);
    // Flush periodically: one huge concatenated string is slower to build than a join.
    if (out.length >= 8192) {
      chunks.push(out);
      out = '';
    }
  }
  const rest = n - i;
  if (rest === 1) {
    const v = (bytes[i] as number) << 16;
    out += `${ALPHABET[v >> 18] as string}${ALPHABET[(v >> 12) & 63] as string}==`;
  } else if (rest === 2) {
    const v = ((bytes[i] as number) << 16) | ((bytes[i + 1] as number) << 8);
    out += `${ALPHABET[v >> 18] as string}${ALPHABET[(v >> 12) & 63] as string}${ALPHABET[(v >> 6) & 63] as string}=`;
  }
  chunks.push(out);
  return chunks.join('');
}

/**
 * Decode base64 (standard or URL-safe, padding optional, ASCII whitespace ignored) into a fresh,
 * zero-offset buffer. Throws on any other character or an impossible length.
 */
export function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const clean = b64.replace(/[\t\n\f\r ]+/g, '').replace(/={1,2}$/, '');
  if (clean.length % 4 === 1) throw new Error('invalid base64: bad length');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let acc = 0;
  let bits = 0;
  let o = 0;
  for (let i = 0; i < clean.length; i++) {
    const code = clean.charCodeAt(i);
    const v = code < 128 ? (LOOKUP[code] as number) : -1;
    if (v < 0) throw new Error(`invalid base64: unexpected character at ${i}`);
    acc = ((acc << 6) | v) & 0xffffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (acc >> bits) & 0xff;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Encode / decode
// ---------------------------------------------------------------------------------------------

/** Little-endian bytes of a view, copied so the view's `byteOffset` and host order never leak. */
export function littleEndianBytes(
  arr: TypedArray,
  hostLittleEndian = HOST_LITTLE_ENDIAN,
): Uint8Array {
  const bytes = new Uint8Array(arr.byteLength);
  bytes.set(new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength));
  if (!hostLittleEndian) swapBytes(bytes, arr.BYTES_PER_ELEMENT);
  return bytes;
}

/**
 * Encode a typed array (only the view's own elements, whatever its `byteOffset`) as
 * `{ dtype, bdata }`. Bits are preserved exactly, so NaN, -0 and ±Infinity survive.
 *
 * @example
 * ```ts
 * encodeTypedArray(Float64Array.of(1, 2)); // { dtype: 'f8', bdata: 'AAAAAAAA8D8AAAAAAAAAQA==' }
 * ```
 */
export function encodeTypedArray(arr: TypedArray): EncodedTypedArray {
  return { dtype: dtypeOf(arr), bdata: bytesToBase64(littleEndianBytes(arr)) };
}

/**
 * Encode equal-length rows of one typed array type as a single 2D spec with `shape: 'rows,cols'`
 * (row-major). Returns `undefined` when the rows are empty, ragged or of mixed types; callers then
 * encode each row on its own.
 */
export function encodeTypedMatrix(rows: readonly unknown[]): EncodedTypedArray | undefined {
  const first = rows[0];
  if (first === undefined || !isEncodableTyped(first)) return undefined;
  const ctor = first.constructor;
  const cols = first.length;
  for (const r of rows) {
    if (!isEncodableTyped(r) || r.constructor !== ctor || r.length !== cols) return undefined;
  }
  const rowBytes = first.byteLength;
  const bytes = new Uint8Array(rowBytes * rows.length);
  rows.forEach((r, i) => bytes.set(littleEndianBytes(r as TypedArray), i * rowBytes));
  return { dtype: dtypeOf(first), bdata: bytesToBase64(bytes), shape: `${rows.length},${cols}` };
}

function isEncodableTyped(v: unknown): v is TypedArray {
  return (
    ArrayBuffer.isView(v) &&
    !(v instanceof DataView) &&
    !(v instanceof BigInt64Array) &&
    !(v instanceof BigUint64Array)
  );
}

function parseShape(shape: TypedArraySpec['shape']): number[] | undefined {
  if (shape === undefined) return undefined;
  const parts =
    typeof shape === 'number' ? [shape] : typeof shape === 'string' ? shape.split(',') : shape;
  return parts.map((p) => {
    const n = typeof p === 'number' ? p : p.trim() === '' ? NaN : Number(p);
    if (!Number.isInteger(n) || n < 0)
      throw new Error(`invalid typed array shape '${String(shape)}'`);
    return n;
  });
}

/**
 * Decode a {@link TypedArraySpec}. 1D specs give one typed array; `shape: 'rows,cols'` gives an
 * array of `rows` typed arrays (row-major views of one buffer, as plotly.js returns), and a 3D
 * shape an array of such arrays. Throws on an unknown dtype, invalid base64, a byte length that is
 * not a whole number of elements, or a shape that does not match the data.
 *
 * @example
 * ```ts
 * decodeTypedArray({ dtype: 'f8', bdata: 'AAAAAAAA8D8AAAAAAAAAQA==' }); // Float64Array [1, 2]
 * decodeTypedArray({ dtype: '<i1', bdata: '/w==' });                  // Int8Array [-1]
 * ```
 */
export function decodeTypedArray(
  spec: TypedArraySpec,
  hostLittleEndian = HOST_LITTLE_ENDIAN,
): DecodedArray {
  const parsed = parseDtype(spec.dtype);
  if (parsed === undefined) throw new Error(`unknown typed array dtype '${spec.dtype}'`);
  const { ctor, bigEndian } = parsed;
  const size = ctor.BYTES_PER_ELEMENT;
  // Always copy: the decoded array must not alias the input (and an ArrayBuffer input may be
  // shared by the caller).
  const bytes: Uint8Array<ArrayBuffer> =
    typeof spec.bdata === 'string'
      ? base64ToBytes(spec.bdata)
      : new Uint8Array(spec.bdata.slice(0));
  if (bytes.length % size !== 0) {
    throw new Error(
      `typed array bdata is ${bytes.length} bytes, not a multiple of ${size} for dtype '${spec.dtype}'`,
    );
  }
  if (bigEndian === hostLittleEndian) swapBytes(bytes, size);
  const count = bytes.length / size;
  const shape = parseShape(spec.shape) ?? [count];
  if (shape.reduce((a, b) => a * b, 1) !== count) {
    throw new Error(`typed array shape '${String(spec.shape)}' does not match ${count} elements`);
  }
  const buffer = bytes.buffer;
  if (shape.length === 1) return new ctor(buffer);
  const [outer = 0, mid = 0, inner = 0] = shape;
  const rows = (n: number, len: number, start: number): TypedArray[] =>
    Array.from({ length: n }, (_, i) => new ctor(buffer, (start + i * len) * size, len));
  if (shape.length === 2) return rows(outer, mid, 0);
  if (shape.length === 3) {
    return Array.from({ length: outer }, (_, k) => rows(mid, inner, k * mid * inner));
  }
  throw new Error(`typed array shape '${String(spec.shape)}' has more than 3 dimensions`);
}
