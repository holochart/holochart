/**
 * Material types of 3D meshes (plan E8.7): `trace.material: { type, ...params }`.
 *
 * - `'plotly'` (default): Plotly's lighting model in the mesh primitive's own shader (see
 *   `lighting.ts`), with the colorscale sampled per fragment. Plotly figures look like Plotly.
 * - `'flat'`: the same shader, unlit: colors exactly as given (like 2D charts).
 * - `'basic'`, `'lambert'`, `'phong'`, `'standard'`, `'physical'`, `'toon'`, `'matcap'`: three.js'
 *   `MeshBasicMaterial`, `MeshLambertMaterial`, … (lit by the scene's {@link LightRig}, receive
 *   shadows, use the environment map). Their colors are linear vertex colors: intensity is mapped
 *   through the colorscale on the CPU, per vertex (or per cell). Other entries of the spec are set
 *   on the material when it has a property of that name: numbers (`roughness`, `metalness`,
 *   `shininess`, `clearcoat`, `transmission`, `ior`, …), colors as sRGB RGBA tuples or hex numbers
 *   (`specular`, `emissive`, `sheenColor`, …), textures (`matcap`, `map`, …) and booleans.
 *   `toon` also takes `steps` (default 3): the number of shading bands.
 *
 * Plotly's `lighting` seeds the parameters it has an equivalent for: `roughness` (standard,
 * physical), `specular` and `roughness` → `specular` color and `shininess` (phong).
 *
 * The clip box is injected into three.js' shaders (`onBeforeCompile`), so all types clip alike.
 */
import {
  Color,
  DataTexture,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshMatcapMaterial,
  MeshPhongMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  MeshToonMaterial,
  NearestFilter,
  RedFormat,
  SRGBColorSpace,
  Texture,
  type IUniform,
  type Material,
  type Vector3,
} from 'three';
import { shininessFromRoughness, type MeshLighting } from './lighting.ts';

/** `trace.material.type`. */
export type MeshMaterialType =
  'plotly' | 'flat' | 'basic' | 'lambert' | 'phong' | 'standard' | 'physical' | 'toon' | 'matcap';

/** `trace.material`: a type and three.js material parameters (see the module comment). */
export interface MeshMaterialSpec {
  type: MeshMaterialType;
  [param: string]: unknown;
}

/** Whether a material type is drawn with a three.js material (not the primitive's shader). */
export function isThreeMaterialType(type: MeshMaterialType | undefined): boolean {
  return type !== undefined && type !== 'plotly' && type !== 'flat';
}

/** Clip box uniforms shared by the primitive's shader and injected three.js materials. */
export interface ClipUniforms {
  [name: string]: IUniform;
  uClipMin: IUniform<Vector3>;
  uClipMax: IUniform<Vector3>;
}

type MaterialClass = new () => Material;

const CLASSES: Record<string, MaterialClass> = {
  basic: MeshBasicMaterial,
  lambert: MeshLambertMaterial,
  phong: MeshPhongMaterial,
  standard: MeshStandardMaterial,
  physical: MeshPhysicalMaterial,
  toon: MeshToonMaterial,
  matcap: MeshMatcapMaterial,
};

/** Set a spec's parameters on the material's matching properties (see the module comment). */
export function applyMaterialParams(material: Material, spec: Readonly<MeshMaterialSpec>): void {
  const target = material as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(spec)) {
    if (key === 'type' || key === 'steps' || !(key in target) || value === undefined) continue;
    const current = target[key];
    if (current instanceof Color) {
      if (typeof value === 'number') current.setHex(value, SRGBColorSpace);
      else if (Array.isArray(value)) {
        current.setRGB(Number(value[0]), Number(value[1]), Number(value[2]), SRGBColorSpace);
      }
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      if (typeof current === 'number' || typeof current === 'boolean') target[key] = value;
    } else if (value instanceof Texture || value === null) {
      target[key] = value;
    }
  }
  material.needsUpdate = true;
}

/** A toon gradient of `steps` bands (nearest-filtered, so the shading steps). */
export function createToonGradient(steps: number): DataTexture {
  const n = Math.max(2, Math.min(16, Math.round(steps) || 3));
  const data = new Uint8Array(n);
  for (let i = 0; i < n; i++) data[i] = Math.round((i / (n - 1)) * 255);
  const texture = new DataTexture(data, n, 1, RedFormat);
  texture.minFilter = texture.magFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Create the three.js material of `spec` (a three.js type), seeded from Plotly's `lighting`, with
 * the clip box injected. The caller disposes it and `material.userData.gradient` (toon).
 */
export function createThreeMaterial(
  spec: Readonly<MeshMaterialSpec>,
  lighting: Readonly<MeshLighting>,
  clip: ClipUniforms,
): Material {
  const Class = CLASSES[spec.type] ?? MeshStandardMaterial;
  const material = new Class();
  const m = material as MeshStandardMaterial & MeshPhongMaterial;
  if (material instanceof MeshStandardMaterial) m.roughness = lighting.roughness;
  if (material instanceof MeshPhongMaterial) {
    m.shininess = shininessFromRoughness(lighting.roughness);
    m.specular.setScalar(Math.min(1, lighting.specular));
  }
  if (material instanceof MeshToonMaterial) {
    material.gradientMap = createToonGradient(Number(spec['steps'] ?? 3));
    material.userData['gradient'] = material.gradientMap;
  }
  applyMaterialParams(material, spec);
  injectClip(material, clip);
  return material;
}

/** Discard fragments outside the clip box in a three.js material (`HC_CLIP` define). */
export function injectClip(material: Material, clip: ClipUniforms): void {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, clip);
    shader.vertexShader =
      'varying vec3 vHcLocal;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvHcLocal = position;',
      );
    shader.fragmentShader =
      'varying vec3 vHcLocal;\nuniform vec3 uClipMin;\nuniform vec3 uClipMax;\n' +
      shader.fragmentShader.replace(
        '#include <clipping_planes_fragment>',
        '#ifdef HC_CLIP\nif (any(lessThan(vHcLocal, uClipMin)) || any(greaterThan(vHcLocal, uClipMax))) discard;\n#endif\n#include <clipping_planes_fragment>',
      );
  };
  material.customProgramCacheKey = () => 'holochart-mesh';
}
