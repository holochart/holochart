import { createChart, type Chart, type LayoutAnnotation, type ViolinTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { CORE, dailyReturns, HALVES, LABEL, PERIODS, type Fund } from './analysis.mts';
import { chartConfig, frame, isNarrow, LOOK, rgba, segmented, settled } from './ui.mts';

/**
 * Daily returns of SPY, QQQ, DIA and IWM as split violins: one `violin` trace per half at the same
 * fund categories, the first half (teal) on the `negative` (left) side and the second (amber) on
 * the `positive` (right) side (`violinmode: 'overlay'`, one `scalegroup` so all eight halves
 * compare), each with a narrow inner box (`box.visible`: quartiles, median, whiskers) and a
 * `meanline`. Densities stop at the extreme days (`spanmode: 'hard'`).
 *
 * The y axis is clipped to ±5%: 14 of the 4,008 fund-days fall outside it (SPY 3, QQQ 4, DIA 2,
 * IWM 5; four in the first half, ten in the second, most of them in April 2025), and a note counts
 * them. The "Y range" toggle (`chart.relayout({ 'yaxis.range': … })`) shows everything.
 */
export const meta: ExampleMeta = {
  title: 'Index funds: daily returns by fund and half',
  description:
    'Split violins of SPY, QQQ, DIA and IWM daily returns, 2022–24 on the left and 2024–26 on the right, with inner boxes and mean lines.',
  tags: ['demo', 'violin', 'split', 'box', 'meanline', 'statistical', 'relayout', 'financial'],
  size: { width: 960, height: 460 },
  testTolerance: 0.004,
};

/** The clipped y range, in percent. */
const CLIP = 5;

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, toolbar, dispose } = frame(el);
  const narrow = isNarrow(el);
  const category = (t: Fund): string => (narrow ? t : `${t} · ${LABEL[t]}`);

  const traces = HALVES.map((half): ViolinTrace => {
    const x: string[] = [];
    const y: number[] = [];
    const text: string[] = [];
    for (const t of CORE) {
      const { dates, r } = dailyReturns(t, half);
      r.forEach((v, i) => {
        x.push(category(t));
        y.push(v * 100);
        text.push(dates[i] as string);
      });
    }
    return {
      type: 'violin',
      name: PERIODS[half].label,
      x,
      y,
      text,
      side: half === 'first' ? 'negative' : 'positive',
      scalegroup: 'daily',
      spanmode: 'hard',
      points: false,
      width: 0.9,
      line: { color: PERIODS[half].color, width: 1.25 },
      fillcolor: rgba(PERIODS[half].color, 0.4),
      box: { visible: true, width: 0.2, fillcolor: 'rgba(10, 10, 15, 0.35)' },
      meanline: { visible: true, color: LOOK.title, width: 1 },
      hoveron: 'violins',
    };
  });

  const outside = CORE.map((t) => dailyReturns(t).r.filter((v) => Math.abs(v * 100) > CLIP).length);
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
    text:
      `Beyond ±${CLIP}%, not shown: ` +
      CORE.map((t, k) => `${t} ${outside[k]} ${outside[k] === 1 ? 'day' : 'days'}`).join(' · '),
  };

  const chart: Chart = createChart(chartEl, {
    data: traces,
    layout: {
      title: { text: narrow ? '' : 'Daily returns: 2022–24 (left) and 2024–26 (right)' },
      violinmode: 'overlay',
      violingap: 0.1,
      hovermode: 'closest',
      legend: { orientation: 'h', x: 1, xanchor: 'right', y: 1.02, yanchor: 'bottom' },
      xaxis: { type: 'category', tickangle: 0, range: [-0.5, CORE.length - 0.5] },
      yaxis: {
        title: { text: 'Daily return' },
        ticksuffix: '%',
        hoverformat: '+.2f',
        range: [-CLIP, CLIP],
        dtick: 1,
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
        'yaxis.dtick': clip ? 1 : 2,
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
