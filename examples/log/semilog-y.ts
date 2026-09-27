import { componentsReady, createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Semilog-y (plan E11.11): $10,000 compounding for 50 years at 3 %, 6 % and 9 % a year, on a log
 * y axis (`yaxis.type: 'log'`). Constant growth is a straight line on a log axis, and its slope is
 * the growth rate, so the three rates read as three straight lines of increasing slope — on a
 * linear axis the 9 % curve would dwarf the others.
 */
export const meta: ExampleMeta = {
  title: 'Log: semilog-y compound growth',
  description:
    'Compound growth at three rates over 50 years on a log y axis, where constant growth is a straight line.',
  tags: ['log', 'axes', 'line', 'scatter'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const years = Array.from({ length: 51 }, (_, i) => i);
  const rates = [0.03, 0.06, 0.09];
  const chart = createChart(el, {
    data: rates.map((r) => ({
      type: 'scatter',
      mode: 'lines',
      name: `${Math.round(r * 100)} % a year`,
      x: years,
      y: years.map((t) => Math.round(10_000 * (1 + r) ** t)),
      hovertemplate: 'Year %{x}: %{y:$,.0f}',
    })),
    layout: {
      title: { text: '$10,000 compounding for 50 years' },
      legend: { x: 0.02, y: 0.98 },
      xaxis: { title: { text: 'Years' } },
      yaxis: { type: 'log', title: { text: 'Value (log scale)' }, tickprefix: '$' },
    },
  });

  return {
    ready: componentsReady(chart),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
