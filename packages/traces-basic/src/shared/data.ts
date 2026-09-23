/**
 * Point counts and slicing that understand multicategory data given as two rows
 * `[[groups], [items]]` (plan E3.6): the point count is the row length, not the 2 rows.
 */
import { isArrayLike, isTwoLevel } from '@mk7s/holochart-core';

/** Number of points in a coordinate array, or `undefined` when it isn't an array. */
export function pointCount(values: unknown): number | undefined {
  if (isTwoLevel(values)) return Math.min(values[0].length, values[1].length);
  return isArrayLike(values) ? values.length : undefined;
}

function sliceRow(values: ArrayLike<unknown>, length: number): ArrayLike<unknown> {
  if (values.length <= length) return values;
  if (ArrayBuffer.isView(values)) return (values as unknown as Float64Array).subarray(0, length);
  return Array.prototype.slice.call(values, 0, length) as unknown[];
}

/** The first `length` points of a coordinate array (each row of two-level data is cut). */
export function headPoints(values: ArrayLike<unknown>, length: number): ArrayLike<unknown> {
  if (isTwoLevel(values)) return [sliceRow(values[0], length), sliceRow(values[1], length)];
  return sliceRow(values, length);
}
