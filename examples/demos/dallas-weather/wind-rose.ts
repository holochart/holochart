import { createChart, type BarpolarTrace, type Chart, type Figure } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { COMPASS, MONTH_NAMES, SEASONS, WIND, WIND_FIRST_DATE, type Season } from './analysis.mts';
import { chartConfig, frame, isNarrow, LOOK, segmented, settled } from './ui.mts';
import { windSeason } from './wind-seasons.mts';

/**
 * The wind rose of Dallas Love Field: for each of the 16 compass points, the share of days whose
 * fastest 2-minute wind came from that direction, stacked outward by the speed of that wind
 * (`barpolar` traces, one per speed class, `polar.barmode: 'stack'`) on a compass axis with north
 * at the top (`angularaxis.direction: 'clockwise'`, `rotation: 90`). The "Season" toggle redraws
 * the rose for one season with `chart.react(…)`; the radial range stays the same, so the roses
 * can be compared.
 *
 * The station reports direction to the nearest 10°, which does not divide evenly into 22.5°
 * sectors (N, E, S and W would collect three readings, the others two), so each reading is spread
 * over the 10° it stands for and shared between the sectors it overlaps.
 *
 * South and south-east winds dominate all year. North winds, behind cold fronts, are the second
 * group, and the strongest in winter.
 */
export const meta: ExampleMeta = {
  title: 'Dallas weather: wind rose',
  description:
    'Share of days by the direction and speed of the fastest wind at Dallas Love Field since 1997, as a stacked polar bar chart with a season toggle.',
  tags: ['demo', 'polar', 'barpolar', 'stack', 'wind rose', 'react'],
  size: { width: 720, height: 560 },
  testTolerance: 0.004,
};

type View = 'All year' | Season;
const VIEWS: readonly View[] = ['All year', ...SEASONS];

/** Speed classes of the day's fastest 2-minute wind, mph (lower bounds). */
const CLASSES = [
  { from: 0, name: 'Under 15 mph', color: '#5468c4' },
  { from: 15, name: '15 to 20', color: '#3aa0c8' },
  { from: 20, name: '20 to 25', color: '#e3d27a' },
  { from: 25, name: '25 to 30', color: '#e8833a' },
  { from: 30, name: '30 mph and up', color: '#ea2a37' },
] as const;
const classOf = (mph: number): number => {
  let k = 0;
  while (k + 1 < CLASSES.length && mph >= (CLASSES[k + 1] as { from: number }).from) k++;
  return k;
};

/** Sectors a direction reading (to the nearest 10°) falls in, with the share of it in each. */
function sectors(degrees: number): [number, number][] {
  const lo = degrees - 5;
  const k = Math.floor((lo + 11.25) / 22.5);
  const edge = k * 22.5 + 11.25;
  const first = Math.min(1, (edge - lo) / 10);
  const wrap = (s: number): number => ((s % 16) + 16) % 16;
  return first >= 1
    ? [[wrap(k), 1]]
    : [
        [wrap(k), first],
        [wrap(k + 1), 1 - first],
      ];
}

/** Percent of the view's days in each [class][sector]. */
function rose(view: View): { share: number[][]; days: number } {
  const days = WIND.filter((w) => view === 'All year' || windSeason(w) === view);
  const share = CLASSES.map(() => COMPASS.map(() => 0));
  for (const w of days) {
    const row = share[classOf(w.fastest)] as number[];
    for (const [s, part] of sectors(w.direction)) row[s] = (row[s] as number) + part;
  }
  return { share: share.map((row) => row.map((n) => (n / days.length) * 100)), days: days.length };
}

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, toolbar, dispose } = frame(el);
  const narrow = isNarrow(el);
  const roses = Object.fromEntries(VIEWS.map((v) => [v, rose(v)])) as Record<
    View,
    ReturnType<typeof rose>
  >;
  const total = (v: View, s: number): number =>
    roses[v].share.reduce((a, row) => a + (row[s] as number), 0);
  // One radial range for every view: the longest spoke of any of them, rounded up to 5%.
  const top =
    Math.ceil(Math.max(...VIEWS.flatMap((v) => COMPASS.map((_, s) => total(v, s)))) / 5) * 5;
  const since = `${MONTH_NAMES[Number(WIND_FIRST_DATE.slice(5, 7)) - 1]} ${WIND_FIRST_DATE.slice(0, 4)}`;
  const side = (v: View, names: readonly string[]): number =>
    names.reduce((a, n) => a + total(v, COMPASS.indexOf(n as (typeof COMPASS)[number])), 0);

  const figure = (view: View): Figure => {
    const { share, days } = roses[view];
    const data = CLASSES.map((c, k): BarpolarTrace => ({
      type: 'barpolar',
      name: c.name,
      theta: [...COMPASS],
      r: share[k] as number[],
      customdata: COMPASS.map((_, s) => total(view, s)),
      marker: { color: c.color, line: { color: LOOK.bg, width: 0.5 } },
      hovertemplate:
        `From the %{theta}, ${c.name.toLowerCase()}<br><b>%{r:.1f}%</b> of days ` +
        '(%{customdata:.1f}% from this direction at any speed)<extra></extra>',
    }));
    const south = side(view, ['SE', 'SSE', 'S']);
    const north = side(view, ['NW', 'NNW', 'N', 'NNE']);
    return {
      data,
      layout: {
        title: {
          text: narrow
            ? ''
            : `${view === 'All year' ? 'All year' : view}: from the south to south-east on ${south.toFixed(0)}% of days, ` +
              `from the north on ${north.toFixed(0)}%`,
        },
        legend: {
          orientation: 'v',
          x: 1,
          xanchor: 'right',
          y: 1,
          yanchor: 'top',
          title: { text: 'Fastest wind of the day' },
        },
        margin: { t: 64, b: 36, l: 24, r: 24 },
        polar: {
          barmode: 'stack',
          bargap: 0.06,
          domain: { x: [0, 0.82], y: [0, 1] },
          angularaxis: { type: 'category', direction: 'clockwise', rotation: 90 },
          radialaxis: {
            range: [0, top],
            dtick: 5,
            ticksuffix: '%',
            angle: 0,
            tickfont: { size: 9 },
          },
        },
        annotations: [
          {
            xref: 'paper',
            yref: 'paper',
            x: 1,
            y: 0,
            xanchor: 'right',
            yanchor: 'bottom',
            showarrow: false,
            align: 'right',
            text: `${days.toLocaleString('en-US')} days since ${since}`,
            font: { size: 10, color: LOOK.tick },
          },
        ],
      },
      config: chartConfig(narrow),
    };
  };

  const chart: Chart = createChart(chartEl, figure('All year'));

  segmented<View>(
    toolbar,
    'Season',
    VIEWS.map((v) => ({ value: v, text: v })),
    (value) => void chart.react(figure(value)),
    'All year',
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
