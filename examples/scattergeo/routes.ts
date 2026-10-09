import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/geo';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Routes on a flat map (backlog GEO3, GEO5, GEO10): `mode: 'lines+markers'` joins the points of a
 * trace along great circles, which a flat projection draws as curves. The map is turned to the
 * Pacific (`projection.rotation.lon`), so the route from Tokyo to San Francisco is one line; the
 * polar route from London to Tokyo crosses the edge of the map and is cut there, to go on at the
 * other side. One trace per route gives each a legend entry and a color.
 */
export const meta: ExampleMeta = {
  title: 'Map: routes with stops',
  description: 'Multi-stop routes as great-circle lines with markers on a flat world map.',
  tags: ['geo', 'scattergeo', 'lines', 'markers', 'great-circle', 'antimeridian', 'map'],
  testTolerance: 0.004,
};

/** A route's name and its stops: city, longitude, latitude. */
const ROUTES: readonly (readonly [string, readonly (readonly [string, number, number])[]])[] = [
  [
    'Pacific',
    [
      ['Singapore', 103.99, 1.36],
      ['Tokyo', 139.78, 35.55],
      ['San Francisco', -122.38, 37.62],
      ['New York', -73.78, 40.64],
    ],
  ],
  [
    'Southern',
    [
      ['Sydney', 151.18, -33.94],
      ['Auckland', 174.79, -37.01],
      ['Santiago', -70.79, -33.39],
      ['São Paulo', -46.47, -23.43],
    ],
  ],
  [
    'Polar',
    [
      ['London', -0.45, 51.47],
      ['Tokyo', 139.78, 35.55],
    ],
  ],
];

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: ROUTES.map(([name, stops]) => ({
      type: 'scattergeo' as const,
      lon: stops.map((s) => s[1]),
      lat: stops.map((s) => s[2]),
      text: stops.map((s) => s[0]),
      mode: 'lines+markers' as const,
      name,
      line: { width: 2 },
      marker: { size: 7 },
    })),
    layout: {
      title: { text: 'Routes with stops' },
      geo: {
        fitbounds: false,
        projection: { type: 'equirectangular', rotation: { lon: -150 } },
        showcountries: true,
        lataxis: { range: [-60, 80] },
      },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
