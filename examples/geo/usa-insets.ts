import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/geo';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * The insets of Albers USA (backlog GEO5): `scope: 'usa'` is three projections in one, each
 * clipped to a frame of its own: the contiguous states, Alaska (drawn at 35% of its size, below
 * California) and Hawaii (beside it). Nothing is drawn between the frames, because no place on
 * Earth is there.
 *
 * The graticule shows the three frames: each inset has its own meridians and parallels, cut at
 * its edges. The flights do the same. A great circle from Seattle to Anchorage leaves the
 * contiguous states at their frame and enters Alaska's inset at its frame, and the part over
 * Canada and the ocean is not drawn; the legs to Honolulu have their middle over the Pacific,
 * outside every frame.
 */
export const meta: ExampleMeta = {
  title: 'Map: the insets of Albers USA',
  description:
    'Flights between the contiguous states, Alaska and Hawaii, cut at the frames of the three projections.',
  tags: ['geo', 'scattergeo', 'usa', 'clipping', 'lines', 'map'],
  size: { width: 760, height: 480 },
  testTolerance: 0.004,
};

/** Airport, longitude, latitude. */
const AIRPORTS: readonly (readonly [string, number, number])[] = [
  ['Seattle', -122.31, 47.45],
  ['Anchorage', -149.99, 61.17],
  ['Fairbanks', -147.86, 64.82],
  ['Honolulu', -157.92, 21.32],
  ['Los Angeles', -118.41, 33.94],
  ['Denver', -104.67, 39.86],
  ['Chicago', -87.9, 41.98],
  ['Miami', -80.29, 25.79],
  ['New York', -73.78, 40.64],
];

/** Flights as pairs of indices into {@link AIRPORTS}. */
const FLIGHTS: readonly (readonly [number, number])[] = [
  [0, 1],
  [1, 2],
  [1, 3],
  [3, 4],
  [4, 5],
  [5, 6],
  [6, 8],
  [6, 1],
  [4, 7],
  [7, 8],
  [0, 5],
];

export function run(el: HTMLElement): ExampleHandle {
  // One trace of segments: a gap (NaN) after each flight breaks the line there.
  const lon: number[] = [];
  const lat: number[] = [];
  for (const [from, to] of FLIGHTS) {
    lon.push(AIRPORTS[from]![1], AIRPORTS[to]![1], NaN);
    lat.push(AIRPORTS[from]![2], AIRPORTS[to]![2], NaN);
  }
  const chart = createChart(el, {
    data: [
      { type: 'scattergeo', mode: 'lines', name: 'flights', lon, lat, line: { width: 1.25 } },
      {
        type: 'scattergeo',
        mode: 'markers+text',
        name: 'airports',
        lon: AIRPORTS.map((a) => a[1]),
        lat: AIRPORTS.map((a) => a[2]),
        text: AIRPORTS.map((a) => a[0]),
        textposition: 'top center',
        marker: { size: 6 },
      },
    ],
    layout: {
      title: { text: 'Three projections, three frames' },
      showlegend: false,
      geo: {
        scope: 'usa',
        fitbounds: false,
        lonaxis: { showgrid: true, dtick: 10 },
        lataxis: { showgrid: true, dtick: 5 },
      },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
