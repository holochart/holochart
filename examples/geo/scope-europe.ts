import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/geo';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A scoped map (backlog GEO2, GEO5): `scope: 'europe'` shows 30°W to 60°E and 30°N to 85°N in a
 * conic conformal projection, with the countries of Europe only. The box of those ranges is a fan
 * on this projection, as the graticule shows, and the map is clipped to the rectangle around it.
 * So Russia, which goes on to the east, is cut along the straight right edge of the subplot, not
 * along the 60th meridian. Lines and markers are clipped by the same rectangle: the route to
 * Novosibirsk leaves the map at that edge.
 *
 * A scoped map pans and zooms; it does not rotate.
 */
export const meta: ExampleMeta = {
  title: 'Map: scope Europe',
  description:
    'Europe in its conic conformal projection: land, grid and a route cut by the edges of the scope.',
  tags: ['geo', 'scattergeo', 'scope', 'clipping', 'conic', 'map'],
  size: { width: 640, height: 520 },
  testTolerance: 0.004,
};

/** City, longitude, latitude. */
const CITIES: readonly (readonly [string, number, number])[] = [
  ['Lisbon', -9.14, 38.72],
  ['Madrid', -3.7, 40.42],
  ['Paris', 2.35, 48.86],
  ['London', -0.13, 51.51],
  ['Berlin', 13.4, 52.52],
  ['Rome', 12.5, 41.9],
  ['Athens', 23.73, 37.98],
  ['Warsaw', 21.01, 52.23],
  ['Stockholm', 18.07, 59.33],
  ['Helsinki', 24.94, 60.17],
  ['Kyiv', 30.52, 50.45],
  ['Moscow', 37.62, 55.75],
  ['Reykjavik', -21.94, 64.15],
  ['Tromsø', 18.96, 69.65],
];

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'scattergeo',
        mode: 'lines',
        name: 'route',
        // Lisbon to Novosibirsk, which is east of the scope.
        lon: [-9.14, 82.93],
        lat: [38.72, 55.03],
        line: { width: 1.5, dash: 'dash' },
        hoverinfo: 'skip',
      },
      {
        type: 'scattergeo',
        mode: 'markers+text',
        name: 'cities',
        lon: CITIES.map((c) => c[1]),
        lat: CITIES.map((c) => c[2]),
        text: CITIES.map((c) => c[0]),
        textposition: 'top center',
        marker: { size: 5 },
      },
    ],
    layout: {
      title: { text: "scope: 'europe'" },
      showlegend: false,
      geo: {
        scope: 'europe',
        fitbounds: false,
        resolution: 50,
        lonaxis: { showgrid: true, dtick: 10 },
        lataxis: { showgrid: true, dtick: 10 },
      },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
