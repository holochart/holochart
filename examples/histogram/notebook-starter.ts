import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

export const meta: ExampleMeta = {
  title: 'Histogram: notebook starter',
  description: 'Seven observations counted in five explicit bins, matching the Python notebook.',
  tags: ['histogram', 'statistical', 'beginner', 'python', 'tutorial'],
};

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'histogram',
        x: [1, 2, 2, 3, 4, 4, 5],
        xbins: { start: 0.5, end: 5.5, size: 1 },
        name: 'Observations',
      },
    ],
    layout: {
      title: { text: 'Small sample histogram' },
      xaxis: { title: { text: 'Value' } },
      yaxis: { title: { text: 'Count' } },
    },
    config: { responsive: true },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
