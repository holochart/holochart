/**
 * Trendlines (plan E23.5), as plotly.py's `px.scatter(trendline=…)` draws them: per group (or once
 * over all rows with `trendlineScope: 'overall'`), the rows sorted by x and a `scatter` line
 * (`mode: 'lines'`) through the fitted values — an OLS line, a LOWESS curve, or a rolling /
 * expanding / exponentially weighted statistic — with the fit in the hover label. OLS fits are
 * kept with the figure for {@link getTrendlineResults}.
 */
import { dateToMs } from '@mk7s/holochart-core';
import { isMissing, plainValue } from '../data/table.ts';
import type { ExpressFigure } from '../options.ts';
import { lowess } from '../stats/lowess.ts';
import { ols, type OlsFit } from '../stats/regression.ts';
import { ewm, expanding, rolling, type EwmFunction, type WindowFunction } from '../stats/window.ts';
import type { Args } from './args.ts';
import type { TraceSpec } from './config.ts';

/** The kinds of trendline (plotly.py's `trendline_functions`). */
export type TrendlineKind = 'ols' | 'lowess' | 'rolling' | 'ewm' | 'expanding';

/**
 * `trendlineOptions`: plotly.py's `trendline_options` in camelCase. Which keys apply depends on
 * the kind; others are rejected.
 */
export interface TrendlineOptions {
  /** `ols`: fit an intercept (default true); false fits a line through the origin. */
  readonly addConstant?: boolean;
  /** `ols`: fit against log10(x) (x must be positive). */
  readonly logX?: boolean;
  /** `ols`: fit log10(y) and draw 10^fit (y must be positive). */
  readonly logY?: boolean;
  /** `lowess`: share of the points in each local fit, 0–1. Default 0.6666666 (px). */
  readonly frac?: number;
  /**
   * `rolling` / `expanding` / `ewm`: the statistic, by pandas' method name (default `'mean'`), or
   * for `rolling` / `expanding` a function of each window's present values.
   */
  readonly function?: WindowFunction;
  /** Arguments of the statistic: `ddof` of `std` / `var`, `std` of a `'gaussian'` window. */
  readonly functionArgs?: Readonly<Record<string, unknown>>;
  /** `rolling`: observations per window, or a time span (`'7D'`, `'12h'`) over dates on x. */
  readonly window?: number | string;
  /** `rolling` / `expanding` / `ewm`: present values a result needs. */
  readonly minPeriods?: number;
  /** `rolling`: center the windows. */
  readonly center?: boolean;
  /** `rolling`: window weights, `'boxcar'`, `'triang'` or `'gaussian'`. */
  readonly winType?: 'boxcar' | 'triang' | 'gaussian';
  /** `ewm`: center of mass. */
  readonly com?: number;
  /** `ewm`: span. */
  readonly span?: number;
  /** `ewm`: half-life, in observations. */
  readonly halflife?: number;
  /** `ewm`: smoothing factor α. */
  readonly alpha?: number;
  /** `ewm`: adjusted weights (default true). */
  readonly adjust?: boolean;
  /** `ewm`: missing values do not age the weights. */
  readonly ignoreNa?: boolean;
}

/** Trendline options of the functions that draw them (`scatter`, `densityContour`). */
export interface TrendlineArgs {
  /** Draw a trendline of each group (or of all rows, see `trendlineScope`). */
  readonly trendline?: TrendlineKind;
  /** Options of the trendline kind (px's `trendline_options`). */
  readonly trendlineOptions?: TrendlineOptions;
  /** One color for every trendline (`line.color`) instead of the group colors. */
  readonly trendlineColorOverride?: string;
  /**
   * `'trace'` (default): one trendline per group; `'overall'`: one fit over all rows, drawn in
   * every subplot as `Overall Trendline` (one legend entry), in the next color of the sequence.
   */
  readonly trendlineScope?: 'trace' | 'overall';
}

/** One OLS fit of a figure, as a row of px's `get_trendline_results` DataFrame. */
export interface TrendlineResult {
  /**
   * The group the line was fit on: `{ sex: 'Female', day: 'Sun' }` by column label (the grouping,
   * facet and frame columns), empty for the overall trendline.
   */
  readonly groups: Readonly<Record<string, string>>;
  /** Index of the trendline trace in `figure.data` (and in each frame's `data`). */
  readonly traceIndex: number;
  /** Name of the frame the fit belongs to, for animated figures. */
  readonly frame?: string;
  /** The fit: coefficients, R², standard errors, p-values, … (statsmodels' `OLSResults`). */
  readonly fit: OlsFit;
  /** Whether x (y) was fit on its log10 (`trendlineOptions.logX` / `logY`). */
  readonly logX: boolean;
  readonly logY: boolean;
}

const OPTION_KEYS: Record<TrendlineKind, readonly string[]> = {
  ols: ['addConstant', 'logX', 'logY'],
  lowess: ['frac'],
  rolling: ['function', 'functionArgs', 'window', 'minPeriods', 'center', 'winType'],
  expanding: ['function', 'functionArgs', 'minPeriods'],
  ewm: [
    'function',
    'functionArgs',
    'com',
    'span',
    'halflife',
    'alpha',
    'minPeriods',
    'adjust',
    'ignoreNa',
  ],
};

/** Check `trendline` and its options (px raises for unknown kinds and keys). */
export function checkTrendline(fn: string, options: Readonly<Record<string, unknown>>): void {
  const kind = options['trendline'];
  if (kind === undefined || kind === null) return;
  if (typeof kind !== 'string' || !(kind in OPTION_KEYS)) {
    throw new Error(
      `${fn}: trendline must be one of 'ols', 'lowess', 'rolling', 'ewm', 'expanding' (got '${String(kind)}').`,
    );
  }
  const valid = OPTION_KEYS[kind as TrendlineKind];
  for (const key of Object.keys((options['trendlineOptions'] ?? {}) as object)) {
    if (!valid.includes(key)) {
      throw new Error(
        `${fn}: ${kind} trendlineOptions keys must be one of [${valid.join(', ')}] but got '${key}'.`,
      );
    }
  }
  if (
    kind === 'rolling' &&
    (options['trendlineOptions'] as TrendlineOptions | undefined)?.window === undefined
  ) {
    throw new Error(`${fn}: the rolling trendline needs trendlineOptions.window.`);
  }
}

/** The computed trendline of a set of rows. */
export interface TrendlineFit {
  /** Trace attributes: `x` (the rows' x, sorted) and `y` (fitted values, `null` where none). */
  readonly patch: Record<string, unknown>;
  /** Hover header: `<b>OLS trendline</b><br>y = 0.1 * x + 2<br>R<sup>2</sup>=0.9<br><br>`. */
  readonly header: string;
  /** The OLS fit (other kinds have none, as in px). */
  readonly fit?: OlsFit;
  readonly logX: boolean;
  readonly logY: boolean;
}

const MODES: Record<string, string> = {
  rolling: 'Rolling',
  ewm: 'Exponentially Weighted',
  expanding: 'Expanding',
};

/**
 * Fit the trendline of `rows` (px's `make_trace_kwargs` for the `trendline` attribute): nothing
 * without both x and y or with fewer than two complete rows; else the rows sorted by x (missing x
 * last), x as numbers (dates as Unix seconds, as px), and the fitted values of the rows with both
 * values.
 *
 * @throws {Error} For x or y that are not numbers or dates, and for `logX` / `logY` with
 *   non-positive values.
 */
export function fitTrendline(args: Args, rows: readonly number[]): TrendlineFit | undefined {
  const kind = args.options['trendline'] as TrendlineKind;
  const options = (args.options['trendlineOptions'] ?? {}) as TrendlineOptions;
  const xCol = args.cols.x;
  const yCol = args.cols.y;
  if (xCol === undefined || yCol === undefined) return undefined;
  const xAll = args.table.column(xCol);
  const yAll = args.table.column(yCol);
  const xDates = args.table.type(xCol) === 'date';
  const xNum = (v: unknown): number => {
    if (isMissing(v)) return NaN;
    const n = xDates ? dateToMs(v) / 1000 : toNumber(v);
    if (Number.isNaN(n)) {
      throw new Error(
        `${args.fn}: could not convert value of 'x' ('${xCol}') into a numeric type. If 'x' contains stringified dates, write them as ISO dates.`,
      );
    }
    return n;
  };
  const yNum = (v: unknown): number => {
    if (isMissing(v)) return NaN;
    const n = toNumber(v);
    if (Number.isNaN(n)) {
      throw new Error(`${args.fn}: could not convert value of 'y' into a numeric type.`);
    }
    return n;
  };
  const complete = rows.filter((i) => !isMissing(xAll[i]) && !isMissing(yAll[i]));
  if (complete.length <= 1) return undefined;

  // Sorted by x, missing x last (stable, as the rows' order within ties).
  const keyed = rows.map((i) => ({ i, x: xNum(xAll[i]), y: yNum(yAll[i]) }));
  keyed.sort((a, b) => {
    const am = Number.isNaN(a.x);
    const bm = Number.isNaN(b.x);
    if (am || bm) return am === bm ? 0 : am ? 1 : -1;
    return a.x - b.x;
  });
  const x = keyed.map((k) => k.x);
  const y = keyed.map((k) => k.y);
  const keep = keyed.map((k) => !Number.isNaN(k.x) && !Number.isNaN(k.y));
  const kept = keyed.filter((_, k) => keep[k]);

  let out: number[];
  let header: string;
  let fit: OlsFit | undefined;
  const logX = kind === 'ols' && options.logX === true;
  const logY = kind === 'ols' && options.logY === true;
  switch (kind) {
    case 'ols': {
      let xs = kept.map((k) => k.x);
      let ys = kept.map((k) => k.y);
      let xLabel = xCol;
      let yLabel = yCol;
      if (logY) {
        if (ys.some((v) => v <= 0)) {
          throw new Error(
            `${args.fn}: can't do OLS trendline with logY when y contains non-positive values.`,
          );
        }
        ys = ys.map(Math.log10);
        yLabel = `log10(${yLabel})`;
      }
      if (logX) {
        if (xs.some((v) => v <= 0)) {
          throw new Error(
            `${args.fn}: can't do OLS trendline with logX when x contains non-positive values.`,
          );
        }
        xs = xs.map(Math.log10);
        xLabel = `log10(${xLabel})`;
      }
      const addConstant = options.addConstant ?? true;
      fit = ols(xs, ys, { addConstant });
      out = fit.fitted.map((v) => (logY ? 10 ** v : v));
      header = '<b>OLS trendline</b><br>';
      const p = fit.params;
      if (p.length === 2) {
        header += `${yLabel} = ${formatG(p[1] as number)} * ${xLabel} + ${formatG(p[0] as number)}<br>`;
      } else if (!addConstant) {
        header += `${yLabel} = ${formatG(p[0] as number)} * ${xLabel}<br>`;
      } else header += `${yLabel} = ${formatG(p[0] as number)}<br>`;
      header += `R<sup>2</sup>=${formatF(fit.rsquared)}<br><br>`;
      break;
    }
    case 'lowess': {
      out = lowess(
        kept.map((k) => k.x),
        kept.map((k) => k.y),
        { frac: options.frac ?? 0.6666666 },
      );
      header = '<b>LOWESS trendline</b><br><br>';
      break;
    }
    default: {
      // pandas: the whole sorted series (missing values take window positions), then the rows
      // with both values.
      const fn = options.function ?? 'mean';
      const fnArgs = options.functionArgs ?? {};
      let all: number[];
      if (kind === 'rolling') {
        const times = xDates ? x.map((v) => v * 1000) : undefined;
        all = rolling(
          y,
          {
            window: options.window as number | string,
            ...(options.minPeriods !== undefined ? { minPeriods: options.minPeriods } : {}),
            ...(options.center !== undefined ? { center: options.center } : {}),
            ...(options.winType !== undefined ? { winType: options.winType } : {}),
          },
          fn,
          fnArgs,
          times,
        );
      } else if (kind === 'expanding') {
        all = expanding(
          y,
          options.minPeriods !== undefined ? { minPeriods: options.minPeriods } : {},
          fn,
          fnArgs,
        );
      } else {
        if (typeof fn !== 'string' || !['mean', 'sum', 'std', 'var'].includes(fn)) {
          throw new Error(
            `${args.fn}: the ewm trendline's function must be 'mean', 'sum', 'std' or 'var'.`,
          );
        }
        all = ewm(y, options, fn as EwmFunction);
      }
      out = all.filter((_, k) => keep[k]);
      const name = typeof fn === 'function' ? fn.name || 'custom' : fn;
      header = `<b>${MODES[kind] as string} ${name} trendline</b><br><br>`;
    }
  }
  const xValues = kept.map((k) => plainValue(xAll[k.i]));
  const yValues = out.map((v) => (Number.isFinite(v) ? v : null));
  return {
    patch: { x: xValues, y: yValues },
    header,
    ...(fit ? { fit } : {}),
    logX,
    logY,
  };
}

function toNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'string' && v.trim() !== '') return Number(v);
  return NaN;
}

/** Python's `'%g' % v`: 6 significant digits, trailing zeros dropped, exponent outside 1e-4–1e6. */
export function formatG(v: number): string {
  if (Number.isNaN(v)) return 'nan';
  if (!Number.isFinite(v)) return v > 0 ? 'inf' : '-inf';
  if (v === 0) return Object.is(v, -0) ? '-0' : '0';
  const [mantissa, exponent] = v.toExponential(5).split('e') as [string, string];
  const exp = Number(exponent);
  if (exp < -4 || exp >= 6) {
    const m = mantissa.includes('.') ? mantissa.replace(/\.?0+$/, '') : mantissa;
    const sign = exp < 0 ? '-' : '+';
    return `${m}e${sign}${String(Math.abs(exp)).padStart(2, '0')}`;
  }
  const fixed = v.toFixed(Math.max(0, 5 - exp));
  return fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed;
}

/** Python's `'%f' % v`: six decimals. */
export function formatF(v: number): string {
  if (Number.isNaN(v)) return 'nan';
  if (!Number.isFinite(v)) return v > 0 ? 'inf' : '-inf';
  return v.toFixed(6);
}

/** OLS fits per figure (and per chart rendered from one): kept out of the figure's JSON. */
const RESULTS = new WeakMap<object, readonly TrendlineResult[]>();

/** Keep the fits of `figure` (the engine calls this). */
export function setTrendlineResults(owner: object, results: readonly TrendlineResult[]): void {
  RESULTS.set(owner, results);
}

/**
 * The OLS fits of a figure built with `trendline: 'ols'` (plotly.py's
 * `px.get_trendline_results(fig)`): one result per trendline trace, with the group it was fit on
 * and statsmodels-like results (`params`, `rsquared`, `bse`, `pvalues`, …). Pass the figure an
 * Express function returned, or the chart it rendered (`await hx.scatter(el, …)`). The results
 * are kept beside the figure object, not in it, so they do not survive `chartToJSON`,
 * `structuredClone` or a copy of the figure (as plotly.py keeps them on the Python figure only);
 * other kinds of trendline, and figures without one, give `[]`.
 *
 * @example
 * ```ts
 * const figure = hx.scatter(tips, { x: 'total_bill', y: 'tip', color: 'sex', trendline: 'ols' });
 * const [female] = hx.getTrendlineResults(figure);
 * female.groups; // { sex: 'Female' }
 * female.fit.params; // [intercept, slope]
 * female.fit.rsquared;
 * ```
 */
export function getTrendlineResults(figure: ExpressFigure | object): readonly TrendlineResult[] {
  return RESULTS.get(figure) ?? [];
}

/**
 * The trendline trace spec of a group (px's `make_trendline_spec`: a `scatter` line, colored by
 * `trendlineColorOverride` when given), and whether it is drawn once over all rows instead.
 */
export function trendlineConfig(args: Args): { specs: TraceSpec[]; overallTrendline?: boolean } {
  checkTrendline(args.fn, args.options);
  if (args.options['trendline'] === undefined || args.options['trendline'] === null) {
    return { specs: [] };
  }
  const scope = args.options['trendlineScope'] ?? 'trace';
  if (scope !== 'trace' && scope !== 'overall') {
    throw new Error(
      `${args.fn}: trendlineScope must be 'trace' or 'overall' (got '${String(scope)}').`,
    );
  }
  if (scope === 'overall') return { specs: [], overallTrendline: true };
  const patch: Record<string, unknown> = { mode: 'lines' };
  const override = args.options['trendlineColorOverride'];
  if (typeof override === 'string') patch['line'] = { color: override };
  return { specs: [{ type: 'scatter', attrs: ['trendline'], patch }] };
}
