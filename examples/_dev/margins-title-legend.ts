import { componentsReady, createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Margins in the default look (ADR-021): the title reserves its room at the top
 * (`title.automargin`, Plotly's reserved margin) and the horizontal legend, wrapping to three rows,
 * pushes the top margin on top of it, so the two stack instead of overlapping. The long tick labels
 * grow the left and right margins (`automargin`) and stay `margin.gutter` px (4 in this look) off
 * the figure edge.
 */
export const meta: ExampleMeta = {
  title: 'Margins: title over a multi-row legend, edge gutter',
  description:
    'A title stacked over a legend that wraps to three rows, and automargin tick labels kept off the figure edge by the gutter.',
  tags: ['dev', 'chart', 'legend', 'title', 'margins'],
  size: { width: 560, height: 360 },
  // SDF text anti-aliasing varies slightly across GPUs.
  testTolerance: 0.004,
};

const REGIONS = [
  'North America',
  'South America',
  'Western Europe',
  'Eastern Europe',
  'Middle East',
  'Sub-Saharan Africa',
  'South Asia',
  'East Asia',
  'Southeast Asia',
  'Oceania',
];

export function run(el: HTMLElement): ExampleHandle {
  const months = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'];
  const chart = createChart(el, {
    data: [
      ...REGIONS.map((name, k) => ({
        mode: 'lines',
        name,
        x: months,
        y: months.map((_, i) => 1_200_000 + k * 450_000 + i * (k + 2) * 60_000),
      })),
      {
        mode: 'markers',
        name: 'share',
        x: months,
        y: [0.21, 0.24, 0.26, 0.31, 0.33, 0.38],
        yaxis: 'y2',
      },
    ],
    layout: {
      title: { text: 'Monthly active users by region' },
      yaxis: { tickformat: ',d', ticksuffix: ' users' },
      yaxis2: {
        overlaying: 'y',
        side: 'right',
        tickformat: '.0%',
        ticksuffix: ' of total',
        showgrid: false,
        automargin: true,
      },
    },
  });

  return {
    ready: componentsReady(chart),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
