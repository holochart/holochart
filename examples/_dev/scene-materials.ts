import { createChart } from '@mk7s/holochart';
import { registerSceneMesh } from '../_lib/scene-mesh.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * `trace.material` (plan E8.7), one sphere per material type, left to right and back to front:
 * `plotly` (the default: Plotly's lighting model with its `lighting` coefficients), `flat` (unlit),
 * `basic`, `lambert`, `phong` (`shininess` 60), `standard` (`metalness` 0.6, `roughness` 0.3),
 * `physical` (a clear coat), `toon` (4 `steps`) and `matcap` (three.js' default gradient). The
 * scene's `lighting`: a dim ambient light, a light high on the front left and a `'studio'`
 * environment, which the `standard` and `physical` spheres reflect. Drawn with a dev-only mesh trace until `mesh3d` and `surface` land.
 */
export const meta: ExampleMeta = {
  title: '3D scene: material types',
  description:
    'The nine material types of trace.material on spheres, lit by a scene light rig with a studio environment.',
  tags: ['dev', 'scene', '3d', 'materials', 'lighting'],
  size: { width: 640, height: 440 },
  testTolerance: 0.004,
};

const MATERIALS: Record<string, unknown>[] = [
  { type: 'plotly' },
  { type: 'flat' },
  { type: 'basic' },
  { type: 'lambert' },
  { type: 'phong', shininess: 60, specular: '#666' },
  { type: 'standard', metalness: 0.6, roughness: 0.3 },
  { type: 'physical', clearcoat: 1, clearcoatroughness: 0.05, roughness: 0.5 },
  { type: 'toon', steps: 4 },
  { type: 'matcap' },
];

export function run(el: HTMLElement): ExampleHandle {
  registerSceneMesh();
  const chart = createChart(el, {
    data: MATERIALS.map((material, i) => ({
      type: 'scenemesh',
      shape: 'sphere',
      size: 0.38,
      x: (i % 3) - 1,
      y: 1 - Math.floor(i / 3),
      color: '#2ca02c',
      material,
    })),
    layout: {
      margin: { l: 0, r: 0, t: 40, b: 0 },
      title: { text: 'Material types' },
      showlegend: false,
      scene: {
        xaxis: { visible: false },
        yaxis: { visible: false },
        zaxis: { visible: false },
        aspectmode: 'data',
        camera: { eye: { x: 0, y: -1.5, z: 2 } },
        lighting: {
          ambient: { intensity: 0.4 },
          directional: [{ position: { x: -1, y: -2, z: 3 }, space: 'scene', intensity: 0.9 }],
          environment: 'studio',
          environmentintensity: 0.8,
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
