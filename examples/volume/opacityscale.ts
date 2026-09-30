import { createChart } from '@mk7s/holochart';
import { cubeGrid } from '../_lib/volume-data.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * `opacityscale` (plan E14.7) on stacked isosurfaces: `sin(πx) sin(πy) cos(πz)` on a 24³ grid,
 * 12 surfaces from -0.8 to 0.8 at `opacity: 0.25`, faded by value: `'min'` (the low values
 * opaque), `'max'` (the high ones), `'extremes'` (both ends) and a custom scale that hides the
 * middle (`[[0, 1], [0.3, 0], [0.7, 0], [1, 1]]`). Like gl-mesh3d, the scale applies twice (the
 * vertex alpha and the colormap's alpha).
 */
export const meta: ExampleMeta = {
  title: 'Volume: opacityscale',
  description: 'One field with four opacity scales: min, max, extremes and a custom one.',
  tags: ['volume', '3d', 'scientific', 'opacity'],
  testTolerance: 0.008,
};

const SCALES = [
  'min',
  'max',
  'extremes',
  [
    [0, 1],
    [0.3, 0],
    [0.7, 0],
    [1, 1],
  ],
] as const;

export function run(el: HTMLElement): ExampleHandle {
  const grid = cubeGrid(
    24,
    -1,
    1,
    (x, y, z) => Math.sin(Math.PI * x) * Math.sin(Math.PI * y) * Math.cos(Math.PI * z),
  );
  const camera = { eye: { x: 1.6, y: -1.6, z: 1.2 } };
  const domains = [
    { x: [0, 0.5], y: [0.5, 1] },
    { x: [0.5, 1], y: [0.5, 1] },
    { x: [0, 0.5], y: [0, 0.5] },
    { x: [0.5, 1], y: [0, 0.5] },
  ];
  const chart = createChart(el, {
    data: SCALES.map((opacityscale, k) => ({
      type: 'volume',
      name: typeof opacityscale === 'string' ? opacityscale : 'custom',
      scene: k === 0 ? 'scene' : `scene${k + 1}`,
      ...grid,
      isomin: -0.8,
      isomax: 0.8,
      opacity: 0.25,
      opacityscale,
      surface: { count: 12 },
      colorscale: 'RdBu',
      showscale: k === 0,
    })),
    layout: {
      title: { text: "opacityscale: 'min', 'max', 'extremes', custom" },
      margin: { l: 10, r: 10, t: 40, b: 10 },
      ...Object.fromEntries(
        domains.map((domain, k) => [
          k === 0 ? 'scene' : `scene${k + 1}`,
          {
            domain,
            camera,
            xaxis: { showticklabels: false, title: { text: '' } },
            yaxis: { showticklabels: false, title: { text: '' } },
            zaxis: { showticklabels: false, title: { text: '' } },
          },
        ]),
      ),
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
