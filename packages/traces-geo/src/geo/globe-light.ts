/**
 * The light of the 3D globe (backlog GEO8, ADR-028): one light for every mesh on a globe, so that
 * the body, the land and the regions of a choropleth are shaded as one sphere.
 *
 * The mesh primitive's own default light is Plotly's `lightposition`, a point in clip space: seen
 * through the globe's orthographic camera it stands in the plane of the screen, so half the disc
 * would be lit flat and the other half not at all, and its direction would change with the zoom
 * and with the subplot's aspect ratio. The globe therefore has a rig of its own with one light
 * fixed to the camera: it shines from the upper left, in front of the screen, at every rotation
 * and every scale. Call {@link lightGlobeMesh} on every mesh that is drawn on a globe and give it
 * {@link GLOBE_LIGHTING}.
 */
import {
  loadMeshModule,
  meshModuleLoaded,
  type LazyMeshPrimitive,
  type LightingSpec,
  type LightRig,
  type MeshLighting,
  type MeshModule,
} from '@mk7s/holochart-render';

/**
 * Where the globe's light shines from, in view space (x right, y up, z towards the viewer): the
 * upper left, in front. Normalised it is (−0.32, 0.49, 0.81).
 */
export const GLOBE_LIGHT_DIRECTION: readonly [number, number, number] = [-0.4, 0.6, 1];

/**
 * The `lighting` of a mesh on a globe. A surface that faces the light has exactly its color
 * (ambient + diffuse = 1) and one that the light does not reach has 0.7 of it: the middle of
 * the disc is at 0.94, the limb between 0.7 (lower right) and 0.88 (upper left). That is enough
 * for the disc to read as a sphere, and little enough for the colors of a map to stay what the
 * figure says they are. No highlight: a specular term would lighten the colors of a choropleth
 * beyond their colorscale.
 */
export const GLOBE_LIGHTING: Readonly<Partial<MeshLighting>> = Object.freeze({
  ambient: 0.7,
  diffuse: 0.3,
  specular: 0,
  roughness: 1,
  fresnel: 0,
});

const SPEC: LightingSpec = {
  // Scaled by `lighting.ambient` and `lighting.diffuse` in the mesh's shader.
  ambient: { intensity: 1 },
  directional: [{ position: [...GLOBE_LIGHT_DIRECTION], space: 'camera', intensity: 1 }],
};

/** One rig for every globe: it holds a spec and no GPU resource, and is never added to a scene. */
let rig: LightRig | undefined;

function rigOf(mesh: MeshModule): LightRig {
  return (rig ??= mesh.createLightRig(SPEC));
}

/**
 * Light a mesh with the globe's light (see the module comment). At once when render's mesh chunk
 * is loaded, else as soon as it is: the lazy mesh keeps the rig until it draws.
 */
export function lightGlobeMesh(mesh: LazyMeshPrimitive): void {
  const loaded = meshModuleLoaded();
  if (loaded) {
    mesh.setLightRig(rigOf(loaded));
    return;
  }
  // A failed load is the lazy mesh's to report; it then draws nothing.
  void loadMeshModule().then(
    (mod) => mesh.setLightRig(rigOf(mod)),
    () => undefined,
  );
}
