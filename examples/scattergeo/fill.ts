import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/geo';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Filled areas on a map (backlog GEO3, GEO5, GEO10): `fill: 'toself'` closes the path of a trace
 * into a shape on the sphere and fills it with `fillcolor` (by default the line color, half
 * transparent). The edges are great circles, like the lines, so the sides of a large area bow on
 * a flat projection. A gap (`null`) in `lon` / `lat` starts a new shape in the same trace. Of the
 * two regions a closed path bounds on a sphere, the smaller one is filled, whichever way round
 * the points are given.
 */
export const meta: ExampleMeta = {
  title: 'Map: filled areas',
  description: 'Two areas drawn with fill: toself, their edges following great circles.',
  tags: ['geo', 'scattergeo', 'fill', 'toself', 'lines', 'map'],
  testTolerance: 0.004,
};

/** The Bermuda Triangle: Miami, Bermuda, San Juan. */
const TRIANGLE = {
  lon: [-80.19, -64.78, -66.11],
  lat: [25.76, 32.3, 18.47],
};

/** Two made-up search areas in one trace, separated by a gap. */
const SEARCH = {
  lon: [-48, -30, -28, -46, null, -42, -30, -32, -44],
  lat: [38, 40, 30, 28, null, 22, 20, 10, 12],
};

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'scattergeo',
        ...TRIANGLE,
        mode: 'lines',
        fill: 'toself',
        name: 'triangle',
        line: { width: 2 },
      },
      {
        type: 'scattergeo',
        ...SEARCH,
        mode: 'lines',
        fill: 'toself',
        name: 'search areas',
        line: { width: 1.5, dash: 'dash' },
      },
      {
        type: 'scattergeo',
        lon: TRIANGLE.lon,
        lat: TRIANGLE.lat,
        text: ['Miami', 'Bermuda', 'San Juan'],
        mode: 'markers+text',
        textposition: ['middle left', 'top center', 'bottom center'],
        textfont: { size: 11 },
        name: 'corners',
        showlegend: false,
        marker: { size: 6 },
      },
    ],
    layout: {
      title: { text: 'Areas on the North Atlantic' },
      geo: {
        fitbounds: false,
        projection: { type: 'mercator' },
        lonaxis: { range: [-95, 0], showgrid: true, dtick: 15 },
        lataxis: { range: [5, 50], showgrid: true, dtick: 10 },
        showcountries: true,
      },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
