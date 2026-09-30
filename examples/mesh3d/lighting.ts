import { createChart } from '@mk7s/holochart';
import { uvSphere } from '../_lib/mesh3d-data.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * `lighting` and `lightposition` (plan E14.4, Plotly's lighting model): the default (ambient 0.8,
 * diffuse 0.8, specular 0.05: soft and bright); matte (less ambient, full diffuse, no highlight);
 * glossy (a strong, tight highlight with a fresnel rim); and the glossy sphere lit from the left
 * (`lightposition` in clip space, so the light moves with the view).
 */
export const meta: ExampleMeta = {
  title: 'Mesh3d: lighting variations',
  description: 'The same sphere with the default, matte and glossy lighting and a moved light.',
  tags: ['mesh3d', '3d', 'mesh', 'lighting', 'lightposition'],
  size: { width: 720, height: 600 },
  testTolerance: 0.004,
};

const GLOSSY = { ambient: 0.35, diffuse: 0.7, specular: 1.4, roughness: 0.25, fresnel: 0.6 };

export function run(el: HTMLElement): ExampleHandle {
  const s = uvSphere(24, 36);
  const color = '#5e74d5';
  const chart = createChart(el, {
    data: [
      { type: 'mesh3d', name: 'default', ...s, color },
      {
        type: 'mesh3d',
        name: 'matte',
        scene: 'scene2',
        ...s,
        color,
        lighting: { ambient: 0.3, diffuse: 1, specular: 0 },
      },
      { type: 'mesh3d', name: 'glossy', scene: 'scene3', ...s, color, lighting: GLOSSY },
      {
        type: 'mesh3d',
        name: 'lit from the left',
        scene: 'scene4',
        ...s,
        color,
        lighting: GLOSSY,
        lightposition: { x: -1e5, y: 0, z: 0 },
      },
    ],
    layout: {
      title: { text: 'Default and matte (top), glossy and lit from the left (bottom)' },
      grid: { rows: 2, columns: 2 },
      scene: { domain: { row: 0, column: 0 } },
      scene2: { domain: { row: 0, column: 1 } },
      scene3: { domain: { row: 1, column: 0 } },
      scene4: { domain: { row: 1, column: 1 } },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
