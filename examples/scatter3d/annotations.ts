import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Scene annotations (plan E14.1d): `scene.annotations[]` anchored at 3D points (`x`, `y`, `z`),
 * drawn with the 2D annotations' styling — arrows and arrowheads, boxes, borders, rich text —
 * at the points' projections, following the camera as it turns.
 */
export const meta: ExampleMeta = {
  title: 'Scatter3D: annotations',
  description: 'Annotations with arrows and boxes anchored at 3D points of a surface of markers.',
  tags: ['scatter3d', '3d', 'annotations'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const x: number[] = [];
  const y: number[] = [];
  const z: number[] = [];
  for (let i = 0; i < 21; i++) {
    for (let j = 0; j < 21; j++) {
      const u = -2 + i * 0.2;
      const v = -2 + j * 0.2;
      x.push(u);
      y.push(v);
      z.push(Math.exp(-(u * u + v * v)) - 0.6 * Math.exp(-((u - 1.2) ** 2 + (v + 1) ** 2) * 2));
    }
  }
  const chart = createChart(el, {
    data: [{ type: 'scatter3d', mode: 'markers', x, y, z, marker: { size: 3, color: z } }],
    layout: {
      title: { text: 'Peak and trough' },
      scene: {
        camera: { eye: { x: 1.5, y: -1.5, z: 1 } },
        annotations: [
          { x: 0, y: 0, z: 1, text: '<b>Peak</b> (0, 0, 1)', ax: -40, ay: -40, arrowhead: 2 },
          {
            x: 1.2,
            y: -1,
            z: -0.45,
            text: 'Trough',
            ax: 50,
            ay: 30,
            arrowhead: 1,
            bgcolor: 'rgba(17, 142, 54, 0.8)',
            bordercolor: '#eceef4',
            borderpad: 4,
            font: { color: '#fff' },
          },
          { x: -2, y: 2, z: 0, text: 'Corner', showarrow: false, xanchor: 'left', yshift: 10 },
        ],
      },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
