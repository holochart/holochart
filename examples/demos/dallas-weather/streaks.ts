import { createChart, type BarTrace, type Chart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { CURRENT_YEAR, fmtDate, HOT, WARM } from './analysis.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';
import { fmtDay, hotStreaks } from './years-events.mts';

/**
 * The longest heat waves: for each year, its longest run of consecutive days at or above 100 °F,
 * and the fifteen longest of those (runs of five days or more) as horizontal bars
 * (`orientation: 'h'`), longest at the top (`yaxis.autorange: 'reversed'` on a category axis).
 * Each bar is labelled with its length and the day it began (`text`, `textposition: 'outside'`);
 * equal lengths are listed in year order. The two longest are drawn in the strong red, and the
 * year in progress is marked "so far".
 */
export const meta: ExampleMeta = {
  title: 'Dallas weather: the longest runs of 100 °F days',
  description:
    'A horizontal bar chart of the fifteen longest runs of consecutive days at or above 100 °F at Dallas Love Field, one per year, labelled with length and start date.',
  tags: ['demo', 'bar', 'horizontal', 'categorical', 'text', 'ranking'],
  size: { width: 960, height: 520 },
  testTolerance: 0.004,
};

const TOP = 15;
const MIN_DAYS = 5;

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const top = hotStreaks()
    .filter((s) => s.length >= MIN_DAYS)
    .sort((a, b) => b.length - a.length || a.year - b.year)
    .slice(0, TOP);
  const [first, second] = top as [(typeof top)[number], (typeof top)[number]];
  const yearLabel = (year: number): string =>
    year === CURRENT_YEAR ? `${year} so far` : String(year);

  const bars: BarTrace = {
    type: 'bar',
    orientation: 'h',
    y: top.map((s) => yearLabel(s.year)),
    x: top.map((s) => s.length),
    text: top.map((s) =>
      narrow
        ? `${s.length}, ${fmtDay(s.startDate)}`
        : `${s.length} days from ${fmtDay(s.startDate)}`,
    ),
    textposition: 'outside',
    textfont: { size: narrow ? 9 : 11, color: LOOK.title },
    cliponaxis: false,
    customdata: top.map((s) => fmtDate(s.startDate)),
    marker: { color: top.map((_, k) => (k < 2 ? HOT : WARM)) },
    hovertemplate:
      '<b>%{y}</b><br>%{x} days in a row at 100 °F or more<br>starting %{customdata}<extra></extra>',
  };

  const chart: Chart = createChart(chartEl, {
    data: [bars],
    layout: {
      title: {
        text: narrow
          ? ''
          : `The longest runs of 100 °F days: ${first.length} in a row in ${first.year}, ${second.length} in ${second.year}`,
      },
      showlegend: false,
      hovermode: 'closest',
      bargap: 0.3,
      margin: { l: narrow ? 72 : 88, r: 24, t: narrow ? 16 : 64 },
      xaxis: {
        title: { text: 'Consecutive days with a high of 100 °F or more' },
        range: [0, first.length * (narrow ? 1.45 : 1.25)],
        fixedrange: true,
      },
      yaxis: {
        type: 'category',
        autorange: 'reversed',
        ticksuffix: ' ',
        tickfont: { size: narrow ? 10 : 12, color: LOOK.text },
        fixedrange: true,
      },
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
