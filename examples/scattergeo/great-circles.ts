import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/geo';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Lines on a globe (backlog GEO3): `scattergeo` lines follow great circles, so a route between two
 * airports bows towards the pole on a flat map and is the shortest path on the globe. The
 * orthographic projection shows one hemisphere; routes that pass behind it are cut at the edge.
 * Drag the globe to turn it.
 */
export const meta: ExampleMeta = {
  title: 'Map: great-circle routes on a globe',
  description: 'Flight routes from New York as great-circle lines on an orthographic projection.',
  tags: ['geo', 'scattergeo', 'lines', 'orthographic', 'map'],
  testTolerance: 0.004,
};

const HUB = [-73.78, 40.64] as const;
const DESTINATIONS: readonly (readonly [string, number, number])[] = [
  ['London', -0.45, 51.47],
  ['Paris', 2.55, 49.01],
  ['Dakar', -17.49, 14.74],
  ['São Paulo', -46.47, -23.43],
  ['Lima', -77.11, -12.02],
  ['Los Angeles', -118.41, 33.94],
  ['Anchorage', -149.99, 61.17],
  ['Reykjavik', -22.61, 63.99],
  ['Dubai', 55.36, 25.25],
];

export function run(el: HTMLElement): ExampleHandle {
  // One trace of segments: a gap (NaN) after each destination breaks the line there.
  const lon: number[] = [];
  const lat: number[] = [];
  for (const [, x, y] of DESTINATIONS) {
    lon.push(HUB[0], x, NaN);
    lat.push(HUB[1], y, NaN);
  }
  const chart = createChart(el, {
    data: [
      { type: 'scattergeo', lon, lat, mode: 'lines', name: 'routes', line: { width: 1.5 } },
      {
        type: 'scattergeo',
        lon: [HUB[0], ...DESTINATIONS.map((d) => d[1])],
        lat: [HUB[1], ...DESTINATIONS.map((d) => d[2])],
        text: ['New York', ...DESTINATIONS.map((d) => d[0])],
        mode: 'markers',
        name: 'airports',
        marker: { size: 6 },
      },
    ],
    layout: {
      title: { text: 'Routes from New York' },
      geo: {
        fitbounds: false,
        projection: { type: 'orthographic', rotation: { lon: -50, lat: 30 } },
        showocean: true,
        showcountries: true,
        lonaxis: { showgrid: true },
        lataxis: { showgrid: true },
      },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
