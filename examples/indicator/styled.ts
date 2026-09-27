import { componentsReady, createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Indicator styling (plan E12.7): an angular gauge with a thin outlined bar, outlined steps, a
 * border, a `dtick` axis with prefixed labels and longer ticks; a left-aligned number whose delta
 * sits on its left with custom symbols; and a bullet gauge with named ticks (`tickvals` /
 * `ticktext`), a thick threshold and a bold number.
 */
export const meta: ExampleMeta = {
  title: 'Indicator: styling',
  description:
    'Custom fonts, symbols, alignment, outlined bars and steps, borders, tick formats and named ticks on angular and bullet gauges.',
  tags: ['indicator', 'financial', 'kpi', 'gauge', 'styling'],
  size: { width: 720, height: 420 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'indicator',
        mode: 'gauge+number',
        value: 0.62,
        number: { valueformat: '.0%', font: { color: '#3fd0e0', weight: 'bold' } },
        title: { text: 'Utilization', font: { size: 14, color: '#eceef4' } },
        gauge: {
          axis: {
            range: [0, 1],
            dtick: 0.25,
            tickformat: '.0%',
            ticklen: 6,
            tickwidth: 2,
            tickcolor: '#80838f',
            tickfont: { size: 10, color: '#a4a7b5' },
          },
          bar: { color: '#3fd0e0', thickness: 0.25, line: { color: '#c8f7ff', width: 1 } },
          bgcolor: '#15151d',
          bordercolor: '#3e3e4c',
          borderwidth: 2,
          steps: [
            { range: [0.75, 0.9], color: 'rgba(204, 84, 10, 0.35)', thickness: 0.6 },
            {
              range: [0.9, 1],
              color: 'rgba(234, 42, 55, 0.45)',
              thickness: 0.6,
              line: { color: '#ea2a37', width: 1 },
            },
          ],
          threshold: { value: 0.9, thickness: 1, line: { color: '#ea2a37', width: 2 } },
        },
        domain: { x: [0, 0.46], y: [0.3, 1] },
      },
      {
        type: 'indicator',
        mode: 'number+delta',
        value: 1873.4,
        align: 'left',
        number: { prefix: '€', valueformat: ',.1f', font: { weight: 'bold' } },
        delta: {
          reference: 1790,
          position: 'left',
          valueformat: ',.1f',
          increasing: { symbol: '+', color: '#3fd0e0' },
          decreasing: { symbol: '−', color: '#ff9e00' },
        },
        title: { text: 'Net asset value', align: 'left', font: { size: 14 } },
        domain: { x: [0.56, 1], y: [0.45, 0.85] },
      },
      {
        type: 'indicator',
        mode: 'number+gauge',
        value: 3.4,
        number: { font: { weight: 'bold' } },
        title: { text: 'Rating' },
        gauge: {
          shape: 'bullet',
          axis: {
            range: [1, 5],
            tickvals: [1, 2, 3, 4, 5],
            ticktext: ['poor', 'fair', 'good', 'great', 'superb'],
          },
          bar: { color: '#ff9e00', thickness: 0.5 },
          threshold: { value: 4, thickness: 0.9, line: { color: '#eceef4', width: 4 } },
        },
        domain: { x: [0.66, 1], y: [0.05, 0.2] },
      },
    ],
    layout: { margin: { l: 40, r: 24, t: 24, b: 32 } },
  });

  return {
    ready: componentsReady(chart),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
