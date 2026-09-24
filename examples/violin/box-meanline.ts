import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Violins with an inner box and mean line (plan E10.5): `box.visible` draws a narrow box plot
 * (quartiles, median, whiskers at the fences) inside each violin, `box.width` its width as a
 * fraction of the violin's, and `meanline.visible` a dashed line at the mean across the box. All
 * samples are drawn to the left (`points: 'all'`, `pointpos`, `jitter`).
 */
export const meta: ExampleMeta = {
  title: 'Violin: inner box, mean line and points',
  description:
    'Violins with a narrow box plot inside, a dashed mean line, and every sample drawn beside them.',
  tags: ['violin', 'statistical', 'distribution', 'box', 'mean', 'points'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const normal = gaussian(rng(29));
  const draw = (n: number, mu: number, sigma: number) =>
    Array.from({ length: n }, () => mu + sigma * normal());
  const style = {
    type: 'violin',
    box: { visible: true, width: 0.3 },
    meanline: { visible: true },
    points: 'all',
    pointpos: -1.2,
    jitter: 0.4,
    marker: { size: 3 },
  };
  const chart = createChart(el, {
    data: [
      { ...style, name: 'Model A', y: draw(120, 0.72, 0.06) },
      { ...style, name: 'Model B', y: [...draw(80, 0.78, 0.04), ...draw(40, 0.64, 0.03)] },
      { ...style, name: 'Model C', y: draw(120, 0.81, 0.035) },
    ],
    layout: {
      title: { text: 'Cross-validation accuracy' },
      yaxis: { title: { text: 'accuracy' }, tickformat: '.0%' },
      showlegend: false,
    },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
