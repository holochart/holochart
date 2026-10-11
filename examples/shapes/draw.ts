import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Drawing shapes: the chart starts in the `drawrect` drag mode, so a drag on the plot draws a
 * rectangle, styled by `layout.newshape`. The modebar shows the draw buttons and the eraser only
 * when they are added by name (`config.modeBarButtonsToAdd`); `displayModeBar: true` keeps the
 * bar visible, so the tools are there before the pointer reaches the chart. A drawing is appended
 * to `layout.shapes` in data coordinates with one `relayout`, and follows zoom and pan.
 *
 * One rectangle is there from the start, with `editable: true`, as drawn shapes have: drag it to
 * move it, or click it to make it the active shape and press the eraser button.
 * `eraseActiveShape(chart)` removes the active shape from code.
 *
 * The picture before any input is deterministic, so it is a visual test; the pointer behavior is
 * covered by the interaction suite (`_dev/draw-shapes`).
 */
export const meta: ExampleMeta = {
  title: 'Shapes: drawing and erasing',
  description:
    'A chart in the drawrect drag mode with the draw and erase buttons in its modebar, and one editable rectangle to move or erase.',
  tags: ['shapes', 'layout', 'drawing', 'dragmode', 'newshape', 'modebar', 'interaction'],
  size: { width: 720, height: 440 },
  testTolerance: 0.004,
};

/** `n` points scattered around (`cx`, `cy`), rounded so the figure is short to serialize. */
function cluster(
  normal: () => number,
  n: number,
  cx: number,
  cy: number,
  spread: number,
): { x: number[]; y: number[] } {
  const round = (v: number): number => Math.round(v * 100) / 100;
  const x: number[] = [];
  const y: number[] = [];
  for (let i = 0; i < n; i++) {
    x.push(round(cx + normal() * spread));
    y.push(round(cy + normal() * spread));
  }
  return { x, y };
}

export function run(el: HTMLElement): ExampleHandle {
  const normal = gaussian(rng(7));
  const a = cluster(normal, 60, 3, 6.5, 0.55);
  const b = cluster(normal, 60, 7, 3.5, 0.7);

  const chart = createChart(el, {
    data: [
      { type: 'scatter', mode: 'markers', name: 'Group A', ...a },
      { type: 'scatter', mode: 'markers', name: 'Group B', ...b },
    ],
    layout: {
      title: { text: 'Drag to draw a rectangle; click a shape, then the eraser' },
      xaxis: { range: [0, 10] },
      yaxis: { range: [0, 10] },
      // A drag draws a rectangle. The modebar's draw buttons switch to the other draw modes.
      dragmode: 'drawrect',
      // How drawn shapes look.
      newshape: {
        line: { color: '#5e74d5', width: 2 },
        fillcolor: 'rgba(94, 116, 213, 0.2)',
      },
      shapes: [
        {
          type: 'rect',
          x0: 1.4,
          x1: 4.6,
          y0: 4.9,
          y1: 8.1,
          line: { color: '#118e36', width: 2, dash: 'dot' },
          fillcolor: 'rgba(17, 142, 54, 0.15)',
          // Drawn shapes get this too: the shape can be moved, and clicked to make it active.
          editable: true,
          label: { text: 'editable: drag me', textposition: 'top left' },
        },
      ],
    },
    config: {
      displayModeBar: true,
      // The draw buttons and the eraser are not in the default modebar.
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

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
