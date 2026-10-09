import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/geo';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A scoped map (backlog GEO2): `scope: 'usa'` draws the United States in the Albers USA
 * projection, with Alaska and Hawaii as insets, and its states as subunits. Scoped maps pan and
 * zoom; they do not rotate.
 */
export const meta: ExampleMeta = {
  title: 'Map: United States',
  description: 'State capitals on the Albers USA projection, with state borders.',
  tags: ['geo', 'scattergeo', 'markers', 'text', 'usa', 'map'],
  testTolerance: 0.004,
};

/** Capital, longitude, latitude. */
const CAPITALS: readonly (readonly [string, number, number])[] = [
  ['Sacramento', -121.49, 38.58],
  ['Austin', -97.74, 30.27],
  ['Albany', -73.76, 42.65],
  ['Tallahassee', -84.28, 30.44],
  ['Denver', -104.99, 39.74],
  ['Olympia', -122.9, 47.04],
  ['Saint Paul', -93.09, 44.95],
  ['Atlanta', -84.39, 33.75],
  ['Juneau', -134.42, 58.3],
  ['Honolulu', -157.86, 21.31],
  ['Phoenix', -112.07, 33.45],
  ['Boston', -71.06, 42.36],
];

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'scattergeo',
        lon: CAPITALS.map((c) => c[1]),
        lat: CAPITALS.map((c) => c[2]),
        text: CAPITALS.map((c) => c[0]),
        mode: 'markers+text',
        textposition: 'top center',
        name: 'capitals',
        marker: { size: 6 },
      },
    ],
    layout: {
      title: { text: 'State capitals' },
      geo: { scope: 'usa', fitbounds: false, showsubunits: true },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
