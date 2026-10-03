import { createChart, type Chart, type FigureInput, type FunnelTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { DATE, fmtDate, LAST_DATE, N, PRCP } from './analysis.mts';
import { count } from './rain.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * How rare a heavy rain is: out of every day with a rain reading, how many had any rain, then at
 * least 0.1, 0.5, 1, 2 and 4 inches, as a `funnel` (each stage is a subset of the one above). The
 * bar text (`text` with `textinfo: 'text'`) gives the number of days and the odds, "1 day in N";
 * hover adds the share of all days and of the stage above (`%{percentInitial}`,
 * `%{percentPrevious}`). Stages take shades of blue (`marker.color` per stage).
 */
export const meta: ExampleMeta = {
  title: 'Dallas weather: how rare is a heavy rain',
  description:
    'Funnel of days by daily rain amount since 1939: all days, days with any rain, and days with at least 0.1, 0.5, 1, 2 and 4 inches.',
  tags: ['demo', 'funnel', 'text', 'textinfo', 'hover'],
  size: { width: 960, height: 460 },
  testTolerance: 0.004,
};

const LEVELS = [0.01, 0.1, 0.5, 1, 2, 4];
/** Blues from light rain to downpour, readable against the dark page and under white text. */
const STAGE_COLORS = ['#3d4257', '#1f5c8f', '#2478a8', '#2f93bd', '#3aa0c8', '#62bedb', '#9fdcf0'];

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);
  let days = 0;
  const reached = LEVELS.map(() => 0);
  for (let i = 0; i < N; i++) {
    const p = PRCP[i];
    if (p === null || p === undefined) continue;
    days++;
    LEVELS.forEach((level, k) => {
      if (p >= level) reached[k]!++;
    });
  }
  const stages = [
    'All days with a reading',
    'Any rain (0.01 in or more)',
    ...LEVELS.slice(1).map((level) => `${level} in or more`),
  ];
  const counts = [days, ...reached];
  const oneIn = (n: number): string => {
    const every = days / n;
    return `1 day in ${every < 10 ? every.toFixed(1) : count(Math.round(every))}`;
  };
  const perYear = (n: number): string => {
    const v = (n / days) * 365.25;
    return v >= 10 ? v.toFixed(0) : v.toFixed(1);
  };
  const last = counts[counts.length - 1]!;

  const funnel = {
    type: 'funnel',
    name: 'Days',
    y: stages,
    x: counts,
    text: counts.map((n, k) => (k === 0 ? `${count(n)} days` : `${count(n)} days · ${oneIn(n)}`)),
    textinfo: 'text',
    textposition: counts.map((n) => (n / days > 0.25 ? 'inside' : 'outside')),
    insidetextfont: { color: '#ffffff', size: 12 },
    outsidetextfont: { color: LOOK.title, size: 11 },
    customdata: counts.map((n) => perYear(n)),
    hovertemplate:
      '%{y}<br><b>%{x:,} days</b>, about %{customdata} a year<br>' +
      '%{percentInitial:.1%} of all days, %{percentPrevious:.0%} of the stage above<extra></extra>',
    marker: { color: STAGE_COLORS, line: { width: 0 } },
    connector: { fillcolor: 'rgba(58, 160, 200, 0.12)', line: { width: 0 } },
  } satisfies FunnelTrace;

  const figure: FigureInput = {
    data: [funnel],
    layout: {
      title: {
        text: narrow
          ? ''
          : `It rains on ${oneIn(reached[0]!).replace('1 day', 'about 1 day')} in Dallas; ${LEVELS[LEVELS.length - 1]} inches in a day has happened ${count(last)} times since ${DATE[0]!.slice(0, 4)}`,
      },
      showlegend: false,
      funnelgap: 0.18,
      margin: { l: narrow ? 120 : 170, r: 24, b: 40 },
      xaxis: { visible: false },
      yaxis: { tickfont: { size: 11 } },
      annotations: [
        {
          xref: 'paper',
          yref: 'paper',
          x: 1,
          y: 0,
          xanchor: 'right',
          yanchor: 'top',
          yshift: -10,
          showarrow: false,
          text: `Daily rain at Dallas Love Field, ${fmtDate(DATE[0] as string)} to ${fmtDate(LAST_DATE)}`,
          font: { size: 10, color: LOOK.tick },
        },
      ],
    },
    config: chartConfig(narrow),
  };
  const chart: Chart = createChart(chartEl, figure);

  return {
    ready: settled(chart),
    renderer: chart.three.renderer,
    dispose: () => {
      chart.destroy();
      dispose();
    },
  };
}
