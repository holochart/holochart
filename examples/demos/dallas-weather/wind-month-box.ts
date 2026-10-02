import { createChart, type BoxTrace, type Chart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import {
  DATE,
  fmtDate,
  MONTH,
  MONTH_NAMES,
  SEASON_COLOR,
  seasonOf,
  WIND,
  WIND_FIRST_DATE,
} from './analysis.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';
import { median } from './wind-seasons.mts';

/**
 * The daily average wind speed by calendar month since April 1997, as 12 `box` plots (about 850
 * days each). Only the outliers are drawn as points (`boxpoints: 'outliers'`), each naming its
 * date on hover (`text`); the boxes are colored by season.
 *
 * Spring is the windy season: the typical day in March and April is about a third windier than
 * in August and September, the calmest months.
 */
export const meta: ExampleMeta = {
  title: 'Dallas weather: wind speed by month',
  description:
    'Box plots of the daily average wind speed at Dallas Love Field for each calendar month since 1997, with outliers.',
  tags: ['demo', 'box', 'outliers', 'statistical', 'categorical', 'hover'],
  size: { width: 960, height: 440 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const byMonth = MONTH_NAMES.map((_, k) => WIND.filter((w) => MONTH[w.i] === k + 1));
  const medians = byMonth.map((days) => median(days.map((w) => w.speed)));
  const windiest = medians.indexOf(Math.max(...medians));
  const calmest = medians.indexOf(Math.min(...medians));

  const traces = byMonth.map((days, k) => {
    const color = SEASON_COLOR[seasonOf(k + 1)];
    return {
      type: 'box',
      name: MONTH_NAMES[k] as string,
      y: days.map((w) => w.speed),
      text: days.map((w) => fmtDate(DATE[w.i] as string)),
      boxpoints: 'outliers',
      width: 0.6,
      line: { color, width: 1.25 },
      fillcolor: `${color}40`,
      marker: { color, size: 3, opacity: 0.55 },
      hoverlabel: { namelength: -1 },
    } satisfies BoxTrace;
  });

  const chart: Chart = createChart(chartEl, {
    data: traces,
    layout: {
      title: {
        text: narrow
          ? ''
          : `Spring is the windy season: a typical ${MONTH_NAMES[windiest]} day averages ` +
            `${(medians[windiest] as number).toFixed(1)} mph, a typical ${MONTH_NAMES[calmest]} day ` +
            `${(medians[calmest] as number).toFixed(1)} mph`,
      },
      hovermode: 'closest',
      showlegend: false,
      xaxis: { type: 'category' },
      yaxis: {
        title: { text: 'Average wind speed of the day (mph)' },
        rangemode: 'tozero',
        hoverformat: '.1f',
      },
      annotations: [
        {
          xref: 'paper',
          yref: 'paper',
          x: 1,
          y: 1,
          xanchor: 'right',
          yanchor: 'top',
          showarrow: false,
          text: `${WIND.length.toLocaleString('en-US')} days since ${fmtDate(WIND_FIRST_DATE)}`,
          font: { size: 10, color: LOOK.tick },
        },
      ],
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
