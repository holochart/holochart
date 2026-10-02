import { componentsReady, createChart, type IndicatorTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Indicator, KPI dashboard (plan E12.7): seven indicators placed by `domain`. Number-and-delta
 * cards and two angular gauges sit in the cells of a 2 × 3 `layout.grid` (`domain.row` /
 * `domain.column`); two bullet gauges share the last cell through explicit `domain.x` / `domain.y`.
 * Every indicator fits its number to its own domain.
 */
export const meta: ExampleMeta = {
  title: 'Indicator: KPI dashboard',
  description:
    'Number and delta cards, angular gauges and bullet gauges laid out on a grid by domain, each fitted to its cell.',
  tags: ['indicator', 'financial', 'kpi', 'dashboard', 'grid', 'gauge', 'bullet'],
  size: { width: 760, height: 460 },
  testTolerance: 0.004,
};

/** A bullet gauge in the bottom-right cell, between `y0` and `y1`. */
function bullet(
  title: string,
  value: number,
  max: number,
  color: string,
  y: [number, number],
): IndicatorTrace {
  return {
    type: 'indicator',
    mode: 'number+gauge',
    value,
    number: { suffix: ' TB' },
    title: { text: title, font: { size: 13 } },
    gauge: {
      shape: 'bullet',
      axis: { range: [0, max] },
      bar: { color, thickness: 0.4 },
      threshold: { value: 0.9 * max, thickness: 0.8 },
    },
    domain: { x: [0.78, 1], y },
  };
}

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'indicator',
        mode: 'number+delta',
        value: 48213,
        delta: { reference: 45120, relative: true, valueformat: '.1%' },
        title: { text: 'Active users' },
        domain: { row: 0, column: 0 },
      },
      {
        type: 'indicator',
        mode: 'number+delta',
        value: 3.42,
        number: { prefix: '$', valueformat: '.2f' },
        delta: { reference: 3.61, valueformat: '.2f' },
        title: { text: 'Revenue per user' },
        domain: { row: 0, column: 1 },
      },
      {
        type: 'indicator',
        mode: 'number+delta',
        value: 0.0271,
        number: { valueformat: '.2%' },
        // Falling churn is good news: swap the colors.
        delta: {
          reference: 0.0312,
          valueformat: '.2%',
          increasing: { color: '#ea2a37' },
          decreasing: { color: '#118e36' },
        },
        title: { text: 'Churn' },
        domain: { row: 0, column: 2 },
      },
      {
        type: 'indicator',
        mode: 'gauge+number',
        value: 72,
        number: { suffix: '%' },
        title: { text: 'CPU' },
        gauge: { axis: { range: [0, 100] }, threshold: { value: 90 } },
        domain: { row: 1, column: 0 },
      },
      {
        type: 'indicator',
        mode: 'gauge+number',
        value: 41,
        number: { suffix: '%' },
        title: { text: 'Memory' },
        gauge: { axis: { range: [0, 100] }, bar: { color: '#128b8b' }, threshold: { value: 90 } },
        domain: { row: 1, column: 1 },
      },
      bullet('Disk', 1.8, 4, '#9962c0', [0.28, 0.4]),
      bullet('Backup', 3.1, 4, '#cc540a', [0.06, 0.18]),
    ],
    layout: {
      grid: { rows: 2, columns: 3, pattern: 'independent', ygap: 0.3 },
      margin: { t: 40, r: 40 },
    },
  });

  return {
    ready: componentsReady(chart),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
