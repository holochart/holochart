import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Rich text (E2.10) in trace text labels: bar `texttemplate` with a bold value over an italic
 * unit (inside and outside labels), and scatter `text` with bold, italic, colored, underlined,
 * superscript and subscript runs. A whole-label style (`<b>…</b>`) stays a single label; mixed
 * styles become one run each.
 */
export const meta: ExampleMeta = {
  title: 'Rich text: scatter and bar text labels',
  description:
    'Plotly pseudo-HTML in scatter text and bar texttemplate labels: bold, italic, colored spans, sup/sub and underline.',
  tags: ['dev', 'chart', 'text', 'richtext', 'bar', 'scatter'],
  size: { width: 720, height: 420 },
  // SDF text anti-aliasing varies slightly across GPUs.
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'bar',
        name: 'output',
        x: ['Q1', 'Q2', 'Q3', 'Q4'],
        y: [42, 57, 12, 66],
        texttemplate: '<b>%{y}</b><br><i>kt CO<sub>2</sub></i>',
        textposition: 'auto',
        textfont: { size: 11 },
      },
      {
        type: 'scatter',
        name: 'target',
        mode: 'lines+markers+text',
        x: ['Q1', 'Q2', 'Q3', 'Q4'],
        y: [50, 74, 30, 80],
        text: [
          '<b>base</b> line',
          'x<sup>2</sup> <i>fit</i>',
          '<span style="color:#ff9e00">▲ warn</span> <u>Q3</u>',
          '<b>goal</b>',
        ],
        textposition: 'top center',
        textfont: { size: 11 },
      },
    ],
    layout: {
      yaxis: { range: [0, 90], title: { text: 'kt CO<sub>2</sub>e' } },
      showlegend: false,
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
