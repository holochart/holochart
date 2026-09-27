import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Overlaid histograms told apart by pattern (plan E10.1, E8.10): with `barmode: 'overlay'` the
 * hatches of the two distributions (`'/'` and `'\'`) cross where they overlap, so the overlap
 * reads without relying on color or translucency. Histograms take bar's `marker.pattern`.
 */
export const meta: ExampleMeta = {
  title: 'Histogram: patterns',
  description:
    'Two overlaid distributions hatched in opposite directions; the overlap cross-hatches.',
  tags: ['histogram', 'chart', 'overlay', 'pattern', 'statistical'],
};

export function run(el: HTMLElement): ExampleHandle {
  const normal = gaussian(rng(37));
  const control = Array.from({ length: 600 }, () => 52 + 9 * normal());
  const treated = Array.from({ length: 600 }, () => 61 + 8 * normal());
  const chart = createChart(el, {
    data: [
      {
        type: 'histogram',
        x: control,
        name: 'Control',
        bingroup: 'score',
        marker: { line: { width: 1 }, pattern: { shape: '/', solidity: 0.35 } },
      },
      {
        type: 'histogram',
        x: treated,
        name: 'Treated',
        bingroup: 'score',
        marker: { line: { width: 1 }, pattern: { shape: '\\', solidity: 0.35 } },
      },
    ],
    layout: {
      title: { text: 'Test scores' },
      barmode: 'overlay',
      xaxis: { title: { text: 'Score' } },
      yaxis: { title: { text: 'Students' } },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
