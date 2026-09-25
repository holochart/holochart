import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Update menus (plan E5.10) of `type: 'buttons'` in the default look: a row of buttons above the
 * plot restyles `visible` to show one series or all of them, and a column on the right relayouts
 * the y axis between linear and log. Both menus are DOM `<button>`s over the canvas (a toolbar
 * each, `aria-pressed` on the active one); the right column pushes the right margin, like
 * Plotly's `autoMargin`.
 */
export const meta: ExampleMeta = {
  title: 'Update menus: buttons (restyle visibility, relayout axis type)',
  description:
    'Two button menus: one row restyles trace visibility, one column relayouts the y-axis type between linear and log.',
  tags: ['dev', 'chart', 'updatemenus', 'restyle', 'relayout'],
  size: { width: 640, height: 400 },
  testTolerance: 0.004,
};

const X = Array.from({ length: 40 }, (_, i) => i);

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      { type: 'scatter', mode: 'lines', name: 'Revenue', x: X, y: X.map((i) => 20 * 1.1 ** i) },
      { type: 'scatter', mode: 'lines', name: 'Costs', x: X, y: X.map((i) => 60 * 1.07 ** i) },
      { type: 'scatter', mode: 'lines', name: 'Margin', x: X, y: X.map((i) => 5 + 3 * i) },
    ],
    layout: {
      title: { text: 'Quarterly figures' },
      showlegend: false,
      margin: { t: 64 },
      updatemenus: [
        {
          type: 'buttons',
          direction: 'right',
          x: 0,
          xanchor: 'left',
          y: 1.02,
          yanchor: 'bottom',
          active: 0,
          buttons: [
            { label: 'All', method: 'restyle', args: ['visible', [true, true, true]] },
            { label: 'Revenue', method: 'restyle', args: ['visible', [true, false, false]] },
            { label: 'Costs', method: 'restyle', args: ['visible', [false, true, false]] },
            { label: 'Margin', method: 'restyle', args: ['visible', [false, false, true]] },
          ],
        },
        {
          type: 'buttons',
          direction: 'down',
          x: 1.02,
          xanchor: 'left',
          y: 1,
          yanchor: 'top',
          active: 0,
          buttons: [
            { label: 'Linear', method: 'relayout', args: ['yaxis.type', 'linear'] },
            { label: 'Log', method: 'relayout', args: ['yaxis.type', 'log'] },
          ],
        },
      ],
    },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
