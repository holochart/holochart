import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Turning the 2.5D view by dragging (plan E8.9): with `view3d.interactive` (the default) and
 * `dragmode: 'turntable'`, dragging the plot area tilts (up / down) and turns (left / right) the
 * view within ±80°; the release commits `view3d.tilt` / `view3d.rotation` with one `relayout`.
 * A click without dragging still clicks the bar under it. Stacked bars and a line (drawn on the
 * plot plane) share the view.
 */
export const meta: ExampleMeta = {
  title: '2.5D view: drag to tilt and turn',
  description: 'Stacked 3D bars and a line in a 2.5D view that dragging tilts and turns.',
  tags: ['view3d', '2.5d', 'bar', 'depth', 'interaction', '3d-native', 'holochart-extension'],
  // Perspective rendering: SwiftShader rasterizes slightly differently on Linux (CI).
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const x = ['A', 'B', 'C', 'D', 'E', 'F'];
  const chart = createChart(el, {
    data: [
      { type: 'bar', name: 'base', x, y: [3, 4, 2, 5, 4, 3], depth: 30 },
      { type: 'bar', name: 'extra', x, y: [2, 1, 3, 2, 3, 4], depth: 30 },
      {
        type: 'scatter',
        name: 'target',
        x,
        y: [6, 6, 6, 7, 7, 7],
        mode: 'lines+markers',
        line: { dash: 'dash' },
      },
    ],
    layout: {
      title: { text: 'Drag to turn the view' },
      barmode: 'stack',
      dragmode: 'turntable',
      view3d: { enabled: true, tilt: 20, rotation: -25, interactive: true },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
