import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import type { InteractionHook } from './interaction-scatter.ts';

/**
 * Keyboard navigation and keyboard access to the controls (plan E6.5, E17.4), for the interaction
 * suite (tests/interaction/keyboard.spec.ts). Press Tab: the plot area gets a focus ring; the arrow
 * keys move between points (the hover label follows and a live region announces each one), Page
 * Up / Page Down switch traces, Enter clicks, `+` / `-` zoom, Shift + arrows pan and `0` resets.
 * Tab on through the legend items (Enter toggles, Shift + Enter isolates), the update menu, the
 * slider, the modebar and the range selector. `hover`, `unhover`, `click`, `relayout`, `restyle`
 * and `legendclick` are logged to `window.__interaction.events`.
 *
 * Not a visual test: its point is the keyboard behavior (`accessibility/keyboard-focus` shows the
 * focus ring and a keyboard-selected point).
 */
export const meta: ExampleMeta = {
  title: 'Interaction: keyboard',
  description:
    'Two lines and bars on a date axis with a legend, an update menu, a slider, the modebar and a range selector, for keyboard tests; events logged to window.__interaction.',
  tags: ['dev', 'chart', 'a11y', 'keyboard', 'interaction', 'no-visual-test'],
  size: { width: 720, height: 460 },
};

const EVENTS = ['hover', 'unhover', 'click', 'relayout', 'restyle', 'legendclick'] as const;

const MONTHS = ['2024-01-01', '2024-02-01', '2024-03-01', '2024-04-01', '2024-05-01', '2024-06-01'];

/** Points without their trace objects, and relayout / restyle edits as JSON. */
function summarize(payload: unknown): unknown {
  const p = payload as Record<string, unknown>;
  if (Array.isArray(p['points'])) {
    return {
      event: (p['event'] as Event | undefined)?.type,
      points: (p['points'] as Record<string, unknown>[]).map((pt) => ({
        curveNumber: pt['curveNumber'],
        pointNumber: pt['pointNumber'],
        x: pt['x'],
        y: pt['y'],
      })),
    };
  }
  if ('curveNumber' in p) return { curveNumber: p['curveNumber'] };
  return JSON.parse(JSON.stringify(p)) as unknown;
}

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'scatter',
        mode: 'lines+markers',
        name: 'Revenue',
        x: MONTHS,
        y: [12, 15, 11, 18, 21, 19],
      },
      { type: 'bar', name: 'Costs', x: MONTHS, y: [8, 9, 10, 9, 12, 11] },
      {
        type: 'scatter',
        mode: 'lines+markers',
        name: 'Target',
        x: MONTHS,
        y: [14, 14, 16, 16, 18, 18],
      },
    ],
    layout: {
      title: { text: 'Revenue, costs and target' },
      margin: { t: 90 },
      xaxis: {
        title: { text: 'Month' },
        rangeselector: { buttons: [{ step: 'month', count: 3, label: '3m' }, { step: 'all' }] },
      },
      yaxis: { title: { text: 'k$' }, range: [0, 24] },
      updatemenus: [
        {
          type: 'buttons',
          direction: 'right',
          x: 0,
          xanchor: 'left',
          y: 1.2,
          yanchor: 'top',
          name: 'Bar mode',
          buttons: [
            { label: 'Group', method: 'relayout', args: [{ barmode: 'group' }] },
            { label: 'Overlay', method: 'relayout', args: [{ barmode: 'overlay' }] },
          ],
        },
      ],
      sliders: [
        {
          name: 'Marker size',
          x: 0.5,
          len: 0.5,
          y: 1.25,
          yanchor: 'top',
          pad: { t: 0 },
          currentvalue: { visible: false },
          transition: { duration: 0 },
          steps: [4, 6, 8].map((size) => ({
            label: String(size),
            method: 'restyle',
            args: ['marker.size', size, [0, 2]],
          })),
        },
      ],
    },
  });
  const hook: InteractionHook = { chart, events: [] };
  for (const name of EVENTS) {
    chart.on(name, (payload: unknown) => {
      hook.events.push({ name, payload: summarize(payload) });
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
