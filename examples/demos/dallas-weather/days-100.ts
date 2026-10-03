import { createChart, type BarTrace, type Chart, type Figure } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import {
  COLD,
  CURRENT_YEAR,
  FIRST_YEAR,
  fmtDate,
  HOT,
  LAST_DATE,
  LAST_YEAR,
  THIS_YEAR,
  YEARLY,
} from './analysis.mts';
import { mean, withAlpha } from './temperature.mts';
import { chartConfig, frame, isNarrow, LOOK, segmented, settled } from './ui.mts';

/**
 * How many days of each year reached 100 °F, as a `bar` per year since 1940. The year in progress
 * is drawn lighter and hatched (`marker.pattern.shape` as an array, one entry per bar) and
 * labelled "so far"; the three highest years carry their year as a label (`text`,
 * `textposition: 'outside'`); a dotted line (`shapes`) marks the average of the complete years.
 * The "Count" toggle (`chart.react`) switches to freezing nights, lows of 32 °F or less, in blue.
 */
export const meta: ExampleMeta = {
  title: 'Dallas weather: 100-degree days and freezing nights per year',
  description:
    'Bars of the number of days at 100 °F or more in each year since 1940, with the average, the top years labelled and a toggle to freezing nights.',
  tags: ['demo', 'bar', 'pattern', 'text', 'shapes', 'annotations', 'react', 'climate'],
  size: { width: 960, height: 480 },
  testTolerance: 0.004,
};

type Mode = 'hot' | 'freeze';
const TOP = 3;
const ALL = [...YEARLY, THIS_YEAR];

function figure(mode: Mode, narrow: boolean): Figure {
  const color = mode === 'hot' ? HOT : COLD;
  const count = (y: (typeof ALL)[number]): number => (mode === 'hot' ? y.days100 : y.freezeDays);
  const complete = YEARLY.map(count);
  const average = mean(complete);
  const ranked = [...YEARLY].sort((a, b) => count(b) - count(a));
  const top = new Set(ranked.slice(0, TOP).map((y) => y.year));
  const what = mode === 'hot' ? 'days of 100 °F or more' : 'nights of 32 °F or less';

  const bars: BarTrace = {
    type: 'bar',
    x: ALL.map((y) => y.year),
    y: ALL.map(count),
    text: ALL.map((y) =>
      y.year === CURRENT_YEAR ? 'so far' : top.has(y.year) ? String(y.year) : '',
    ),
    textposition: 'outside',
    textfont: { size: 10, color: LOOK.title },
    constraintext: 'none',
    cliponaxis: false,
    marker: {
      color: ALL.map((y) => (y.year === CURRENT_YEAR ? withAlpha(color, 0.55) : color)),
      pattern: { shape: ALL.map((y) => (y.year === CURRENT_YEAR ? '/' : '')), solidity: 0.4 },
    },
    customdata: ALL.map((y) =>
      y.year === CURRENT_YEAR ? ` (through ${fmtDate(LAST_DATE).split(',')[0]})` : '',
    ),
    hovertemplate: `%{x}%{customdata}<br><b>%{y}</b> ${what}<extra></extra>`,
  };

  const first = ranked[0] as (typeof ALL)[number];
  return {
    data: [bars],
    layout: {
      title: {
        text: narrow
          ? ''
          : mode === 'hot'
            ? `Days of 100 °F or more in each year: ${count(first)} in ${first.year}, ${count(THIS_YEAR)} so far in ${CURRENT_YEAR}`
            : `Freezing nights in each year: ${count(first)} in ${first.year}, ${count(THIS_YEAR)} so far in ${CURRENT_YEAR}`,
      },
      showlegend: false,
      bargap: 0.2,
      xaxis: { dtick: 10, range: [FIRST_YEAR - 1, CURRENT_YEAR + 2.5] },
      yaxis: {
        title: { text: mode === 'hot' ? 'Days of 100 °F or more' : 'Nights of 32 °F or less' },
        rangemode: 'tozero',
      },
      shapes: [
        {
          type: 'line',
          xref: 'paper',
          yref: 'y',
          x0: 0,
          x1: 1,
          y0: average,
          y1: average,
          line: { color: LOOK.title, width: 1, dash: 'dot' },
        },
      ],
      annotations: [
        {
          xref: 'paper',
          yref: 'paper',
          x: 0.01,
          y: 0.99,
          xanchor: 'left',
          yanchor: 'top',
          showarrow: false,
          font: { size: 11, color: LOOK.title },
          text: `Dotted line: the ${FIRST_YEAR} to ${LAST_YEAR} average, ${average.toFixed(0)} a year`,
        },
      ],
    },
    config: chartConfig(narrow),
  };
}

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, toolbar, dispose } = frame(el);
  const narrow = isNarrow(el);
  const chart: Chart = createChart(chartEl, figure('hot', narrow));
  segmented<Mode>(
    toolbar,
    'Count',
    [
      { value: 'hot', text: '100 °F days' },
      { value: 'freeze', text: 'Freezing nights' },
    ],
    (value) => void chart.react(figure(value, narrow)),
    'hot',
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
