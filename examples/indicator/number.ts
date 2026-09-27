import { componentsReady, createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Indicator, number only (plan E12.7): one value as a big number with a `$` prefix and a d3
 * `valueformat`, under a title. Without `number.font.size`, the number is sized to fit its domain
 * (never above Plotly's 80 px default), and the title takes a quarter of that size.
 */
export const meta: ExampleMeta = {
  title: 'Indicator: number',
  description:
    'One value as a big number with a prefix and a d3 format, sized to fit its domain, under a title.',
  tags: ['indicator', 'financial', 'kpi', 'number', 'basic'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'indicator',
        mode: 'number',
        value: 8742310,
        number: { prefix: '$', valueformat: ',.0f' },
        title: { text: 'Revenue, year to date' },
      },
    ],
  });

  return {
    ready: componentsReady(chart),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
