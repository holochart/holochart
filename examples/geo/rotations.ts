import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/geo';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Turning a map (backlog GEO2, GEO5): `projection.rotation` puts another longitude in the middle
 * (`lon`), tips the globe towards a pole (`lat`) and turns it about the line of sight (`roll`).
 * Every rotation moves the cut: land that was whole is split at the new edge of the map, and land
 * that was split is whole again. The top row is one projection at three longitudes; in the last,
 * the Pacific is in the middle and Russia, Alaska and Fiji are in one piece. The bottom row tips
 * three other projections, which is what a drag does on a globe.
 */
export const meta: ExampleMeta = {
  title: 'Map rotation',
  description:
    'World maps turned in longitude, latitude and roll: the land is cut where the map now ends.',
  tags: ['geo', 'projection', 'rotation', 'subplots', 'map'],
  size: { width: 900, height: 520 },
  testTolerance: 0.004,
};

interface Cell {
  type: string;
  rotation: { lon?: number; lat?: number; roll?: number };
}

const CELLS: readonly Cell[] = [
  { type: 'natural earth', rotation: { lon: 0 } },
  { type: 'natural earth', rotation: { lon: 90 } },
  { type: 'natural earth', rotation: { lon: 180 } },
  { type: 'mollweide', rotation: { lon: -135, lat: 30 } },
  { type: 'azimuthal equal area', rotation: { lon: 20, lat: -60 } },
  { type: 'orthographic', rotation: { lon: -100, lat: 40, roll: 23.5 } },
];

const COLUMNS = 3;
const ROWS = 2;
const GAP = 0.03;
const LABEL = 0.07;

function describe({ type, rotation }: Cell): string {
  const parts = Object.entries(rotation).map(([key, value]) => `${key} ${String(value)}°`);
  return `${type} · ${parts.join(', ')}`;
}

export function run(el: HTMLElement): ExampleHandle {
  const data: Record<string, unknown>[] = [];
  const layout: Record<string, unknown> = {
    title: { text: 'projection.rotation' },
    showlegend: false,
    margin: { l: 10, r: 10, t: 44, b: 10 },
  };
  const annotations: Record<string, unknown>[] = [];
  CELLS.forEach((cell, i) => {
    const geo = i === 0 ? 'geo' : `geo${i + 1}`;
    const column = i % COLUMNS;
    const row = Math.floor(i / COLUMNS);
    const x0 = column / COLUMNS + GAP / 2;
    const x1 = (column + 1) / COLUMNS - GAP / 2;
    const y1 = 1 - row / ROWS - LABEL;
    const y0 = 1 - (row + 1) / ROWS + GAP / 2;
    layout[geo] = {
      domain: { x: [x0, x1], y: [y0, y1] },
      fitbounds: false,
      projection: cell,
      showcountries: true,
      lonaxis: { showgrid: true },
      lataxis: { showgrid: true },
    };
    // The antimeridian and the equator, so that the turn can be read off the map.
    const meridian = Array.from({ length: 73 }, (_, k) => -90 + k * 2.5);
    const equator = Array.from({ length: 145 }, (_, k) => -180 + k * 2.5);
    data.push({
      type: 'scattergeo',
      geo,
      mode: 'lines',
      lon: [...meridian.map(() => 180), NaN, ...equator],
      lat: [...meridian, NaN, ...equator.map(() => 0)],
      line: { width: 1.5 },
      hoverinfo: 'skip',
    });
    annotations.push({
      text: describe(cell),
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
