/**
 * The points style functions (E8.6) are called with, shared by the chart runtime and `chartToJSON`
 * (`encodeFigure`), so a function gives the same values when drawn and when saved.
 */
import { isArrayLike } from '../coerce/coerce.ts';
import type { ObjectNode } from '../schema/types.ts';
import { isAttr } from '../schema/walk.ts';
import type { StylePoint } from './types.ts';

/** Per-point view of a trace's data arrays. */
export interface PointSource {
  /** The point count. */
  readonly length: number;
  /** The {@link StylePoint} of point `i` (a new object on every call). */
  point(i: number): StylePoint;
}

/**
 * Per-point access to a trace's top-level arrays: every `data_array` attribute (`x`, `y`,
 * `customdata`, …) and every per-point (`arrayOk`) attribute given as an array (`text`,
 * `hovertext`, …). Pass the trace with `'@column'` references resolved. The point count is
 * `length` when given, else the shorter of `x` and `y` when either is present (what gets drawn),
 * else the length of the first data array; `null` when there is no count.
 */
export function pointSource(
  trace: Readonly<Record<string, unknown>>,
  schema: ObjectNode,
  length?: number,
): PointSource | null {
  const columns: [string, ArrayLike<unknown>][] = [];
  const data: number[] = [];
  const xy: number[] = [];
  for (const [key, node] of Object.entries(schema.children)) {
    const v = trace[key];
    if (!isAttr(node) || !isArrayLike(v) || typeof v === 'string') continue;
    if (node.valType === 'data_array') {
      data.push(v.length);
      if (key === 'x' || key === 'y') xy.push(v.length);
    } else if (node.arrayOk !== true) continue;
    columns.push([key, v]);
  }
  const n = length ?? (xy.length > 0 ? Math.min(...xy) : data[0]);
  if (n === undefined) return null;
  return {
    length: n,
    point(i) {
      const p: Record<string, unknown> = { pointNumber: i };
      for (const [k, c] of columns) p[k] = c[i];
      return p as StylePoint;
    },
  };
}
