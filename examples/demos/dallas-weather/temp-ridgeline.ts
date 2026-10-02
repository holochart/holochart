import { createChart, type Chart, type ViolinTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { FIRST_DATE, LAST_DATE, MONTH, MONTH_NAMES, N, TEMP_SCALE, TMAX } from './analysis.mts';
import { median, scaleColor } from './temperature.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * A ridgeline of the seasons: one horizontal, one-sided `violin` per calendar month
 * (`orientation: 'h'`, `side: 'positive'`), January at the top, each the distribution of every
 * daily high of that month in the whole record. The violins are wider than their row (`width`),
 * so each ridge overlaps the row above, and each is filled with the `TEMP_SCALE` color of its
 * median. Winter ridges are wide and flat (a January day can be 30 °F or 80 °F); summer ridges
 * are narrow and tall (nearly every July day lands in the 90s).
 */
export const meta: ExampleMeta = {
  title: 'Dallas weather: daily highs of each month as a ridgeline',
  description:
    'One-sided horizontal violins of every daily high by calendar month, January to December, colored by the median.',
  tags: ['demo', 'violin', 'ridgeline', 'horizontal', 'statistical', 'distribution'],
  size: { width: 960, height: 560 },
  testTolerance: 0.004,
};

/** Medians from 50 °F to 100 °F span the colorscale. */
const COLOR_FROM = 45;
const COLOR_TO = 100;

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const byMonth = MONTH_NAMES.map((): number[] => []);
  for (let i = 0; i < N; i++) {
    const t = TMAX[i];
    if (t !== null && t !== undefined) byMonth[(MONTH[i] as number) - 1]?.push(t);
  }
  const medians = byMonth.map(median);

  const traces = MONTH_NAMES.map((name, k): ViolinTrace => {
    const highs = byMonth[k] as number[];
    const t = ((medians[k] as number) - COLOR_FROM) / (COLOR_TO - COLOR_FROM);
    return {
      type: 'violin',
      name,
      orientation: 'h',
      side: 'positive',
      x: highs,
      y: highs.map(() => name),
      width: 2.6,
      points: false,
      spanmode: 'hard',
      line: { color: LOOK.title, width: 1 },
      fillcolor: scaleColor(TEMP_SCALE, t, 0.9),
      meanline: { visible: false },
      hoveron: 'violins',
      hoverlabel: { namelength: -1 },
    };
  });

  const jan = byMonth[0] as number[];
  const jul = byMonth[6] as number[];
  const chart: Chart = createChart(chartEl, {
    data: traces,
    layout: {
      title: {
        text: narrow
          ? ''
          : `Every daily high by month, ${FIRST_DATE.slice(0, 4)} to ${LAST_DATE.slice(0, 4)}: winter varies, summer does not`,
      },
      showlegend: false,
      hovermode: 'closest',
      violinmode: 'overlay',
      xaxis: { title: { text: 'Daily high (°F)' }, dtick: 10, range: [10, 115], zeroline: false },
      yaxis: {
        type: 'category',
        categoryorder: 'array',
        categoryarray: [...MONTH_NAMES].reverse(),
        range: [-0.3, 12.6],
        showgrid: false,
      },
      annotations: [
        {
          xref: 'paper',
          yref: 'paper',
          x: 0.01,
          y: 0.5,
          xanchor: 'left',
          yanchor: 'middle',
          align: 'left',
          showarrow: false,
          font: { size: 11, color: LOOK.text },
          text:
            `January highs: ${Math.min(...jan)} to ${Math.max(...jan)} °F, median ${medians[0]?.toFixed(0)} °F<br>` +
            `July highs: ${Math.min(...jul)} to ${Math.max(...jul)} °F, median ${medians[6]?.toFixed(0)} °F`,
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
