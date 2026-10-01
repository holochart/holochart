import { componentsReady, createChart, render, type Chart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Tilting a 3D pie with a transition (plan E9.12, E7.3): `tilt` is an animatable trace attribute,
 * so `animate` (or `react` with `layout.transition`) moves it smoothly. The pie starts seen from
 * the front (`tilt: 0`: its `depth` only shows in the shading of the bevels), then lies back; the
 * buttons switch between the two frames the same way. Shown (and tested) once the transition has
 * finished.
 */
export const meta: ExampleMeta = {
  title: 'Pie: animated tilt',
  description: 'A thick pie that tilts back with an animated transition, and buttons to switch.',
  tags: [
    'pie',
    'chart',
    'depth',
    'animation',
    'transitions',
    '2.5d',
    '3d-native',
    'holochart-extension',
  ],
  // SDF text anti-aliasing varies slightly across GPUs.
  testTolerance: 0.004,
};

const ANIMATION = {
  mode: 'immediate',
  frame: { duration: 700, redraw: false },
  transition: { duration: 700, easing: 'cubic-in-out' },
} as const;

const CHARACTERS = '0123456789.% ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

export function run(el: HTMLElement): ExampleHandle {
  let chart: Chart | undefined;
  let disposed = false;
  const ready = render.preloadTextFont({ characters: CHARACTERS }).then(async () => {
    if (disposed) return;
    chart = createChart(el, {
      data: [
        {
          type: 'pie',
          name: 'Traffic',
          labels: ['Search', 'Direct', 'Social', 'Referral', 'Email'],
          values: [46, 22, 15, 10, 7],
          depth: 32,
          bevel: { size: 4 },
          tilt: 0,
          marker: { line: { width: 2 } },
        },
      ],
      layout: {
        title: { text: 'Traffic sources' },
        updatemenus: [
          {
            type: 'buttons',
            direction: 'right',
            x: 1,
            xanchor: 'right',
            y: 1.12,
            buttons: [
              { label: 'Front', method: 'animate', args: [['front'], ANIMATION] },
              { label: 'Tilted', method: 'animate', args: [['tilted'], ANIMATION] },
            ],
          },
        ],
      },
      frames: [
        { name: 'front', data: [{ tilt: 0 }] },
        { name: 'tilted', data: [{ tilt: 55 }] },
      ],
    });
    await chart.ready;
    // `animate` resolves once the transition has finished.
    await chart.animate(['tilted'], ANIMATION);
    await componentsReady(chart);
  });
  return {
    ready,
    get renderer() {
      return chart?.three.renderer;
    },
    dispose: () => {
      disposed = true;
      chart?.destroy();
    },
  };
}
