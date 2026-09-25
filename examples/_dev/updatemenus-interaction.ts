import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import type { InteractionHook } from './interaction-scatter.ts';

/**
 * Update menus (plan E5.10) for the interaction suite (tests/interaction/updatemenus.spec.ts):
 * menu 0 is a row of buttons restyling `visible`, menu 1 a dropdown restyling `mode`, menu 2 a
 * column of relayout buttons for the y-axis type (tracked: it follows `yaxis.type` however it
 * changes), menu 3 an `args2` toggle, menu 4 a button with `execute: false`. Chart events are
 * logged to `window.__interaction.events`.
 *
 * Not a visual test: its point is the click and keyboard behavior.
 */
export const meta: ExampleMeta = {
  title: 'Interaction: update menus',
  description:
    'Button, dropdown, tracked relayout, args2 toggle and execute:false menus; events logged to window.__interaction.',
  tags: ['dev', 'chart', 'updatemenus', 'interaction', 'no-visual-test'],
  size: { width: 700, height: 420 },
};

const EVENTS = ['buttonclicked', 'restyle', 'relayout'] as const;
const X = [1, 2, 3, 4, 5, 6];

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      { type: 'scatter', mode: 'lines', name: 'a', x: X, y: [1, 3, 2, 5, 4, 6] },
      { type: 'scatter', mode: 'lines', name: 'b', x: X, y: [10, 30, 20, 50, 40, 60] },
    ],
    layout: {
      showlegend: false,
      margin: { t: 70, r: 120 },
      updatemenus: [
        {
          name: 'Series',
          type: 'buttons',
          direction: 'right',
          x: 0,
          xanchor: 'left',
          y: 1.12,
          yanchor: 'bottom',
          buttons: [
            { label: 'Both', method: 'restyle', args: ['visible', [true, true]] },
            { label: 'Only a', method: 'restyle', args: ['visible', [true, false]] },
            { label: 'Only b', method: 'restyle', args: ['visible', [false, true]] },
          ],
        },
        {
          name: 'Mode',
          x: 0.6,
          xanchor: 'left',
          y: 1.12,
          yanchor: 'bottom',
          buttons: [
            { label: 'Lines', method: 'restyle', args: ['mode', 'lines'] },
            { label: 'Markers', method: 'restyle', args: ['mode', 'markers'] },
            { label: 'Both', method: 'restyle', args: ['mode', 'lines+markers'] },
          ],
        },
        {
          name: 'Y axis',
          type: 'buttons',
          x: 1.02,
          xanchor: 'left',
          y: 1,
          buttons: [
            { label: 'Linear', method: 'relayout', args: ['yaxis.type', 'linear'] },
            { label: 'Log', method: 'relayout', args: ['yaxis.type', 'log'] },
          ],
        },
        {
          name: 'Grid',
          type: 'buttons',
          active: -1,
          x: 1.02,
          xanchor: 'left',
          y: 0.5,
          buttons: [
            {
              label: 'Hide grid',
              method: 'relayout',
              args: ['yaxis.showgrid', false],
              args2: ['yaxis.showgrid', true],
            },
          ],
        },
        {
          name: 'App',
          type: 'buttons',
          showactive: false,
          x: 1.02,
          xanchor: 'left',
          y: 0.2,
          buttons: [
            { label: 'Custom', method: 'relayout', args: ['title.text', 'x'], execute: false },
          ],
        },
      ],
    },
  });

  const hook: InteractionHook = { chart, events: [] };
  for (const name of EVENTS) {
    chart.on(name, (payload: unknown) => {
      const p = payload as Record<string, unknown>;
      hook.events.push({
        name,
        payload:
          name === 'buttonclicked'
            ? {
                active: p['active'],
                label: (p['button'] as { label?: unknown }).label,
                menu: (p['menu'] as { _index?: unknown })._index,
              }
            : JSON.parse(JSON.stringify(p)),
      });
    });
  }
  window.__interaction = hook;
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => {
      if (window.__interaction === hook) delete window.__interaction;
      chart.destroy();
    },
  };
}
