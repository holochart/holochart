import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Smoothing (plan E11.1): the same coarse 8 × 6 grid with flat cells (`zsmooth: false`, left) and
 * bilinear interpolation between cell centers (`zsmooth: 'best'`, right), sharing one color axis.
 * Smoothing is done per fragment on the GPU; the grid is uploaded once per trace.
 */
export const meta: ExampleMeta = {
  title: 'Heatmap: smoothing',
  description: 'Flat cells next to zsmooth "best" (bilinear on the GPU), sharing one color axis.',
  tags: ['heatmap', 'scientific', 'zsmooth', 'coloraxis', 'subplots'],
  size: { width: 760, height: 380 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const z = Array.from({ length: 6 }, (_, j) =>
    Array.from({ length: 8 }, (_, i) => Math.cos(i / 1.6) * Math.sin(j / 1.3 + 0.4) + j / 6),
  );
  const common = { type: 'heatmap', z, coloraxis: 'coloraxis' };
  const chart = createChart(el, {
    data: [
      { ...common, xaxis: 'x', yaxis: 'y' },
      { ...common, zsmooth: 'best', xaxis: 'x2', yaxis: 'y2' },
    ],
    layout: {
      title: { text: 'zsmooth: false vs "best"' },
      grid: { rows: 1, columns: 2, pattern: 'independent' },
      coloraxis: { colorscale: 'Plasma' },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
