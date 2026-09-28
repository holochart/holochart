import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import type { InteractionHook } from './interaction-scatter.ts';

/**
 * A visible data table of 100,000 points (plan E17.3): the table formats and renders only the rows
 * scrolled into view. Not a visual test; the a11y interaction suite scrolls it.
 */
export const meta: ExampleMeta = {
  title: 'Accessibility: 100k-row data table',
  description:
    "100,000 points with config.a11y.dataTable: 'visible': a virtualized table below the chart.",
  tags: ['dev', 'a11y', 'data table', 'no-visual-test'],
  size: { width: 640, height: 720 },
};

export function run(el: HTMLElement): ExampleHandle {
  const box = document.createElement('div');
  box.style.height = '360px';
  el.appendChild(box);
  const n = 100_000;
  const x = Float64Array.from({ length: n }, (_, i) => i);
  const y = Float64Array.from(x, (i) => Math.round(1000 * Math.sin(i / 500)) / 10);
  const chart = createChart(box, {
    data: [{ type: 'scatter', mode: 'lines', name: 'Signal', x, y }],
    config: { a11y: { dataTable: 'visible' } },
  });
  const hook: InteractionHook = { chart, events: [] };
  window.__interaction = hook;
  return {
    ready: chart.ready.then(() => chart.describe()).then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => {
      if (window.__interaction === hook) delete window.__interaction;
      chart.destroy();
      box.remove();
    },
  };
}
