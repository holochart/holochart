/**
 * Data-array classification and numeric conversion (plan E1.6).
 *
 * Coercion keeps data arrays by reference in whatever form the user passed (plain arrays of
 * numbers, strings or `Date`s, or any typed array). The calc stage then needs flat numeric
 * columns; these helpers produce them, reusing the input when its dtype already fits so typed
 * arrays reach the GPU upload path without a copy.
 */
import type { TypedArray } from '../schema/types.ts';
import { isDateString, isValidDate, parseDate, type CalendarSystem } from './dates.ts';

/**
 * True for the typed arrays a data array may be ({@link TypedArray}). `DataView` and the BigInt
 * arrays are excluded: charts deal in doubles.
 */
export function isTypedArray(v: unknown): v is TypedArray {
  return (
    ArrayBuffer.isView(v) &&
    !(v instanceof DataView) &&
    !(v instanceof BigInt64Array) &&
    !(v instanceof BigUint64Array)
  );
}

/**
 * What a data array holds, as reported by {@link dataArrayKind}.
 *
 * - `empty` — no elements, or only missing ones (`null`, `undefined`, `''`) among those sampled.
 * - `typed` — a {@link TypedArray}; always numeric.
 * - `number` — a plain array of numbers.
 * - `date` — `Date` instances and/or ISO date strings.
 * - `string` — strings, not all of them dates (numeric strings included).
 * - `mixed` — anything else, e.g. numbers mixed with strings, booleans or objects.
 */
export type DataArrayKind = 'empty' | 'typed' | 'number' | 'date' | 'string' | 'mixed';

/** Elements inspected by {@link dataArrayKind}; enough to classify real columns reliably. */
const SAMPLE = 1000;

/**
 * Classify a data array. Plain arrays longer than 1000 elements are sampled at an even stride
 * rather than scanned, so the answer describes the array's dominant content and a rare outlier
 * may go unseen (the calc stage turns unusable points into gaps anyway).
 *
 * @example
 * ```ts
 * dataArrayKind(new Float32Array(3));          // 'typed'
 * dataArrayKind(['2024-01-01', new Date()]);   // 'date'
 * dataArrayKind([1, 'a']);                     // 'mixed'
 * ```
 */
export function dataArrayKind(arr: ArrayLike<unknown>): DataArrayKind {
  if (isTypedArray(arr)) return 'typed';
  const n = arr.length;
  if (n === 0) return 'empty';
  const step = n > SAMPLE ? Math.floor(n / SAMPLE) : 1;
  let nums = 0;
  let dates = 0;
  let strs = 0;
  let other = 0;
  for (let i = 0; i < n; i += step) {
    const v = arr[i];
    if (v === null || v === undefined || v === '') continue;
    if (typeof v === 'number') nums++;
    else if (typeof v === 'string') {
      if (isDateString(v)) dates++;
      else strs++;
    } else if (v instanceof Date) dates++;
    else other++;
  }
  if (nums + dates + strs + other === 0) return 'empty';
  if (other > 0) return 'mixed';
  if (nums > 0) return dates + strs === 0 ? 'number' : 'mixed';
  return strs === 0 ? 'date' : 'string';
}

/** Options for {@link toFloat64Array} and {@link toFloat32Array}. */
export interface ToNumericOptions {
  /**
   * Convert `Date`s and ISO date strings to milliseconds since the epoch (for date axes).
   * Default `false`: like Plotly's linear axes, dates are then not numbers and become `NaN`.
   */
  readonly dates?: boolean;
  /** Calendar for date strings, as in {@link parseDate}. Only used with `dates: true`. */
  readonly calendar?: string | CalendarSystem;
}

// One monomorphic loop body shared by both output types. Kept free of per-element closures:
// this runs over millions of points.
function fillNumeric(
  out: Float64Array | Float32Array,
  arr: ArrayLike<unknown>,
  offset: number,
  dates: boolean,
  calendar: string | CalendarSystem | undefined,
): void {
  const n = arr.length;
  for (let i = 0; i < n; i++) {
    const v = arr[i];
    let x = NaN;
    if (typeof v === 'number') x = v;
    else if (typeof v === 'string') {
      const num = +v;
      // `+''` and `+'  '` are 0, and `'Infinity'` is not data; neither is a number here.
      if (Number.isFinite(num) && v.trim() !== '') x = num;
      else if (dates) x = parseDate(v, calendar) ?? NaN;
    } else if (typeof v === 'bigint') x = Number(v);
    else if (dates && isValidDate(v)) x = v.getTime();
    out[i] = x - offset;
  }
}

/**
 * Convert a data array to a `Float64Array`.
 *
 * A `Float64Array` input is returned as-is (zero-copy), so callers must treat the result as
 * read-only: it may be the user's own buffer. Other typed arrays are converted natively. Plain
 * arrays convert element-wise: numbers are kept verbatim (including `NaN`/`±Infinity`), numeric
 * strings are parsed, `Date`s and ISO date strings become epoch milliseconds with `dates: true`,
 * and anything else (missing values, booleans, categories) becomes `NaN`.
 *
 * @example
 * ```ts
 * const f = new Float64Array([1, 2]);
 * toFloat64Array(f) === f;                                   // true
 * toFloat64Array(['1', '2024-01-01', null], { dates: true }); // [1, 1704067200000, NaN]
 * ```
 */
export function toFloat64Array(arr: ArrayLike<unknown>, opts: ToNumericOptions = {}): Float64Array {
  if (arr instanceof Float64Array) return arr;
  // Typed arrays convert natively in the constructor (BigInt arrays would throw there, so they take
  // the element-wise path).
  if (isTypedArray(arr)) return new Float64Array(arr);
  const out = new Float64Array(arr.length);
  fillNumeric(out, arr, 0, opts.dates === true, opts.calendar);
  return out;
}

/** Options for {@link toFloat32Array}. */
export interface ToFloat32Options extends ToNumericOptions {
  /**
   * Subtracted from every value in double precision before narrowing to float32
   * (relative-to-center encoding, plan §4.3 / E16.4). Without it, epoch-millisecond dates lose
   * about two minutes of precision in float32. Default 0.
   */
  readonly origin?: number;
}

/**
 * Convert a data array to a `Float32Array` for GPU upload, with the same element rules as
 * {@link toFloat64Array}.
 *
 * A `Float32Array` input is returned as-is (zero-copy, treat it as read-only) unless a non-zero
 * `origin` must be subtracted. Other inputs are always copied.
 */
export function toFloat32Array(arr: ArrayLike<unknown>, opts: ToFloat32Options = {}): Float32Array {
  const origin = opts.origin ?? 0;
  if (origin === 0) {
    if (arr instanceof Float32Array) return arr;
    if (isTypedArray(arr)) return new Float32Array(arr);
  }
  const out = new Float32Array(arr.length);
  if (isTypedArray(arr)) {
    for (let i = 0; i < arr.length; i++) out[i] = (arr[i] as number) - origin;
  } else {
    fillNumeric(out, arr, origin, opts.dates === true, opts.calendar);
  }
  return out;
}
