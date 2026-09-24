/** `table` supply-defaults (plan E9.13), following plotly.js' `traces/table/defaults.js`. */
import { isArrayLike, type FullTrace, type TraceDefaultsContext } from '@mk7s/holochart-core';

/** Number of columns of a `values` attribute: its length, 0 when it is not an array. */
export function columnCount(values: unknown): number {
  return isArrayLike(values) ? values.length : 0;
}

/**
 * Normalize `columnorder` to display ranks: a permutation of `0 … count − 1` where entry `i` is the
 * position data column `i` is drawn at. Entries are sort keys, as in Plotly (`[10, 5]` draws column
 * 1 first); missing or non-numeric entries keep the column's own index as its key, and ties keep
 * data order. Plotly keeps the raw input (and misplaces columns it doesn't cover); ranks are the
 * same order, spelled out for every column.
 */
export function normalizeColumnOrder(order: unknown, count: number): number[] {
  const keys: number[] = [];
  for (let i = 0; i < count; i++) {
    const v = isArrayLike(order) && i < order.length ? order[i] : undefined;
    const n =
      typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
    keys.push(Number.isFinite(n) ? n : i);
  }
  const byKey = keys.map((_, i) => i).sort((a, b) => keys[a]! - keys[b]! || a - b);
  const ranks = new Array<number>(count);
  byKey.forEach((column, rank) => (ranks[column] = rank));
  return ranks;
}

/** Coerce one `header` / `cells` block. */
function supplyBlock(ctx: TraceDefaultsContext, which: 'header' | 'cells'): void {
  ctx.coerce(`${which}.values`);
  ctx.coerce(`${which}.format`);
  ctx.coerce(`${which}.align`);
  ctx.coerce(`${which}.prefix`);
  ctx.coerce(`${which}.suffix`);
  ctx.coerce(`${which}.height`);
  ctx.coerce(`${which}.line.width`);
  ctx.coerce(`${which}.line.color`);
  ctx.coerce(`${which}.fill.color`);
  const font = ctx.fullLayout.font;
  ctx.coerceContainer(`${which}.font`, {
    family: font.family,
    size: font.size,
    color: font.color,
    weight: font.weight,
    style: font.style,
  });
}

/**
 * Supply table defaults. `domain` was coerced by core before this runs (the `domain` category).
 * `columnorder` is always set (see {@link normalizeColumnOrder}), covering every column: the header
 * columns and any further cell columns.
 */
export function supplyTableDefaults(
  _traceIn: Readonly<Record<string, unknown>>,
  traceOut: FullTrace,
  ctx: TraceDefaultsContext,
): void {
  ctx.coerce('columnwidth');
  supplyBlock(ctx, 'header');
  supplyBlock(ctx, 'cells');
  const header = traceOut['header'] as { values?: unknown };
  const cells = traceOut['cells'] as { values?: unknown };
  const count = Math.max(columnCount(header.values), columnCount(cells.values));
  const order = ctx.coerce('columnorder');
  traceOut['columnorder'] = normalizeColumnOrder(order, count);
}
