import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/geo';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * The poles (backlog GEO5). Antarctica is a polygon around a pole: its coast goes once around the
 * globe and never reaches 90°S. Seen from below (`rotation.lat: -90` on an orthographic map) it is
 * an island like any other. On a flat world map the projection has to close it along the bottom
 * edge, and it comes out as one piece from side to side, not as a strip with a seam or a fill that
 * covers everything but Antarctica. The Arctic is the opposite case: an ocean around the pole,
 * with Greenland and the Canadian islands cut by nothing.
 *
 * The polar circles are `scattergeo` lines of constant latitude, closed around each pole.
 */
export const meta: ExampleMeta = {
  title: 'Map: the poles',
  description:
    'The Arctic and Antarctica on orthographic maps, and Antarctica along the bottom of a flat one.',
  tags: ['geo', 'scattergeo', 'orthographic', 'poles', 'subplots', 'map'],
  size: { width: 900, height: 560 },
  testTolerance: 0.004,
};

/** Station, longitude, latitude. */
const NORTH: readonly (readonly [string, number, number])[] = [
  ['North Pole', 0, 90],
  ['Alert', -62.35, 82.5],
  ['Longyearbyen', 15.63, 78.22],
  ['Utqiagvik', -156.79, 71.29],
  ['Tiksi', 128.87, 71.64],
];
const SOUTH: readonly (readonly [string, number, number])[] = [
  ['South Pole', 0, -90],
  ['Vostok', 106.84, -78.46],
  ['McMurdo', 166.67, -77.85],
  ['Halley', -26.21, -75.58],
  ['Palmer', -64.05, -64.77],
];

const LONGITUDES = Array.from({ length: 145 }, (_, k) => -180 + k * 2.5);
/** The latitude of the polar circles. */
const CIRCLE = 66.56;

function circle(geo: string, lat: number): Record<string, unknown> {
  return {
    type: 'scattergeo',
    geo,
    mode: 'lines',
    lon: LONGITUDES,
    lat: LONGITUDES.map(() => lat),
    line: { width: 1, dash: 'dot', color: '#8ab4f8' },
    hoverinfo: 'skip',
  };
}

function stations(
  geo: string,
  list: readonly (readonly [string, number, number])[],
  labels: boolean,
): Record<string, unknown> {
  return {
    type: 'scattergeo',
    geo,
    mode: labels ? 'markers+text' : 'markers',
    lon: list.map((s) => s[1]),
    lat: list.map((s) => s[2]),
    text: list.map((s) => s[0]),
    textposition: 'top center',
    marker: { size: 5, color: '#f6c177' },
  };
}

export function run(el: HTMLElement): ExampleHandle {
  const globe = { showcountries: true, lonaxis: { showgrid: true }, lataxis: { showgrid: true } };
  const chart = createChart(el, {
    data: [
      circle('geo', CIRCLE),
      stations('geo', NORTH, true),
      circle('geo2', -CIRCLE),
      stations('geo2', SOUTH, true),
      circle('geo3', CIRCLE),
      circle('geo3', -CIRCLE),
      stations('geo3', [...NORTH, ...SOUTH], false),
    ],
    layout: {
      title: { text: 'Around the poles' },
      showlegend: false,
      margin: { l: 10, r: 10, t: 44, b: 10 },
      geo: {
        ...globe,
        domain: { x: [0, 0.38], y: [0.52, 1] },
        fitbounds: false,
        projection: { type: 'orthographic', rotation: { lon: 0, lat: 90 } },
      },
      geo2: {
        ...globe,
        domain: { x: [0, 0.38], y: [0, 0.48] },
        fitbounds: false,
        projection: { type: 'orthographic', rotation: { lon: 0, lat: -90 } },
      },
      geo3: {
        ...globe,
        domain: { x: [0.42, 1], y: [0, 1] },
        fitbounds: false,
        projection: { type: 'equirectangular' },
      },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
