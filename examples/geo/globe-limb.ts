import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/geo';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Clipping at the edge of a globe (backlog GEO5): an orthographic map shows one hemisphere, and
 * everything is cut at its edge, the limb. The orbit is a `scattergeo` line once around the
 * Earth: it runs to the limb, passes behind the globe and comes back on the other side. The
 * filled region (`fill: 'toself'`) lies half behind the limb and is closed along it, and of the
 * cities only those on the near side are drawn. Land is cut the same way: Asia and the Americas
 * end at the limb with no stray edge across the disc.
 *
 * Drag to turn the globe: what was hidden comes into view.
 */
export const meta: ExampleMeta = {
  title: 'Map: behind the globe',
  description:
    'An orbit, a filled region and cities on an orthographic globe, each cut where the globe hides it.',
  tags: ['geo', 'scattergeo', 'orthographic', 'clipping', 'fill', 'map'],
  size: { width: 640, height: 480 },
  testTolerance: 0.004,
};

const RAD = Math.PI / 180;
/** The inclination of the orbit to the equator, in degrees. */
const INCLINATION = 51.6;

/** A great circle inclined to the equator, crossing it northwards at `node` degrees east. */
function orbit(node: number): { lon: number[]; lat: number[] } {
  const lon: number[] = [];
  const lat: number[] = [];
  for (let step = 0; step <= 180; step++) {
    const u = step * 2 * RAD;
    lat.push(Math.asin(Math.sin(INCLINATION * RAD) * Math.sin(u)) / RAD);
    const east = Math.atan2(Math.cos(INCLINATION * RAD) * Math.sin(u), Math.cos(u)) / RAD + node;
    lon.push(((east + 540) % 360) - 180);
  }
  return { lon, lat };
}

/** City, longitude, latitude: about half of them are on the far side. */
const CITIES: readonly (readonly [string, number, number])[] = [
  ['Lisbon', -9.14, 38.72],
  ['Dakar', -17.47, 14.69],
  ['Recife', -34.88, -8.05],
  ['New York', -74.01, 40.71],
  ['Reykjavik', -21.94, 64.15],
  ['Cairo', 31.24, 30.04],
  ['Cape Town', 18.42, -33.92],
  ['Tokyo', 139.69, 35.69],
  ['Sydney', 151.21, -33.87],
  ['Delhi', 77.21, 28.61],
  ['Honolulu', -157.86, 21.31],
  ['Los Angeles', -118.24, 34.05],
];

export function run(el: HTMLElement): ExampleHandle {
  const track = orbit(-20);
  const chart = createChart(el, {
    data: [
      {
        type: 'scattergeo',
        mode: 'lines',
        name: 'region',
        // A box of 60° by 90°, from the middle of the disc to beyond the limb.
        lon: [20, 20, 50, 80, 110, 110, 80, 50, 20],
        lat: [0, 60, 60, 60, 60, 0, 0, 0, 0],
        fill: 'toself',
        fillcolor: 'rgba(138, 180, 248, 0.25)',
        line: { width: 1, color: '#8ab4f8' },
        hoverinfo: 'skip',
      },
      {
        type: 'scattergeo',
        mode: 'lines',
        name: 'orbit',
        lon: track.lon,
        lat: track.lat,
        line: { width: 1.5, color: '#f6c177' },
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
        marker: { size: 5, color: '#ffffff' },
      },
    ],
    layout: {
      title: { text: 'One hemisphere at a time' },
      showlegend: false,
      geo: {
        fitbounds: false,
        projection: { type: 'orthographic', rotation: { lon: -20, lat: 20 } },
        showocean: true,
        oceancolor: '#0d1b2a',
        lakecolor: '#0d1b2a',
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
