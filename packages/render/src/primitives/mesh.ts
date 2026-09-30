/**
 * Mesh primitive (plan E2.11): an indexed triangle mesh with per-vertex (or per-face) colors or
 * colorscale intensity, Plotly's lighting model or a three.js material (E8.7), flat or smooth
 * shading, one- or two-sided, translucency with sorted triangles (E2.14), a clip box, shader hooks
 * and GPU picking. Surface, mesh3d, isosurface, volume and extruded 2D shapes draw with it. It is
 * loaded on first use (`mesh-loader.ts`), so 2D charts never pay for it.
 *
 * ## Design
 *
 * - **Positions** are RTC float32 (relative to `origin`, plan E16.4). The data → world transform
 *   is the mesh object's own matrix (`scale`, `position` = offset + origin · scale in float64), so
 *   three.js computes `modelViewMatrix` in float64 on the CPU, and three.js materials, shadow maps
 *   and generic picking all see the same geometry without shader changes. Normals go through
 *   `normalMatrix`, which handles non-uniform axis scales.
 * - **Layout**: indexed (one GPU vertex per input vertex, smooth shading, per-vertex colors) or
 *   expanded (three GPU vertices per triangle) when a triangle needs its own values: flat shading
 *   (Plotly's face normals), per-cell intensity (`intensityMode: 'cell'`), per-face colors, or
 *   triangle picking. Both draw through an index buffer, which translucent meshes reorder back to
 *   front when the view changes (`transparency.ts`). Triangles with a missing vertex are drawn
 *   degenerate (nothing), as Plotly drops them.
 * - **Colors** (Plotly's precedence): `intensity` → per-vertex `color` array → `faceColor` → one
 *   `color`. Plotly's model samples the shared colorscale LUT per fragment, with `cmin` / `cmax` /
 *   `reversescale` as uniforms and intensities stored relative to their center (float32
 *   precision). three.js material types get linear vertex colors, intensities mapped on the CPU.
 * - **Partial updates** (plan E16.3): colors, alpha and intensity rewrite only their attribute in
 *   place when the vertex count is unchanged; `cmin` / `cmax` / `reversescale` / `opacity` /
 *   `lighting` / `lightposition` / `clip` are uniforms; a new colorscale swaps a shared LUT.
 *   Positions, indices, normals, shading or picking mode rebuild the geometry.
 * - **Picking** (E2.13): the mesh is a `PickablePrimitive`: its pick material is the same vertex
 *   shader with `PICKING` defined, writing the vertex index (`pickKind: 'vertex'`: the provoking,
 *   i.e. last, vertex of the triangle under the cursor), or the triangle index for expanded
 *   layouts (`'triangle'`; `triangleVertices` maps it back).
 */
import {
  BackSide,
  Box3,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  FrontSide,
  GLSL3,
  Matrix4,
  Mesh,
  NoBlending,
  NormalBlending,
  ShaderMaterial,
  Sphere,
  SRGBColorSpace,
  Vector3,
  Vector4,
  type Camera,
  type IUniform,
  type Material,
  type MeshStandardMaterial,
  type Texture,
  type WebGLRenderer,
} from 'three';
import type { ColorscaleInterpolation } from '../colorscale/interpolate.ts';
import {
  acquireColorscaleTexture,
  buildColorscaleLUT,
  resolveColorDomain,
  type Colorscale,
  type ColorscaleTextureHandle,
} from '../colorscale/lut.ts';
import type { PickablePrimitive, PickMaterialHandle, PickRenderState } from '../picking/types.ts';
import type { Vec3 } from '../precision.ts';
import type {
  ColorInput,
  DataTransform,
  Primitive,
  PrimitiveContext,
  RGBA,
  ViewportSize,
} from '../types.ts';
import { IDENTITY_TRANSFORM } from '../types.ts';
import {
  applyViewportUniforms,
  createViewportUniforms,
  effectiveTransform,
  syncViewportUniforms,
  type ViewportUniforms,
} from './common.ts';
import {
  computeViewLights,
  createViewLights,
  PLOTLY_LIGHTPOSITION,
  resolveMeshLighting,
  type LightRig,
  type MeshLighting,
} from './lighting.ts';
import {
  computeFaceNormals,
  computeVertexNormals,
  defaultNormalScale,
  gatherVertices,
  hasTranslucency,
  intensityOrigin,
  isValidTriangle,
  meshColorSource,
  meshTriangleCount,
  needsColorAttribute,
  writeColors,
  writeIntensity,
  type MeshColorSource,
  type MeshIndexArray,
  type MeshLayout,
} from './mesh-geometry.ts';
import { MESH_FRAGMENT_SHADER, MESH_VERTEX_SHADER } from './mesh.glsl.ts';
import {
  createThreeMaterial,
  isThreeMaterialType,
  type ClipUniforms,
  type MeshMaterialSpec,
} from './mesh-material.ts';
import {
  MESH_SORT_LIMIT,
  reorderTriangles,
  sortTrianglesByDepth,
  triangleCentroids,
} from './transparency.ts';

/**
 * GLSL spliced into the Plotly-model shader (`'plotly'` / `'flat'` materials) at its hooks, e.g.
 * surface contours or a wireframe overlay. Varyings available to fragment hooks: `vLocal` (RTC
 * position), `vViewPos`, `vNormal`, `vValue` (intensity relative to its origin, with intensity);
 * `color` is the straight-alpha sRGB color. Vertex hooks also apply to the pick pass (e.g. a
 * displacement); `uResolution` / `uPixelRatio` (CSS px) are available to declare.
 */
export interface MeshShaderHooks {
  /** Extra uniforms (shared with the pick material). */
  uniforms?: Record<string, IUniform>;
  /** Declarations before the vertex shader's `main`. */
  vertexDecl?: string;
  /** Statements at the end of the vertex shader's `main` (after `gl_Position`). */
  vertex?: string;
  /** Declarations before the fragment shader's `main`. */
  fragmentDecl?: string;
  /** Statements that may change `color` before lighting. */
  color?: string;
  /** Statements that may change `color` after lighting. */
  lit?: string;
}

/** Data for {@link MeshPrimitive}. */
export interface MeshData {
  /** xyz per vertex, relative to {@link origin} (RTC, plan E16.4). The primitive copies it. */
  positions: Float32Array;
  /** Float64 origin of `positions` in data space. Default `[0, 0, 0]`. */
  origin: Vec3;
  /** Three per triangle; null: every three vertices are a triangle. */
  indices: MeshIndexArray | null;
  /**
   * Per-vertex normals in data space; null: computed with Plotly's epsilons (see
   * `mesh-geometry.ts`). Flat shading always uses computed face normals.
   */
  normals: Float32Array | null;
  /** Axis scale applied before computing normals (Plotly's scene space). Default: extents → 2. */
  normalScale: Vec3 | null;
  /** One sRGB color, or one per vertex (4 floats each). Default Plotly's mesh3d gray. */
  color: ColorInput;
  /** One sRGB color per triangle (Plotly `facecolor`), used when `color` is a single color. */
  faceColor: Float32Array | null;
  /** Values mapped through the colorscale: one per vertex, or per triangle (`'cell'`). */
  intensity: ArrayLike<number> | null;
  intensityMode: 'vertex' | 'cell';
  /** sRGB 0–1 stops (shared LUT texture). Default gray ramp. */
  colorscale: Colorscale;
  interpolation: ColorscaleInterpolation;
  /** Value at colorscale 0 / 1. Default: the finite range of `intensity`. */
  cmin: number | undefined;
  cmax: number | undefined;
  reversescale: boolean;
  /** Multiplies alpha. Default 1. */
  opacity: number;
  /** Per-vertex alpha multipliers (e.g. `opacityscale`), or null. */
  alpha: ArrayLike<number> | null;
  /** `'flat'`: Plotly's `flatshading` (face normals). Default `'smooth'`. */
  shading: 'smooth' | 'flat';
  /** Default `'double'` (Plotly draws both sides). */
  side: 'double' | 'front' | 'back';
  /** Plotly's `lighting` (defaults: `PLOTLY_LIGHTING`). */
  lighting: Partial<MeshLighting> | null;
  /** Plotly's `lightposition` (clip space). Default `(1e5, 1e5, 0)`. */
  lightposition: Vec3;
  /** `trace.material` (E8.7). Default null: Plotly's model. */
  material: MeshMaterialSpec | null;
  /** Data-space box outside which fragments are discarded (the scene's axis ranges), or null. */
  clip: { min: Vec3; max: Vec3 } | null;
  /** Pick ids per vertex (default) or per triangle (expands the geometry). */
  pick: 'vertex' | 'triangle';
  /**
   * Sort a translucent mesh's triangles back to front when the view changes: `'auto'` (default)
   * up to `MESH_SORT_LIMIT` triangles.
   */
  sortTriangles: boolean | 'auto';
  castShadow: boolean;
  /** Only three.js material types receive shadows. */
  receiveShadow: boolean;
  hooks: MeshShaderHooks | null;
}

/** Required fields of {@link MeshData}; the rest have defaults. */
export type MeshInput = Partial<MeshData> & Pick<MeshData, 'positions'>;

/** Plotly's mesh3d default color (`#444`… is the line color; the surface default is this gray). */
export const DEFAULT_MESH_COLOR: RGBA = [0.8, 0.8, 0.8, 1];

const GRAY_SCALE: Colorscale = [
  [0, [0, 0, 0, 1]],
  [1, [1, 1, 1, 1]],
];

const HIDDEN_BOX = 3.0e38;

function defaults(input: MeshInput): MeshData {
  return {
    origin: [0, 0, 0],
    indices: null,
    normals: null,
    normalScale: null,
    color: DEFAULT_MESH_COLOR,
    faceColor: null,
    intensity: null,
    intensityMode: 'vertex',
    colorscale: GRAY_SCALE,
    interpolation: 'rgb',
    cmin: undefined,
    cmax: undefined,
    reversescale: false,
    opacity: 1,
    alpha: null,
    shading: 'smooth',
    side: 'double',
    lighting: null,
    lightposition: [...PLOTLY_LIGHTPOSITION] as Vec3,
    material: null,
    clip: null,
    pick: 'vertex',
    sortTriangles: 'auto',
    castShadow: false,
    receiveShadow: false,
    hooks: null,
    ...input,
  };
}

interface MeshUniforms extends ClipUniforms, ViewportUniforms {
  uColor: IUniform<Vector4>;
  uOpacity: IUniform<number>;
  uLut: IUniform<Texture | null>;
  uCRange: IUniform<Vector3>;
  uK: IUniform<Vector4>;
  uAmbient: IUniform<Vector3>;
  uHemiSky: IUniform<Vector3>;
  uHemiGround: IUniform<Vector3>;
  uHemiUp: IUniform<Vector3>;
  uLightPos: IUniform<Float32Array>;
  uLightColor: IUniform<Float32Array>;
}

/** Keys whose change rebuilds the geometry. */
const GEOMETRY_KEYS = [
  'positions',
  'indices',
  'normals',
  'normalScale',
  'shading',
  'pick',
] as const;
/** Keys whose change rewrites the color / intensity attributes. */
const COLOR_KEYS = ['color', 'faceColor', 'alpha', 'intensity', 'intensityMode'] as const;
/** Keys that change CPU-mapped colors (three.js material types) but only uniforms otherwise. */
const SCALE_KEYS = ['colorscale', 'interpolation', 'cmin', 'cmax', 'reversescale'] as const;

/** Splice hooks into a shader at its `// @mesh-…` lines. */
function withHooks(source: string, hooks: MeshShaderHooks | null, fragment: boolean): string {
  if (!hooks) return source;
  const parts: Record<string, string | undefined> = fragment
    ? { 'fragment-decl': hooks.fragmentDecl, color: hooks.color, lit: hooks.lit }
    : { 'vertex-decl': hooks.vertexDecl, vertex: hooks.vertex };
  return source.replace(/\/\/ @mesh-([a-z-]+)/g, (line, name: string) => parts[name] ?? line);
}

function setDefine(defines: Record<string, unknown>, name: string, value: unknown): boolean {
  if (value === undefined || value === false) {
    if (!(name in defines)) return false;
    delete defines[name];
    return true;
  }
  const v = value === true ? '' : value;
  if (defines[name] === v) return false;
  defines[name] = v;
  return true;
}

const SIDES = { double: DoubleSide, front: FrontSide, back: BackSide } as const;
const modelView = new Matrix4();

/** See the module comment. */
export class MeshPrimitive implements Primitive<MeshData>, PickablePrimitive {
  readonly object: Mesh;
  readonly #context: PrimitiveContext;
  #d: MeshData;
  #lighting: MeshLighting;
  #source: MeshColorSource = 'uniform';
  #layout: MeshLayout = {
    expanded: false,
    vertexCount: 0,
    triangleCount: 0,
    itemCount: 0,
    indices: null,
  };
  #geometry: BufferGeometry;
  /** Drawn index before sorting. */
  #baseIndex: Uint32Array | Uint16Array = new Uint16Array(0);
  #centroids: Float32Array | null = null;
  #order: Uint32Array | null = null;
  /** View-space z row of the last sort (NaN: not sorted). */
  readonly #sortedView = [NaN, NaN, NaN, NaN];
  #transform: DataTransform = IDENTITY_TRANSFORM;
  readonly #uniforms: MeshUniforms;
  readonly #shader: ShaderMaterial;
  #three: Material | null = null;
  #threeSpec: MeshMaterialSpec | null = null;
  #lut: ColorscaleTextureHandle | null = null;
  #cpuLut: { key: Colorscale; space: ColorscaleInterpolation; data: Uint8Array } | null = null;
  #intensityOrigin = 0;
  #translucent = false;
  /** Some drawn color attribute value has alpha < 1. */
  #colorsTranslucent = false;
  #rig: LightRig | null = null;
  readonly #view = createViewLights();

  constructor(context: PrimitiveContext, input: MeshInput, object?: Mesh) {
    this.#context = context;
    this.#d = defaults(input);
    this.#lighting = resolveMeshLighting(this.#d.lighting);
    this.#uniforms = {
      ...createViewportUniforms(),
      uClipMin: { value: new Vector3() },
      uClipMax: { value: new Vector3() },
      uColor: { value: new Vector4(1, 1, 1, 1) },
      uOpacity: { value: 1 },
      uLut: { value: null },
      uCRange: { value: new Vector3(0, 1, 0) },
      uK: { value: new Vector4() },
      uAmbient: { value: new Vector3() },
      uHemiSky: { value: new Vector3() },
      uHemiGround: { value: new Vector3() },
      uHemiUp: { value: new Vector3(0, 0, 1) },
      uLightPos: { value: new Float32Array(0) },
      uLightColor: { value: new Float32Array(0) },
    };
    this.#shader = new ShaderMaterial({
      name: 'holochart:mesh',
      glslVersion: GLSL3,
      vertexShader: MESH_VERTEX_SHADER,
      fragmentShader: MESH_FRAGMENT_SHADER,
      uniforms: this.#uniforms,
      defines: { HC_LIGHTS: 1 },
      blending: NormalBlending,
    });
    this.#geometry = new BufferGeometry();
    this.object = object ?? new Mesh();
    this.object.geometry = this.#geometry;
    this.object.material = this.#shader;
    this.object.name ||= 'holochart:mesh';
    this.object.onBeforeRender = (renderer, _scene, camera) => this.#beforeRender(renderer, camera);
    this.#apply(true, true, true);
  }

  /** The resolved data. */
  get data(): Readonly<MeshData> {
    return this.#d;
  }

  /** The drawn layout (expanded or indexed, counts). */
  get layout(): Readonly<MeshLayout> {
    return this.#layout;
  }

  /** Whether the mesh draws translucent (sorted, no depth writes). */
  get translucent(): boolean {
    return this.#translucent;
  }

  /** The material drawing the mesh: the Plotly-model shader or a three.js material. */
  get material(): Material {
    return this.#three ?? this.#shader;
  }

  get pickCount(): number {
    return this.#layout.expanded ? this.#layout.triangleCount : this.#layout.vertexCount;
  }

  get pickKind(): 'vertex' | 'triangle' {
    return this.#layout.expanded ? 'triangle' : 'vertex';
  }

  /** Input vertices of triangle `t` (e.g. to map a triangle pick to a vertex). */
  triangleVertices(t: number): [number, number, number] {
    const idx = this.#d.indices;
    const k = t * 3;
    return idx ? [idx[k]!, idx[k + 1]!, idx[k + 2]!] : [k, k + 1, k + 2];
  }

  /**
   * Use the lights of a scene's rig (`layout.lighting`) in Plotly's model, scaled by the trace's
   * `lighting`; null (default): Plotly's own light at `lightposition`. three.js material types are
   * lit by the rig's three.js lights in the scene either way.
   */
  setLightRig(rig: LightRig | null): void {
    this.#rig = rig;
    this.#context.invalidate();
  }

  update(patch: Partial<MeshData>): void {
    const prev = this.#d;
    const next: MeshData = { ...prev, ...patch };
    const changed = (k: keyof MeshData) => k in patch;
    this.#d = next;
    const prevLighting = this.#lighting;
    this.#lighting = resolveMeshLighting(next.lighting);
    const epsChanged =
      prevLighting.facenormalsepsilon !== this.#lighting.facenormalsepsilon ||
      prevLighting.vertexnormalsepsilon !== this.#lighting.vertexnormalsepsilon;
    const modeChanged =
      isThreeMaterialType(prev.material?.type) !== isThreeMaterialType(next.material?.type);
    const sourceChanged = meshColorSource(next) !== this.#source;
    const geometry =
      GEOMETRY_KEYS.some(changed) ||
      (epsChanged && (next.normals === null || next.shading === 'flat')) ||
      this.#expanded(next) !== this.#layout.expanded;
    const three = isThreeMaterialType(next.material?.type);
    const colors =
      geometry ||
      modeChanged ||
      sourceChanged ||
      COLOR_KEYS.some(changed) ||
      (three && SCALE_KEYS.some(changed));
    this.#apply(geometry, colors, changed('material') || changed('hooks') || modeChanged);
  }

  setTransform(transform: DataTransform): void {
    this.#transform = { ...transform };
    this.#applyTransform();
    this.#context.invalidate();
  }

  setViewport(size: ViewportSize): void {
    applyViewportUniforms(this.#uniforms, size);
  }

  /** The GPU-picking variant of the Plotly-model shader (see the module comment). */
  createPickMaterial(): PickMaterialHandle {
    const uniforms = { ...this.#uniforms, uPickBase: { value: 0 } };
    const material = new ShaderMaterial({
      name: 'holochart:mesh:pick',
      glslVersion: GLSL3,
      vertexShader: MESH_VERTEX_SHADER,
      fragmentShader: MESH_FRAGMENT_SHADER,
      uniforms,
      defines: { PICKING: '', HC_LIGHTS: 0 },
      blending: NoBlending,
    });
    return {
      material,
      prepare: (state: Readonly<PickRenderState>): void => {
        uniforms.uPickBase.value = state.base;
        const hooks = this.#d.hooks;
        Object.assign(uniforms, hooks?.uniforms);
        const vertex = withHooks(MESH_VERTEX_SHADER, hooks, false);
        const defines = material.defines as Record<string, unknown>;
        let dirty = material.vertexShader !== vertex;
        material.vertexShader = vertex;
        dirty = setDefine(defines, 'HC_PICK_TRIANGLE', this.#layout.expanded) || dirty;
        dirty = setDefine(defines, 'HC_CLIP', this.#d.clip !== null) || dirty;
        if (dirty) material.needsUpdate = true;
        const source = this.material;
        material.side = source.side;
        material.depthTest = source.depthTest;
        material.depthWrite = source.depthWrite;
        material.transparent = source.transparent;
      },
      dispose: () => material.dispose(),
    };
  }

  dispose(): void {
    this.#geometry.dispose();
    this.#shader.dispose();
    this.#disposeThree();
    this.#lut?.release();
    this.#lut = null;
    this.object.removeFromParent();
  }

  // -------------------------------------------------------------------------------------------

  #expanded(d: MeshData): boolean {
    const source = meshColorSource(d);
    return (
      d.shading === 'flat' ||
      d.pick === 'triangle' ||
      source === 'intensity-cell' ||
      source === 'face'
    );
  }

  #apply(geometry: boolean, colors: boolean, material: boolean): void {
    const d = this.#d;
    this.#source = meshColorSource(d);
    const three = isThreeMaterialType(d.material?.type);
    if (geometry) this.#buildGeometry();
    if (colors || geometry) this.#writeColors(three, geometry);
    if (material || !three !== !this.#three) this.#buildMaterial(three);
    this.#updateState(three);
    this.#applyTransform();
    this.#context.invalidate();
  }

  #buildGeometry(): void {
    const d = this.#d;
    const positions = d.positions;
    const vertexCount = Math.floor(positions.length / 3);
    const indices = d.indices;
    const triangleCount = meshTriangleCount(vertexCount, indices);
    const expanded = this.#expanded(d);
    const layout: MeshLayout = {
      expanded,
      vertexCount,
      triangleCount,
      itemCount: expanded ? triangleCount * 3 : vertexCount,
      indices,
    };
    this.#layout = layout;
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(gatherVertices(positions, 3, layout), 3));
    const scale = d.normalScale ?? defaultNormalScale(positions);
    let normals: Float32Array;
    if (d.shading === 'flat') {
      const faces = computeFaceNormals(
        positions,
        indices,
        this.#lighting.facenormalsepsilon,
        scale,
      );
      normals = new Float32Array(layout.itemCount * 3);
      for (let i = 0; i < layout.itemCount; i++) {
        const t = Math.floor(i / 3) * 3;
        normals[i * 3] = faces[t]!;
        normals[i * 3 + 1] = faces[t + 1]!;
        normals[i * 3 + 2] = faces[t + 2]!;
      }
    } else {
      const vn =
        d.normals && d.normals.length >= vertexCount * 3
          ? d.normals
          : computeVertexNormals(positions, indices, this.#lighting.vertexnormalsepsilon, scale);
      normals = gatherVertices(vn, 3, layout);
    }
    geometry.setAttribute('normal', new BufferAttribute(normals, 3));
    // Draw index: corners of expanded triangles, or the input indices; invalid triangles
    // degenerate (all three corners the same vertex).
    const n = triangleCount * 3;
    const index = layout.itemCount > 65535 ? new Uint32Array(n) : new Uint16Array(n);
    for (let t = 0; t < triangleCount; t++) {
      const k = t * 3;
      const valid = isValidTriangle(positions, indices, t);
      for (let j = 0; j < 3; j++) {
        const c = expanded ? k + j : indices ? indices[k + j]! : k + j;
        index[k + j] = valid || j === 0 ? c : index[k]!;
      }
    }
    this.#baseIndex = index;
    geometry.setIndex(new BufferAttribute(index.slice(), 1));
    // Bounds of the valid vertices (hidden ones would blow up culling and depth sorting).
    const box = new Box3();
    const p = new Vector3();
    const drawn = geometry.getAttribute('position').array;
    for (let i = 0; i + 2 < drawn.length; i += 3) {
      const x = drawn[i]!;
      const y = drawn[i + 1]!;
      const z = drawn[i + 2]!;
      if (Math.abs(x) < HIDDEN_BOX && Math.abs(y) < HIDDEN_BOX && Math.abs(z) < HIDDEN_BOX) {
        box.expandByPoint(p.set(x, y, z));
      }
    }
    if (box.isEmpty()) box.set(p.set(0, 0, 0), p.clone());
    geometry.boundingBox = box;
    geometry.boundingSphere = box.getBoundingSphere(new Sphere());
    this.#centroids = null;
    this.#order = null;
    this.#sortedView[0] = NaN;
    this.#geometry.dispose();
    this.#geometry = geometry;
    this.object.geometry = geometry;
  }

  /** Write (or drop) the color and intensity attributes; in place when the size is unchanged. */
  #writeColors(three: boolean, fresh: boolean): void {
    const d = this.#d;
    const layout = this.#layout;
    const source = this.#source;
    const intensity = source.startsWith('intensity') ? d.intensity : null;
    const inputs = {
      source,
      color: d.color,
      faceColor: d.faceColor,
      alpha: d.alpha,
      intensity,
      linear: three,
      ...(three && intensity ? this.#cpuMapping(intensity) : {}),
    };
    const geometry = this.#geometry;
    let rebuild = false;
    const set = (name: string, array: Float32Array | null, size: number) => {
      const current = geometry.getAttribute(name) as BufferAttribute | undefined;
      if (!array) {
        if (current) rebuild = true;
        return;
      }
      if (current && current.array.length === array.length) {
        (current.array as Float32Array).set(array);
        current.needsUpdate = true;
      } else if (current || !fresh) {
        rebuild = true;
        geometry.setAttribute(name, new BufferAttribute(array, size));
      } else geometry.setAttribute(name, new BufferAttribute(array, size));
    };
    const colors = needsColorAttribute(inputs) ? writeColors(inputs, layout) : null;
    set('color', colors, 4);
    let values: Float32Array | null = null;
    if (intensity && !three) {
      this.#intensityOrigin = intensityOrigin(intensity);
      values = writeIntensity(
        intensity,
        source === 'intensity-cell',
        this.#intensityOrigin,
        layout,
      );
    }
    set('intensity', values, 1);
    if (rebuild) {
      // Attributes appeared, vanished or changed size: move the rest to a fresh geometry (the old
      // one's GPU buffers are freed; shared attributes upload again).
      const next = new BufferGeometry();
      for (const [name, attr] of Object.entries(geometry.attributes)) {
        if (name === 'color' && !colors) continue;
        if (name === 'intensity' && !values) continue;
        next.setAttribute(name, attr);
      }
      next.setIndex(geometry.getIndex());
      next.boundingBox = geometry.boundingBox;
      next.boundingSphere = geometry.boundingSphere;
      geometry.dispose();
      this.#geometry = next;
      this.object.geometry = next;
    }
    this.#colorsTranslucent = hasTranslucency(colors, 1);
  }

  /** Colorscale LUT bytes and domain for intensity mapped on the CPU (three.js material types). */
  #cpuMapping(intensity: ArrayLike<number>) {
    const d = this.#d;
    let lut = this.#cpuLut;
    if (!lut || lut.key !== d.colorscale || lut.space !== d.interpolation) {
      lut = {
        key: d.colorscale,
        space: d.interpolation,
        data: buildColorscaleLUT(d.colorscale, 256, undefined, d.interpolation),
      };
      this.#cpuLut = lut;
    }
    return { lut: lut.data, domain: this.#domain(intensity), reverse: d.reversescale };
  }

  #domain(intensity: ArrayLike<number>): [number, number] {
    const d = this.#d;
    let lo = d.cmin;
    let hi = d.cmax;
    if (lo === undefined || hi === undefined) {
      let min = Infinity;
      let max = -Infinity;
      for (let i = 0; i < intensity.length; i++) {
        const v = intensity[i]!;
        if (v < min && v > -Infinity) min = v;
        if (v > max && v < Infinity) max = v;
      }
      lo ??= min <= max ? min : 0;
      hi ??= min <= max ? max : 1;
    }
    return resolveColorDomain(lo, hi);
  }

  #disposeThree(): void {
    const gradient = this.#three?.userData['gradient'] as Texture | undefined;
    gradient?.dispose();
    this.#three?.dispose();
    this.#three = null;
    this.#threeSpec = null;
  }

  #buildMaterial(three: boolean): void {
    const d = this.#d;
    if (three) {
      if (this.#threeSpec !== d.material) {
        this.#disposeThree();
        this.#three = createThreeMaterial(d.material!, this.#lighting, this.#uniforms);
        this.#threeSpec = d.material;
      }
    } else this.#disposeThree();
    const shader = this.#shader;
    shader.vertexShader = withHooks(MESH_VERTEX_SHADER, d.hooks, false);
    shader.fragmentShader = withHooks(MESH_FRAGMENT_SHADER, d.hooks, true);
    Object.assign(this.#uniforms, d.hooks?.uniforms);
    shader.needsUpdate = true;
    this.object.material = this.#three ?? shader;
  }

  /** Uniforms, defines and render state (cheap; after every update). */
  #updateState(three: boolean): void {
    const d = this.#d;
    const u = this.#uniforms;
    const l = this.#lighting;
    const geometry = this.#geometry;
    const hasColor = geometry.getAttribute('color') !== undefined;
    const hasIntensity = geometry.getAttribute('intensity') !== undefined;
    const uniform = d.color instanceof Float32Array ? DEFAULT_MESH_COLOR : d.color;
    if (this.#source === 'uniform') u.uColor.value.set(...uniform);
    else u.uColor.value.set(1, 1, 1, 1);
    u.uOpacity.value = Math.min(1, Math.max(0, d.opacity));
    u.uK.value.set(l.diffuse, l.specular, Math.max(l.roughness, 1e-3), l.fresnel);
    if (d.clip) {
      const o = d.origin;
      u.uClipMin.value.set(d.clip.min[0] - o[0], d.clip.min[1] - o[1], d.clip.min[2] - o[2]);
      u.uClipMax.value.set(d.clip.max[0] - o[0], d.clip.max[1] - o[1], d.clip.max[2] - o[2]);
    }
    // Colorscale (Plotly's model: LUT + domain uniforms).
    if (hasIntensity && d.intensity) {
      const handle = this.#lut;
      const next = acquireColorscaleTexture(this.#context.resources, d.colorscale, d.interpolation);
      handle?.release();
      this.#lut = next;
      u.uLut.value = next.texture;
      const [lo, hi] = this.#domain(d.intensity);
      const o = this.#intensityOrigin;
      u.uCRange.value.set(lo - o, hi - o, d.reversescale ? 1 : 0);
    } else if (this.#lut) {
      this.#lut.release();
      this.#lut = null;
      u.uLut.value = null;
    }
    const defines = this.#shader.defines as Record<string, unknown>;
    let dirty = setDefine(defines, 'HC_COLOR', hasColor);
    dirty = setDefine(defines, 'HC_INTENSITY', hasIntensity) || dirty;
    dirty = setDefine(defines, 'HC_UNLIT', d.material?.type === 'flat') || dirty;
    dirty = setDefine(defines, 'HC_CLIP', d.clip !== null) || dirty;
    if (dirty) this.#shader.needsUpdate = true;
    const hasLutAlpha = hasIntensity && d.colorscale.some((stop) => stop[1][3] < 1);
    const translucent =
      d.opacity < 1 ||
      this.#colorsTranslucent ||
      hasLutAlpha ||
      (!hasColor && this.#source === 'uniform' && uniform[3] < 1);
    this.#translucent = translucent;
    const material = this.material;
    material.transparent = translucent;
    material.depthWrite = !translucent;
    material.side = SIDES[d.side] ?? DoubleSide;
    if (three) {
      const m = material as MeshStandardMaterial;
      if (m.vertexColors !== hasColor) {
        m.vertexColors = hasColor;
        m.needsUpdate = true;
      }
      if (hasColor || this.#source !== 'uniform') m.color.setRGB(1, 1, 1);
      else m.color.setRGB(uniform[0], uniform[1], uniform[2], SRGBColorSpace);
      m.opacity = u.uOpacity.value * (!hasColor && this.#source === 'uniform' ? uniform[3] : 1);
      const threeDefines = (m.defines ??= {}) as Record<string, unknown>;
      if (setDefine(threeDefines, 'HC_CLIP', d.clip !== null)) m.needsUpdate = true;
    }
    this.object.castShadow = d.castShadow;
    this.object.receiveShadow = d.receiveShadow;
    if (!translucent && this.#order) this.#restoreIndex();
  }

  #applyTransform(): void {
    const { scale, offset } = effectiveTransform(this.#transform, this.#d.origin);
    this.object.scale.set(scale[0], scale[1], scale[2]);
    this.object.position.set(offset[0], offset[1], offset[2]);
  }

  #restoreIndex(): void {
    const index = this.#geometry.getIndex()!;
    (index.array as Uint32Array).set(this.#baseIndex);
    index.needsUpdate = true;
    this.#order = null;
    this.#sortedView[0] = NaN;
  }

  #beforeRender(renderer: WebGLRenderer, camera: Camera): void {
    syncViewportUniforms(this.#uniforms, renderer);
    const d = this.#d;
    if (!this.#three && d.material?.type !== 'flat') {
      const view = computeViewLights(
        this.#rig?.spec ?? null,
        d.lightposition,
        this.#lighting,
        camera,
        this.#view,
      );
      const u = this.#uniforms;
      u.uLightPos.value = view.position;
      u.uLightColor.value = view.color;
      u.uAmbient.value.fromArray(view.ambient);
      u.uHemiSky.value.fromArray(view.hemiSky);
      u.uHemiGround.value.fromArray(view.hemiGround);
      u.uHemiUp.value.fromArray(view.hemiUp);
      const defines = this.#shader.defines as Record<string, unknown>;
      if (defines['HC_LIGHTS'] !== view.count) {
        defines['HC_LIGHTS'] = view.count;
        this.#shader.needsUpdate = true;
      }
    }
    const sort = d.sortTriangles;
    const count = this.#layout.triangleCount;
    if (!this.#translucent || sort === false || (sort === 'auto' && count > MESH_SORT_LIMIT)) {
      return;
    }
    modelView.multiplyMatrices(camera.matrixWorldInverse, this.object.matrixWorld);
    const e = modelView.elements;
    const last = this.#sortedView;
    if (last[0] === e[2] && last[1] === e[6] && last[2] === e[10] && last[3] === e[14]) return;
    last[0] = e[2]!;
    last[1] = e[6]!;
    last[2] = e[10]!;
    last[3] = e[14]!;
    const positions = this.#geometry.getAttribute('position').array as Float32Array;
    const base = this.#baseIndex;
    // Collapsed (invalid) triangles have three equal corners.
    this.#centroids ??= triangleCentroids(
      positions,
      base,
      (t) => base[t * 3] !== base[t * 3 + 1] || base[t * 3] !== base[t * 3 + 2],
    );
    this.#order = sortTrianglesByDepth(this.#centroids, e, this.#order ?? undefined);
    const index = this.#geometry.getIndex()!;
    reorderTriangles(base, this.#order, index.array as Uint32Array);
    index.needsUpdate = true;
  }
}

/** Create a {@link MeshPrimitive}. `object`: an existing (placeholder) mesh to draw into. */
export function createMeshPrimitive(
  context: PrimitiveContext,
  data: MeshInput,
  object?: Mesh,
): MeshPrimitive {
  return new MeshPrimitive(context, data, object);
}
