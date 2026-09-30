import { createChart } from '@mk7s/holochart';
import { uvSphere } from '../_lib/mesh3d-data.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Smooth and flat shading (plan E14.4): the same low-poly sphere with normals interpolated across
 * the triangles (left, the default) and with `flatshading: true` (right): one normal per triangle,
 * so its facets show.
 */
export const meta: ExampleMeta = {
  title: 'Mesh3d: smooth vs flat shading',
  description: 'A low-poly sphere with smooth normals and with flatshading.',
  tags: ['mesh3d', '3d', 'mesh', 'flatshading', 'lighting'],
  size: { width: 800, height: 400 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const s = uvSphere(8, 12);
  const chart = createChart(el, {
    data: [
      { type: 'mesh3d', name: 'smooth', ...s, color: '#5e74d5' },
      { type: 'mesh3d', name: 'flat', scene: 'scene2', ...s, color: '#5e74d5', flatshading: true },
    ],
    layout: {
      title: { text: 'Smooth (left) and flatshading: true (right)' },
      scene: { domain: { x: [0, 0.5] } },
      scene2: { domain: { x: [0.5, 1] } },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
