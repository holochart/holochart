import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * The lower half of a scatter plot matrix (plan E10.9): `showupperhalf: false` drops the cells
 * above the diagonal (they mirror the ones below) and `diagonal.visible: false` the diagonal, so
 * five dimensions need four rows and four columns. One trace, colored per sample by class.
 */
export const meta: ExampleMeta = {
  title: 'Scatter plot matrix: lower half',
  description:
    'Only the cells below the diagonal: showupperhalf false and no diagonal, one trace colored by class.',
  tags: ['splom', 'statistical'],
  size: { width: 640, height: 600 },
  testTolerance: 0.004,
};

const LABELS = ['latency', 'throughput', 'cpu', 'memory', 'errors'];
const CLASSES = [
  { color: '#ea2a37', center: [40, 900, 35, 52, 0.4] },
  { color: '#5e74d5', center: [85, 620, 62, 71, 1.4] },
  { color: '#118e36', center: [140, 380, 81, 88, 3.1] },
];

export function run(el: HTMLElement): ExampleHandle {
  const normal = gaussian(rng(7));
  const cols: number[][] = LABELS.map(() => []);
  const color: string[] = [];
  for (const c of CLASSES) {
    for (let i = 0; i < 60; i++) {
      const load = normal();
      c.center.forEach((m, d) => {
        const spread = m * 0.18;
        const sign = d === 1 ? -1 : 1;
        cols[d]!.push(m + spread * (0.6 * sign * load + 0.8 * normal()));
      });
      color.push(c.color);
    }
  }
  const chart = createChart(el, {
    data: [
      {
        type: 'splom',
        name: 'hosts',
        dimensions: LABELS.map((label, d) => ({ label, values: cols[d]! })),
        showupperhalf: false,
        diagonal: { visible: false },
        marker: { color, size: 4, opacity: 0.8 },
      },
    ],
    layout: { title: { text: 'Host metrics, lower half' } },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
