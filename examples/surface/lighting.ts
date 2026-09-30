import { createChart } from '@mk7s/holochart';
import { linspace, sample } from '../_lib/surface-data.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Lighting (plan E14.3, E8.7): the same surface in three scenes. Left: Plotly's defaults (ambient
 * 0.8, diffuse 0.8, a faint specular highlight). Middle: a glossy look (low ambient, strong
 * specular, low roughness, fresnel) with the light moved (`lightposition`). Right: the `flat`
 * material, colors as given without shading.
 */
export const meta: ExampleMeta = {
  title: 'Surface: lighting',
  description: "Plotly's default lighting, a glossy variant and the unlit flat material.",
  tags: ['surface', '3d', 'scientific', 'lighting'],
  testTolerance: 0.004,
  size: { width: 900, height: 360 },
};

export function run(el: HTMLElement): ExampleHandle {
  const axis = linspace(-3, 3, 64);
  const z = sample(axis, axis, (x, y) => Math.sin(x * 1.5) * Math.cos(y * 1.2) + 0.2 * x);
  const common = { type: 'surface' as const, x: axis, y: axis, z, showscale: false };
  const camera = { eye: { x: 1.5, y: -1.5, z: 1.1 } };
  const scene = { camera, xaxis: { showticklabels: false }, yaxis: { showticklabels: false } };
  const chart = createChart(el, {
    data: [
      { ...common, scene: 'scene' },
      {
        ...common,
        scene: 'scene2',
        lighting: { ambient: 0.35, diffuse: 0.65, specular: 2, roughness: 0.3, fresnel: 0.5 },
        lightposition: { x: 1e4, y: 1e4, z: 1e4 },
      },
      { ...common, scene: 'scene3', material: { type: 'flat' } },
    ],
    layout: {
      title: { text: 'Default, glossy and flat' },
      scene: { ...scene, domain: { x: [0, 0.33] } },
      scene2: { ...scene, domain: { x: [0.33, 0.66] } },
      scene3: { ...scene, domain: { x: [0.66, 1] } },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
