import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Closed shapes with thickness (plan E8.9): `fill: 'toself'` fills each shape by the nonzero rule,
 * and `depth` extrudes exactly that region — a self-intersecting star (its five points and its
 * center) and a figure-eight — into 24 px slabs with walls only on their outlines, in a tilted
 * view (`layout.view3d`).
 */
export const meta: ExampleMeta = {
  title: 'Area: self-intersecting shapes with depth',
  description:
    'A star and a figure-eight filled toself and extruded 24 px, walls on their outlines only, in a tilted view.',
  tags: ['area', 'fill', 'toself', 'scatter', 'depth', '2.5d', 'view3d', 'holochart-extension'],
  size: { width: 640, height: 420 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  // A pentagram: every second vertex of a pentagon (self-intersecting; nonzero fills its center).
  const star = Array.from({ length: 6 }, (_, k) => {
    const a = Math.PI / 2 + (k * 4 * Math.PI) / 5;
    return [2 + 1.6 * Math.cos(a), 2 + 1.6 * Math.sin(a)] as const;
  });
  // A figure-eight (a lemniscate): its two loops wind in opposite directions.
  const eight = Array.from({ length: 49 }, (_, k) => {
    const t = (k / 48) * 2 * Math.PI;
    return [
      6.5 + (2 * Math.cos(t)) / (1 + Math.sin(t) ** 2),
      2 + (2 * Math.sin(t) * Math.cos(t)) / (1 + Math.sin(t) ** 2),
    ] as const;
  });
  const chart = createChart(el, {
    data: [
      {
        type: 'scatter',
        name: 'star',
        x: star.map((p) => p[0]),
        y: star.map((p) => p[1]),
        fill: 'toself',
        fillcolor: '#e9c46a',
        mode: 'lines',
        line: { color: '#8a6d1d', width: 1.5 },
        depth: 24,
      },
      {
        type: 'scatter',
        name: 'figure-eight',
        x: eight.map((p) => p[0]),
        y: eight.map((p) => p[1]),
        fill: 'toself',
        fillcolor: '#2a9d8f',
        mode: 'lines',
        line: { color: '#1d6b62', width: 1.5 },
        depth: 24,
      },
    ],
    layout: {
      title: { text: 'Filled toself, extruded' },
      xaxis: { range: [0, 9], showgrid: false },
      yaxis: { range: [0, 4], scaleanchor: 'x', showgrid: false },
      view3d: { enabled: true, tilt: 30, rotation: 20 },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
