import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * 3D bar materials (plan E14.9, E8.7): the same small matrix three times. Left, the default
 * (`material.type: 'plotly'`, Plotly's lighting model); middle, a three.js `standard` material
 * (`metalness`, `roughness`) lit by the scene's light rig (`scene2.lighting`: a key light, a
 * sky-ground hemisphere and ambient light); right, translucent bars (`opacity: 0.55`: front faces
 * only, sorted back to front as the camera moves) without edges.
 */
export const meta: ExampleMeta = {
  title: 'Bar3D: materials and translucency',
  description: 'The same bars with Plotly lighting, a metallic standard material, and translucent.',
  tags: ['bar3d', '3d', 'bar', 'materials', 'lighting', 'holochart-extension'],
  size: { width: 900, height: 400 },
  testTolerance: 0.004,
};

const X = ['a', 'b', 'c', 'd'];
const Y = ['p', 'q', 'r'];
const Z = [
  [3, 5, 2, 4],
  [6, 2, 5, 3],
  [2, 4, 6, 5],
];

function bars(scene: string, extra: Record<string, unknown>): Record<string, unknown> {
  return {
    type: 'bar3d',
    scene,
    x: Y.flatMap(() => X),
    y: Y.flatMap((y) => X.map(() => y)),
    z: Z.flat(),
    showlegend: false,
    ...extra,
  };
}

export function run(el: HTMLElement): ExampleHandle {
  const camera = { eye: { x: 1.6, y: -1.5, z: 1.1 } };
  const chart = createChart(el, {
    data: [
      bars('scene', { name: 'plotly' }),
      bars('scene2', {
        name: 'standard',
        marker: { color: '#c9a227' },
        material: { type: 'standard', metalness: 0.6, roughness: 0.35 },
      }),
      bars('scene3', {
        name: 'translucent',
        opacity: 0.55,
        marker: { color: '#5e74d5', line: { width: 0 } },
      }),
    ],
    layout: {
      margin: { l: 10, r: 10, t: 30, b: 10 },
      title: { text: "Plotly lighting · 'standard' material · translucent" },
      scene: { domain: { x: [0, 0.33] }, camera },
      scene2: {
        domain: { x: [0.33, 0.67] },
        camera,
        lighting: {
          ambient: { intensity: 0.35 },
          hemisphere: { skycolor: '#ffffff', groundcolor: '#303040', intensity: 0.8 },
          directional: [{ position: { x: 1, y: -2, z: 3 }, intensity: 2.2 }],
          environment: 'studio',
        },
      },
      scene3: { domain: { x: [0.67, 1] }, camera },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
