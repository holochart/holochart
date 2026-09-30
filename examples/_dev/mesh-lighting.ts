import { meshGrid, sphere, surfaceGrid } from '../_lib/mesh3d.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Plotly's lighting parameters (plan E2.11), one change per panel on a sphere (left to right, top
 * to bottom): Plotly's defaults; `ambient` 0.2; `diffuse` 0.1; `specular` 0; `specular` 2;
 * `roughness` 0.1 (with specular 2); `roughness` 1 (with specular 2); `fresnel` 0 (with specular
 * 2); `fresnel` 5 (with specular 2); `lightposition` from the upper left; `lightposition` from below; `facenormalsepsilon` 1 with flat shading (every face
 * normal dropped: ambient light only). The light is Plotly's: given in clip space, it moves with
 * the camera.
 */
export const meta: ExampleMeta = {
  title: 'Mesh lighting',
  description:
    "Plotly's lighting model: ambient, diffuse, specular, roughness, fresnel, light position, epsilons.",
  tags: ['dev', 'primitives', '3d', 'mesh', 'lighting'],
  size: { width: 800, height: 600 },
};

/** A light color, so the visual test sees shading changes (dark blues differ too little). */
const COLOR = [0.55, 0.75, 0.95, 1] as const;

export function run(el: HTMLElement): ExampleHandle {
  const grid = meshGrid(el, 4, 3, [2.6, -2.6, 1.6]);
  const ball = sphere(0.85, [0, 0, 0], 48, 24);
  const shiny = { specular: 2 };
  const panels: Record<string, unknown>[] = [
    {},
    { lighting: { ambient: 0.2 } },
    { lighting: { diffuse: 0.1 } },
    { lighting: { specular: 0 } },
    { lighting: shiny },
    { lighting: { ...shiny, roughness: 0.1 } },
    { lighting: { ...shiny, roughness: 1 } },
    { lighting: { ...shiny, fresnel: 0 } },
    { lighting: { ...shiny, fresnel: 5 } },
    { lightposition: [-1e5, 1e5, 0] },
    { lightposition: [0, -1e5, 0] },
  ];
  panels.forEach((extra, i) =>
    grid.add(i, { positions: ball.positions, indices: ball.indices, color: COLOR, ...extra }),
  );
  const tile = surfaceGrid(6, (x, y) => 0.3 * Math.sin(2 * x) * Math.cos(2 * y));
  grid.add(11, {
    positions: tile.positions,
    indices: tile.indices,
    color: COLOR,
    shading: 'flat',
    lighting: { facenormalsepsilon: 1 },
    normalScale: [1, 1, 1],
  });
  return { renderer: grid.root.renderer, ready: grid.ready(), dispose: () => grid.dispose() };
}
