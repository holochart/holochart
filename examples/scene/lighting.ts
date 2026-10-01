import { createChart } from '@mk7s/holochart';
import { placed, torus, uvSphere } from '../_lib/mesh3d-data.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Scene lights (plan E8.7), the same `mesh3d` objects in two scenes: a torus, a `standard`
 * sphere and a gray `lambert` floor tile. Left: no `scene.lighting`, so Plotly's model lights the
 * torus with its own `lightposition` (as in Plotly), and the three.js materials get Plotly's
 * default light. Right: `scene2.lighting` — a dim ambient light, a hemisphere light, and a
 * scene-space light high on the left casting shadows onto the tile and a ground plane under the
 * axis box — lights all three (Plotly's model scales the rig's lights by the torus' `lighting`).
 */
export const meta: ExampleMeta = {
  title: '3D scene: lights and shadows',
  description:
    "Plotly's per-trace light (left) and a scene light rig with a hemisphere light, a shadow-casting light and a ground plane (right).",
  tags: ['scene', '3d', 'lighting', 'shadows', 'mesh3d', 'holochart-extension'],
  size: { width: 720, height: 400 },
  testTolerance: 0.004,
};

const RING = placed(torus(1, 0.4, 64, 24), 0.8, [0, 0, 0.5]);
const BALL = placed(uvSphere(24, 48), 0.45, [0.9, -0.9, 0.45]);
const TILE = {
  x: [-1.6, 1.6, 1.6, -1.6],
  y: [-1.6, -1.6, 1.6, 1.6],
  z: [0, 0, 0, 0],
  i: [0, 0],
  j: [1, 2],
  k: [2, 3],
};

function objects(scene: string, ringMaterial?: Record<string, unknown>) {
  return [
    {
      type: 'mesh3d',
      scene,
      ...RING,
      color: '#1f77b4',
      ...(ringMaterial ? { material: ringMaterial } : {}),
    },
    {
      type: 'mesh3d',
      scene,
      ...BALL,
      color: '#ff7f0e',
      material: { type: 'standard', roughness: 0.35, castshadow: true, receiveshadow: true },
    },
    {
      type: 'mesh3d',
      scene,
      ...TILE,
      color: '#8c8c8c',
      material: { type: 'lambert', receiveshadow: true },
    },
  ];
}

export function run(el: HTMLElement): ExampleHandle {
  const axes = { showbackground: false, range: [-1.7, 1.7] };
  const box = {
    xaxis: axes,
    yaxis: axes,
    zaxis: { ...axes, range: [-0.1, 1.2] },
    aspectmode: 'manual',
    aspectratio: { x: 1, y: 1, z: 1.3 / 3.4 },
    camera: { eye: { x: 1.3, y: -1.3, z: 0.9 } },
  };
  const chart = createChart(el, {
    data: [...objects('scene'), ...objects('scene2', { type: 'plotly', castshadow: true })],
    layout: {
      margin: { l: 10, r: 10, t: 40, b: 10 },
      title: { text: "Plotly's light (left) and a scene light rig (right)" },
      showlegend: false,
      scene: { ...box, domain: { x: [0, 0.5] } },
      scene2: {
        ...box,
        domain: { x: [0.5, 1] },
        lighting: {
          ambient: { intensity: 0.35 },
          hemisphere: { skycolor: '#dde6ff', groundcolor: '#6b5a4a', intensity: 0.3 },
          directional: [
            {
              position: { x: -1, y: -0.6, z: 2 },
              space: 'scene',
              intensity: 0.85,
              castshadow: true,
            },
          ],
          shadows: { ground: true, opacity: 0.35 },
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
