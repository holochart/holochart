/**
 * Lazy loading of the 3D mesh code (plan E2.11, like the fill primitive, `fill-loader.ts`).
 *
 * The mesh primitive, Plotly's lighting model, the three.js material types, light rigs and
 * transparency sorting are only needed by 3D scenes (and later extruded 2D shapes). Scenes draw
 * meshes through {@link LazyMeshPrimitive}, which fetches that code with a dynamic `import()` (of
 * `mesh-lazy.ts`) the first time a mesh is created and draws it once it has arrived; `ready`
 * covers the load, so `chart.ready` and image export wait for it. {@link loadMeshModule} gives the
 * whole module (light rigs, normals, sorting helpers) to code that needs it directly, e.g. a
 * scene creating its `layout.lighting` rig. Bundlers that split code emit it as its own chunk.
 * The script-tag build inlines it into its 3D add-on, which hands it to this loader (the main
 * script's build replaces the `import()`, see `scripts/build/iife-split.ts`).
 */
import { Mesh } from 'three';
import type { PickablePrimitive, PickMaterialHandle } from '../picking/types.ts';
import type { DataTransform, Primitive, PrimitiveContext, ViewportSize } from '../types.ts';
import type { LightRig } from './lighting.ts';
import type { MeshData, MeshInput, MeshPrimitive } from './mesh.ts';

/** The lazily loaded mesh module (`mesh-lazy.ts`). */
export type MeshModule = typeof import('./mesh-lazy.ts');

let meshModule: MeshModule | null = null;
let loading: Promise<MeshModule> | null = null;

/** Load the mesh code once (concurrent callers share the request; a failed load is retried). */
export function loadMeshModule(): Promise<MeshModule> {
  if (meshModule) return Promise.resolve(meshModule);
  loading ??= import('./mesh-lazy.ts').then(
    (mod) => (meshModule = mod),
    (error: unknown) => {
      loading = null;
      throw error;
    },
  );
  return loading;
}

/** The mesh module if it has loaded (else null). */
export function meshModuleLoaded(): MeshModule | null {
  return meshModule;
}

let errorReported = false;

const RESOLVED: Promise<void> = Promise.resolve();

/**
 * A {@link MeshPrimitive} whose code loads on first use: the same data, updates, transform, light
 * rig and picking once loaded. Until then it keeps the latest of each and draws nothing (its
 * {@link object} is a hidden placeholder the mesh draws into later, so callers can hold it and set
 * its `renderOrder` at any time). A failed load resolves `ready` (the mesh stays undrawn) and is
 * retried by the next {@link update}.
 */
export class LazyMeshPrimitive implements Primitive<MeshData>, PickablePrimitive {
  readonly object: Mesh;
  readonly #context: PrimitiveContext;
  #data: MeshInput | null;
  #transform: DataTransform | undefined;
  #viewport: ViewportSize | undefined;
  #rig: LightRig | null = null;
  #mesh: MeshPrimitive | null = null;
  #pending: Promise<void> = RESOLVED;
  #loading = false;
  #disposed = false;

  constructor(context: PrimitiveContext, data: MeshInput) {
    this.#context = context;
    this.#data = { ...data };
    this.object = new Mesh();
    this.object.visible = false;
    if (meshModule) this.#attach(meshModule);
    else this.#load();
  }

  /** Resolves once the mesh code has loaded (or failed to) and the mesh holds the data. */
  get ready(): Promise<void> {
    return this.#pending;
  }

  /** The underlying mesh primitive, once loaded (else null). */
  get mesh(): MeshPrimitive | null {
    return this.#mesh;
  }

  get pickCount(): number {
    return this.#mesh?.pickCount ?? 0;
  }

  get pickKind(): 'vertex' | 'triangle' {
    return this.#mesh?.pickKind ?? 'vertex';
  }

  /** Only called by the picker once the mesh is drawn (the placeholder is hidden until then). */
  createPickMaterial(): PickMaterialHandle {
    if (!this.#mesh) throw new Error('[holochart] the mesh primitive has not loaded yet');
    return this.#mesh.createPickMaterial();
  }

  update(patch: Partial<MeshData>): void {
    if (this.#disposed) return;
    if (this.#mesh) {
      this.#mesh.update(patch);
      return;
    }
    this.#data = { ...(this.#data as MeshInput), ...patch };
    if (!this.#loading) this.#load();
  }

  setTransform(transform: DataTransform): void {
    if (this.#mesh) this.#mesh.setTransform(transform);
    else this.#transform = { ...transform };
  }

  setViewport(size: ViewportSize): void {
    if (this.#mesh) this.#mesh.setViewport(size);
    else this.#viewport = { ...size };
  }

  /** See `MeshPrimitive.setLightRig`. */
  setLightRig(rig: LightRig | null): void {
    this.#rig = rig;
    this.#mesh?.setLightRig(rig);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#mesh?.dispose();
    this.#mesh = null;
    this.object.removeFromParent();
    this.#data = null;
  }

  #load(): void {
    this.#loading = true;
    this.#pending = loadMeshModule().then(
      (mod) => {
        this.#loading = false;
        if (this.#disposed) return;
        this.#attach(mod);
        this.#context.invalidate();
      },
      (error: unknown) => {
        this.#loading = false;
        if (!errorReported) console.error('[holochart] could not load the mesh primitive:', error);
        errorReported = true;
      },
    );
  }

  #attach(mod: MeshModule): void {
    const mesh = mod.createMeshPrimitive(this.#context, this.#data as MeshInput, this.object);
    if (this.#transform) mesh.setTransform(this.#transform);
    if (this.#viewport) mesh.setViewport(this.#viewport);
    if (this.#rig) mesh.setLightRig(this.#rig);
    this.#data = null;
    this.#transform = undefined;
    this.#viewport = undefined;
    this.object.visible = true;
    this.#mesh = mesh;
  }
}

/** Create a {@link LazyMeshPrimitive}. */
export function createLazyMeshPrimitive(
  context: PrimitiveContext,
  data: MeshInput,
): LazyMeshPrimitive {
  return new LazyMeshPrimitive(context, data);
}
