import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/geo';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Scatter on a map (backlog GEO2, GEO3): `scattergeo` markers at `lon` / `lat` on the default geo
 * subplot (`layout.geo`), a world map in the equirectangular projection. Maps are not in the full
 * bundle: `import '@mk7s/holochart/geo'` adds them. `fitbounds: false` shows the whole world;
 * by default the view fits the data.
 */
export const meta: ExampleMeta = {
  title: 'Map: markers',
  description: 'Cities as markers on a world map, sized by population.',
  tags: ['geo', 'scattergeo', 'markers', 'map'],
  testTolerance: 0.004,
};

/** City, longitude, latitude, metropolitan population in millions. */
const CITIES: readonly (readonly [string, number, number, number])[] = [
  ['Tokyo', 139.69, 35.69, 37.4],
  ['Delhi', 77.21, 28.61, 31.0],
  ['Shanghai', 121.47, 31.23, 27.1],
  ['São Paulo', -46.63, -23.55, 22.0],
  ['Mexico City', -99.13, 19.43, 21.8],
  ['Cairo', 31.24, 30.04, 20.9],
  ['Lagos', 3.38, 6.52, 14.4],
  ['New York', -74.01, 40.71, 18.8],
  ['London', -0.13, 51.51, 9.3],
  ['Sydney', 151.21, -33.87, 5.0],
  ['Johannesburg', 28.05, -26.2, 5.8],
  ['Moscow', 37.62, 55.75, 12.5],
];

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'scattergeo',
        lon: CITIES.map((c) => c[1]),
        lat: CITIES.map((c) => c[2]),
        text: CITIES.map((c) => c[0]),
        mode: 'markers',
        name: 'cities',
        marker: { size: CITIES.map((c) => 4 + Math.sqrt(c[3]) * 2), opacity: 0.85 },
      },
    ],
    layout: {
      title: { text: 'Largest cities' },
      geo: { fitbounds: false, showcountries: true },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
