import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import type { InteractionHook } from './interaction-scatter.ts';

/**
 * Legend groups (plan E5.2, plotly.js `legend/handle_click.js`): clicking a legend item toggles
 * every trace of its `legendgroup` — including traces with `showlegend: false`, which have no item
 * of their own (here the dotted projection follows its fit) — and double-clicking isolates the
 * group. Chart events are logged to `window.__interaction.events` for the interaction suite
 * (tests/interaction/legend.spec.ts).
 *
 * Traces: 0 "fit" (red markers, group `fit`), 1 its projection (red, `showlegend: false`, group
 * `fit`), 2 "other" (blue markers). The legend glyphs have flat colors so tests can find them.
 *
 * Not a visual test: its point is the pointer behavior, covered by the interaction suite.
 */
export const meta: ExampleMeta = {
  title: 'Interaction: legend groups',
  description:
    'Click and double-click legend items of a legendgroup with a hidden-legend member; restyle events are logged to window.__interaction.',
  tags: ['dev', 'chart', 'legend', 'legendgroup', 'interaction', 'no-visual-test'],
  size: { width: 640, height: 400 },
};

const EVENTS = ['restyle', 'legendclick', 'legenddoubleclick'] as const;

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'scatter',
        mode: 'markers',
        name: 'fit',
        legendgroup: 'fit',
        x: [0, 1, 2, 3],
        y: [1, 2, 3, 4],
        marker: { size: 14, color: '#ea2a37' },
      },
      {
        type: 'scatter',
        mode: 'lines',
        name: 'projection',
        legendgroup: 'fit',
        showlegend: false,
        x: [3, 4, 5],
        y: [4, 5, 6],
        line: { color: '#ea2a37', dash: 'dot' },
      },
      {
        type: 'scatter',
        mode: 'markers',
        name: 'other',
        x: [0, 1, 2, 3, 4, 5],
        y: [5, 4, 3, 2, 1, 0],
        marker: { size: 14, color: '#5e74d5' },
      },
    ],
    layout: { showlegend: true, xaxis: { range: [-1, 6] }, yaxis: { range: [-1, 7] } },
  });

  const hook: InteractionHook = { chart, events: [] };
  for (const name of EVENTS) {
    chart.on(name, (payload: unknown) => {
      const p = payload && typeof payload === 'object' ? { ...payload } : payload;
      hook.events.push({
        name,
        payload: name === 'restyle' ? JSON.parse(JSON.stringify(p)) : { name },
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
