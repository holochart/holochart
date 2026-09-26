/**
 * `ff.distplot` (plan E10.8): plotly.py's `figure_factory.create_distplot` — per sample set, a
 * probability-density histogram, a KDE or normal curve over it, and a rug of the samples in a strip
 * below, sharing the x axis.
 */
import { DEFAULT_COLORWAY, resolveTemplate, type Template } from '@mk7s/holochart-core';
import { newPlot, registry, type Chart } from '@mk7s/holochart-runtime';
import { isElement } from '../core/render.ts';
import type { ExpressFigure } from '../options.ts';
import { fitNormal, gaussianKde, normalPdf } from '../stats/kde.ts';

/** Options of {@link distplot}: `create_distplot`'s arguments in camelCase. */
export interface DistplotOptions {
  /** Bin width of the histograms: one for all, or one per sample set. Default 1. */
  readonly binSize?: number | readonly number[];
  /** `'kde'` (default: Gaussian KDE, Scott's rule) or `'normal'` (a fitted normal density). */
  readonly curveType?: 'kde' | 'normal';
  /** Colors per sample set. Default: the template's colorway (plotly.py: category10). */
  readonly colors?: readonly string[];
  /** Hover text per sample of the rug, per sample set. */
  readonly rugText?: readonly (readonly string[] | undefined)[];
  /**
   * `'probability density'` (default: the histogram's area is 1, like the curve's) or
   * `'probability'` (bar heights sum to 1; the curve is scaled by the bin size to match).
   */
  readonly histnorm?: 'probability density' | 'probability';
  /** Draw the histograms. Default true. */
  readonly showHist?: boolean;
  /** Draw the curves. Default true. */
  readonly showCurve?: boolean;
  /** Draw the rug below. Default true. */
  readonly showRug?: boolean;
  /** `layout.template` (also the source of the default colors). */
  readonly template?: string | Template;
}

/** Points on each curve (plotly.py: 500, from the smallest to the largest sample). */
const CURVE_POINTS = 500;

function build(
  samples: readonly ArrayLike<number>[],
  labels: readonly string[],
  options: DistplotOptions,
): ExpressFigure {
  if (!Array.isArray(samples) || samples.length === 0) {
    throw new Error('distplot: give at least one array of samples.');
  }
  if (labels.length !== samples.length) {
    throw new Error(
      `distplot: give one label per sample set (${samples.length} sets, ${labels.length} labels).`,
    );
  }
  const curveType = options.curveType ?? 'kde';
  if (curveType !== 'kde' && curveType !== 'normal') {
    throw new Error(`distplot: curveType must be 'kde' or 'normal' (got '${String(curveType)}').`);
  }
  const histnorm = options.histnorm ?? 'probability density';
  const showHist = options.showHist ?? true;
  const showCurve = options.showCurve ?? true;
  const showRug = options.showRug ?? true;
  const binSizes = samples.map((_, i) =>
    typeof options.binSize === 'number' ? options.binSize : (options.binSize?.[i] ?? 1),
  );
  const template = resolveTemplate(options.template, registry.core).template;
  const colorway = (template?.layout?.['colorway'] as string[] | undefined) ?? [
    ...DEFAULT_COLORWAY,
  ];
  const colors = options.colors && options.colors.length > 0 ? options.colors : colorway;
  const color = (i: number) => colors[i % colors.length] as string;
  const sets = samples.map((s) => Array.from(s, Number).filter(Number.isFinite));
  const starts = sets.map((s) => s.reduce((m, v) => Math.min(m, v), Infinity));
  const ends = sets.map((s) => s.reduce((m, v) => Math.max(m, v), -Infinity));

  const hist = sets.map((x, i) => ({
    type: 'histogram',
    x,
    xaxis: 'x',
    yaxis: 'y',
    histnorm,
    name: labels[i],
    legendgroup: labels[i],
    marker: { color: color(i) },
    autobinx: false,
    xbins: { start: starts[i], end: ends[i], size: binSizes[i] },
    opacity: 0.7,
  }));
  const curves = sets.map((x, i) => {
    const start = starts[i] as number;
    const end = ends[i] as number;
    const cx = Array.from(
      { length: CURVE_POINTS },
      (_, k) => start + (k * (end - start)) / CURVE_POINTS,
    );
    let pdf: (v: number) => number;
    if (curveType === 'kde') pdf = gaussianKde(x).pdf;
    else {
      const fit = fitNormal(x);
      pdf = (v) => normalPdf(v, fit.mean, fit.sd);
    }
    const scale = histnorm === 'probability' ? (binSizes[i] as number) : 1;
    return {
      type: 'scatter',
      x: cx,
      y: cx.map((v) => pdf(v) * scale),
      xaxis: 'x',
      yaxis: 'y',
      mode: 'lines',
      name: labels[i],
      legendgroup: labels[i],
      showlegend: !showHist,
      marker: { color: color(i) },
    };
  });
  const rug = sets.map((x, i) => {
    const trace: Record<string, unknown> = {
      type: 'scatter',
      x,
      y: x.map(() => labels[i]),
      xaxis: 'x',
      yaxis: 'y2',
      mode: 'markers',
      name: labels[i],
      legendgroup: labels[i],
      showlegend: !(showHist || showCurve),
      marker: { color: color(i), symbol: 'line-ns-open' },
    };
    const text = options.rugText?.[i];
    if (text) trace['text'] = [...text];
    return trace;
  });

  const data: Record<string, unknown>[] = [
    ...(showHist ? hist : []),
    ...(showCurve ? curves : []),
    ...(showRug ? rug : []),
  ];
  const layout: Record<string, unknown> = {
    barmode: 'overlay',
    hovermode: 'closest',
    legend: { traceorder: 'reversed' },
    xaxis: { domain: [0, 1], anchor: 'y2', zeroline: false },
    yaxis: { domain: showRug ? [0.35, 1] : [0, 1], anchor: 'free', position: 0 },
  };
  if (showRug)
    layout['yaxis2'] = { domain: [0, 0.25], anchor: 'x', dtick: 1, showticklabels: false };
  if (options.template !== undefined) layout['template'] = options.template;
  return { data, layout };
}

/**
 * A distribution plot, like plotly.py's `ff.create_distplot(hist_data, group_labels)`: for each
 * sample set, a `histogram` (`histnorm: 'probability density'`, bins of `binSize` from its
 * smallest to largest sample, `opacity: 0.7`), a curve (Gaussian KDE with Scott's rule, or a fitted
 * normal) on the same axes, and a rug (`line-ns-open` markers) in a strip below; `barmode:
 * 'overlay'`, the legend in reverse order. Differences from plotly.py: colors default to the
 * template's colorway instead of category10. With an element first, renders it and resolves with
 * the chart.
 *
 * @example
 * ```ts
 * const figure = ff.distplot([a, b], ['Group A', 'Group B'], { binSize: 0.25 });
 * ```
 * @throws {Error} Without samples, with a label count that differs, and (KDE) for a set with fewer
 * than two samples or no spread.
 */
export function distplot(
  samples: readonly ArrayLike<number>[],
  labels: readonly string[],
  options?: DistplotOptions,
): ExpressFigure;
export function distplot(
  el: HTMLElement,
  samples: readonly ArrayLike<number>[],
  labels: readonly string[],
  options?: DistplotOptions,
): Promise<Chart>;
export function distplot(
  a: HTMLElement | readonly ArrayLike<number>[],
  b: readonly ArrayLike<number>[] | readonly string[],
  c?: readonly string[] | DistplotOptions,
  d?: DistplotOptions,
): ExpressFigure | Promise<Chart> {
  if (isElement(a)) {
    try {
      return newPlot(a, build(b as readonly ArrayLike<number>[], c as readonly string[], d ?? {}));
    } catch (error) {
      return Promise.reject(error);
    }
  }
  return build(a, b as readonly string[], (c as DistplotOptions | undefined) ?? {});
}
