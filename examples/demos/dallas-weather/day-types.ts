import { createChart, type Chart, type ParcatsTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { N, PRCP, SEASON_COLOR, SEASONS, TMAX, TMIN } from './analysis.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';
import { seasonOfDay } from './wind-seasons.mts';

/**
 * Every day of the record sorted three ways at once, as parallel categories (`parcats`): its
 * season, how warm its high was (six bands from freezing to 100 °F and up) and whether it rained
 * (0.01 in or more). A ribbon is the group of days that share all three, as wide as the number of
 * days in it. Ribbons are colored by season (`line.color` mapped through a four-step
 * `line.colorscale`), the axes keep a fixed order (`categoryarray`), and hover follows the color
 * (`hoveron: 'color'`), counting the days of that season in a band.
 *
 * Summer is almost entirely hot and dry, winter spreads over four bands, and rain falls on
 * about one day in five, mostly on cool and warm days.
 */
export const meta: ExampleMeta = {
  title: 'Dallas weather: what kind of day it was',
  description:
    'Parallel categories of every day at Dallas Love Field since 1939: season, how warm the high was, and dry or rain.',
  tags: ['demo', 'parcats', 'categorical', 'colorscale', 'categoryarray', 'hover'],
  size: { width: 960, height: 520 },
  testTolerance: 0.004,
};

/** Bands of the daily high, °F (lower bounds), coldest first. */
const BANDS = [
  { from: -Infinity, name: 'Freezing (32 °F or less)' },
  { from: 33, name: 'Cold (33 to 49)' },
  { from: 50, name: 'Cool (50 to 69)' },
  { from: 70, name: 'Warm (70 to 89)' },
  { from: 90, name: 'Hot (90 to 99)' },
  { from: 100, name: '100 °F and up' },
] as const;
const bandOf = (high: number): number => {
  let k = 0;
  while (k + 1 < BANDS.length && high >= (BANDS[k + 1] as { from: number }).from) k++;
  return k;
};
const WET = ['Dry', 'Rain'] as const;

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const season: string[] = [];
  const seasonIndex: number[] = [];
  const band: string[] = [];
  const wet: string[] = [];
  for (let i = 0; i < N; i++) {
    const hi = TMAX[i];
    const lo = TMIN[i];
    const rain = PRCP[i];
    if (hi === null || hi === undefined || lo === null || lo === undefined) continue;
    if (rain === null || rain === undefined) continue;
    const s = seasonOfDay(i);
    season.push(s);
    seasonIndex.push(SEASONS.indexOf(s));
    band.push((BANDS[bandOf(hi)] as { name: string }).name);
    wet.push(rain >= 0.01 ? 'Rain' : 'Dry');
  }
  const days = season.length;
  const rainy = wet.filter((w) => w === 'Rain').length;
  const hot = band.filter((b) => b === BANDS[4].name || b === BANDS[5].name).length;

  const trace: ParcatsTrace = {
    type: 'parcats',
    name: 'Days',
    dimensions: [
      { label: 'Season', values: season, categoryarray: [...SEASONS] },
      {
        label: 'High of the day',
        values: band,
        // Hottest at the top.
        categoryarray: BANDS.map((b) => b.name).reverse(),
      },
      { label: 'Rain', values: wet, categoryarray: [...WET] },
    ],
    line: {
      color: seasonIndex,
      cmin: 0,
      cmax: 3,
      colorscale: SEASONS.map((s, k) => [k / 3, SEASON_COLOR[s]] as [number, string]),
      shape: 'hspline',
    },
    hoveron: 'color',
    hoverinfo: 'count+probability',
    arrangement: 'freeform',
    labelfont: { size: narrow ? 10 : 12, color: LOOK.title },
    tickfont: { size: narrow ? 8 : 10, color: LOOK.title },
  };

  const pct = (n: number): string => `${((n / days) * 100).toFixed(0)}%`;
  const chart: Chart = createChart(chartEl, {
    data: [trace],
    layout: {
      title: {
        text: narrow
          ? ''
          : `${days.toLocaleString('en-US')} days: ${pct(hot)} reached 90 °F, ${pct(rainy)} had rain`,
      },
      margin: { t: narrow ? 28 : 64, l: narrow ? 44 : 64, r: narrow ? 44 : 64, b: 24 },
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
