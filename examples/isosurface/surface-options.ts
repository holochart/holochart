import { createChart } from '@mk7s/holochart';
import { linspace, scalarGrid } from '../_lib/volume-data.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * `surface.count`, `surface.fill` and `surface.pattern` (plan E14.8) on one field, the distance
 * from the origin, on a grid that stops at z = 0.1 (no caps), so the spheres are seen cut open:
 * four nested spheres between `isomin` 0.3 and `isomax` 0.9 (left), the same with `fill: 0.6` —
 * every triangle drawn as a frame around a hole, so the inner spheres show through (middle) — and
 * two with `pattern: 'odd'`, only the grid cells with an odd `i + j + k` (a checkerboard, right).
 */
export const meta: ExampleMeta = {
  title: 'Isosurface: surface count, fill and pattern',
  description: 'Nested spheres: four surfaces, open triangles (fill) and a checkerboard pattern.',
  tags: ['isosurface', '3d', 'scientific'],
  testTolerance: 0.006,
};

export function run(el: HTMLElement): ExampleHandle {
  const a = linspace(24, -1, 1);
  const grid = scalarGrid(a, a, linspace(14, -1, 0.1), (x, y, z) => Math.hypot(x, y, z));
  const base = {
    type: 'isosurface',
    ...grid,
    isomin: 0.3,
    isomax: 0.9,
    showscale: false,
    caps: { x: { show: false }, y: { show: false }, z: { show: false } },
  };
  const camera = { eye: { x: 1.35, y: -1.6, z: 1.85 } };
  const chart = createChart(el, {
    data: [
      { ...base, name: 'count 4', surface: { count: 4, fill: 1 } },
      { ...base, name: 'fill 0.6', scene: 'scene2', surface: { count: 4, fill: 0.6 } },
      { ...base, name: "pattern 'odd'", scene: 'scene3', surface: { count: 2, pattern: 'odd' } },
    ],
    layout: {
      title: { text: "count: 4 · fill: 0.6 · pattern: 'odd'" },
      margin: { l: 10, r: 10, t: 40, b: 10 },
      scene: { domain: { x: [0, 0.33] }, camera },
      scene2: { domain: { x: [0.33, 0.67] }, camera },
      scene3: { domain: { x: [0.67, 1] }, camera },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
