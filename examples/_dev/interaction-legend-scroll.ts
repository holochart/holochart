import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import type { InteractionHook } from './interaction-scatter.ts';

/**
 * Two legends, one of them scrolling (plan E5.2), for the interaction suite
 * (tests/interaction/legend-scroll.spec.ts): clicks in each legend act on its own traces, and the
 * second legend's 20 items scroll inside `maxheight: 120` px — by wheel (which must not zoom the
 * plot: `scrollZoom` is on), scrollbar drag, finger drag and keyboard focus. Chart events are logged
 * to `window.__interaction.events`.
 *
 * Traces: 0–2 "A", "B", "C" in `legend` (left of the plot); 3–22 "s01"… "s20" in `legend2`
 * (right of the plot). The keyboard toolbars' buttons sit over the drawn items, so tests find the
 * items (at their scrolled positions) through them.
 *
 * Not a visual test: its point is the pointer behavior, covered by the interaction suite.
 */
export const meta: ExampleMeta = {
  title: 'Interaction: two legends, one scrolling',
  description:
    'A left legend and a scrolling right legend (legend2, maxheight 120 px); legend and restyle events are logged to window.__interaction.',
  tags: ['dev', 'chart', 'legend', 'interaction', 'no-visual-test'],
  size: { width: 720, height: 400 },
};

const EVENTS = ['restyle', 'relayout', 'legendclick', 'legenddoubleclick'] as const;

export function run(el: HTMLElement): ExampleHandle {
  const x = [0, 1, 2, 3, 4];
  const first = ['A', 'B', 'C'].map((name, i) => ({
    type: 'scatter' as const,
    mode: 'lines' as const,
    name,
    x,
    y: x.map((v) => v + i * 2),
  }));
  const second = Array.from({ length: 20 }, (_, i) => ({
    type: 'scatter' as const,
    mode: 'markers' as const,
    name: `s${String(i + 1).padStart(2, '0')}`,
    legend: 'legend2',
    x,
    y: x.map((v) => 10 + i * 0.5 - v),
  }));
  const chart = createChart(el, {
    data: [...first, ...second],
    layout: {
      template: 'plotly',
      xaxis: { range: [-1, 5] },
      yaxis: { range: [-1, 22] },
      legend: { x: -0.12, xanchor: 'right', y: 1, yanchor: 'top' },
      legend2: { x: 1.02, y: 1, yanchor: 'top', maxheight: 120, title: { text: 'Sensors' } },
    },
    config: { scrollZoom: true },
  });

  const hook: InteractionHook = { chart, events: [] };
  for (const name of EVENTS) {
    chart.on(name, (payload: unknown) => {
      const p = payload && typeof payload === 'object' ? { ...payload } : payload;
      hook.events.push({
        name,
        payload:
          name === 'restyle' || name === 'relayout' ? JSON.parse(JSON.stringify(p)) : { name },
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
