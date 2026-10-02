import { createChart, type Chart, type LayoutAnnotation, type ViolinTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { COLOR, COMMON_RETURNS, FUNDS, LAST_DATE, type Fund } from './analysis.mts';
import { chartConfig, frame, isNarrow, LOOK, segmented, settled } from './ui.mts';

/**
 * Daily returns of TQQQ and SOXL per calendar year as split violins: one `violin` trace per fund
 * at the same year categories, TQQQ on the `negative` (left) side and SOXL on the `positive`
 * (right) side (`violinmode: 'overlay'`, one `scalegroup` so the halves compare), each with a
 * narrow inner box (`box.visible`: quartiles, median, whiskers) and a dashed `meanline`. Densities
 * stop at the extreme days (`spanmode: 'hard'`). 2010 starts on Mar 11 (SOXL's first day) and the
 * current year is year to date.
 *
 * A handful of crash and rebound days (Mar 2020, Apr 2025) reach −39% to +55% and would squash the
 * rest, so the y axis starts at ±20% and a note counts the days outside it; the "Y range" toggle
 * (`chart.relayout({ 'yaxis.range': … })`) shows everything.
 */
export const meta: ExampleMeta = {
  title: 'TQQQ and SOXL: daily returns by year',
  description:
    'Split violins of TQQQ and SOXL daily returns for every calendar year since 2010, with inner boxes and mean lines.',
  tags: ['demo', 'violin', 'split', 'box', 'meanline', 'statistical', 'relayout'],
  size: { width: 960, height: 460 },
  testTolerance: 0.004,
};

/** The clipped y range, in percent. */
const CLIP = 20;

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, toolbar, dispose } = frame(el);
  const narrow = isNarrow(el);
  const thisYear = LAST_DATE.slice(0, 4);
  const yearLabel = (d: string): string =>
    d.startsWith(thisYear) ? `${thisYear} YTD` : d.slice(0, 4);

  const fill: Record<Fund, string> = {
    TQQQ: 'rgba(94, 116, 213, 0.45)',
    SOXL: 'rgba(204, 84, 10, 0.45)',
  };
  const years = new Set(COMMON_RETURNS.TQQQ.dates.map(yearLabel)).size;
  const traces = FUNDS.map((fund): ViolinTrace => {
    const { dates, r } = COMMON_RETURNS[fund];
    return {
      type: 'violin',
      name: fund,
      x: dates.map(yearLabel),
      y: r.map((v) => v * 100),
      text: dates,
      side: fund === 'TQQQ' ? 'negative' : 'positive',
      scalegroup: 'daily',
      spanmode: 'hard',
      points: false,
      width: 0.9,
      line: { color: COLOR[fund], width: 1 },
      fillcolor: fill[fund],
      box: { visible: true, width: 0.3, fillcolor: 'rgba(10, 10, 15, 0.35)' },
      meanline: { visible: true, color: LOOK.title, width: 1 },
      hoveron: 'violins',
    };
  });

  const outside = FUNDS.map(
    (fund) => COMMON_RETURNS[fund].r.filter((v) => Math.abs(v * 100) > CLIP).length,
  );
  const note: LayoutAnnotation = {
    xref: 'paper',
    yref: 'paper',
    x: 0,
    y: 1.02,
    xanchor: 'left',
    yanchor: 'bottom',
    align: 'left',
    showarrow: false,
    font: { size: 10, color: LOOK.text },
    text: `Beyond ±${CLIP}%, not shown: TQQQ ${outside[0]} days · SOXL ${outside[1]} days`,
  };

  const chart: Chart = createChart(chartEl, {
    data: traces,
    layout: {
      title: { text: narrow ? '' : 'Daily returns by calendar year: TQQQ (left) and SOXL (right)' },
      violinmode: 'overlay',
      violingap: 0.1,
      hovermode: 'closest',
      legend: { orientation: 'h', x: 1, xanchor: 'right', y: 1.02, yanchor: 'bottom' },
      xaxis: { type: 'category', tickangle: 0, range: [-0.5, years - 0.5] },
      yaxis: {
        title: { text: 'Daily return' },
        ticksuffix: '%',
        hoverformat: '+.1f',
        range: [-CLIP, CLIP],
        dtick: 5,
        zeroline: true,
      },
      annotations: [note],
    },
    config: chartConfig(narrow),
  });

  segmented(
    toolbar,
    'Y range',
    [
      { value: 'clip', text: `±${CLIP}%` },
      { value: 'full', text: 'All days' },
    ],
    (value) => {
      const clip = value === 'clip';
      void chart.relayout({
        'yaxis.range': clip ? [-CLIP, CLIP] : null,
        'yaxis.autorange': !clip,
        'yaxis.dtick': clip ? 5 : 10,
        'annotations[0].visible': clip,
      });
    },
    'clip',
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
