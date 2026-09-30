import { createChart } from '@mk7s/holochart';
import { linspace, sample } from '../_lib/surface-data.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Gaps and `connectgaps` (plan E14.3): missing heights (`null`) leave holes (left): every triangle
 * touching a gap is dropped in the vertex shader. With `connectgaps` (right) the gaps are filled by
 * interpolating their neighbours (Plotly's Laplace fill) before the surface is built.
 */
export const meta: ExampleMeta = {
  title: 'Surface: gaps and connectgaps',
  description: 'Missing values as holes, and the same data with connectgaps filling them.',
  tags: ['surface', '3d', 'scientific'],
  testTolerance: 0.004,
  size: { width: 800, height: 380 },
};

export function run(el: HTMLElement): ExampleHandle {
  const axis = linspace(-2, 2, 30);
  const z: (number | null)[][] = sample(axis, axis, (x, y) => Math.cos(x) * Math.cos(y));
  // A missing block and a missing stripe.
  for (let j = 8; j < 14; j++) for (let i = 10; i < 17; i++) z[j]![i] = null;
  for (let i = 0; i < 30; i++) if (i % 7 !== 0) z[22]![i] = null;
  const common = { type: 'surface' as const, x: axis, y: axis, z, showscale: false };
  const scene = { camera: { eye: { x: 1.3, y: -1.5, z: 1.1 } } };
  const chart = createChart(el, {
    data: [
      { ...common, scene: 'scene' },
      { ...common, scene: 'scene2', connectgaps: true },
    ],
    layout: {
      title: { text: 'Holes, and connectgaps' },
      scene: { ...scene, domain: { x: [0, 0.5] } },
      scene2: { ...scene, domain: { x: [0.5, 1] } },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
