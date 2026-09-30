import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A surface through the points (plan E14.2, `surfaceaxis`): the points are triangulated (Delaunay)
 * in the plane perpendicular to the chosen axis — `surfaceaxis: 2` triangulates `(x, y)` — and the
 * triangles keep each point's height, filled with `surfacecolor`. Here a closed, wavy loop (with
 * its center) becomes a filled, rippled disc under its outline.
 */
export const meta: ExampleMeta = {
  title: 'Scatter3D: surfaceaxis fill',
  description: 'A closed 3D loop filled by a surface through its points (surfaceaxis).',
  tags: ['scatter3d', '3d', 'surfaceaxis', 'fill'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const n = 72;
  const t = Array.from({ length: n + 1 }, (_, i) => (i / n) * 2 * Math.PI);
  const loop = (r: number, h: number, phase: number) => ({
    x: t.map((v) => r * Math.cos(v)),
    y: t.map((v) => r * Math.sin(v)),
    z: t.map((v) => h + 0.25 * Math.sin(5 * v + phase)),
  });
  const outer = loop(1, 0, 0);
  const inner = loop(0.55, 0.9, 1);
  const chart = createChart(el, {
    data: [
      {
        type: 'scatter3d',
        mode: 'lines',
        name: 'rim',
        ...outer,
        line: { width: 3 },
        surfaceaxis: 2,
        surfacecolor: 'rgba(94, 116, 213, 0.5)',
      },
      {
        type: 'scatter3d',
        mode: 'lines+markers',
        name: 'lid',
        ...inner,
        marker: { size: 3 },
        surfaceaxis: 2,
        surfacecolor: 'rgba(204, 84, 10, 0.55)',
      },
    ],
    layout: {
      title: { text: 'Loops filled with surfaceaxis' },
      scene: { camera: { eye: { x: 1.3, y: -1.4, z: 1.1 } } },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
