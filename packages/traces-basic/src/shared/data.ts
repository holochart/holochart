/**
 * Point counts and slicing that understand multicategory data given as two rows
 * `[[groups], [items]]` (plan E3.6): the point count is the row length, not the 2 rows.
 */
import {
  cleanNumber,
  dateToMs,
  formatDate,
  isArrayLike,
  isTwoLevel,
  type FullTrace,
  type Scale,
} from '@mk7s/holochart-core';

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

/**
 * The data value of point `i` along `letter`, for hover labels and event data: `trace[letter][i]`,
 * or for a trace without that array Plotly's implicit `letter0 + i·dletter`, stepped the way calc
 * steps it (ms on date axes, the category index on category axes) and returned as a value `scale`
 * reads back: a date string, a category name, a number. Without a scale, a numeric `letter0`
 * steps as a number and any other is returned as is.
 */
export function coordinateValue(
  trace: FullTrace,
  letter: 'x' | 'y',
  i: number,
  scale: Scale | undefined,
): unknown {
  const values = trace[letter];
  if (isArrayLike(values)) return (values as ArrayLike<unknown>)[i];
  const start = trace[`${letter}0`];
  const step = Number(trace[`d${letter}`] ?? 1);
  if (!scale) return typeof start === 'number' ? start + i * step : start;
  let v: number | string;
  switch (scale.type) {
    case 'date': {
      const ms = dateToMs(start) + i * step;
      v = formatDate(ms) ?? ms;
      break;
    }
    case 'category':
    case 'multicategory': {
      // The category index steps; out-of-range indices stay numbers.
      const l = scale.d2l(start) + i * step;
      v = Number.isFinite(l) ? scale.l2d(l) : NaN;
      break;
    }
    default:
      v = cleanNumber(start) + i * step;
  }
  return typeof v === 'string' || Number.isFinite(v) ? v : start;
}
