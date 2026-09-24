import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Rotated and multi-line annotation text (E5.4): `textangle` rotates the whole box (background and
 * border included) about its center, anchors apply to the rotated bounding box, multi-line text
 * (`<br>`) is aligned with `align` inside a fixed `width`, whole-text bold/italic, and `opacity`.
 */
export const meta: ExampleMeta = {
  title: 'Annotations: rotated and multi-line text',
  description:
    'textangle on boxed labels with arrows, multi-line text with align inside a fixed width, bold/italic text and opacity.',
  tags: ['dev', 'chart', 'annotations'],
  size: { width: 720, height: 420 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const box = { bgcolor: '#15151d', bordercolor: '#3e3e4c', borderwidth: 1, borderpad: 4 };
  const chart = createChart(el, {
    data: [
      {
        type: 'scatter',
        mode: 'lines',
        x: [0, 1, 2, 3, 4, 5, 6],
        y: [1, 3, 2, 5, 4, 6, 5],
      },
    ],
    layout: {
      showlegend: false,
      yaxis: { range: [0, 7.5] },
      annotations: [
        { x: 1, y: 3, text: 'rotated −30°', textangle: -30, ax: -40, ay: -50, ...box },
        { x: 3, y: 5, text: 'vertical', textangle: 90, ax: 0, ay: -70, ...box },
        {
          x: 5,
          y: 6,
          text: 'left-aligned<br>two lines<br>in a 120 px box',
          align: 'left',
          width: 120,
          ax: 40,
          ay: 60,
          ...box,
          bgcolor: 'rgba(94, 116, 213, 0.18)',
        },
        {
          x: 2,
          y: 2,
          text: '<b>bold</b>',
          showarrow: false,
          textangle: 20,
          yshift: -24,
          font: { size: 13, color: '#118e36' },
        },
        {
          x: 4,
          y: 4,
          text: '<i>right<br>aligned</i>',
          align: 'right',
          ax: 30,
          ay: 45,
          opacity: 0.6,
          ...box,
        },
        {
          xref: 'paper',
          yref: 'paper',
          x: 0.02,
          y: 0.98,
          text: 'paper note, 45°',
          textangle: 45,
          showarrow: false,
          font: { color: '#80838f' },
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
