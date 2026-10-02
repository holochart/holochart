import {
  createChart,
  type Chart,
  type HistogramTrace,
  type LayoutAnnotation,
  type LayoutShape,
} from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { COLD, HOT, N, TMAX, YEAR, YEARS } from './analysis.mts';
import { chartConfig, frame, isNarrow, settled } from './ui.mts';

/**
 * The distribution of all daily highs in two periods, the first 30 complete years of the record
 * and the last 30, as two overlaid `histogram` traces in 2 °F bins (`xbins`), each as a percent of
 * its own days (`histnorm: 'percent'`, `barmode: 'overlay'`, translucent bars). Dashed `shapes`
 * mark each period's mean.
 *
 * Both periods have the same shape, a long tail of cold days and a peak in the 90s, but the
 * recent one sits further right: fewer cool days, more days in the upper 90s and above.
 */
export const meta: ExampleMeta = {
  title: 'Dallas weather: daily highs then and now',
  description:
    'Overlaid histograms of the daily high at Dallas Love Field in the first and the last 30 complete years of the record, in 2 °F bins, with the means.',
  tags: ['demo', 'histogram', 'overlay', 'histnorm', 'statistical', 'shapes', 'annotations'],
  size: { width: 960, height: 440 },
  testTolerance: 0.004,
};

const SPAN = 30;

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const first = YEARS[0] as number;
  const last = YEARS[YEARS.length - 1] as number;
  const highs = (from: number, to: number): number[] => {
    const out: number[] = [];
    for (let i = 0; i < N; i++) {
      const t = TMAX[i];
      const y = YEAR[i] as number;
      if (t !== null && t !== undefined && y >= from && y <= to) out.push(t);
    }
    return out;
  };
  const periods = [
    { from: first, to: first + SPAN - 1, color: COLD },
    { from: last - SPAN + 1, to: last, color: HOT },
  ].map((p) => {
    const values = highs(p.from, p.to);
    return {
      ...p,
      name: `${p.from}–${p.to}`,
      values,
      mean: values.reduce((a, b) => a + b, 0) / values.length,
    };
  });
  const all = periods.flatMap((p) => p.values);
  // Bin edges on half degrees, so each 2 °F bin holds two whole-degree readings.
  const start = Math.floor(Math.min(...all) / 2) * 2 - 0.5;
  const end = Math.ceil(Math.max(...all) / 2) * 2 + 1.5;

  const traces = periods.map((p): HistogramTrace => ({
    type: 'histogram',
    name: p.name,
    x: p.values,
    xbins: { start, end, size: 2 },
    histnorm: 'percent',
    marker: { color: p.color, opacity: 0.55, line: { color: p.color, width: 1 } },
    hovertemplate: `${p.name}<br>highs near %{x:.0f} °F: <b>%{y:.1f}%</b> of days<extra></extra>`,
  }));
  const [early, late] = periods as [(typeof periods)[number], (typeof periods)[number]];
  const shapes = periods.map((p): LayoutShape => ({
    type: 'line',
    yref: 'paper',
    x0: p.mean,
    x1: p.mean,
    y0: 0,
    y1: 1,
    line: { color: p.color, width: 1.5, dash: 'dash' },
  }));
  const note = (p: (typeof periods)[number], left: boolean): LayoutAnnotation => ({
    yref: 'paper',
    x: p.mean,
    y: 1,
    xanchor: left ? 'right' : 'left',
    yanchor: 'top',
    xshift: left ? -6 : 6,
    showarrow: false,
    align: left ? 'right' : 'left',
    text: `${p.name}<br>mean high ${p.mean.toFixed(1)} °F`,
    font: { size: 10, color: p.color },
  });

  const chart: Chart = createChart(chartEl, {
    data: traces,
    layout: {
      title: {
        text: narrow
          ? ''
          : `The average daily high rose ${(late.mean - early.mean).toFixed(1)} °F between ${early.name} and ${late.name}`,
      },
      barmode: 'overlay',
      bargap: 0,
      legend: { orientation: 'h', x: 0, xanchor: 'left', y: 1.02, yanchor: 'bottom' },
      xaxis: { title: { text: 'High of the day (°F)' }, range: [start, end], dtick: 10 },
      yaxis: { title: { text: 'Share of days' }, ticksuffix: '%', hoverformat: '.1f' },
      shapes,
      annotations: [note(early, true), note(late, false)],
    },
    config: chartConfig(narrow),
  });

  return {
    ready: settled(chart),
    renderer: chart.three.renderer,
    dispose: () => {
      chart.destroy();
      dispose();
    },
  };
}
