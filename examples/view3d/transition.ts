import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * From the flat view to the 2.5D view (plan E8.9, E7.5): the chart starts flat, then `animate`s to
 * the frame `3d`, which turns `layout.view3d` on — the plot plane tilts and turns smoothly from where
 * the flat view draws it (tilt and rotation 0 are the flat view) while the extruded bars come into
 * perspective. The buttons animate back and forth between the frames `flat` and `3d` the same way
 * (reduced motion snaps). Shown (and tested) once the transition has finished.
 */
export const meta: ExampleMeta = {
  title: '2.5D view: animated transition from flat',
  description:
    'Bars that tilt into a 2.5D view with an animated transition, and buttons to switch.',
  tags: [
    'view3d',
    '2.5d',
    'bar',
    'depth',
    'animation',
    'transitions',
    '3d-native',
    'holochart-extension',
  ],
  // Perspective rendering: SwiftShader rasterizes slightly differently on Linux (CI).
  testTolerance: 0.004,
};

const ANIMATION = {
  mode: 'immediate',
  frame: { duration: 800, redraw: false },
  transition: { duration: 800, easing: 'cubic-in-out' },
} as const;

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'bar',
        x: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
        y: [4.2, 5.1, 6.8, 6.1, 7.4, 8.9],
        depth: '70%',
        bevel: { size: 3 },
      },
    ],
    layout: {
      title: { text: 'Monthly output' },
      updatemenus: [
        {
          type: 'buttons',
          direction: 'right',
          x: 1,
          xanchor: 'right',
          y: 1.12,
          buttons: [
            { label: 'Flat', method: 'animate', args: [['flat'], ANIMATION] },
            { label: '3D', method: 'animate', args: [['3d'], ANIMATION] },
          ],
        },
      ],
    },
    frames: [
      { name: 'flat', layout: { view3d: { enabled: false } } },
      { name: '3d', layout: { view3d: { enabled: true, tilt: 25, rotation: -30 } } },
    ],
  });
  // `animate` resolves once the transition has finished.
  const ready = chart.ready.then(() => chart.animate(['3d'], ANIMATION));
  return {
    ready: ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
