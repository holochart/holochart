/**
 * Generated chart summaries (plan E17.2): the gist of a chart in a few sentences — trends with their
 * start and end values and notable extremes, the largest parts of a whole, distributions, hot spots
 * of a grid, price changes — from the facts trace modules report (`TraceDescription.insight`).
 * Loaded lazily after a chart's first draw (the runtime's `a11y` chunk), so charts that never get a
 * description don't ship it.
 *
 * ## Rules
 *
 * Deterministic and conservative: a series *rises* or *falls* when its last value differs from its
 * first by at least {@link TREND_THRESHOLD} of its range, and otherwise *stays flat* (a range under
 * {@link FLAT_THRESHOLD} of its magnitude) or *varies with no clear trend*. A peak or low point is
 * mentioned only when it stands out from both ends by {@link EXTREME_THRESHOLD} of the range.
 * Markers whose x doesn't increase are described by their correlation. Seasonality is not
 * detected (not robust on short series).
 *
 * ## Localization
 *
 * Every sentence comes from {@link SUMMARY_TEMPLATES}: English text with `{placeholders}`, which is
 * also the key a locale's `dictionary` translates (like Plotly's UI strings), so
 * `register({ moduleType: 'locale', name: 'de', dictionary: { '{name} rises from …': '…' } })`
 * translates the summaries of charts with `config.locale: 'de'`. Values are formatted like the
 * chart (axis formats, locale separators), percentages and correlations with the locale's numbers.
 */
import { localeOf, localize, type FullLayout } from '@mk7s/holochart-core';
import type {
  BinsInsight,
  BoxesInsight,
  GridInsight,
  PricesInsight,
  SeriesInsight,
  SharesInsight,
  TraceInsight,
  ValueInsight,
} from '../contracts.ts';

/** Share of a series' range its end must differ from its start by to rise or fall. */
export const TREND_THRESHOLD = 0.1;
/** A series whose range is under this share of its magnitude stays flat. */
export const FLAT_THRESHOLD = 0.05;
/** How far (share of the range) a peak or low point must stand out from both ends to be named. */
export const EXTREME_THRESHOLD = 0.05;
/** Traces summarized in the overview; later ones are counted. */
export const MAX_SUMMARIZED_TRACES = 10;

/**
 * The English sentences of generated summaries. Each template is also its own key in a locale
 * dictionary: a translation keeps the `{placeholders}` (in any order).
 */
export const SUMMARY_TEMPLATES = {
  axes: '{y} by {x}.',
  more: '{count} more traces are not summarized.',
  empty: '{name} has no values.',
  single: '{name} has a single value, {value} ({x}).',
  rises: '{name} rises from {start} ({startX}) to {end} ({endX}).',
  falls: '{name} falls from {start} ({startX}) to {end} ({endX}).',
  flat: '{name} stays flat at about {value}.',
  varies: '{name} varies between {min} ({minX}) and {max} ({maxX}) with no clear trend.',
  peak: 'It peaks at {max} ({maxX}).',
  low: 'Its lowest point is {min} ({minX}).',
  strongUp: '{name}: {y} rises strongly with {x} (correlation {r}).',
  up: '{name}: {y} tends to rise with {x} (correlation {r}).',
  none: '{name}: no clear relationship between {x} and {y} (correlation {r}).',
  down: '{name}: {y} tends to fall as {x} rises (correlation {r}).',
  strongDown: '{name}: {y} falls strongly as {x} rises (correlation {r}).',
  range: 'Values range from {min} to {max}.',
  slice: '{label} is the largest slice of {name}: {share} ({value}).',
  stage: '{label} is the largest stage of {name}: {share} ({value}).',
  branch: '{label} is the largest branch of {name}: {share} ({value}).',
  flow: '{label} is the largest flow of {name}: {share} ({value}).',
  next: 'Next: {label}, {share} ({value}).',
  next2: 'Next: {label}, {share} ({value}), and {label2}, {share2} ({value2}).',
  bars: '{name} is highest at {label} ({value}) and lowest at {lowLabel} ({lowValue}).',
  box: '{name}: median {median}; half of the values lie between {q1} and {q3}; range {min} to {max}.',
  boxes: '{name}: medians range from {low} ({lowLabel}) to {high} ({highLabel}).',
  mode: '{name}: the most common range is {start} to {end} ({value}).',
  spread: 'Half of the values lie between {q1} and {q3}, with a median of about {median}.',
  skewRight: 'The distribution is skewed to the right (a long tail of high values).',
  skewLeft: 'The distribution is skewed to the left (a long tail of low values).',
  grid: '{name}: values range from {min} to {max}.',
  hotspot: 'The highest value, {max}, is at {x}, {y}; the lowest, {min}, at {minX}, {minY}.',
  rows: 'Highest average by row: {row} ({rowValue}); by column: {column} ({columnValue}).',
  priceUp:
    '{name} rises {change} from an open of {open} ({startX}) to a close of {close} ({endX}).',
  priceDown:
    '{name} falls {change} from an open of {open} ({startX}) to a close of {close} ({endX}).',
  priceSame: '{name} closes at {close} ({endX}), where it opened ({startX}).',
  priceRange: 'Highest high {high} ({highX}); lowest low {low} ({lowX}).',
  value: '{name} is {value}.',
  valueUp: '{name} is {value}, up {change} from {reference}.',
  valueDown: '{name} is {value}, down {change} from {reference}.',
  valueSame: '{name} is {value}, unchanged from {reference}.',
} as const;

/** A template name. */
export type SummaryTemplate = keyof typeof SUMMARY_TEMPLATES;

type Values = Readonly<Record<string, string>>;

/** Sentences in the chart's language: `say('rises', { name, … })`. */
export type Say = (template: SummaryTemplate, values: Values) => string;

/** A {@link Say} for a chart: the template translated through its locale, then filled in. */
export function sayer(fullLayout: FullLayout | undefined): Say {
  return (template, values) =>
    localize(fullLayout, SUMMARY_TEMPLATES[template]).replace(
      /\{(\w+)\}/g,
      (match, key: string) => values[key] ?? match,
    );
}

/** One trace to summarize. */
export interface SummaryTrace {
  /** Plain-text name. */
  readonly name: string;
  readonly insight: TraceInsight;
}

/** What {@link summarizeChart} needs. */
export interface SummaryInput {
  readonly fullLayout: FullLayout | undefined;
  readonly traces: readonly SummaryTrace[];
  /** Plain-text titles of the first x and y axes (cartesian charts), if they have one. */
  readonly xTitle?: string;
  readonly yTitle?: string;
}

/** The overview paragraph: the axes (`"k$ by Month."`) and each trace's sentences. */
export function summarizeChart(input: SummaryInput): string {
  const say = sayer(input.fullLayout);
  const out: string[] = [];
  if (input.xTitle && input.yTitle) out.push(say('axes', { x: input.xTitle, y: input.yTitle }));
  const traces = input.traces.slice(0, MAX_SUMMARIZED_TRACES);
  for (const t of traces) {
    out.push(...summarizeTrace(t.insight, t.name, input.fullLayout, input, say));
  }
  const more = input.traces.length - traces.length;
  if (more > 0) out.push(say('more', { count: String(more) }));
  return out.join(' ');
}

/** Percentages and correlations in the chart's locale. */
function numbers(fullLayout: FullLayout | undefined): {
  pct(v: number): string;
  r(v: number): string;
} {
  const locale = localeOf(fullLayout);
  const pct = locale.numberFormat('.1~%') ?? ((v: number) => `${Math.round(v * 1000) / 10}%`);
  const r = locale.numberFormat('.2f') ?? ((v: number) => v.toFixed(2));
  return { pct, r };
}

/** The sentences of one trace. */
export function summarizeTrace(
  insight: TraceInsight,
  name: string,
  fullLayout: FullLayout | undefined,
  titles: { readonly xTitle?: string; readonly yTitle?: string } = {},
  say: Say = sayer(fullLayout),
): string[] {
  switch (insight.kind) {
    case 'series':
      return series(insight, name, say, numbers(fullLayout), titles);
    case 'shares':
      return shares(insight, name, say, numbers(fullLayout));
    case 'boxes':
      return boxes(insight, name, say);
    case 'bins':
      return bins(insight, name, say);
    case 'grid':
      return grid(insight, name, say);
    case 'prices':
      return prices(insight, name, say, numbers(fullLayout));
    case 'value':
      return value(insight, name, say, numbers(fullLayout));
  }
}

/** The trend of a list of values: what {@link series} says, as data (for tests and reuse). */
export interface Trend {
  readonly direction: 'rises' | 'falls' | 'flat' | 'varies';
  readonly first: number;
  readonly last: number;
  readonly min: number;
  readonly max: number;
  /** Whether the peak / low point stands out from both ends (worth naming). */
  readonly peak: boolean;
  readonly low: boolean;
}

/**
 * Classify `values[points[k]]` in order (see the module rules). `points` holds at least two
 * indices of finite values.
 */
export function trend(values: ArrayLike<number>, points: readonly number[]): Trend {
  const v = (k: number): number => values[points[k]!]!;
  const first = 0;
  const last = points.length - 1;
  let min = 0;
  let max = 0;
  for (let k = 1; k < points.length; k++) {
    if (v(k) < v(min)) min = k;
    if (v(k) > v(max)) max = k;
  }
  const range = v(max) - v(min);
  const magnitude = Math.max(Math.abs(v(max)), Math.abs(v(min)));
  const change = range > 0 ? (v(last) - v(first)) / range : 0;
  let direction: Trend['direction'];
  if (range <= FLAT_THRESHOLD * magnitude || range === 0) direction = 'flat';
  else if (change >= TREND_THRESHOLD) direction = 'rises';
  else if (change <= -TREND_THRESHOLD) direction = 'falls';
  else direction = 'varies';
  const margin = EXTREME_THRESHOLD * range;
  const moving = direction === 'rises' || direction === 'falls';
  return {
    direction,
    first: points[first]!,
    last: points[last]!,
    min: points[min]!,
    max: points[max]!,
    peak: moving && v(max) - Math.max(v(first), v(last)) >= margin && margin > 0,
    low: moving && Math.min(v(first), v(last)) - v(min) >= margin && margin > 0,
  };
}

/** Pearson's correlation of `y` with `x` over `points`, or `NaN` without variance. */
export function correlation(
  x: ArrayLike<number>,
  y: ArrayLike<number>,
  points: readonly number[],
): number {
  const n = points.length;
  let mx = 0;
  let my = 0;
  for (const i of points) {
    mx += x[i]!;
    my += y[i]!;
  }
  mx /= n;
  my /= n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (const i of points) {
    const dx = x[i]! - mx;
    const dy = y[i]! - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : NaN;
}

function series(
  s: SeriesInsight,
  name: string,
  say: Say,
  num: ReturnType<typeof numbers>,
  titles: { readonly xTitle?: string; readonly yTitle?: string },
): string[] {
  const points: number[] = [];
  let increasing = true;
  for (let i = 0; i < s.length; i++) {
    const x = s.x[i]!;
    if (!Number.isFinite(x) || !Number.isFinite(s.y[i]!)) continue;
    if (points.length > 0 && x < s.x[points[points.length - 1]!]!) increasing = false;
    points.push(i);
  }
  if (points.length === 0) return [say('empty', { name })];
  const fx = (i: number): string => s.formatX(s.x[i]!);
  const fy = (i: number): string => s.formatY(s.y[i]!);
  if (points.length === 1) {
    const i = points[0]!;
    return [say('single', { name, value: fy(i), x: fx(i) })];
  }
  if (!s.joined && !increasing) {
    const r = correlation(s.x, s.y, points);
    let min = points[0]!;
    let max = min;
    for (const i of points) {
      if (s.y[i]! < s.y[min]!) min = i;
      if (s.y[i]! > s.y[max]!) max = i;
    }
    const range = say('range', { min: fy(min), max: fy(max) });
    if (!Number.isFinite(r)) return [say('flat', { name, value: fy(min) }), range];
    const template: SummaryTemplate =
      r >= 0.7
        ? 'strongUp'
        : r >= 0.3
          ? 'up'
          : r <= -0.7
            ? 'strongDown'
            : r <= -0.3
              ? 'down'
              : 'none';
    const x = titles.xTitle || 'x';
    const y = titles.yTitle || 'y';
    return [say(template, { name, x, y, r: num.r(r) }), range];
  }
  const t = trend(s.y, points);
  if (t.direction === 'flat') {
    let sum = 0;
    for (const i of points) sum += s.y[i]!;
    return [say('flat', { name, value: s.formatY(sum / points.length) })];
  }
  if (t.direction === 'varies') {
    return [
      say('varies', { name, min: fy(t.min), minX: fx(t.min), max: fy(t.max), maxX: fx(t.max) }),
    ];
  }
  const out = [
    say(t.direction, {
      name,
      start: fy(t.first),
      startX: fx(t.first),
      end: fy(t.last),
      endX: fx(t.last),
    }),
  ];
  if (t.peak) out.push(say('peak', { max: fy(t.max), maxX: fx(t.max) }));
  if (t.low) out.push(say('low', { min: fy(t.min), minX: fx(t.min) }));
  return out;
}

function shares(
  s: SharesInsight,
  name: string,
  say: Say,
  num: ReturnType<typeof numbers>,
): string[] {
  const parts: number[] = [];
  let sum = 0;
  let negative = false;
  for (let i = 0; i < s.length; i++) {
    const v = s.values[i]!;
    if (!Number.isFinite(v) || s.skip?.(i) === true) continue;
    parts.push(i);
    sum += v;
    if (v < 0) negative = true;
  }
  if (parts.length === 0) return [say('empty', { name })];
  // Largest first; ties keep their order.
  const order = [...parts].sort((a, b) => s.values[b]! - s.values[a]! || a - b);
  const fv = (i: number): string => s.formatValue(s.values[i]!);
  if (s.part === 'bar' || negative) {
    const high = order[0]!;
    const low = order[order.length - 1]!;
    if (parts.length === 1) return [say('single', { name, value: fv(high), x: s.label(high) })];
    return [
      say('bars', {
        name,
        label: s.label(high),
        value: fv(high),
        lowLabel: s.label(low),
        lowValue: fv(low),
      }),
    ];
  }
  const total = s.total ?? sum;
  const share = (i: number): string => (total > 0 ? num.pct(s.values[i]! / total) : '');
  const [a, b, c] = order;
  const out = [say(s.part, { name, label: s.label(a!), share: share(a!), value: fv(a!) })];
  if (b !== undefined && c !== undefined) {
    out.push(
      say('next2', {
        label: s.label(b),
        share: share(b),
        value: fv(b),
        label2: s.label(c),
        share2: share(c),
        value2: fv(c),
      }),
    );
  } else if (b !== undefined) {
    out.push(say('next', { label: s.label(b), share: share(b), value: fv(b) }));
  }
  return out;
}

function boxes(b: BoxesInsight, name: string, say: Say): string[] {
  const valid: number[] = [];
  for (let i = 0; i < b.length; i++) if (Number.isFinite(b.median[i]!)) valid.push(i);
  if (valid.length === 0) return [say('empty', { name })];
  const f = (a: ArrayLike<number>, i: number): string => b.formatValue(a[i]!);
  if (valid.length === 1) {
    const i = valid[0]!;
    return [
      say('box', {
        name,
        median: f(b.median, i),
        q1: f(b.q1, i),
        q3: f(b.q3, i),
        min: f(b.min, i),
        max: f(b.max, i),
      }),
    ];
  }
  let low = valid[0]!;
  let high = low;
  for (const i of valid) {
    if (b.median[i]! < b.median[low]!) low = i;
    if (b.median[i]! > b.median[high]!) high = i;
  }
  return [
    say('boxes', {
      name,
      low: f(b.median, low),
      lowLabel: b.label(low),
      high: f(b.median, high),
      highLabel: b.label(high),
    }),
  ];
}

/** Quartiles of binned values (linear interpolation inside a bin), or `undefined` without a total. */
export function binQuantiles(bins: BinsInsight): [number, number, number] | undefined {
  let total = 0;
  for (let i = 0; i < bins.length; i++) {
    const v = bins.values[i]!;
    if (Number.isFinite(v) && v > 0) total += v;
  }
  if (!(total > 0)) return undefined;
  const at = (p: number): number => {
    const target = p * total;
    let before = 0;
    let last = 0;
    for (let i = 0; i < bins.length; i++) {
      const v = bins.values[i]!;
      if (!(Number.isFinite(v) && v > 0)) continue;
      last = i;
      if (before + v >= target) {
        const f = (target - before) / v;
        return bins.start[i]! + f * (bins.end[i]! - bins.start[i]!);
      }
      before += v;
    }
    return bins.end[last]!;
  };
  return [at(0.25), at(0.5), at(0.75)];
}

function bins(b: BinsInsight, name: string, say: Say): string[] {
  let mode = -1;
  let negative = false;
  for (let i = 0; i < b.length; i++) {
    const v = b.values[i]!;
    if (!Number.isFinite(v)) continue;
    if (v < 0) negative = true;
    if (mode < 0 || v > b.values[mode]!) mode = i;
  }
  if (mode < 0) return [say('empty', { name })];
  const out = [
    say('mode', {
      name,
      start: b.formatPosition(b.start[mode]!),
      end: b.formatPosition(b.end[mode]!),
      value: b.formatValue(b.values[mode]!),
    }),
  ];
  const q = negative || b.length < 3 ? undefined : binQuantiles(b);
  if (q) {
    const [q1, median, q3] = q;
    out.push(
      say('spread', {
        q1: b.formatPosition(q1),
        q3: b.formatPosition(q3),
        median: b.formatPosition(median),
      }),
    );
    // Bowley's quartile skewness: robust, and bounded by ±1.
    const skew = q3 > q1 ? (q3 + q1 - 2 * median) / (q3 - q1) : 0;
    if (b.length >= 5 && skew >= 0.3) out.push(say('skewRight', {}));
    else if (b.length >= 5 && skew <= -0.3) out.push(say('skewLeft', {}));
  }
  return out;
}

interface GridScan {
  nx: number;
  ny: number;
  min: number;
  max: number;
  rowSum: Float64Array;
  rowN: Uint32Array;
  colSum: Float64Array;
  colN: Uint32Array;
}

/** Scans of the grids summarized so far, by their `z`: a summary is rebuilt after every run. */
const gridScans = new WeakMap<object, GridScan>();

function scanGrid(g: GridInsight): GridScan {
  const { nx, ny, z } = g;
  const known = gridScans.get(z);
  if (known && known.nx === nx && known.ny === ny) return known;
  let min = -1;
  let max = -1;
  const rowSum = new Float64Array(ny);
  const rowN = new Uint32Array(ny);
  const colSum = new Float64Array(nx);
  const colN = new Uint32Array(nx);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const c = j * nx + i;
      const v = z[c]!;
      if (!Number.isFinite(v)) continue;
      if (min < 0 || v < z[min]!) min = c;
      if (max < 0 || v > z[max]!) max = c;
      rowSum[j] = rowSum[j]! + v;
      rowN[j] = rowN[j]! + 1;
      colSum[i] = colSum[i]! + v;
      colN[i] = colN[i]! + 1;
    }
  }
  const scan = { nx, ny, min, max, rowSum, rowN, colSum, colN };
  gridScans.set(z, scan);
  return scan;
}

function grid(g: GridInsight, name: string, say: Say): string[] {
  const { nx, ny, z } = g;
  const { min, max, rowSum, rowN, colSum, colN } = scanGrid(g);
  if (max < 0) return [say('empty', { name })];
  const fv = (c: number): string => g.formatValue(z[c]!);
  const out = [say('grid', { name, min: fv(min), max: fv(max) })];
  if (z[max]! > z[min]!) {
    out.push(
      say('hotspot', {
        max: fv(max),
        x: g.xText(max % nx),
        y: g.yText(Math.floor(max / nx)),
        min: fv(min),
        minX: g.xText(min % nx),
        minY: g.yText(Math.floor(min / nx)),
      }),
    );
  }
  if (nx > 1 && ny > 1) {
    const best = (sum: Float64Array, n: Uint32Array): number => {
      let k = -1;
      for (let i = 0; i < sum.length; i++) {
        if (n[i]! > 0 && (k < 0 || sum[i]! / n[i]! > sum[k]! / n[k]!)) k = i;
      }
      return k;
    };
    const row = best(rowSum, rowN);
    const column = best(colSum, colN);
    out.push(
      say('rows', {
        row: g.yText(row),
        rowValue: g.formatValue(rowSum[row]! / rowN[row]!),
        column: g.xText(column),
        columnValue: g.formatValue(colSum[column]! / colN[column]!),
      }),
    );
  }
  return out;
}

function prices(
  p: PricesInsight,
  name: string,
  say: Say,
  num: ReturnType<typeof numbers>,
): string[] {
  const n = p.points.length;
  if (n === 0) return [say('empty', { name })];
  const first = p.points[0]!;
  const last = p.points[n - 1]!;
  let high = first;
  let low = first;
  for (let k = 0; k < n; k++) {
    const i = p.points[k]!;
    if (p.high[i]! > p.high[high]!) high = i;
    if (p.low[i]! < p.low[low]!) low = i;
  }
  const open = p.open[first]!;
  const close = p.close[last]!;
  const values = {
    name,
    open: p.formatY(open),
    close: p.formatY(close),
    startX: p.formatX(p.x[first]!),
    endX: p.formatX(p.x[last]!),
  };
  const delta = close - open;
  const change = open > 0 ? num.pct(Math.abs(delta) / open) : p.formatY(Math.abs(delta));
  const out = [
    delta > 0
      ? say('priceUp', { ...values, change })
      : delta < 0
        ? say('priceDown', { ...values, change })
        : say('priceSame', values),
  ];
  out.push(
    say('priceRange', {
      high: p.formatY(p.high[high]!),
      highX: p.formatX(p.x[high]!),
      low: p.formatY(p.low[low]!),
      lowX: p.formatX(p.x[low]!),
    }),
  );
  return out;
}

function value(v: ValueInsight, name: string, say: Say, num: ReturnType<typeof numbers>): string[] {
  if (!Number.isFinite(v.value)) return [say('empty', { name })];
  const shown = v.formatValue(v.value);
  const ref = v.reference;
  if (ref === undefined || !Number.isFinite(ref)) return [say('value', { name, value: shown })];
  const delta = v.value - ref;
  const reference = v.formatValue(ref);
  if (delta === 0) return [say('valueSame', { name, value: shown, reference })];
  const pct = ref !== 0 ? ` (${num.pct(Math.abs(delta / ref))})` : '';
  const change = `${v.formatValue(Math.abs(delta))}${pct}`;
  return [say(delta > 0 ? 'valueUp' : 'valueDown', { name, value: shown, change, reference })];
}
