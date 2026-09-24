import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import type { InteractionHook } from './interaction-scatter.ts';

/**
 * Editable shapes (plan E5.5): with `config.edits.shapePosition`, drag a shape to move it, drag a
 * rectangle's or ellipse's edge or corner to resize it, drag a line's end to move that end, and
 * drag a path to translate it. Each drag commits one `relayout`. Chart events are logged to
 * `window.__interaction.events` for the interaction suite (tests/interaction/shapes.spec.ts).
 *
 * Layout: x in [0, 10], y in [0, 100]; shapes have flat opaque colors so the tests can sample them.
 *
 * Not a visual test: its point is the pointer behavior, covered by the interaction suite.
 */
export const meta: ExampleMeta = {
  title: 'Interaction: shapes',
  description:
    'Move and resize rectangles and ellipses, move line ends and translate paths; relayout events are logged to window.__interaction.',
  tags: ['dev', 'chart', 'shapes', 'interaction', 'no-visual-test'],
  size: { width: 640, height: 400 },
};

const EVENTS = ['relayout', 'relayouting', 'click'] as const;

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'scatter',
        mode: 'markers',
        x: [0, 10],
        y: [0, 100],
        marker: { size: 6, color: '#80838f' },
      },
    ],
    layout: {
      xaxis: { range: [0, 10] },
      yaxis: { range: [0, 100] },
      showlegend: false,
      shapes: [
        // 0: rect, move by its inside, resize by its edges.
        {
          type: 'rect',
          x0: 1,
          x1: 3,
          y0: 60,
          y1: 80,
          fillcolor: '#ea2a37',
          line: { width: 0 },
        },
        // 1: line, move its ends.
        {
          type: 'line',
          x0: 5,
          y0: 20,
          x1: 8,
          y1: 50,
          line: { color: '#5e74d5', width: 6 },
        },
        // 2: ellipse.
        {
          type: 'circle',
          x0: 6,
          x1: 8,
          y0: 70,
          y1: 90,
          fillcolor: '#118e36',
          line: { width: 0 },
        },
        // 3: path, moved as a whole.
        {
          type: 'path',
          path: 'M 1 10 L 3 10 L 2 30 Z',
          fillcolor: '#9962c0',
          line: { width: 0 },
        },
      ],
    },
    config: { edits: { shapePosition: true } },
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
