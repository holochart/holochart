import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/geo';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Markers at places instead of coordinates (backlog GEO3): `scattergeo` with `locations`, here
 * ISO 3166-1 alpha-3 codes (`locationmode: 'ISO-3'`, the default). Each marker is drawn at the
 * label point of its country in the base map. `'country names'` takes names, `'USA-states'`
 * postal codes or state names, and `geojson` with `featureidkey` any features of your own.
 */
export const meta: ExampleMeta = {
  title: 'Map: markers at locations',
  description: 'Countries named by ISO-3 code, drawn at their label points with text labels.',
  tags: ['geo', 'scattergeo', 'locations', 'markers', 'text', 'map'],
  testTolerance: 0.004,
};

/** ISO-3 code, name, population in millions (2023, rounded). */
const COUNTRIES: readonly (readonly [string, string, number])[] = [
  ['IND', 'India', 1429],
  ['CHN', 'China', 1411],
  ['USA', 'United States', 335],
  ['IDN', 'Indonesia', 278],
  ['PAK', 'Pakistan', 240],
  ['NGA', 'Nigeria', 224],
  ['BRA', 'Brazil', 216],
  ['RUS', 'Russia', 144],
  ['MEX', 'Mexico', 128],
  ['ETH', 'Ethiopia', 127],
  ['EGY', 'Egypt', 113],
  ['COD', 'DR Congo', 102],
  ['DEU', 'Germany', 84],
  ['ZAF', 'South Africa', 60],
  ['AUS', 'Australia', 27],
  ['CAN', 'Canada', 40],
  ['ARG', 'Argentina', 46],
];

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'scattergeo',
        locations: COUNTRIES.map((c) => c[0]),
        text: COUNTRIES.map((c) => c[1]),
        mode: 'markers+text',
        textposition: 'top center',
        textfont: { size: 11 },
        name: 'population',
        marker: { size: COUNTRIES.map((c) => 6 + Math.sqrt(c[2]) * 0.7), opacity: 0.85 },
        hovertemplate: '%{text} (%{location})<extra></extra>',
      },
    ],
    layout: {
      title: { text: 'Most populous countries' },
      geo: { fitbounds: false, showcountries: true },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
