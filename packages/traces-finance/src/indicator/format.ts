/**
 * Number and delta text of an `indicator` (plan E12.7), formatted like plotly.js: through a mock
 * linear axis over `trace._range` (`[0, 1.5 × value]`, or the gauge axis range) as wide as the
 * plot area, so an unformatted value is rounded like a tick label of that axis (`450`, `1.2M`),
 * and `valueformat` d3 specifiers go through Plotly's `adjustFormat` (`'2%'` → `'~%'`).
 */
import {
  createScale,
  createTickFormatter,
  type FullAxis,
  type FullTrace,
  type Locale,
} from '@mk7s/holochart-core';

/**
 * Plotly's `Lib.adjustFormat`: trim trailing zeros from specifiers without a precision (`'2%'` →
 * `'~%'`, `'f'` → `'~f'`, `'+s'` → `'+~s'`), leaving explicit precisions and symbol-led specifiers
 * alone.
 */
export function adjustFormat(format: string): string {
  if (!format || /^\d[.]\df/.test(format) || /[.]\d%/.test(format)) return format;
  if (format === '0.f') return '~f';
  if (/^\d%/.test(format)) return '~%';
  if (/^\ds/.test(format)) return '~s';
  const prefix = /^[+\-( ]?/.exec(format)?.[0] ?? '';
  const rest = format.slice(prefix.length);
  if (!/^[~,.0$#]/.test(rest) && /[&fps]/.test(rest)) return `${prefix}~${rest}`;
  return format;
}

/** The axis range numbers and deltas are formatted on (Plotly's `trace._range`). */
export function valueRange(trace: FullTrace): [number, number] {
  const r = trace['_range'];
  if (Array.isArray(r) && Number.isFinite(r[0]) && Number.isFinite(r[1])) {
    return [r[0] as number, r[1] as number];
  }
  const v = trace['value'];
  return [0, typeof v === 'number' && Number.isFinite(v) ? 1.5 * v : 1];
}

/**
 * A formatter of values like Plotly's indicator `mockAxis`: `valueformat` (adjusted) when set,
 * else tick-label rounding on a linear axis over `range`, `width` px long, in `locale` (the
 * chart's, plan E17.6; default en-US).
 */
export function valueFormatter(
  valueformat: string,
  range: readonly [number, number],
  width: number,
  locale?: Locale,
): (v: number) => string {
  const scale = createScale({ type: 'linear', range: [range[0], range[1]], length: width });
  const axis = {
    _id: 'x',
    type: 'linear',
    tickformat: adjustFormat(valueformat),
    _locale: locale,
  };
  const fmt = createTickFormatter(scale, axis as unknown as FullAxis);
  return (v) => fmt.label(v).text;
}

/** The number text: prefix, formatted value and suffix, or `-` without a value. */
export function numberText(
  value: number | undefined,
  format: (v: number) => string,
  prefix: string,
  suffix: string,
): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? prefix + format(value) + suffix
    : '-';
}

/** What a delta shows. */
export interface DeltaStyle {
  readonly prefix: string;
  readonly suffix: string;
  readonly increasing: { readonly symbol: string; readonly color: string };
  readonly decreasing: { readonly symbol: string; readonly color: string };
}

/**
 * The delta text (Plotly's `deltaFormatText`): the direction's symbol, prefix, the formatted
 * magnitude with its sign, and suffix; `-` for no change or no value.
 */
export function deltaText(value: number, format: (v: number) => string, style: DeltaStyle): string {
  if (value === 0 || !Number.isFinite(value)) return '-';
  const symbol = value > 0 ? style.increasing.symbol : style.decreasing.symbol;
  return symbol + style.prefix + format(value) + style.suffix;
}

/** The delta color: increasing for a positive (or zero) difference, else decreasing. */
export function deltaColor(delta: number, style: DeltaStyle): string {
  return delta >= 0 ? style.increasing.color : style.decreasing.color;
}
