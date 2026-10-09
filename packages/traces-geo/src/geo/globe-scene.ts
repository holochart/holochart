/**
 * The globe of a `'globe3d'` subplot as a rigid body (ADR-028): one three.js group per viewport,
 * whose matrix is {@link GeoSubplot.globeMatrix}. Everything built in globe coordinates (the unit
 * sphere) is parented under it by the geo component and by the traces, so a rotation or a zoom
 * moves all of it with one matrix and nothing is built again.
 *
 * It is in the package's initial code because the subplot places it; the geometry that goes into
 * it is the lazy globe chunk's (`globe/`).
 */
import type { Viewport } from '@mk7s/holochart-render';
import { Group, type Matrix4, type Object3D } from 'three';

/** What a globe's viewport holds for everyone who draws on it. */
export interface GlobeScene {
  /** Parent of everything in globe coordinates. Its matrix is set by {@link placeGlobeScene}. */
  readonly group: Group;
  /**
   * The globe's body: the opaque sphere that writes depth, drawn by the geo component. Picking
   * registers it as an occluder, so nothing behind the globe is hit. `undefined` until drawn.
   */
  body: Object3D | undefined;
  /** Changes whenever the globe moves on screen: a pick made before is no longer true. */
  version: number;
}

const SCENES = new WeakMap<Viewport, GlobeScene>();

/** The globe of `viewport`, made and added to the viewport's scene on first use. */
export function globeScene(viewport: Viewport): GlobeScene {
  let scene = SCENES.get(viewport);
  if (!scene) {
    const group = new Group();
    group.name = 'globe';
    // The matrix is written whole by `placeGlobeScene`, never composed from position and scale.
    group.matrixAutoUpdate = false;
    viewport.scene.add(group);
    SCENES.set(viewport, (scene = { group, body: undefined, version: 0 }));
  }
  return scene;
}

/** Move the globe of `viewport` to `matrix` (globe coordinates → the viewport's world px). */
export function placeGlobeScene(viewport: Viewport, matrix: Matrix4): void {
  const scene = globeScene(viewport);
  if (scene.group.matrix.equals(matrix)) return;
  scene.group.matrix.copy(matrix);
  scene.group.matrixWorldNeedsUpdate = true;
  scene.version++;
}

/**
 * Put a primitive's object on the globe. Call it after `ctx.add(primitive, viewport)`: the
 * viewport keeps tracking the primitive (its size, its disposal), and the object now moves with
 * the globe. The primitive's own transform should be the identity.
 */
export function addToGlobe(viewport: Viewport, object: Object3D): void {
  globeScene(viewport).group.add(object);
}
