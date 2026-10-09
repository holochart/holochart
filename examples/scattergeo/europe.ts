import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/geo';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A scoped map with text labels (backlog GEO2, GEO3, GEO10): `scope: 'europe'` draws the countries
 * of one continent in the scope's own projection (conic conformal) with their borders, and
 * `mode: 'markers+text'` writes each point's `text` beside its marker (`textposition`). Scoped
 * maps pan and zoom; they do not rotate. `resolution: 50` draws the finer base map, which a map
 * of one continent shows.
 */
export const meta: ExampleMeta = {
  title: 'Map: Europe with labels',
  description: 'Capitals as labelled markers on the scoped map of Europe, at the 50m resolution.',
  tags: ['geo', 'scattergeo', 'markers', 'text', 'scope', 'europe', 'map'],
  testTolerance: 0.004,
};

/** Capital, longitude, latitude, where its label goes. */
const CAPITALS: readonly (readonly [string, number, number, 'top center' | 'bottom center'])[] = [
  ['Lisbon', -9.14, 38.72, 'top center'],
  ['Madrid', -3.7, 40.42, 'top center'],
  ['Paris', 2.35, 48.86, 'bottom center'],
  ['London', -0.13, 51.51, 'top center'],
  ['Dublin', -6.26, 53.35, 'top center'],
  ['Berlin', 13.4, 52.52, 'top center'],
  ['Rome', 12.5, 41.9, 'bottom center'],
  ['Vienna', 16.37, 48.21, 'bottom center'],
  ['Warsaw', 21.01, 52.23, 'top center'],
  ['Stockholm', 18.07, 59.33, 'bottom center'],
  ['Oslo', 10.75, 59.91, 'top center'],
  ['Helsinki', 24.94, 60.17, 'top center'],
  ['Athens', 23.73, 37.98, 'bottom center'],
  ['Bucharest', 26.1, 44.43, 'bottom center'],
  ['Kyiv', 30.52, 50.45, 'top center'],
  ['Reykjavik', -21.94, 64.15, 'bottom center'],
];

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'scattergeo',
        lon: CAPITALS.map((c) => c[1]),
        lat: CAPITALS.map((c) => c[2]),
        text: CAPITALS.map((c) => c[0]),
        mode: 'markers+text',
        textposition: CAPITALS.map((c) => c[3]),
        textfont: { size: 11 },
        name: 'capitals',
        marker: { size: 6 },
      },
    ],
    layout: {
      title: { text: 'Capitals of Europe' },
      geo: {
        scope: 'europe',
        resolution: 50,
        fitbounds: false,
        lonaxis: { range: [-25, 40] },
        lataxis: { range: [34, 70] },
      },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
