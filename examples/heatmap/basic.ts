import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A heatmap of a 2D field (plan E11.1): `z` as rows of values on numeric `x` / `y` cell centers.
 * The whole grid is one float texture sampled in the fragment shader through the colorscale LUT
 * (the default look's sequential ramp), so zooming only updates uniforms. Hover shows `x`, `y`
 * and `z` of the cell under the pointer.
 */
export const meta: ExampleMeta = {
  title: 'Heatmap: basic',
  description: 'A 2D field of 60 × 40 values drawn as one GPU texture with a colorbar.',
  tags: ['heatmap', 'scientific', 'colorscale'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const nx = 60;
  const ny = 40;
  const x = Array.from({ length: nx }, (_, i) => -3 + (6 * i) / (nx - 1));
  const y = Array.from({ length: ny }, (_, j) => -2 + (4 * j) / (ny - 1));
  // Two bumps and a trough.
  const z = y.map((yv) =>
    x.map(
      (xv) =>
        Math.exp(-((xv - 1) ** 2 + (yv - 0.5) ** 2)) +
        0.8 * Math.exp(-((xv + 1.4) ** 2 + (yv + 0.6) ** 2) / 0.6) -
        0.5 * Math.exp(-((xv + 0.2) ** 2 + (yv - 1.2) ** 2) / 0.3),
    ),
  );
  const chart = createChart(el, {
    data: [{ type: 'heatmap', x, y, z, colorbar: { title: { text: 'intensity' } } }],
    layout: {
      title: { text: 'Field intensity' },
      xaxis: { title: { text: 'x (mm)' } },
      yaxis: { title: { text: 'y (mm)' } },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
