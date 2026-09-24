import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Layout images (E5.6): a logo (a 160×64 PNG) placed in paper coordinates, in three square boxes
 * outlined by shapes: `sizing: 'contain'` (fits inside, aligned by the anchors), `'fill'` (covers,
 * cropped) and `'stretch'`. A fourth copy sits in the top-right margin with `opacity`.
 */
export const meta: ExampleMeta = {
  title: 'Images: logo sizing',
  description:
    'A logo in paper coordinates with contain, fill and stretch sizing inside outlined boxes, and a translucent copy in the margin.',
  tags: ['dev', 'chart', 'images'],
  size: { width: 720, height: 400 },
  testTolerance: 0.004,
};

const LOGO = new URL('../_lib/assets/logo.png', import.meta.url).href;

export function run(el: HTMLElement): ExampleHandle {
  const boxes = [
    { x: 0.05, sizing: 'contain', xanchor: 'left', yanchor: 'top' },
    { x: 0.38, sizing: 'fill', xanchor: 'left', yanchor: 'top' },
    { x: 0.71, sizing: 'stretch', xanchor: 'left', yanchor: 'top' },
  ] as const;
  const size = { sizex: 0.24, sizey: 0.5 };
  const chart = createChart(el, {
    data: [
      {
        type: 'scatter',
        mode: 'lines',
        x: [0, 1, 2, 3, 4, 5],
        y: [1, 3, 2, 4, 3, 5],
        line: { color: '#3e3e4c', width: 2 },
      },
    ],
    layout: {
      showlegend: false,
      margin: { r: 110 }, // room for the translucent logo in the top-right margin
      images: [
        ...boxes.map((b) => ({
          source: LOGO,
          xref: 'paper',
          yref: 'paper',
          y: 0.8,
          ...size,
          ...b,
        })),
        {
          source: LOGO,
          xref: 'paper',
          yref: 'paper',
          x: 1.02,
          y: 1.06,
          sizex: 0.14,
          sizey: 0.14,
          xanchor: 'left',
          yanchor: 'top',
          opacity: 0.5,
        },
      ],
      shapes: boxes.map((b) => ({
        type: 'rect',
        xref: 'paper',
        yref: 'paper',
        x0: b.x,
        x1: b.x + size.sizex,
        y0: 0.8 - size.sizey,
        y1: 0.8,
        line: { color: '#80838f', width: 1, dash: 'dot' },
        label: { text: b.sizing, textposition: 'bottom center', yanchor: 'top', padding: 6 },
      })),
    },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
