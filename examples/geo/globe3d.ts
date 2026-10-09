import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/geo';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A 3D globe (backlog GEO8): `projection.type: 'globe3d'` is the orthographic map drawn as a lit
 * sphere. The ocean is the sphere itself, land and lakes are meshes on it, and the countries, the
 * coastlines and the graticule are lines just above its surface, hidden where the globe is in the
 * way. The view is the orthographic one: `projection.rotation` and `projection.scale` say where
 * the globe is turned and how large it is, and a figure switches between `'orthographic'` and
 * `'globe3d'` by changing the type alone.
 *
 * Drag to turn the globe and use the wheel to zoom: turning moves one matrix, so nothing is
 * projected again, at any resolution. The cities are `scattergeo` markers; those on the far side
 * are not drawn.
 */
export const meta: ExampleMeta = {
  title: 'Map: 3D globe',
  description:
    'A lit globe with land, ocean, countries and a graticule as sphere meshes and 3D lines, and cities on it.',
  tags: ['geo', 'scattergeo', 'globe3d', 'globe', '3d', 'map'],
  size: { width: 640, height: 480 },
  testTolerance: 0.004,
};

/** City, longitude, latitude: some of them are on the far side. */
const CITIES: readonly (readonly [string, number, number])[] = [
  ['Lisbon', -9.14, 38.72],
  ['Lagos', 3.38, 6.52],
  ['Cairo', 31.24, 30.04],
  ['Cape Town', 18.42, -33.92],
  ['Reykjavik', -21.94, 64.15],
  ['Moscow', 37.62, 55.76],
  ['Delhi', 77.21, 28.61],
  ['Recife', -34.88, -8.05],
  ['Nairobi', 36.82, -1.29],
  ['Lima', -77.04, -12.05],
  ['Tokyo', 139.69, 35.69],
  ['Sydney', 151.21, -33.87],
];

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'scattergeo',
        mode: 'markers+text',
        name: 'cities',
        lon: CITIES.map((c) => c[1]),
        lat: CITIES.map((c) => c[2]),
        text: CITIES.map((c) => c[0]),
        textposition: 'top center',
        textfont: { size: 11, color: '#1f2933' },
        marker: { size: 7, color: '#d1495b', line: { color: '#ffffff', width: 1 } },
      },
    ],
    layout: {
      title: { text: 'A globe that turns by a matrix' },
      showlegend: false,
      dragmode: 'pan',
      margin: { l: 20, r: 20, t: 60, b: 20 },
      geo: {
        fitbounds: false,
        projection: { type: 'globe3d', rotation: { lon: 25, lat: 25 } },
        showocean: true,
        oceancolor: '#a9cbe6',
        showland: true,
        landcolor: '#e6dcc3',
        showlakes: true,
        lakecolor: '#a9cbe6',
        showcountries: true,
        countrycolor: '#9a8f78',
        countrywidth: 0.6,
        showcoastlines: true,
        coastlinecolor: '#6f6652',
        coastlinewidth: 1,
        showframe: true,
        framecolor: '#52606d',
        framewidth: 1,
        lonaxis: { showgrid: true, dtick: 15, gridcolor: 'rgba(255, 255, 255, 0.55)' },
        lataxis: { showgrid: true, dtick: 15, gridcolor: 'rgba(255, 255, 255, 0.55)' },
      },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
