import { createChart, type Chart, type ScatterpolarTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { COMPASS, compassIndex, DATE, fmtDate, SEASON_COLOR, SEASONS, WIND } from './analysis.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';
import { BEARING_NAMES, BEARINGS, spread, windSeason } from './wind-seasons.mts';

/**
 * Every day's fastest wind since April 1997 as one point (about 10,000 `scatterpolar` markers):
 * the angle is the direction the fastest 2-minute wind came from (north at the top, clockwise,
 * compass names from `angularaxis.tickvals` / `ticktext`), the radius its speed in mph, the color
 * the season (`marker.color` per point). The days are drawn in a fixed shuffled order, so no season
 * covers the others.
 *
 * The station reports direction to the nearest 10° and speed in whole knots, so thousands of days
 * share the same spot. Each point is therefore moved by a small fixed amount inside the cell its
 * reading stands for (up to 5° and up to 0.9 mph), the same on every render; hover shows the reading itself.
 * The strongest wind of the record is labelled with its date by a `markers+text` trace.
 */
export const meta: ExampleMeta = {
  title: 'Dallas weather: the fastest wind of every day',
  description:
    'About 10,000 polar markers, one per day since 1997: direction and speed of the fastest 2-minute wind at Dallas Love Field, colored by season.',
  tags: ['demo', 'polar', 'scatterpolar', 'markers', 'many points', 'text'],
  size: { width: 720, height: 560 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  // One trace for all days, in a fixed shuffled order, so no season is drawn on top of the others.
  const days = [...WIND].sort((a, b) => spread(a.i, 2) - spread(b.i, 2));
  const points: ScatterpolarTrace = {
    type: 'scatterpolar',
    mode: 'markers',
    name: 'Days',
    theta: days.map((w) => w.direction + spread(w.i, 0) * 10),
    r: days.map((w) => Math.max(0, w.fastest + spread(w.i, 1) * 1.8)),
    thetaunit: 'degrees',
    customdata: days.map((w) => [
      fmtDate(DATE[w.i] as string),
      w.fastest,
      COMPASS[compassIndex(w.direction)],
      w.direction,
      w.speed,
    ]),
    marker: { color: days.map((w) => SEASON_COLOR[windSeason(w)]), size: 2.5, opacity: 0.45 },
    showlegend: false,
    hovertemplate:
      '%{customdata[0]}<br>fastest wind <b>%{customdata[1]:.0f} mph</b> from the ' +
      '%{customdata[2]} (%{customdata[3]}°)<br>average of the day %{customdata[4]:.1f} mph' +
      '<extra></extra>',
  };
  // Legend entries for the season colors (the points themselves are one trace).
  const keys = SEASONS.map((season): ScatterpolarTrace => ({
    type: 'scatterpolar',
    mode: 'markers',
    name: season,
    theta: [0],
    r: [null],
    marker: { color: SEASON_COLOR[season], size: 8 },
    hoverinfo: 'skip',
  }));

  const top = WIND.reduce((a, b) => (b.fastest > a.fastest ? b : a));
  const peak: ScatterpolarTrace = {
    type: 'scatterpolar',
    mode: 'markers+text',
    name: 'Strongest',
    theta: [top.direction],
    r: [top.fastest],
    thetaunit: 'degrees',
    text: [`${top.fastest.toFixed(0)} mph, ${fmtDate(DATE[top.i] as string)}`],
    textposition: 'middle right',
    textfont: { size: 11, color: LOOK.title },
    marker: {
      color: 'rgba(0, 0, 0, 0)',
      size: 11,
      line: { color: LOOK.title, width: 1.5 },
    },
    showlegend: false,
    hoverinfo: 'skip',
    cliponaxis: false,
  };

  const rmax = Math.ceil((top.fastest + 1) / 10) * 10;
  const chart: Chart = createChart(chartEl, {
    data: [points, ...keys, peak],
    layout: {
      title: {
        text: narrow
          ? ''
          : `The fastest wind of each of ${WIND.length.toLocaleString('en-US')} days, by direction and speed`,
      },
      hovermode: 'closest',
      legend: { orientation: 'v', x: 1, xanchor: 'right', y: 1, yanchor: 'top' },
      margin: { t: 64, b: 36, l: 24, r: 24 },
      polar: {
        domain: { x: [0, 0.86], y: [0, 1] },
        angularaxis: {
          direction: 'clockwise',
          rotation: 90,
          tickmode: 'array',
          tickvals: BEARINGS,
          ticktext: BEARING_NAMES,
        },
        radialaxis: {
          range: [0, rmax],
          tickmode: 'array',
          tickvals: [20, 40, 60],
          ticksuffix: ' mph',
          angle: 0,
          tickfont: { size: 9 },
        },
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
