import { createChart, type BoxTrace, type Chart, type Figure } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { COLD, CURRENT_YEAR, FIRST_YEAR, HOT, MONTH, N, TMAX, TMIN, YEAR } from './analysis.mts';
import { median } from './temperature.mts';
import { chartConfig, frame, isNarrow, LOOK, segmented, settled } from './ui.mts';

/**
 * Summer afternoons and winter nights by decade, as `box` plots: every daily high of July and
 * August (about 620 per decade) in one box per decade, 1940s to 2020s. Only the outliers are
 * drawn as points (`boxpoints: 'outliers'`); the box is the middle half of the days and the line
 * in it the median. The "Show" toggle (`chart.react`) switches to the daily lows of January and
 * February in blue. The annotation compares the first and the latest decade's medians.
 */
export const meta: ExampleMeta = {
  title: 'Dallas weather: summer highs and winter lows by decade',
  description:
    'Box plots of July and August daily highs grouped by decade, 1940s to 2020s, with a toggle to January and February lows.',
  tags: ['demo', 'box', 'outliers', 'statistical', 'category', 'react', 'climate'],
  size: { width: 960, height: 480 },
  testTolerance: 0.004,
};

type Mode = 'summer' | 'winter';

const DECADES: number[] = [];
for (let d = FIRST_YEAR; d <= CURRENT_YEAR; d += 10) DECADES.push(d);

function figure(mode: Mode, narrow: boolean): Figure {
  const summer = mode === 'summer';
  const color = summer ? HOT : COLD;
  const source = summer ? TMAX : TMIN;
  const months = summer ? [7, 8] : [1, 2];
  const groups = DECADES.map((): number[] => []);
  for (let i = 0; i < N; i++) {
    const v = source[i];
    const y = YEAR[i] as number;
    if (v === null || v === undefined || y < FIRST_YEAR) continue;
    if (months.includes(MONTH[i] as number)) groups[Math.floor((y - FIRST_YEAR) / 10)]?.push(v);
  }
  const medians = groups.map(median);
  const traces = DECADES.map((d, k): BoxTrace => ({
    type: 'box',
    name: `${d}s`,
    y: groups[k] as number[],
    boxpoints: 'outliers',
    width: 0.55,
    line: { color, width: 1.25 },
    fillcolor: `${color}40`,
    marker: { color, size: 3, opacity: 0.6 },
    hoverlabel: { namelength: -1 },
  }));
  const all = groups.flat();
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const first = medians[0] as number;
  const last = medians[medians.length - 1] as number;
  const kind = summer ? 'July and August high' : 'January and February low';

  return {
    data: traces,
    layout: {
      title: {
        text: narrow
          ? ''
          : summer
            ? 'Daily highs of July and August, by decade'
            : 'Daily lows of January and February, by decade',
      },
      showlegend: false,
      hovermode: 'closest',
      xaxis: { type: 'category' },
      yaxis: {
        title: { text: summer ? 'Daily high (°F)' : 'Daily low (°F)' },
        hoverformat: '.0f',
        // Headroom above the highest outlier for the annotation.
        range: [lo - (hi - lo) * 0.05, hi + (hi - lo) * 0.16],
        zeroline: false,
      },
      annotations: [
        {
          xref: 'paper',
          yref: 'paper',
          x: 0.01,
          y: 0.98,
          xanchor: 'left',
          yanchor: 'top',
          align: 'left',
          showarrow: false,
          font: { size: 11, color: LOOK.text },
          text:
            `Median ${kind}: ${first.toFixed(0)} °F in the ${DECADES[0]}s, ` +
            `${last.toFixed(0)} °F in the ${DECADES[DECADES.length - 1]}s so far`,
        },
      ],
    },
    config: chartConfig(narrow),
  };
}

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, toolbar, dispose } = frame(el);
  const narrow = isNarrow(el);
  const chart: Chart = createChart(chartEl, figure('summer', narrow));
  segmented<Mode>(
    toolbar,
    'Show',
    [
      { value: 'summer', text: 'Summer highs' },
      { value: 'winter', text: 'Winter lows' },
    ],
    (value) => void chart.react(figure(value, narrow)),
    'summer',
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
