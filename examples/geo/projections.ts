import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/geo';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * The most used map projections side by side (backlog GEO2, GEO5): nine geo subplots, each a world
 * map with one `projection.type`, its graticule and its frame. Plotly's 84 projection names all
 * work; the 16 that `d3-geo` has are in the geo package itself, the others load as one chunk the
 * first time a figure names one (here Robinson, Mollweide and Winkel tripel).
 *
 * The same `scattergeo` route is drawn on every map: the great circle from New York to Singapore,
 * which passes close to the North Pole. It is the shortest way on each of them, and looks it only
 * on the globe, where it runs on behind the edge.
 *
 * A conic projection opens like a fan, and its `center` is not in the middle of the fan: Plotly
 * puts latitude 0 in the middle of the subplot, which cuts the top of a conic world map off.
 * `center.lat: 34` is the latitude that sits in the middle of this one.
 */
export const meta: ExampleMeta = {
  title: 'Map projections',
  description: 'Nine world maps, one per projection, with the same great-circle route on each.',
  tags: ['geo', 'projection', 'scattergeo', 'subplots', 'map'],
  size: { width: 900, height: 660 },
  testTolerance: 0.004,
};

const PROJECTIONS: readonly { type: string; center?: { lat: number } }[] = [
  { type: 'equirectangular' },
  { type: 'mercator' },
  { type: 'natural earth' },
  { type: 'robinson' },
  { type: 'orthographic' },
  { type: 'mollweide' },
  { type: 'azimuthal equal area' },
  { type: 'conic equal area', center: { lat: 34 } },
  { type: 'winkel tripel' },
];

const COLUMNS = 3;
const ROWS = 3;
/** Room between the cells, and for the name above each, in fractions of the plot area. */
const GAP = 0.03;
const LABEL = 0.05;

export function run(el: HTMLElement): ExampleHandle {
  const data: Record<string, unknown>[] = [];
  const layout: Record<string, unknown> = {
    title: { text: 'Map projections' },
    showlegend: false,
    margin: { l: 10, r: 10, t: 44, b: 10 },
  };
  const annotations: Record<string, unknown>[] = [];
  PROJECTIONS.forEach(({ type, center }, i) => {
    const geo = i === 0 ? 'geo' : `geo${i + 1}`;
    const column = i % COLUMNS;
    const row = Math.floor(i / COLUMNS);
    const x0 = column / COLUMNS + GAP / 2;
    const x1 = (column + 1) / COLUMNS - GAP / 2;
    const y1 = 1 - row / ROWS - LABEL;
    const y0 = 1 - (row + 1) / ROWS + GAP / 2;
    layout[geo] = {
      domain: { x: [x0, x1], y: [y0, y1] },
      // Without this the view would fit the route.
      fitbounds: false,
      projection: { type },
      ...(center ? { center } : {}),
      lonaxis: { showgrid: true },
      lataxis: { showgrid: true },
    };
    data.push({
      type: 'scattergeo',
      geo,
      mode: 'lines+markers',
      lon: [-73.78, 103.99],
      lat: [40.64, 1.36],
      text: ['New York', 'Singapore'],
      line: { width: 1.5 },
      marker: { size: 5 },
    });
    annotations.push({
      text: type,
      x: (x0 + x1) / 2,
      y: 1 - row / ROWS - LABEL / 2,
      xref: 'paper',
      yref: 'paper',
      xanchor: 'center',
      yanchor: 'middle',
      showarrow: false,
    });
  });
  layout['annotations'] = annotations;

  const chart = createChart(el, { data, layout });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
