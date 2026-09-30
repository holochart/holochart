/**
 * The lights of a live scene (plan E8.7): one render `LightRig` per scene, built from
 * `layout.sceneN.lighting` (see `lighting-attributes.ts`) and shared by the scene's meshes.
 *
 * - Meshes register with {@link SceneLighting.use} (`scene.useLightRig(mesh)`): meshes drawn with
 *   Plotly's model get the rig only when the scene sets `lighting` (else they keep their own
 *   `lightposition` light, as in Plotly); three.js material types are always lit by the rig's
 *   three.js lights, which the default rig (render's `DEFAULT_LIGHTING`, Plotly's default light)
 *   provides when `lighting` is unset.
 * - The rig (and the mesh code it lives in, a lazily loaded chunk) is created only once a scene
 *   has a mesh or a `lighting`, so scenes of points and lines never load it.
 * - The scene component calls {@link SceneLighting.sync} on every pass with the scene's defaulted
 *   container: a changed `lighting` updates the rig (shadow maps, environment) in place.
 */
import { loadMeshModule, type LightingSpec, type LightRig } from '@mk7s/holochart-render';
import type { Scene as ThreeScene, WebGLRenderer } from 'three';
import { sceneLightingSpec } from './lighting-attributes.ts';

type Vec3 = [number, number, number];

/** What takes the scene's rig: a mesh primitive (or its lazy loader). */
export interface LightRigUser {
  setLightRig(rig: LightRig | null): void;
}

/** What {@link SceneLighting} lights: the scene's three.js scene and camera. */
export interface SceneLightingHost {
  readonly viewport: { readonly scene: ThreeScene; readonly camera: LightRigCamera };
}

type LightRigCamera = Parameters<LightRig['setCamera']>[0];

/** The lights of one live scene (see the module comment). */
export class SceneLighting {
  readonly #host: SceneLightingHost;
  readonly #users = new Set<LightRigUser>();
  #rig: LightRig | null = null;
  #spec: LightingSpec | null = null;
  /** render's `DEFAULT_LIGHTING`, once the mesh code has loaded. */
  #default: LightingSpec | null = null;
  #key = '';
  #renderer: WebGLRenderer | null = null;
  #invalidate: () => void = () => {};
  #loading = false;
  /** Bumped by {@link dispose}: a load started before it creates nothing. */
  #generation = 0;

  constructor(host: SceneLightingHost) {
    this.#host = host;
  }

  /** The rig, once created (the default rig when the scene sets no `lighting`). */
  get rig(): LightRig | null {
    return this.#rig;
  }

  /** The scene's `lighting` as a render spec, or null when unset (Plotly's per-trace lights). */
  get spec(): LightingSpec | null {
    return this.#spec;
  }

  /**
   * Take the scene's defaulted container (`fullLayout.sceneN`), the axis box's aspect ratio, the
   * renderer and a redraw request (environment images load asynchronously).
   */
  sync(
    full: Readonly<Record<string, unknown>>,
    aspect: Readonly<Vec3>,
    renderer: WebGLRenderer | null | undefined,
    invalidate?: () => void,
  ): void {
    if (invalidate) this.#invalidate = invalidate;
    const spec = sceneLightingSpec(full['lighting'], aspect);
    const key = JSON.stringify(spec);
    const changed = key !== this.#key;
    this.#key = key;
    this.#spec = spec;
    const attach = renderer && renderer !== this.#renderer;
    if (renderer) this.#renderer = renderer;
    if (this.#rig) {
      if (changed) this.#rig.update(spec ?? this.#default ?? {});
      if (changed || attach) this.#attach();
      if (changed) this.#share();
    } else if (spec) this.#create();
  }

  /**
   * Light `mesh` with the scene's rig (now and whenever it changes). Returns the function that
   * stops it (call it when the mesh is disposed).
   */
  use(mesh: LightRigUser): () => void {
    this.#users.add(mesh);
    if (this.#rig) mesh.setLightRig(this.#spec ? this.#rig : null);
    else this.#create();
    return () => {
      this.#users.delete(mesh);
    };
  }

  /** Free the rig (a later `sync` or `use` creates a new one). */
  dispose(): void {
    this.#generation++;
    this.#loading = false;
    this.#rig?.dispose();
    this.#rig = null;
    this.#key = '';
    this.#renderer = null;
    // Meshes stay registered: they get the next rig.
    for (const user of this.#users) user.setLightRig(null);
  }

  #create(): void {
    if (this.#loading || this.#rig) return;
    this.#loading = true;
    const generation = this.#generation;
    loadMeshModule().then(
      (mod) => {
        if (generation !== this.#generation) return;
        this.#loading = false;
        if (this.#rig) return;
        this.#default = mod.DEFAULT_LIGHTING;
        const rig = mod.createLightRig(this.#spec ?? mod.DEFAULT_LIGHTING);
        this.#rig = rig;
        this.#attach();
        this.#share();
        this.#invalidate();
      },
      () => {
        if (generation === this.#generation) this.#loading = false;
      },
    );
  }

  #attach(): void {
    const rig = this.#rig;
    if (!rig) return;
    const { scene, camera } = this.#host.viewport;
    rig.setCamera(camera);
    if (rig.object.parent !== scene) scene.add(rig.object);
    if (this.#renderer) rig.attach(this.#renderer, scene, () => this.#invalidate());
  }

  #share(): void {
    const rig = this.#spec ? this.#rig : null;
    for (const user of this.#users) user.setLightRig(rig);
  }
}
