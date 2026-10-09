import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/geo';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Values written on the regions (backlog GEO6, GEO10): color is the only encoding of a
 * choropleth, so a reader who cannot tell the colors apart has nothing else to read. A
 * `scattergeo` trace with the same `locations` and `mode: 'text'` writes each value at the label
 * point of its region, as a second encoding. `hoverinfo: 'skip'` leaves hover to the regions
 * under the labels.
 */
export const meta: ExampleMeta = {
  title: 'Choropleth: values as labels',
  description: 'Countries of South America colored by population, with the value written on each.',
  tags: ['geo', 'choropleth', 'scattergeo', 'text', 'labels', 'accessibility', 'scope', 'map'],
  testTolerance: 0.004,
};

/** ISO-3 code, population in millions (2023, rounded). */
const POPULATION: readonly (readonly [string, number])[] = [
  ['BRA', 216],
  ['COL', 52],
  ['ARG', 46],
  ['PER', 34],
  ['VEN', 28],
  ['CHL', 20],
  ['ECU', 18],
  ['BOL', 12],
  ['PRY', 7],
  ['URY', 3],
];

export function run(el: HTMLElement): ExampleHandle {
  const locations = POPULATION.map((p) => p[0]);
  const chart = createChart(el, {
    data: [
      {
        type: 'choropleth',
        locations,
        z: POPULATION.map((p) => p[1]),
        name: 'population',
        zmin: 0,
        hovertemplate: '%{location}: %{z} M<extra></extra>',
        marker: { line: { color: '#fff', width: 0.75 } },
        colorbar: { title: { text: 'millions' } },
      },
      {
        type: 'scattergeo',
        locations,
        text: POPULATION.map((p) => String(p[1])),
        mode: 'text',
        // Light text on the dark end of the scale, dark text on Brazil.
        textfont: { size: 12, color: POPULATION.map((p) => (p[1] > 120 ? '#111' : '#fff')) },
        hoverinfo: 'skip',
        showlegend: false,
      },
    ],
    layout: {
      title: { text: 'Population, millions' },
      geo: { scope: 'south america', fitbounds: false },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
