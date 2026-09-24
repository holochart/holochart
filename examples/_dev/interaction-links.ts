import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import type { InteractionHook } from './interaction-scatter.ts';

/**
 * Rich-text links (E2.10): `<a href>` in the title, an annotation and a scatter text label.
 * Hovering a link shows a pointer cursor; clicking opens it with its `target` (default
 * `_blank`, without an opener). Used by tests/interaction/links.spec.ts, which stubs
 * `window.open`.
 *
 * Layout: one trace at (v, 10·v), x in [-1, 10], y in [-10, 100]; the annotation is a link at
 * (5, 50), 20 px; the title is a link as a whole; the point (2, 20) is labeled with a link.
 *
 * Not a visual test: its point is the pointer behavior, covered by the interaction suite.
 */
export const meta: ExampleMeta = {
  title: 'Interaction: rich-text links',
  description:
    'Links in a title, an annotation and a scatter text label: pointer cursor on hover, window.open with the link target on click.',
  tags: ['dev', 'chart', 'text', 'richtext', 'interaction', 'no-visual-test'],
  size: { width: 640, height: 400 },
};

export function run(el: HTMLElement): ExampleHandle {
  const x = Array.from({ length: 10 }, (_, i) => i);
  const chart = createChart(el, {
    data: [
      {
        type: 'scatter',
        mode: 'markers+text',
        x,
        y: x.map((v) => v * 10),
        text: x.map((v) =>
          v === 2 ? '<a href="https://example.com/point" target="_top">point link</a>' : '',
        ),
        textposition: 'middle right',
        textfont: { size: 16 },
      },
    ],
    layout: {
      title: { text: '<a href="https://example.com/title">Title link</a>' },
      xaxis: { range: [-1, 10] },
      yaxis: { range: [-10, 100] },
      showlegend: false,
      annotations: [
        {
          x: 5,
          y: 50,
          text: '<a href="https://example.com/annotation" target="_self">annotation link</a>',
          showarrow: false,
          font: { size: 20 },
        },
      ],
    },
  });
  const hook: InteractionHook = { chart, events: [] };
  for (const name of ['click', 'relayout'] as const) {
    chart.on(name, () => hook.events.push({ name, payload: {} }));
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
