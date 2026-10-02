import { createChart, type LayoutScene } from '@mk7s/holochart';
import { registerSceneMesh, type SceneMeshTrace } from '../_lib/scene-mesh.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Scene lights (plan E8.7), the same objects in two scenes. Left: no `scene.lighting`, so Plotly's
 * model lights the torus with its own `lightposition` (as in Plotly), and the `standard` sphere
 * gets render's default rig (Plotly's default light). Right: `scene2.lighting` — a dim ambient
 * light, a hemisphere light, and a scene-space light high on the left casting shadows onto a
 * ground plane under the axis box — lights both (Plotly's model scales the rig's lights by the
 * torus' `lighting`). Drawn with a dev-only mesh trace until `mesh3d` and `surface` land.
 */
export const meta: ExampleMeta = {
  title: '3D scene: lights and shadows',
  description:
    "Plotly's per-trace light (left) and a scene light rig with a hemisphere light, a shadow-casting light and a ground plane (right).",
  tags: ['dev', 'scene', '3d', 'lighting', 'shadows'],
  size: { width: 720, height: 400 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  registerSceneMesh();
  const objects = (scene: SceneMeshTrace['scene']): SceneMeshTrace[] => [
    { type: 'scenemesh', scene, shape: 'torus', size: 0.8, z: 0.5, color: '#1f77b4' },
    {
      type: 'scenemesh',
      scene,
      shape: 'sphere',
      size: 0.45,
      x: 0.9,
      y: -0.9,
      z: 0.45,
      color: '#ff7f0e',
      material: { type: 'standard', roughness: 0.35, castshadow: true, receiveshadow: true },
    },
    {
      type: 'scenemesh',
      scene,
      shape: 'tile',
      size: 1.6,
      color: '#8c8c8c',
      material: { type: 'lambert', receiveshadow: true },
    },
  ];
  const axes = { showbackground: false, range: [-1.7, 1.7] };
  const box: LayoutScene = {
    xaxis: axes,
    yaxis: axes,
    zaxis: { ...axes, range: [-0.1, 1.2] },
    aspectmode: 'manual',
    aspectratio: { x: 1, y: 1, z: 1.3 / 3.4 },
    camera: { eye: { x: 1.3, y: -1.3, z: 0.9 } },
  };
  const chart = createChart(el, {
    data: [
      ...objects('scene'),
      ...objects('scene2').map((t): SceneMeshTrace =>
        t.shape === 'torus' ? { ...t, material: { type: 'plotly', castshadow: true } } : t,
      ),
    ],
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
