import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/geo';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Flight routes on the 3D globe (backlog GEO8): on `projection.type: 'globe3d'` the lines of a
 * `scattergeo` trace are arcs that leave the surface at one airport, follow the great circle and
 * come down at the other. An arc is as high as its route is long (`line.lift`, in globe radii
 * per radian of the route), so a long haul stands clear of the globe and a short hop stays low,
 * and a route that leads behind the globe passes behind it. Markers and labels stay on the
 * surface. Drag to turn the globe.
 *
 * The globe and `line.lift` are Holochart's own; Plotly has neither. On a flat projection the
 * same figure draws the routes as great-circle lines (see `scattergeo/great-circles`).
 */
export const meta: ExampleMeta = {
  title: 'Map: flight routes as arcs on a 3D globe',
  description:
    'Flight routes from New York as arcs lifted above a 3D globe, with markers at the airports.',
  tags: ['geo', 'scattergeo', 'lines', 'globe3d', '3d', 'arcs', 'map'],
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
  ['Cairo', 31.41, 30.12],
  ['Miami', -80.29, 25.79],
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
      {
        type: 'scattergeo',
        lon,
        lat,
        mode: 'lines',
        name: 'routes',
        // The height of an arc in its middle: 0.2 globe radii per radian of its route.
        line: { width: 2, color: '#d1495b', lift: 0.2 },
        hoverinfo: 'skip',
      },
      {
        type: 'scattergeo',
        lon: [HUB[0], ...DESTINATIONS.map((d) => d[1])],
        lat: [HUB[1], ...DESTINATIONS.map((d) => d[2])],
        text: ['New York', ...DESTINATIONS.map((d) => d[0])],
        mode: 'markers',
        name: 'airports',
        marker: { size: 7, color: '#1d3557', line: { color: '#ffffff', width: 1 } },
      },
    ],
    layout: {
      title: { text: 'Routes from New York' },
      showlegend: false,
      geo: {
        fitbounds: false,
        // A scale under 1 leaves room around the globe for the arcs that rise past its limb.
        projection: { type: 'globe3d', rotation: { lon: -50, lat: 30 }, scale: 0.9 },
        showocean: true,
        oceancolor: '#dbe9f4',
        landcolor: '#e4dccb',
        lakecolor: '#dbe9f4',
        showcountries: true,
        countrycolor: '#bdb5a2',
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
