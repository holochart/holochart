import { createChart } from '@mk7s/holochart';
import type { InteractionHook } from '../_dev/interaction-scatter.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Table interaction playground (plan E9.13, E20.4): a 200-row table over the right half of a
 * scatter plot with wheel zoom on. The wheel and a drag over the table scroll its rows (the plot
 * never zooms or pans there); dragging a header cell reorders the columns and emits `restyle` with
 * the new `columnorder`. Chart events are logged to `window.__interaction.events`, which
 * tests/interaction/table.spec.ts reads.
 *
 * The geometry is fixed so the tests can find the table without internals: 640×400 px, 20 px
 * margins, the table in `domain.x: [0.5, 1]` (x 320–620, y 20–380), three equal columns, a 28 px
 * header and 20 px rows (single-word cells never grow). Colors are explicit so the tests don't
 * depend on the default template.
 *
 * Not a visual test: its point is the pointer behavior, covered by the interaction suite.
 */
export const meta: ExampleMeta = {
  title: 'Table: scroll and reorder events',
  description:
    'Wheel and drag scrolling over a table on top of a zoomable plot, and header drags that reorder columns; events are logged to window.__interaction.',
  tags: ['table', 'chart', 'interaction', 'no-visual-test'],
  size: { width: 640, height: 400 },
};

const EVENTS = ['restyle', 'relayout', 'click', 'doubleclick'] as const;

export function run(el: HTMLElement): ExampleHandle {
  const n = 200;
  const ids = Array.from({ length: n }, (_, i) => `row${i + 1}`);
  const values = Array.from({ length: n }, (_, i) => (i * 37) % 101);
  const flags = Array.from({ length: n }, (_, i) => (i % 3 === 0 ? 'yes' : 'no'));
  const chart = createChart(el, {
    data: [
      {
        type: 'scatter',
        mode: 'markers',
        x: values.map((_, i) => i),
        y: values,
        marker: { color: '#5e74d5' },
      },
      {
        type: 'table',
        domain: { x: [0.5, 1], y: [0, 1] },
        header: {
          values: ['Id', 'Value', 'Flag'],
          fill: { color: '#15151d' },
          font: { color: '#eceef4' },
        },
        cells: {
          values: [ids, values, flags],
          fill: { color: [ids.map((_, i) => (i % 2 ? '#12121a' : '#0a0a0f'))] },
          font: { color: '#a4a7b5' },
        },
      },
    ],
    layout: {
      margin: { l: 20, r: 20, t: 20, b: 20 },
      showlegend: false,
      xaxis: { showticklabels: false },
      yaxis: { showticklabels: false },
    },
    // No modebar: it would appear over the table's header while the pointer is on the chart.
    config: { scrollZoom: true, displayModeBar: false },
  });
  const hook: InteractionHook = { chart, events: [] };
  for (const name of EVENTS) {
    chart.on(name, (payload: unknown) => {
      hook.events.push({ name, payload: JSON.parse(JSON.stringify(payload ?? null)) as unknown });
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
