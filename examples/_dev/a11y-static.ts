import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import type { InteractionHook } from './interaction-scatter.ts';

/**
 * Accessible DOM mirror of a static chart (plan E17.1): `config.staticPlot` makes the element
 * `role="img"`, named by `layout.meta.description` (which wins over the title), with the pie's
 * slices in the hidden description (`aria-describedby`) and a hidden data table.
 *
 * Not a visual test: the description draws nothing; tests/interaction/a11y.spec.ts reads it.
 */
export const meta: ExampleMeta = {
  title: 'Accessibility: static chart',
  description:
    'A static donut chart named by layout.meta.description, exposed as an image with a long description.',
  tags: ['dev', 'chart', 'a11y', 'pie', 'no-visual-test'],
  size: { width: 480, height: 360 },
};

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'pie',
        name: 'Browsers',
        labels: ['Chrome', 'Safari', 'Edge', 'Firefox'],
        values: [641, 187, 52, 120],
        hole: 0.4,
      },
    ],
    layout: {
      title: { text: 'Browser share' },
      meta: { description: 'Browser share of page views in June 2024' },
    },
    config: { staticPlot: true },
  });
  const hook: InteractionHook = { chart, events: [] };
  window.__interaction = hook;
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => {
      if (window.__interaction === hook) delete window.__interaction;
      chart.destroy();
    },
  };
}
