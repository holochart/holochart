import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A horizontal histogram (plan E10.1): with only `y` given, the orientation is inferred as `'h'`
 * and the samples are binned along y, bars growing to the right. `ybins.size: 5` sets 5-year bins;
 * their start is still automatic, and for integer data Plotly's rule starts them half a year below
 * a round number (19.5, 24.5, …), so no age sits on an edge and hover reads `20 - 24`, `25 - 29`, ….
 */
export const meta: ExampleMeta = {
  title: 'Histogram: horizontal',
  description: 'Integer ages binned along y (orientation inferred from y only) into 5-year bins.',
  tags: ['histogram', 'chart', 'horizontal', 'statistical'],
};

export function run(el: HTMLElement): ExampleHandle {
  const normal = gaussian(rng(29));
  const y = Array.from({ length: 900 }, () =>
    Math.max(16, Math.min(80, Math.round(38 + 12 * normal()))),
  );
  const chart = createChart(el, {
    data: [{ type: 'histogram', y, name: 'Members', ybins: { size: 5 } }],
    layout: {
      title: { text: 'Member ages' },
      xaxis: { title: { text: 'Members' } },
      yaxis: { title: { text: 'Age' } },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
