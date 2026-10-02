import { createChart, type Chart, type LayoutAnnotation, type ScatterTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { COLOR, COMMON_START, DASH, fmtDate, growthOf, TICKERS, usd } from './analysis.mts';
import { chartConfig, frame, isNarrow, segmented, settled } from './ui.mts';

/**
 * Growth of $10,000 in TQQQ and SOXL since SOXL's first day (Mar 11, 2010), next to the
 * unleveraged ETFs on the same indexes (QQQ, SOXX), with dividends reinvested. One hue per index
 * family: the 3× fund solid, its reference dashed and lighter. Starts on a log y axis, where equal
 * percentage moves are equal heights; a DOM toggle switches to linear with
 * `chart.relayout({ 'yaxis.type': … })`. `hovermode: 'x unified'` lists all four on one date.
 */
export const meta: ExampleMeta = {
  title: 'TQQQ and SOXL: growth of $10,000 since 2010',
  description:
    'Growth of $10,000 in TQQQ, SOXL, QQQ and SOXX since March 2010, dividends reinvested, on a log or linear axis.',
  tags: ['demo', 'line', 'log', 'date', 'hover', 'relayout', 'financial'],
  size: { width: 960, height: 480 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, toolbar, dispose } = frame(el);
  const narrow = isNarrow(el);

  const traces = TICKERS.map((t): ScatterTrace => {
    const g = growthOf(t);
    return {
      type: 'scatter',
      mode: 'lines',
      name: t,
      x: g.dates,
      y: g.adj,
      line: { color: COLOR[t], width: t === 'TQQQ' || t === 'SOXL' ? 1.75 : 1.25, dash: DASH[t] },
      hovertemplate: `${t}  %{y:$,.0f}<extra></extra>`,
    };
  });
  // End-of-line labels, nudged apart where two would overlap (TQQQ and SOXL end close together).
  const finals = TICKERS.map((t) => {
    const g = growthOf(t);
    return { t, x: g.dates[g.dates.length - 1], v: g.adj[g.adj.length - 1] as number };
  });
  const shift = new Map<string, number>();
  const byValue = [...finals].sort((a, b) => a.v - b.v);
  byValue.forEach((f, i) => {
    const below = byValue[i - 1];
    if (below && Math.log10(f.v / below.v) < 0.12) {
      shift.set(below.t, -6);
      shift.set(f.t, 6);
    }
  });
  const labelY = (v: number, log: boolean): number => (log ? Math.log10(v) : v);
  const ends = finals.map((f): LayoutAnnotation => ({
    x: f.x,
    y: labelY(f.v, true),
    xref: 'x',
    yref: 'y',
    text: `${f.t} ${usd(f.v)}`,
    showarrow: false,
    xanchor: 'left',
    xshift: 4,
    yshift: shift.get(f.t) ?? 0,
    font: { color: COLOR[f.t], size: 9 },
  }));

  const chart: Chart = createChart(chartEl, {
    data: traces,
    layout: {
      title: { text: narrow ? '' : `Growth of $10,000 since ${fmtDate(COMMON_START)}` },
      hovermode: 'x unified',
      margin: { r: narrow ? 64 : 96 },
      legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom' },
      xaxis: { type: 'date' },
      yaxis: {
        type: 'log',
        title: { text: 'Value (USD, log scale)' },
        tickprefix: '$',
        tickformat: '~s',
      },
      annotations: ends,
    },
    config: chartConfig(narrow),
  });

  segmented(
    toolbar,
    'Y axis',
    [
      { value: 'log', text: 'Log' },
      { value: 'linear', text: 'Linear' },
    ],
    (value) => {
      const log = value === 'log';
      const update: Record<string, unknown> = {
        'yaxis.type': value,
        'yaxis.autorange': true,
        'yaxis.title.text': log ? 'Value (USD, log scale)' : 'Value (USD)',
      };
      finals.forEach((f, i) => {
        update[`annotations[${i}].y`] = labelY(f.v, log);
      });
      void chart.relayout(update);
    },
    'log',
  );

  return {
    ready: settled(chart),
    renderer: chart.three.renderer,
    dispose: () => {
      chart.destroy();
      dispose();
    },
  };
}
