import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Filled contour plot (plan E11.2): a 2D `z` grid (rows along y) of two overlapping bumps and a
 * dip, contoured at automatic levels. Bands between levels are filled (the lazily loaded fill
 * primitive) and separated by thin lines; the colorbar shows the bands as blocks.
 */
export const meta: ExampleMeta = {
  title: 'Contour: filled',
  description: 'Two bumps and a dip on a regular grid, as filled bands with a banded colorbar.',
  tags: ['contour', 'scientific'],
  testTolerance: 0.004,
};

/** Two Gaussian bumps and a dip, sampled on a regular grid. */
export function bumps(nx: number, ny: number): { x: number[]; y: number[]; z: number[][] } {
  const x = Array.from({ length: nx }, (_, i) => -3 + (6 * i) / (nx - 1));
  const y = Array.from({ length: ny }, (_, j) => -2 + (4 * j) / (ny - 1));
  const g = (px: number, py: number, cx: number, cy: number, s: number): number =>
    Math.exp(-((px - cx) ** 2 + (py - cy) ** 2) / (2 * s * s));
  const z = y.map((py) =>
    x.map(
      (px) =>
        3 * g(px, py, -1.1, 0.4, 0.8) +
        2 * g(px, py, 1.3, -0.3, 0.9) -
        1.5 * g(px, py, 0.4, 1.5, 0.5),
    ),
  );
  return { x, y, z };
}

export function run(el: HTMLElement): ExampleHandle {
  const { x, y, z } = bumps(61, 41);
  const chart = createChart(el, {
    data: [
      {
        type: 'contour',
        x,
        y,
        z,
        line: { color: 'rgba(10, 10, 15, 0.6)' },
        colorbar: { title: { text: 'height' } },
      },
    ],
    layout: { title: { text: 'Filled contours' } },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
