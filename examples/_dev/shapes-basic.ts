import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Shapes (E5.5): lines, rectangles and ellipses in data coordinates, a paper-referenced frame
 * and banner, dashed outlines, translucent fills, and threshold lines spanning the subplot
 * (`x domain` / `y domain` references, like `addHline` / `addVline`) with labels.
 */
export const meta: ExampleMeta = {
  title: 'Shapes: lines, rects, circles',
  description:
    'Lines, rectangles and ellipses in data and paper coordinates, dashed outlines, translucent fills and labelled threshold lines.',
  tags: ['dev', 'chart', 'shapes'],
  size: { width: 720, height: 440 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const x = Array.from({ length: 21 }, (_, i) => i / 2);
  const chart = createChart(el, {
    data: [
      {
        type: 'scatter',
        mode: 'lines+markers',
        x,
        y: x.map((v) => 5 + 3 * Math.sin(v * 0.9)),
      },
    ],
    layout: {
      showlegend: false,
      margin: { t: 48 }, // room for the paper banner above the plot
      xaxis: { range: [-0.5, 10.5] },
      yaxis: { range: [0, 10] },
      shapes: [
        // Data coordinates: a translucent box, an ellipse and a diagonal line.
        {
          type: 'rect',
          x0: 1,
          x1: 3,
          y0: 6,
          y1: 9,
          fillcolor: 'rgba(94, 116, 213, 0.25)',
          line: { color: '#5e74d5', width: 2 },
          label: { text: 'rect', textposition: 'top left' },
        },
        {
          type: 'circle',
          x0: 6.5,
          x1: 9.5,
          y0: 6.5,
          y1: 9.5,
          fillcolor: 'rgba(17, 142, 54, 0.3)',
          line: { color: '#118e36', width: 3, dash: 'dot' },
          label: { text: 'circle' },
        },
        {
          type: 'line',
          x0: 4,
          y0: 1,
          x1: 9,
          y1: 4,
          line: { color: '#9962c0', width: 4 },
          label: { text: 'along the line', font: { color: '#9962c0' } },
        },
        // Thresholds across the subplot: x/y domain references.
        {
          type: 'line',
          xref: 'x domain',
          x0: 0,
          x1: 1,
          y0: 2,
          y1: 2,
          line: { color: '#ff9e00', width: 2, dash: 'dash' },
          label: { text: 'y = 2', textposition: 'end' },
        },
        {
          type: 'line',
          yref: 'y domain',
          y0: 0,
          y1: 1,
          x0: 5,
          x1: 5,
          line: { width: 1.5, dash: 'dashdot' },
          label: { texttemplate: 'x = %{x0:.1f}', textposition: 'end', textangle: 0 },
        },
        // Paper coordinates: a frame around the plot area and a banner above it.
        {
          type: 'rect',
          xref: 'paper',
          yref: 'paper',
          x0: 0,
          x1: 1,
          y0: 0,
          y1: 1,
          line: { color: '#80838f', width: 1 },
        },
        {
          type: 'rect',
          xref: 'paper',
          yref: 'paper',
          x0: 0.6,
          x1: 0.95,
          y0: 1.03,
          y1: 1.12,
          fillcolor: '#128b8b',
          line: { width: 0 },
          label: { text: 'paper banner', font: { color: '#ffffff' } },
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
