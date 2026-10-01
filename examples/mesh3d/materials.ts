import { createChart } from '@mk7s/holochart';
import { placed, uvSphere } from '../_lib/mesh3d-data.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * `material` (plan E14.4, E8.7, a Holochart extension), one `mesh3d` sphere per material type,
 * left to right and back to front: `plotly` (the default: Plotly's lighting model with its
 * `lighting` coefficients), `flat` (unlit), `basic`, `lambert`, `phong` (`shininess` 60),
 * `standard` (`metalness` 0.6, `roughness` 0.3), `physical` (a clear coat), `toon` (4 `steps`) and
 * `matcap` (three.js' default gradient). The scene's `lighting`: a dim ambient light, a light high
 * on the front left and a `'studio'` environment, which the `standard` and `physical` spheres
 * reflect.
 */
export const meta: ExampleMeta = {
  title: 'Mesh3d: material types',
  description:
    'The nine material types of trace.material on spheres, lit by a scene light rig with a studio environment.',
  tags: ['mesh3d', '3d', 'mesh', 'materials', 'lighting', 'holochart-extension'],
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
  const ball = uvSphere(24, 48);
  const chart = createChart(el, {
    data: MATERIALS.map((material, i) => ({
      type: 'mesh3d',
      name: String(material['type']),
      ...placed(ball, 0.38, [(i % 3) - 1, 1 - Math.floor(i / 3), 0]),
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
