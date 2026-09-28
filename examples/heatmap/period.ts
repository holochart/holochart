import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A heatmap with period alignment (plan E11.1, E3.5): monthly figures are given at each month's
 * first day, and `xperiod: 'M1'` with `xperiodalignment: 'middle'` centers each column in its
 * month, as Plotly does, so the columns sit over the month labels (`ticklabelmode: 'period'`)
 * instead of straddling two months. Hover shows the dates as given (the first of the month).
 */
export const meta: ExampleMeta = {
  title: 'Heatmap: period alignment',
  description:
    'Monthly sales by region, each column centered in its month with xperiod M1 and xperiodalignment.',
  tags: ['heatmap', 'scientific', 'date', 'period'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const months = Array.from({ length: 12 }, (_, i) => `2024-${String(i + 1).padStart(2, '0')}-01`);
  const regions = ['North', 'East', 'South', 'West'];
  // A seasonal peak that arrives later in the south and west.
  const z = regions.map((_, r) =>
    months.map((_, m) => Math.round(40 + 30 * Math.sin(((m - r) / 12) * 2 * Math.PI) + 6 * r)),
  );
  const chart = createChart(el, {
    data: [
      {
        type: 'heatmap',
        x: months,
        y: regions,
        z,
        xperiod: 'M1',
        xperiodalignment: 'middle',
        colorscale: 'Viridis',
        colorbar: { title: { text: 'units' } },
        hovertemplate: '%{y}, %{x|%B %Y}: %{z} units<extra></extra>',
      },
    ],
    layout: {
      title: { text: 'Monthly sales by region' },
      xaxis: { dtick: 'M1', tickformat: '%b', ticklabelmode: 'period' },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
