import { createChart } from '@mk7s/holochart';
import { linspace, sample } from '../_lib/surface-data.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * three.js material types on a colored surface (plan E14.3, E8.7, a Holochart extension), each
 * scene with its own light rig (`scene.lighting`), left to right and top to bottom: `lambert` under
 * Plotly's default light (no `scene.lighting`), the colorscale mapped per vertex; `standard`
 * (`metalness` 0.4) with a `'studio'` environment and a light casting the surface's shadow onto a
 * ground plane; `physical` with a clear coat and a `'city'` environment; `toon` with 3 bands under a
 * warm key light and a hemisphere light.
 */
export const meta: ExampleMeta = {
  title: 'Surface: materials and light rigs',
  description:
    'A colored surface with the lambert, standard, physical and toon materials, each scene with its own lights.',
  tags: ['surface', '3d', 'materials', 'lighting', 'shadows', 'holochart-extension'],
  size: { width: 720, height: 600 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const axis = linspace(-2, 2, 48);
  const z = sample(
    axis,
    axis,
    (x, y) => Math.exp(-(x * x + y * y) / 1.5) * Math.cos(1.6 * x) * Math.cos(1.6 * y),
  );
  const common = { x: axis, y: axis, z, showscale: false };
  const hidden = { visible: false };
  const view = {
    xaxis: hidden,
    yaxis: hidden,
    zaxis: hidden,
    camera: { eye: { x: 1.4, y: -1.4, z: 1 } },
  };
  const chart = createChart(el, {
    data: [
      { type: 'surface', ...common, material: { type: 'lambert' } },
      {
        type: 'surface',
        ...common,
        scene: 'scene2',
        material: { type: 'standard', metalness: 0.4, castshadow: true },
      },
      {
        type: 'surface',
        ...common,
        scene: 'scene3',
        material: { type: 'physical', clearcoat: 1, clearcoatroughness: 0.1, roughness: 0.6 },
      },
      { type: 'surface', ...common, scene: 'scene4', material: { type: 'toon', steps: 3 } },
    ],
    layout: {
      margin: { l: 10, r: 10, t: 40, b: 10 },
      title: { text: 'lambert · standard (top), physical · toon (bottom)' },
      grid: { rows: 2, columns: 2 },
      scene: { ...view, domain: { row: 0, column: 0 } },
      scene2: {
        ...view,
        domain: { row: 0, column: 1 },
        lighting: {
          ambient: { intensity: 0.4 },
          directional: [
            { position: { x: 1, y: -1, z: 3 }, space: 'scene', intensity: 0.9, castshadow: true },
          ],
          environment: 'studio',
          environmentintensity: 0.6,
          shadows: { ground: true, opacity: 0.35 },
        },
      },
      scene3: {
        ...view,
        domain: { row: 1, column: 0 },
        lighting: {
          ambient: { intensity: 0.5 },
          directional: [{ position: { x: -1, y: -1, z: 2 }, space: 'scene', intensity: 0.8 }],
          environment: 'city',
          environmentintensity: 0.8,
        },
      },
      scene4: {
        ...view,
        domain: { row: 1, column: 1 },
        lighting: {
          ambient: { intensity: 0.3 },
          hemisphere: { skycolor: '#dde6ff', groundcolor: '#443322', intensity: 0.4 },
          directional: [
            { position: { x: 1, y: 1, z: 0 }, space: 'camera', color: '#ffe8cc', intensity: 0.9 },
          ],
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
