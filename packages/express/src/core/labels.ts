/**
 * Labels of Express figures: group values as text, and axis titles / hover labels of aggregated
 * axes (plotly.py's `get_decorated_label`).
 */
import { formatDate, isValidDate } from '@mk7s/holochart-core';
import type { Args } from './args.ts';
import type { Config } from './config.ts';

/** Key of a group value: `Date`s as date strings, so equal dates group together. */
export function groupValue(v: unknown): unknown {
  if (v instanceof Date) return isValidDate(v) ? (formatDate(v.getTime()) ?? null) : null;
  if (typeof v === 'bigint') return Number(v);
  return v;
}

/** Python's `str()` of a group value, as px writes it in names and hover lines. */
export function valueText(v: unknown): string {
  return v === undefined || v === null ? '' : String(v);
}

/**
 * The axis title / hover label of a role: the column's label, or for a histogram's aggregated
 * axis `count`, `sum of tip`, `probability density`, … (px's `get_decorated_label`).
 */
export function decoratedLabel(
  args: Args,
  config: Config,
  column: string | undefined,
  role: 'x' | 'y' | 'z' | string,
): string {
  const original = column === undefined ? '' : args.label(column);
  const agg = config.aggregation;
  const aggregated =
    agg !== undefined &&
    (role === 'z' ||
      (role === 'x' && config.orientation === 'h') ||
      (role === 'y' && config.orientation === 'v'));
  if (!aggregated) return original;
  const histfunc = agg.histfunc ?? 'count';
  let label = histfunc !== 'count' ? `${histfunc} of ${original}` : histfunc;
  const histnorm = agg.histnorm;
  if (histnorm) {
    if (label === 'count') label = histnorm;
    else if (histfunc === 'sum') {
      label =
        histnorm === 'probability'
          ? `fraction of ${label}`
          : histnorm === 'percent'
            ? `percent of ${label}`
            : `${histnorm} weighted by ${original}`;
    } else if (histnorm === 'probability') label = `fraction of sum of ${label}`;
    else if (histnorm === 'percent') label = `percent of sum of ${label}`;
    else label = `${histnorm} of ${label}`;
  }
  if (agg.barnorm) label = `${label} (normalized as ${agg.barnorm})`;
  return label;
}
