/**
 * @mk7s/holochart-traces-3d — the 3D scene subplot and 3D trace types (plan E14, milestone M6):
 * `scatter3d`, `surface`, `mesh3d`, `cone`, `streamtube`, `volume`, `isosurface` and `bar3d`.
 * Register them like any trace module (`register(...traces3d)`); the `@mk7s/holochart` bundle
 * registers them for you.
 *
 * M6 wave 0 ships the scene (`layout.scene*`: camera, aspect ratio, 3D axes, controls; see
 * `scene/index.ts` for the contract 3D trace modules build on). The trace types follow in wave 1.
 */
import type { Registrable } from '@mk7s/holochart-runtime';
import { cone } from './cone/index.ts';
import { mesh3d } from './mesh3d/index.ts';
import { scatter3d } from './scatter3d/index.ts';
import { sceneComponent } from './scene/component.ts';
import { surface } from './surface/index.ts';

export * from './scene/index.ts';
export * from './scatter3d/index.ts';
export * from './surface/index.ts';
export * from './mesh3d/index.ts';
export * from './cone/index.ts';

/** The scene component and every 3D trace module, for `register(...traces3d)`. */
export const traces3d: readonly Registrable[] = [
  // Declares and draws `layout.scene*` and runs the 3D controls.
  sceneComponent,
  scatter3d,
  surface,
  mesh3d,
  cone,
];
