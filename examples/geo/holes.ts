import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/geo';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Holes and multipolygons (backlog GEO5). A country that surrounds another has a hole: South
 * Africa around Lesotho, Italy around San Marino and the Vatican City. The `choropleth` region is
 * the country without the hole, so the enclave shows the land color beneath it. Italy is also a
 * multipolygon (the mainland, Sicily, Sardinia and the smaller islands), every part filled by the
 * one location. The Vatican is a square kilometre: on a map of Italy it is smaller than a pixel,
 * and it is there when the map is zoomed to Rome.
 *
 * Water inside land comes two ways. The Caspian Sea is a hole in the land itself. The other lakes
 * are a layer of their own (`showlakes`), filled with `lakecolor` on top of the land: here the
 * Aral Sea, Lake Balkhash and Issyk-Kul.
 *
 * The maps are at `resolution: 50`; the 1:110m basemap has no San Marino and no Vatican.
 */
export const meta: ExampleMeta = {
  title: 'Map: enclaves and lakes',
  description:
    'Lesotho inside South Africa, San Marino and the Vatican inside Italy, and lakes cut out of the land.',
  tags: ['geo', 'choropleth', 'scattergeo', 'holes', 'lakes', 'subplots', 'map'],
  size: { width: 860, height: 640 },
  testTolerance: 0.004,
};

const WATER = '#12324e';
const LAND = '#22232d';

function region(geo: string, code: string, color: string): Record<string, unknown> {
  return {
    type: 'choropleth',
    geo,
    locations: [code],
    z: [1],
    colorscale: [
      [0, color],
      [1, color],
    ],
    showscale: false,
    marker: { line: { width: 0.75 } },
  };
}

function labels(
  geo: string,
  points: readonly (readonly [string, number, number])[],
  textposition = 'middle center',
): Record<string, unknown> {
  return {
    type: 'scattergeo',
    geo,
    mode: 'text',
    lon: points.map((p) => p[1]),
    lat: points.map((p) => p[2]),
    text: points.map((p) => p[0]),
    textposition,
    hoverinfo: 'skip',
  };
}

export function run(el: HTMLElement): ExampleHandle {
  const base = {
    fitbounds: false,
    resolution: 50,
    projection: { type: 'mercator' },
    showcountries: true,
    landcolor: LAND,
    showocean: true,
    oceancolor: WATER,
    lakecolor: WATER,
  } as const;
  const chart = createChart(el, {
    data: [
      region('geo', 'ZAF', '#3d9a70'),
      labels('geo', [
        ['South Africa', 23.5, -30.6],
        ['Lesotho', 28.25, -29.55],
      ]),
      labels('geo2', [
        ['Caspian Sea', 50.5, 41.8],
        ['Black Sea', 35, 43.3],
      ]),
      labels(
        'geo2',
        [
          ['Aral Sea', 59.6, 46.6],
          ['Balkhash', 75, 47.3],
          ['Issyk-Kul', 77.3, 42.9],
        ],
        'top center',
      ),
      region('geo3', 'ITA', '#c8553d'),
      labels('geo3', [['San Marino', 12.46, 43.94]], 'middle right'),
      region('geo4', 'ITA', '#c8553d'),
      labels('geo4', [
        ['Vatican City', 12.453, 41.9035],
        ['Rome', 12.5, 41.89],
      ]),
    ],
    layout: {
      title: { text: 'Holes in countries, holes in land' },
      showlegend: false,
      margin: { l: 10, r: 10, t: 44, b: 10 },
      geo: {
        ...base,
        domain: { x: [0, 0.48], y: [0.52, 1] },
        lonaxis: { range: [15.5, 34] },
        lataxis: { range: [-35.5, -21.5] },
      },
      geo2: {
        ...base,
        domain: { x: [0.52, 1], y: [0.52, 1] },
        lonaxis: { range: [26, 82] },
        lataxis: { range: [34, 56] },
        showlakes: true,
      },
      geo3: {
        ...base,
        domain: { x: [0, 0.48], y: [0, 0.48] },
        lonaxis: { range: [5.5, 19.5] },
        lataxis: { range: [35.8, 47.6] },
      },
      geo4: {
        ...base,
        domain: { x: [0.52, 1], y: [0, 0.48] },
        lonaxis: { range: [12.36, 12.56] },
        lataxis: { range: [41.84, 41.96] },
      },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
