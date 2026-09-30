import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Text in 3D (plan E14.2): `mode: 'markers+text'` labels each point with a camera-facing label
 * (billboarded, px-sized at every depth) placed by `textposition` around its marker; labels are
 * depth-tested against the data. The rich-text subset works (`<b>`, `<br>`).
 */
export const meta: ExampleMeta = {
  title: 'Scatter3D: text labels',
  description: 'Markers with camera-facing text labels placed by textposition.',
  tags: ['scatter3d', '3d', 'text', 'labels'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const planets = [
    { name: 'Mercury', d: 0.39, i: 7.0 },
    { name: 'Venus', d: 0.72, i: 3.4 },
    { name: 'Earth', d: 1, i: 0 },
    { name: 'Mars', d: 1.52, i: 1.9 },
    { name: 'Jupiter', d: 5.2, i: 1.3 },
    { name: 'Saturn', d: 9.54, i: 2.5 },
  ];
  const angle = (k: number): number => k * 1.1;
  const chart = createChart(el, {
    data: [
      {
        type: 'scatter3d',
        mode: 'markers+text',
        x: planets.map((p, k) => p.d * Math.cos(angle(k))),
        y: planets.map((p, k) => p.d * Math.sin(angle(k))),
        z: planets.map((p) => p.d * Math.sin((p.i * Math.PI) / 180)),
        text: planets.map((p) => (p.name === 'Earth' ? '<b>Earth</b>' : p.name)),
        textposition: [
          'top center',
          'bottom center',
          'top right',
          'middle left',
          'top center',
          'bottom right',
        ],
        marker: { size: planets.map((p) => 6 + Math.sqrt(p.d) * 3), color: '#f2b441' },
      },
    ],
    layout: {
      title: { text: 'Planets (AU)' },
      scene: { camera: { eye: { x: 0.9, y: -1.6, z: 0.8 } }, aspectmode: 'cube' },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
