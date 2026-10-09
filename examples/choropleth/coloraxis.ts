import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/geo';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A color axis shared by regions and points (backlog GEO4, GEO10): the choropleth and the
 * `scattergeo` markers above it both name `coloraxis: 'coloraxis'`, so `layout.coloraxis` gives
 * them one colorscale, one domain and one colorbar. A marker then reads against its region: a
 * city lighter than its state lies below the state's mean elevation. `fitbounds: 'locations'` (the
 * default) fits the view to the regions and points that are drawn.
 */
export const meta: ExampleMeta = {
  title: 'Choropleth: shared color axis with markers',
  description:
    'Mean elevation of the western US states and the elevation of a city in each, on one color axis.',
  tags: ['geo', 'choropleth', 'scattergeo', 'coloraxis', 'colorbar', 'overlay', 'map'],
  testTolerance: 0.004,
};

/** Postal code, mean elevation of the state in m (approximate, rounded). */
const STATES: readonly (readonly [string, number])[] = [
  ['CO', 2070],
  ['WY', 2040],
  ['UT', 1860],
  ['NM', 1740],
  ['NV', 1680],
  ['ID', 1520],
  ['AZ', 1250],
  ['MT', 1040],
  ['OR', 1010],
  ['CA', 880],
  ['WA', 520],
];

/** City, longitude, latitude, elevation in m. */
const CITIES: readonly (readonly [string, number, number, number])[] = [
  ['Denver', -104.99, 39.74, 1609],
  ['Cheyenne', -104.82, 41.14, 1848],
  ['Salt Lake City', -111.89, 40.76, 1288],
  ['Albuquerque', -106.65, 35.08, 1619],
  ['Las Vegas', -115.14, 36.17, 610],
  ['Boise', -116.2, 43.62, 824],
  ['Phoenix', -112.07, 33.45, 331],
  ['Billings', -108.5, 45.78, 950],
  ['Portland', -122.68, 45.52, 15],
  ['Los Angeles', -118.24, 34.05, 87],
  ['Seattle', -122.33, 47.61, 53],
];

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'choropleth',
        locationmode: 'USA-states',
        locations: STATES.map((s) => s[0]),
        z: STATES.map((s) => s[1]),
        name: 'states',
        coloraxis: 'coloraxis',
        hovertemplate: '%{location}: %{z} m<extra></extra>',
        marker: { line: { color: '#fff', width: 1 } },
      },
      {
        type: 'scattergeo',
        lon: CITIES.map((c) => c[1]),
        lat: CITIES.map((c) => c[2]),
        text: CITIES.map((c) => c[0]),
        mode: 'markers',
        name: 'cities',
        hovertemplate: '%{text}: %{marker.color} m<extra></extra>',
        marker: {
          size: 14,
          color: CITIES.map((c) => c[3]),
          coloraxis: 'coloraxis',
          line: { color: '#fff', width: 1.5 },
        },
      },
    ],
    layout: {
      title: { text: 'Elevation: states and cities' },
      showlegend: false,
      coloraxis: {
        colorscale: 'YlOrBr',
        cmin: 0,
        cmax: 2100,
        colorbar: { title: { text: 'm' } },
      },
      geo: { scope: 'north america' },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
