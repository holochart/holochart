/**
 * Reading trace attributes per point (plan E6.1, E5.7), for hover labels, event points and
 * keyboard navigation. Apart from `settings.ts`, whose layout schema must stay in the runtime's
 * entry chunk.
 */
import { getIn, type FullTrace } from '@mk7s/holochart-core';

/**
 * A trace attribute from the defaulted trace, falling back to the input trace when the trace's
 * schema does not declare it (yet).
 */
export function traceAttr(fullTrace: FullTrace, input: unknown, path: string): unknown {
  const v = getIn(fullTrace, path);
  if (v !== undefined) return v;
  return input !== null && typeof input === 'object' ? getIn(input, path) : undefined;
}

function isArrayValue(value: unknown): value is ArrayLike<unknown> {
  return Array.isArray(value) || (ArrayBuffer.isView(value) && !(value instanceof DataView));
}

/**
 * Per-point value of a possibly array-valued (`arrayOk`) attribute. With `cell` (`[row, column]`
 * of a grid cell, see `HoverPoint.cell`) arrays are 2D and read at `value[row][column]`; a row
 * that is not an array gives `undefined` (Plotly reads `text[row][column]` only for 2D `text`).
 */
export function perPoint(value: unknown, index: number, cell?: readonly [number, number]): unknown {
  if (!isArrayValue(value)) return value;
  if (!cell) return value[index];
  const row = value[cell[0]];
  return isArrayValue(row) ? row[cell[1]] : undefined;
}
