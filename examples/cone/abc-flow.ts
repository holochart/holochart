import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A dense field (plan E14.5): the Arnold–Beltrami–Childress flow `(A sin z + C cos y, B sin x +
 * A cos z, C sin y + B cos x)` sampled on a 10 × 10 × 10 grid over [0, 2π]³ — 1,000 cones, still
 * one instanced draw call. Norms through the layout's sequential ramp (`autocolorscale`).
 */
export const meta: ExampleMeta = {
  title: 'Cone: ABC flow, 1,000 cones',
  description: 'The Arnold–Beltrami–Childress flow on a 10×10×10 grid, drawn in one call.',
  tags: ['cone', '3d', 'vector field', 'performance'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const [A, B, C] = [1, Math.sqrt(2 / 3), Math.sqrt(1 / 3)];
  const n = 10;
  const d = { x: [] as number[], y: [] as number[], z: [] as number[] };
  const v = { u: [] as number[], v: [] as number[], w: [] as number[] };
  for (let k = 0; k < n; k++) {
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const [x, y, z] = [i, j, k].map((c) => (c / (n - 1)) * 2 * Math.PI) as [
          number,
          number,
          number,
        ];
        d.x.push(x);
        d.y.push(y);
        d.z.push(z);
        v.u.push(A * Math.sin(z) + C * Math.cos(y));
        v.v.push(B * Math.sin(x) + A * Math.cos(z));
        v.w.push(C * Math.sin(y) + B * Math.cos(x));
      }
    }
  }
  const chart = createChart(el, {
    data: [{ type: 'cone', name: 'ABC flow', ...d, ...v, sizeref: 0.7 }],
    layout: { title: { text: 'ABC flow (1,000 cones)' } },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
