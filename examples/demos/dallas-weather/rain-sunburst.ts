import { createChart, type Chart, type FigureInput, type SunburstTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import {
  NORMAL_FROM,
  NORMAL_TO,
  NORMALS,
  SEASON_COLOR,
  seasonOf,
  SEASONS,
  type MonthNormal,
} from './analysis.mts';
import { monthName } from './rain.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * A normal year's rain split by season and month: a `sunburst` with the year in the center, the
 * four seasons in the first ring and their three months in the second, sized by the 1991–2020
 * average rain (`branchvalues: 'total'`, so a season is exactly the sum of its months). Labels
 * carry inches and the share of the year (`text` with `textinfo: 'text'`), months take their
 * season's color (lighter, `leaf.opacity`), and the order is the calendar's, clockwise from the top (`sort: false`, `rotation: 90`).
 * Click a season to zoom into it. Spring is the wettest season, and no season is truly dry.
 */
export const meta: ExampleMeta = {
  title: 'Dallas weather: a normal year of rain by season and month',
  description:
    'Sunburst of the 1991–2020 average rain: the year in the center, the four seasons, then the months, labelled with inches and percent.',
  tags: ['demo', 'sunburst', 'hierarchical', 'branchvalues', 'text'],
  size: { width: 720, height: 560 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);
  // Whole hundredths of an inch, so the months add up to their season exactly.
  const cents = (n: MonthNormal): number => Math.round(n.rain * 100);
  const total = NORMALS.reduce((a, n) => a + cents(n), 0);
  const share = (v: number): string => `${Math.round((v / total) * 100)}%`;

  const ids = ['Year'];
  const labels = ['Year'];
  const parents = [''];
  const values = [total / 100];
  const colors: string[] = [LOOK.grid];
  const text = [`<b>A normal year</b><br>${(total / 100).toFixed(1)} in`];
  const hover = [`A normal year: <b>${(total / 100).toFixed(1)} in</b> of rain`];
  // The library lays sectors out counterclockwise, so the calendar is fed backwards to read
  // clockwise from the top: December, January, February (winter), then spring, and so on.
  const seasons = [...SEASONS].reverse().map((season) => {
    const months = NORMALS.filter((n) => seasonOf(n.month) === season).sort(
      (a, b) => (b.month % 12) - (a.month % 12),
    );
    return { season, months, sum: months.reduce((a, n) => a + cents(n), 0) };
  });
  for (const s of seasons) {
    ids.push(s.season);
    labels.push(s.season);
    parents.push('Year');
    values.push(s.sum / 100);
    colors.push(SEASON_COLOR[s.season]);
    text.push(`<b>${s.season}</b><br>${(s.sum / 100).toFixed(1)} in · ${share(s.sum)}`);
    hover.push(
      `${s.season} (${s.months.map((n) => n.name).join(', ')})<br>` +
        `<b>${(s.sum / 100).toFixed(1)} in</b>, ${share(s.sum)} of the year`,
    );
    for (const n of s.months) {
      ids.push(n.name);
      labels.push(n.name);
      parents.push(s.season);
      values.push(cents(n) / 100);
      colors.push(SEASON_COLOR[s.season]);
      text.push(`${n.name}<br>${n.rain.toFixed(1)} in<br>${share(cents(n))}`);
      hover.push(
        `${monthName(n.month)}<br><b>${n.rain.toFixed(2)} in</b>, ${share(cents(n))} of the year`,
      );
    }
  }
  const wettest = seasons.reduce((a, b) => (b.sum > a.sum ? b : a));

  const burst = {
    type: 'sunburst',
    name: 'Rain',
    ids,
    labels,
    parents,
    values,
    branchvalues: 'total',
    sort: false,
    rotation: 90,
    marker: { colors, line: { color: LOOK.bg, width: 1.5 } },
    leaf: { opacity: 0.72 },
    text,
    textinfo: 'text',
    hovertext: hover,
    hovertemplate: '%{hovertext}<extra></extra>',
    insidetextorientation: 'horizontal',
    insidetextfont: { color: '#ffffff', size: 11 },
    outsidetextfont: { color: LOOK.title, size: 12 },
  } satisfies SunburstTrace;

  const figure: FigureInput = {
    data: [burst],
    layout: {
      title: {
        text: narrow
          ? ''
          : `Rain of a normal year (${NORMAL_FROM}–${NORMAL_TO}): ${wettest.season.toLowerCase()} brings the most, ${share(wettest.sum)}`,
      },
      margin: { t: narrow ? 10 : 48, l: 10, r: 10, b: 10 },
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
