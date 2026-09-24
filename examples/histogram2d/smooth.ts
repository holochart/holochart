import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Smoothing (plan E10.2): the same samples with flat cells (`zsmooth: false`, left) and bilinear
 * interpolation between cell centers (`zsmooth: 'best'`, right). Both panels share one color axis
 * (`coloraxis`), so one colorbar describes them. Smoothing runs in the fragment shader: no extra
 * geometry, and zooming stays a uniform update.
 */
export const meta: ExampleMeta = {
  title: '2D histogram: smoothing',
  description: 'Flat cells next to zsmooth "best" (bilinear on the GPU), sharing one color axis.',
  tags: ['histogram2d', 'statistical', 'zsmooth', 'coloraxis', 'subplots'],
  size: { width: 760, height: 380 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const normal = gaussian(rng(21));
  const x: number[] = [];
  const y: number[] = [];
  for (let i = 0; i < 2500; i++) {
    const r = 2 + normal() * 0.35;
    const a = normal() * 1.2;
    x.push(r * Math.cos(a));
    y.push(r * Math.sin(a) * 0.8);
  }
  const common = { type: 'histogram2d', x, y, nbinsx: 14, nbinsy: 14, coloraxis: 'coloraxis' };
  const chart = createChart(el, {
    data: [
      { ...common, name: 'flat' },
      { ...common, name: 'best', zsmooth: 'best', xaxis: 'x2', yaxis: 'y2' },
    ],
    layout: {
      title: { text: 'zsmooth: false vs best' },
      xaxis: { domain: [0, 0.46] },
      xaxis2: { domain: [0.54, 1] },
      yaxis2: { anchor: 'x2' },
      coloraxis: { colorbar: { title: { text: 'count' } } },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
