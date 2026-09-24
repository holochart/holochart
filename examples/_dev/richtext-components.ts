import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Rich text (E2.10) in every component that takes Plotly pseudo-HTML: the figure title and
 * subtitle, axis titles, tick labels (`ticktext`), legend items and title, annotations (every
 * tag, colored and sized spans, `<br>` with alignment, a rotated one) and shape labels. Partially
 * styled strings are drawn as several runs (bold and italic runs use the default font's bold and
 * italic faces); strings styled as a whole stay single labels.
 */
export const meta: ExampleMeta = {
  title: 'Rich text: titles, axes, legend, annotations, shapes',
  description:
    'Plotly pseudo-HTML (<b>, <i>, <em>, <u>, <s>, <sup>, <sub>, <span style>, <a href>, <br>) in titles, axis titles, tick labels, legend items, annotations and shape labels.',
  tags: ['dev', 'chart', 'text', 'richtext'],
  size: { width: 760, height: 480 },
  // SDF text anti-aliasing varies slightly across GPUs.
  testTolerance: 0.004,
};

const X = [1, 2, 3, 4, 5, 6];

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      { x: X, y: [2.1, 2.9, 3.4, 4.8, 5.1, 6.3], name: 'CO<sub>2</sub> <i>(ppm)</i>' },
      { x: X, y: [1.2, 1.6, 2.5, 2.2, 3.4, 3.9], name: '<b>CH<sub>4</sub></b> trend' },
      {
        x: X,
        y: [0.6, 0.9, 1.1, 1.8, 1.6, 2.4],
        name: '<span style="color:#ff9e00">N<sub>2</sub>O</span> est.',
      },
    ],
    layout: {
      title: {
        text: '<b>Rich</b> <i>text</i> in <em>every</em> <u>component</u>, E = mc<sup>2</sup>',
        subtitle: {
          text: 'Subtitle with <s>strike</s>, H<sub>2</sub>O and <a href="https://mk7s.dev/holochart/">a link</a>',
        },
      },
      // A vertical legend on the right keeps the two-line title clear of it (ADR-021 overlap).
      legend: {
        orientation: 'v',
        x: 1.02,
        xanchor: 'left',
        y: 1,
        yanchor: 'top',
        title: { text: '<b>Gas</b> <span style="font-size:7px">(scaled)</span>' },
      },
      xaxis: {
        title: { text: 'Time (10<sup>3</sup> years, <i>BP</i>)' },
        tickvals: [1, 2, 3, 4, 5, 6],
        ticktext: ['<b>A</b>', 'B<sub>1</sub>', 'C', '<i>D</i>', 'E<sup>*</sup>', '<u>F</u>'],
      },
      yaxis: { title: { text: 'Forcing (W m<sup>−2</sup>)' } },
      annotations: [
        {
          x: 2,
          y: 5.6,
          text:
            '<b>bold</b> <i>italic</i> <em>em</em> <strong>strong</strong><br>' +
            '<u>under</u> <s>strike</s> x<sup>2</sup> x<sub>i</sub> x<sup>a<sup>b</sup></sup><br>' +
            '<span style="color:#5e74d5">blue</span> <span style="font-size:14px">big</span> ' +
            '<span style="font-family:monospace">mono</span> <a href="https://example.com">link</a>',
          showarrow: false,
          align: 'left',
          bgcolor: '#15151d',
          bordercolor: '#3e3e4c',
          borderwidth: 1,
          borderpad: 4,
        },
        {
          x: 5,
          y: 5.1,
          ax: 40,
          ay: 40,
          text: 'peak: <b>5.1</b> W m<sup>−2</sup><br><span style="color:#ea2a37">+12%</span>',
          align: 'right',
        },
        {
          x: 3.5,
          y: 1.6,
          text: '<i>rotated</i> <b>run</b>s',
          textangle: -20,
          showarrow: false,
        },
        {
          xref: 'paper',
          yref: 'paper',
          x: 1,
          y: 0,
          xanchor: 'right',
          yanchor: 'bottom',
          text: 'entities: &lt;b&gt; &amp; &deg;C &plusmn; &mu;m &#x2192;',
          showarrow: false,
        },
      ],
      shapes: [
        {
          type: 'rect',
          x0: 3.6,
          x1: 4.4,
          y0: 0.2,
          y1: 1.0,
          line: { width: 1 },
          label: { text: '<b>zone</b> Δ<sub>t</sub>' },
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
