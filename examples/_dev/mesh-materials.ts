import { loadMeshModule, type LightingSpec } from '@mk7s/holochart-render';
import { BLUE, meshGrid, torus, VIRIDIS } from '../_lib/mesh3d.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Material types (plan E8.7), one per panel on a torus (left to right, top to bottom): `plotly`
 * (the default: Plotly's lighting model); `flat` (unlit, exact colors); `basic`; `lambert` with
 * colorscale intensity (mapped per vertex); `phong` (shininess from Plotly's roughness); `standard`
 * (metalness 0.4, a `'studio'` environment, a shadow-casting light and a ground plane); `physical`
 * (clearcoat, a `'city'` environment); `toon` (3 bands); `matcap` (three.js' default gradient).
 * The three.js types are lit by a light rig (`layout.lighting`): Plotly's default light and
 * ambient strength unless the panel says otherwise.
 */
export const meta: ExampleMeta = {
  title: 'Mesh materials',
  description:
    'Material types on the mesh primitive: plotly, flat, basic, lambert, phong, standard, physical, toon, matcap.',
  tags: ['dev', 'primitives', '3d', 'mesh', 'materials'],
  size: { width: 720, height: 600 },
};

export function run(el: HTMLElement): ExampleHandle {
  const grid = meshGrid(el, 3, 3, [2.4, -2.8, 2.2]);
  const ring = torus(0.62, 0.26, 64, 24);
  const base = { positions: ring.positions, indices: ring.indices, color: BLUE };
  const types = ['plotly', 'flat', 'basic', 'lambert', 'phong', 'standard', 'physical', 'toon'];
  types.forEach((type, i) =>
    grid.add(i, {
      ...base,
      material: { type: type as 'plotly' },
      ...(type === 'lambert' ? { intensity: ring.values, colorscale: VIRIDIS } : {}),
      ...(type === 'standard'
        ? { material: { type: 'standard', metalness: 0.4 }, castShadow: true }
        : {}),
      ...(type === 'physical'
        ? { material: { type: 'physical', clearcoat: 1, clearcoatRoughness: 0.1, roughness: 0.6 } }
        : {}),
    }),
  );
  grid.add(8, { ...base, material: { type: 'matcap' } });

  const ready = (async () => {
    const { createLightRig, DEFAULT_LIGHTING } = await loadMeshModule();
    grid.viewports.forEach((viewport, i) => {
      if (i < 2) return; // plotly / flat: the primitive's own shader
      let spec: LightingSpec = DEFAULT_LIGHTING;
      if (i === 5) {
        spec = {
          ambient: { intensity: 0.4 },
          directional: [{ position: [1, -1, 3], intensity: 0.9, castShadow: true }],
          environment: 'studio',
          environmentIntensity: 0.6,
          shadows: { ground: -0.45, extent: 1.5, opacity: 0.35 },
        };
      } else if (i === 6) {
        spec = { ...DEFAULT_LIGHTING, environment: 'city', environmentIntensity: 0.8 };
      }
      const rig = createLightRig(spec);
      rig.setCamera(viewport.camera);
      viewport.scene.add(rig.object);
      rig.attach(grid.root.renderer, viewport.scene, () => grid.root.invalidate());
    });
    await grid.ready();
  })();
  return { renderer: grid.root.renderer, ready, dispose: () => grid.dispose() };
}
