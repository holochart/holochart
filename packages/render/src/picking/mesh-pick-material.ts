/**
 * Pick materials for generic meshes (any user `Mesh` / `InstancedMesh`, e.g. a surface).
 */
import { GLSL3, NoBlending, ShaderMaterial, type IUniform, type Material, type Mesh } from 'three';
import { MESH_PICK_FRAGMENT, MESH_PICK_VERTEX } from './pick.glsl.ts';
import type { MeshPickElement, PickMaterialHandle, PickRenderState } from './types.ts';

const ELEMENT_DEFINE: Record<MeshPickElement, string | null> = {
  object: null,
  instance: 'PICK_INSTANCE',
  vertex: 'PICK_VERTEX',
  triangle: 'PICK_TRIANGLE',
};
const ELEMENT_DEFINES = ['PICK_INSTANCE', 'PICK_VERTEX', 'PICK_TRIANGLE'] as const;

/** The element mode that actually applies to `mesh` (triangle ids need non-indexed geometry). */
export function effectiveMeshElement(mesh: Mesh, element: MeshPickElement): MeshPickElement {
  if (element === 'triangle' && mesh.geometry.index !== null) return 'vertex';
  if (element === 'instance' && !(mesh as { isInstancedMesh?: boolean }).isInstancedMesh) {
    return 'object';
  }
  return element;
}

/** Number of pick ids a mesh needs for `element` (see {@link effectiveMeshElement}). */
export function meshPickCount(mesh: Mesh, element: MeshPickElement): number {
  const geometry = mesh.geometry;
  switch (effectiveMeshElement(mesh, element)) {
    case 'object':
      return 1;
    case 'instance':
      return (mesh as unknown as { count: number }).count;
    case 'vertex':
      return geometry.getAttribute('position')?.count ?? 0;
    case 'triangle':
      return Math.floor((geometry.getAttribute('position')?.count ?? 0) / 3);
  }
}

function firstMaterial(material: Material | Material[]): Material | undefined {
  return Array.isArray(material) ? material[0] : material;
}

interface MeshPickUniforms {
  [name: string]: IUniform;
  uPickBase: IUniform<number>;
}

/**
 * Pick material for one generic mesh: writes `base + element` and mirrors the source material's
 * side, depth test/write, wireframe, and opaque/transparent bucket (so three.js orders the pick pass
 * like the visible frame). `occluder: true` makes a depth-only material for non-pickable objects
 * that must still hide pickables behind them.
 */
export class MeshPickMaterial implements PickMaterialHandle {
  readonly material: ShaderMaterial;
  readonly #source: Mesh;
  readonly #uniforms: MeshPickUniforms = { uPickBase: { value: 0 } };
  readonly #occluder: boolean;
  #element: MeshPickElement;

  constructor(source: Mesh, element: MeshPickElement, occluder = false) {
    this.#source = source;
    this.#element = element;
    this.#occluder = occluder;
    this.material = new ShaderMaterial({
      name: occluder ? 'holochart:pick:occluder' : 'holochart:pick:mesh',
      glslVersion: GLSL3,
      vertexShader: MESH_PICK_VERTEX,
      fragmentShader: MESH_PICK_FRAGMENT,
      uniforms: this.#uniforms,
      blending: NoBlending,
      colorWrite: !occluder,
      defines: occluder ? { PICK_OCCLUDER: '' } : {},
    });
    this.#syncDefines(occluder ? 'object' : effectiveMeshElement(source, element));
  }

  /** Change the requested element mode (applied on the next pick). */
  setElement(element: MeshPickElement): void {
    this.#element = element;
  }

  prepare(state: Readonly<PickRenderState>): void {
    this.#uniforms.uPickBase.value = state.base;
    const m = this.material;
    if (!this.#occluder) {
      this.#syncDefines(effectiveMeshElement(this.#source, this.#element));
    }
    const src = firstMaterial(this.#source.material);
    if (src) {
      m.side = src.side;
      m.depthTest = src.depthTest;
      m.depthWrite = src.depthWrite;
      m.depthFunc = src.depthFunc;
      m.transparent = src.transparent;
      m.visible = src.visible;
      m.wireframe = (src as { wireframe?: boolean }).wireframe === true;
    }
  }

  dispose(): void {
    this.material.dispose();
  }

  #syncDefines(element: MeshPickElement): void {
    const defines = this.material.defines as Record<string, string>;
    const want = ELEMENT_DEFINE[element];
    let changed = false;
    for (const name of ELEMENT_DEFINES) {
      const has = name in defines;
      if (name === want && !has) {
        defines[name] = '';
        changed = true;
      } else if (name !== want && has) {
        delete defines[name];
        changed = true;
      }
    }
    if (changed) this.material.needsUpdate = true;
  }
}
