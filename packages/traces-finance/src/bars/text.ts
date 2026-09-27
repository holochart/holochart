/**
 * Labels of the bar-like financial traces (plotly.js bar `calcTextinfo` / `calcTexttemplate`):
 * values formatted like the axes' hover labels, Plotly's percent format, and the trace handed to
 * bar's renderer with the label strings and per-bar styles in bar's attributes.
 */
import { isArrayLike, type FullTrace } from '@mk7s/holochart-core';
import { formatTemplate, type AxisInfo } from '@mk7s/holochart-runtime';
import { valueFormatters, type BarCalc } from '@mk7s/holochart-traces-basic';

/**
 * A ratio as a percentage rounded to `digits` decimals, trailing zeros dropped (Plotly's
 * `Lib.formatPercent`: `0.3125` → `'31%'`, with 1 digit `'31.3%'`, `1` → `'100%'`).
 */
export function formatPercent(ratio: number, digits = 0): string {
  let s = `${(Math.round(100 * ratio * 10 ** digits) * 0.1 ** digits).toFixed(digits)}%`;
  for (let i = 0; i < digits; i++) {
    if (s.includes('.')) s = s.replace('0%', '%').replace('.%', '%');
  }
  return s;
}

/** Formatters of a bar-like calc: positions and sizes like the axes' hover labels. */
export interface LabelFormatters {
  /** A linear position (category index, ms, …) as the position axis shows it. */
  readonly position: (l: number) => string;
  /** A size-axis value in calc space as the size axis shows it. */
  readonly size: (c: number) => string;
}

/** Hover-precision formatters of a calc's axes (plain numbers without axes). */
export function labelFormatters(
  calc: BarCalc,
  xaxis: AxisInfo | undefined,
  yaxis: AxisInfo | undefined,
): LabelFormatters {
  const f = valueFormatters(calc, xaxis, yaxis);
  return {
    position: f.position ?? String,
    size: (c) => (Number.isFinite(c) ? (f.size ?? String)(c) : ''),
  };
}

/** The entry of a scalar-or-array attribute for bar `i`. */
export function valueAt(value: unknown, i: number): unknown {
  return isArrayLike(value) ? value[i] : value;
}

/** A text attribute's entry for bar `i`, `undefined` unless a string or number (Plotly: `0` shows). */
export function textAt(trace: FullTrace, key: string, i: number): string | undefined {
  const v = valueAt(trace[key], i);
  return v || v === 0 ? String(v) : undefined;
}

/**
 * Fill bar `i`'s `texttemplate`, or `undefined` without one: `values` and their preformatted
 * `labels` (used for a variable without a format), plus `text`, `customdata` and `meta`.
 */
export function templateLabel(
  trace: FullTrace,
  i: number,
  values: Record<string, unknown>,
  labels: Record<string, string>,
): string | undefined {
  const template = valueAt(trace['texttemplate'], i);
  if (typeof template !== 'string' || template === '') return undefined;
  const text = textAt(trace, 'text', i);
  const customdata = valueAt(trace['customdata'], i);
  // Unknown variables render as '' (as bar labels do).
  return formatTemplate(
    template,
    {
      values: {
        ...values,
        ...(text !== undefined ? { text } : {}),
        ...(customdata !== undefined ? { customdata } : {}),
        meta: trace['meta'],
      },
      labels,
    },
    { fallback: '' },
  );
}

/** The flags of a `textinfo` flaglist, or `undefined` for none. */
export function textinfoFlags(trace: FullTrace): Set<string> | undefined {
  const info = trace['textinfo'];
  if (typeof info !== 'string' || info === '' || info === 'none') return undefined;
  return new Set(info.split('+'));
}

/**
 * The trace as bar's renderer reads it: `marker` replaced (no corner radius: only `bar` has one),
 * the finished label strings as `text` and no `texttemplate`.
 */
export function asBarTrace(
  trace: FullTrace,
  marker: Readonly<Record<string, unknown>>,
  text: readonly string[],
): FullTrace {
  return { ...trace, marker: { ...marker, cornerradius: 0 }, text, texttemplate: '' } as FullTrace;
}
