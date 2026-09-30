import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import { registerScenePoints } from '../_lib/scene-points.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Styling the scene and its axes (plan E14.1b): a scene background (`bgcolor`), tinted walls
 * (`showbackground`, `backgroundcolor`), grid and zero-line colors, axis lines on the label edges
 * and mirrored (`showline`, `mirror`), outside tick marks, rotated tick labels (`tickangle`), a
 * rich-text title, and an axis without tick labels. The walls are the far faces for the current
 * camera: they follow the view.
 */
export const meta: ExampleMeta = {
  title: '3D scene: walls and axis styling',
  description:
    'Scene background, tinted walls, axis lines, mirrored lines, tick marks and styled titles.',
  tags: ['dev', 'scene', '3d', 'styling'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  registerScenePoints();
  const normal = gaussian(rng(3));
  const n = 300;
  const chart = createChart(el, {
    data: [
      {
        type: 'scenepoints',
        x: Array.from({ length: n }, () => normal() * 2),
        y: Array.from({ length: n }, () => normal()),
        z: Array.from({ length: n }, () => normal() * 1.5 + 1),
        color: '#ffb000',
        size: 4,
      },
    ],
    layout: {
      title: { text: 'Walls, lines and ticks' },
      scene: {
        bgcolor: '#101826',
        camera: { eye: { x: -1.4, y: 1.6, z: 0.8 } },
        xaxis: {
          showbackground: true,
          backgroundcolor: 'rgba(94, 116, 213, 0.18)',
          gridcolor: '#3a4a6b',
          showline: true,
          linecolor: '#9fb3ff',
          mirror: true,
          ticks: 'outside',
          ticklen: 6,
          tickcolor: '#9fb3ff',
          tickangle: 30,
          title: { text: '<b>x</b> (bold)', font: { color: '#9fb3ff', size: 11 } },
        },
        yaxis: {
          showbackground: true,
          backgroundcolor: 'rgba(17, 142, 54, 0.18)',
          gridcolor: '#2f5a3c',
          zeroline: false,
          showticklabels: false,
          title: { text: 'y, no tick labels' },
        },
        zaxis: {
          showbackground: true,
          backgroundcolor: 'rgba(234, 42, 55, 0.14)',
          gridcolor: '#5a2f38',
          zerolinecolor: '#ff7b7b',
          showaxeslabels: false,
        },
      },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
