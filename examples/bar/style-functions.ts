import { createChart } from '@mk7s/holochart';
import { rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Style functions (plan E8.6) next to style rules (E8.5) on bars: monthly profit, where
 * `marker.color` is a function of the point (`(p) => (p.y < 0 ? red : green)`) and `text` a
 * function of the point and its index, and one style rule outlines the best months. Functions are
 * evaluated into per-point arrays before the bar trace sees the data, so any per-point (`arrayOk`)
 * attribute of any trace type takes one. They are not serializable: `toJSON()` stores the arrays.
 */
export const meta: ExampleMeta = {
  title: 'Bar: style functions and rules',
  description:
    'marker.color and text as functions of each point (evaluated into arrays), with a style rule outlining the best months.',
  tags: ['bar', 'style-functions', 'style-rules', 'conditional-styling'],
  testTolerance: 0.004,
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function run(el: HTMLElement): ExampleHandle {
  const random = rng(21);
  const profit = MONTHS.map(
    (_, i) => Math.round((Math.sin(i / 2) * 40 + (random() - 0.4) * 50) * 10) / 10,
  );

  const chart = createChart(el, {
    data: [
      {
        type: 'bar',
        x: MONTHS,
        y: profit,
        marker: {
          color: (p: { y: number }) => (p.y < 0 ? '#ef4444' : '#10b981'),
          line: { color: '#facc15', width: 0 },
        },
        text: (p: { y: number }, i: number) => (i % 3 === 0 || p.y < -20 ? `${p.y}` : ''),
        textposition: 'outside',
        styleRules: [{ when: { y: { gte: 40 } }, set: { 'marker.line.width': 3 } }],
        hovertemplate: '%{x}: %{y}k<extra></extra>',
      },
    ],
    layout: {
      title: { text: 'Monthly profit (k)' },
      yaxis: { title: { text: 'Profit' }, zeroline: true },
      showlegend: false,
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
