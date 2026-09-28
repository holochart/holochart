import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * The colorblind-safe `Safe` palette (plan E17.5; CARTO's, plotly.py's
 * `px.colors.qualitative.Safe`): `layout.colorway: 'Safe'` names it, in every bundle. Its colors
 * stay distinguishable with the common color-vision deficiencies; they are not all high-contrast
 * against the background, so lines here are 2.5 px with markers.
 */
export const meta: ExampleMeta = {
  title: 'Accessibility: Safe palette',
  description:
    "Six series with layout.colorway: 'Safe', the colorblind-safe qualitative palette, as lines with markers.",
  tags: ['a11y', 'palette', 'colorway', 'line'],
};

const YEARS = [2019, 2020, 2021, 2022, 2023, 2024];
const SERIES: [string, number[]][] = [
  ['Solar', [3, 4, 6, 8, 11, 14]],
  ['Wind', [6, 7, 8, 9, 10, 11]],
  ['Hydro', [9, 9, 8.5, 8.8, 8.6, 8.7]],
  ['Nuclear', [7, 6.8, 6.6, 6.2, 6, 5.8]],
  ['Gas', [12, 11.5, 12.5, 11, 10, 9]],
  ['Coal', [10, 8, 8.5, 7, 5, 3.5]],
];

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: SERIES.map(([name, y]) => ({
      type: 'scatter',
      mode: 'lines+markers',
      name,
      x: YEARS,
      y,
      line: { width: 2.5 },
      marker: { size: 7 },
    })),
    layout: {
      title: { text: 'Electricity by source (TWh)' },
      colorway: 'Safe',
      xaxis: { dtick: 1 },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
