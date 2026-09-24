import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import type { InteractionHook } from './interaction-scatter.ts';

/**
 * Shape drawing (plan E5.5): the draw `dragmode`s from the modebar's draw buttons (added with
 * `config.modeBarButtonsToAdd`) — drag to draw a line, an open or closed freeform path, a circle
 * or a rectangle, styled by `layout.newshape`. Each drawing commits one `relayout` with the whole
 * `shapes` list, as in Plotly. Click a drawn shape to make it active (`layout.activeshape`), then
 * erase it with the eraser button. Chart events are logged to `window.__interaction.events` for
 * the interaction suite (tests/interaction/draw.spec.ts).
 *
 * Layout: x in [0, 10], y in [0, 100]; new shapes have a flat opaque fill so tests can sample it.
 *
 * Not a visual test: its point is the pointer behavior, covered by the interaction suite.
 */
export const meta: ExampleMeta = {
  title: 'Interaction: drawing shapes',
  description:
    'Draw lines, freeform paths, circles and rectangles with the draw dragmodes, then select and erase them; relayout events are logged to window.__interaction.',
  tags: ['dev', 'chart', 'shapes', 'interaction', 'dragmode', 'newshape', 'no-visual-test'],
  size: { width: 640, height: 400 },
};

const EVENTS = ['relayout', 'click'] as const;

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'scatter',
        mode: 'markers',
        x: [0, 5, 10],
        y: [0, 50, 100],
        marker: { size: 6, color: '#80838f' },
      },
    ],
    layout: {
      xaxis: { range: [0, 10] },
      yaxis: { range: [0, 100] },
      showlegend: false,
      dragmode: 'drawrect',
      newshape: { line: { color: '#5e74d5', width: 3 }, fillcolor: '#ea2a37' },
    },
    config: {
      displayModeBar: true,
      modeBarButtonsToAdd: [
        'drawline',
        'drawopenpath',
        'drawclosedpath',
        'drawcircle',
        'drawrect',
        'eraseshape',
      ],
    },
  });

  const hook: InteractionHook = { chart, events: [] };
  for (const name of EVENTS) {
    chart.on(name, (payload: unknown) => {
      const p = payload && typeof payload === 'object' ? { ...payload, event: undefined } : payload;
      hook.events.push({ name, payload: p });
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
