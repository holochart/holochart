/**
 * The surface primitive (plan E14.3): a height field drawn from float textures (see `shader.ts`),
 * lit with Plotly's model, colored through the colorscale LUT, with in-shader contour, highlight
 * and wireframe lines.
 *
 * - **Loading**: the fragment stage and the lighting helpers are the mesh primitive's, in the
 *   lazily loaded mesh chunk (`loadMeshModule`). The primitive exists at once (a hidden
 *   placeholder mesh the runtime can hold and order) and draws once the chunk has arrived;
 *   `ready` covers the load, so `chart.ready` and image export wait for it.
 * - **Data**: the grid in linear coordinates relative to a float64 origin (the grid's center),
 *   packed into float32 textures ({@link packRelative}); the data → scene transform is the mesh
 *   object's own matrix (float64 on the CPU, as the mesh primitive does). A new grid of the same
 *   size rewrites the textures in place; everything else is uniforms.
 * - **Translucency** (`opacity` < 1, `opacityscale`, colorscale alpha, `hidesurface`): no depth
 *   writes, and the cells are walked from the far side of the grid (`uOrder`, per frame from the
 *   camera), which draws a height field back to front without sorting triangles.
 * - **Picking** (E2.13): a `PickablePrimitive` whose pick material writes the grid index of each
 *   triangle's provoking vertex (`pickKind: 'vertex'`).
 */
import {
  fitsTexture,
  acquireColorscaleTexture,
  effectiveTransform,
  loadMeshModule,
  type Colorscale,
  type ColorscaleInterpolation,
  type ColorscaleTextureHandle,
  type DataTransform,
  type LightRig,
  type MeshLighting,
  type MeshModule,
  type PickablePrimitive,
  type PickMaterialHandle,
  type PickRenderState,
  type Primitive,
  type PrimitiveContext,
  type RGBA,
  type ViewportSize,
} from '@mk7s/holochart-render';
import {
  BufferGeometry,
  DataTexture,
  DoubleSide,
  FloatType,
  GLSL3,
  Mesh,
  NearestFilter,
  NoBlending,
  NormalBlending,
  RedFormat,
  ShaderMaterial,
  Sphere,
  Vector3,
  Vector4,
  type Camera,
  type IUniform,
} from 'three';
import type { ContourLevels } from './contours.ts';
import { finiteExtent, gridX, gridY, type SurfaceGrid } from './grid.ts';
import { SURFACE_FRAGMENT_HOOKS, SURFACE_VERTEX_SHADER } from './shader.ts';

type Vec3 = [number, number, number];

/** Values at least this large (in magnitude) are gaps in the textures. */
export const HIDDEN_VALUE = 3.0e38;

/** A line style: sRGB color (straight alpha) and width in CSS px. */
export interface SurfaceLineStyle {
  readonly color: RGBA;
  readonly width: number;
}

/** Contour lines of one axis. */
export interface SurfaceContourStyle extends SurfaceLineStyle {
  readonly levels: ContourLevels;
  /** Color the lines with the colorscale (the surface's unlit color) instead of `color`. */
  readonly usecolormap: boolean;
}

/** What {@link SurfacePrimitive} draws. */
export interface SurfaceData {
  /** The grid in linear coordinates; null draws nothing. */
  grid: SurfaceGrid | null;
  /** Values the colorscale maps, one per grid point (`surfacecolor`); null: `z`. */
  color: Float64Array | null;
  colorscale: Colorscale;
  interpolation: ColorscaleInterpolation;
  /** Color domain (values at colorscale 0 and 1). */
  cmin: number;
  cmax: number;
  reversescale: boolean;
  opacity: number;
  /** `[position, opacity]` stops over the normalized color domain, or null. */
  opacityscale: readonly (readonly [number, number])[] | null;
  hidesurface: boolean;
  /** Plotly's `lighting` (render's defaults for missing values). */
  lighting: Partial<MeshLighting>;
  /** Plotly's `lightposition` (clip space). */
  lightposition: Vec3;
  /** The `'flat'` material: colors as given, no lighting. */
  unlit: boolean;
  /** Contour lines of x, y and z (null: none). */
  contours: readonly [
    SurfaceContourStyle | null,
    SurfaceContourStyle | null,
    SurfaceContourStyle | null,
  ];
  /** Highlight lines of x, y and z at the hovered point (null: off). */
  highlight: readonly [SurfaceLineStyle | null, SurfaceLineStyle | null, SurfaceLineStyle | null];
  /** Wireframe: every `step`-th grid line. */
  wireframe: (SurfaceLineStyle & { readonly step: number }) | null;
  /** Linear box outside which fragments are discarded (the scene's axis ranges), or null. */
  clip: { min: Vec3; max: Vec3 } | null;
}

const GRAY: Colorscale = [
  [0, [0, 0, 0, 1]],
  [1, [1, 1, 1, 1]],
];

/** The data of an empty surface. */
export function emptySurfaceData(): SurfaceData {
  return {
    grid: null,
    color: null,
    colorscale: GRAY,
    interpolation: 'rgb',
    cmin: 0,
    cmax: 1,
    reversescale: false,
    opacity: 1,
    opacityscale: null,
    hidesurface: false,
    lighting: {},
    lightposition: [10, 1e4, 0],
    unlit: false,
    contours: [null, null, null],
    highlight: [null, null, null],
    wireframe: null,
    clip: null,
  };
}

/**
 * Pack `values` relative to `origin` as float32 (the texture layout): non-finite values become
 * {@link HIDDEN_VALUE}.
 */
export function packRelative(
  values: ArrayLike<number>,
  origin: number,
  out: Float32Array = new Float32Array(values.length),
): Float32Array {
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    out[i] = Number.isFinite(v) ? v - origin : HIDDEN_VALUE;
  }
  return out;
}

/** Center of the finite values (0 without any): the origin they are stored relative to. */
export function centerOf(values: ArrayLike<number>): number {
  const e = finiteExtent(values);
  return e ? (e[0] + e[1]) / 2 : 0;
}

/** 256 opacities sampled from `[position, opacity]` stops (linear between stops). */
export function opacityscaleTable(
  stops: readonly (readonly [number, number])[],
  out: Float32Array = new Float32Array(256),
): Float32Array {
  for (let k = 0; k < 256; k++) {
    const t = k / 255;
    let v = stops[stops.length - 1]![1];
    for (let s = 1; s < stops.length; s++) {
      const [p1, o1] = stops[s]!;
      if (t <= p1) {
        const [p0, o0] = stops[s - 1]!;
        v = p1 > p0 ? o0 + ((o1 - o0) * (t - p0)) / (p1 - p0) : o1;
        break;
      }
    }
    out[k] = Math.min(1, Math.max(0, v));
  }
  return out;
}

/** A float texture's data and size. */
export interface PackedTexture {
  readonly data: Float32Array;
  readonly width: number;
  readonly height: number;
}

/** A grid packed for the shader (see {@link packGrid}). */
export interface PackedGrid {
  /** Float64 origin of x, y and z: the centers of their finite ranges. */
  readonly origin: Vec3;
  /** z, `nx × ny`. */
  readonly height: PackedTexture;
  /** x: `nx × 1` (a vector) or `nx × ny` (a matrix); texel `(i, 0)` or `(i, j)`. */
  readonly x: PackedTexture;
  /** y: `ny × 1` (a vector: texel `(j, 0)`) or `nx × ny`. */
  readonly y: PackedTexture;
  /** The color values (`nx × ny`), or one unused texel when colored by z. */
  readonly value: PackedTexture;
  /** Origin of the color values (z's when colored by z). */
  readonly colorOrigin: number;
}

/**
 * The textures of a grid (plan E14.3's height texture): float32 values relative to float64
 * origins (the centers of their ranges, so dates and large offsets keep their precision), gaps as
 * {@link HIDDEN_VALUE}. Row-major, one texel per grid point (row `j` is texture row `j`).
 */
export function packGrid(g: SurfaceGrid, color: ArrayLike<number> | null): PackedGrid {
  const { nx, ny } = g;
  const origin: Vec3 = [centerOf(g.x), centerOf(g.y), centerOf(g.z)];
  const colorOrigin = color ? centerOf(color) : origin[2];
  return {
    origin,
    height: { data: packRelative(g.z, origin[2]), width: nx, height: ny },
    x: { data: packRelative(g.x, origin[0]), width: nx, height: g.xMatrix ? ny : 1 },
    y: {
      data: packRelative(g.y, origin[1]),
      width: g.yMatrix ? nx : ny,
      height: g.yMatrix ? ny : 1,
    },
    value: color
      ? { data: packRelative(color, colorOrigin), width: nx, height: ny }
      : { data: new Float32Array(1), width: 1, height: 1 },
    colorOrigin,
  };
}

function floatTexture(data: Float32Array, width: number, height: number): DataTexture {
  const t = new DataTexture(data, width, height, RedFormat, FloatType);
  t.minFilter = t.magFilter = NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

/** A float texture holding `data` (`width × height`): `current` rewritten in place when it fits. */
function fillTexture(
  current: DataTexture | null,
  data: Float32Array,
  width: number,
  height: number,
): DataTexture {
  const image = current?.image as { width: number; height: number; data: Float32Array } | undefined;
  if (current && image && image.width === width && image.height === height) {
    image.data.set(data);
    current.needsUpdate = true;
    return current;
  }
  current?.dispose();
  return floatTexture(data, width, height);
}

interface SurfaceUniforms {
  [name: string]: IUniform;
  uHeight: IUniform<DataTexture | null>;
  uCoordX: IUniform<DataTexture | null>;
  uCoordY: IUniform<DataTexture | null>;
  uValue: IUniform<DataTexture | null>;
  uGrid: IUniform<[number, number]>;
  uMatrix: IUniform<[number, number]>;
  uOrder: IUniform<[number, number, number]>;
  uWorldScale: IUniform<Vector3>;
  uColorByZ: IUniform<number>;
  uColor: IUniform<Vector4>;
  uOpacity: IUniform<number>;
  uClipMin: IUniform<Vector3>;
  uClipMax: IUniform<Vector3>;
  uLut: IUniform<unknown>;
  uCRange: IUniform<Vector3>;
  uK: IUniform<Vector4>;
  uAmbient: IUniform<Vector3>;
  uHemiSky: IUniform<Vector3>;
  uHemiGround: IUniform<Vector3>;
  uHemiUp: IUniform<Vector3>;
  uLightPos: IUniform<Float32Array>;
  uLightColor: IUniform<Float32Array>;
  uAlphaLut: IUniform<DataTexture | null>;
  uAlphaScale: IUniform<number>;
  uIso: IUniform<Vector4[]>;
  uIsoColor: IUniform<Vector4[]>;
  uIsoTint: IUniform<Vector3>;
  uHiLevel: IUniform<Vector3>;
  uHiWidth: IUniform<Vector3>;
  uHiColor: IUniform<Vector4[]>;
  uWire: IUniform<Vector4>;
  uWireColor: IUniform<Vector4>;
  uHideSurface: IUniform<number>;
}

/** Splice the surface hooks into the mesh fragment shader at its `// @mesh-…` lines. */
function fragmentShader(mod: MeshModule): string {
  const parts: Record<string, string> = {
    'fragment-decl': SURFACE_FRAGMENT_HOOKS.fragmentDecl,
    color: SURFACE_FRAGMENT_HOOKS.color,
    lit: SURFACE_FRAGMENT_HOOKS.lit,
  };
  return mod.MESH_FRAGMENT_SHADER.replace(
    /\/\/ @mesh-([a-z-]+)/g,
    (line, name: string) => parts[name] ?? line,
  );
}

function setDefine(defines: Record<string, unknown>, name: string, on: boolean): boolean {
  if (on === name in defines) return false;
  if (on) defines[name] = '';
  else delete defines[name];
  return true;
}

const v3 = new Vector3();
const v3b = new Vector3();

/** See the module comment. */
export class SurfacePrimitive implements Primitive<SurfaceData>, PickablePrimitive {
  readonly object: Mesh;
  readonly #context: PrimitiveContext;
  #d: SurfaceData = emptySurfaceData();
  #mod: MeshModule | null = null;
  #material: ShaderMaterial | null = null;
  readonly #uniforms: SurfaceUniforms;
  readonly #geometry = new BufferGeometry();
  #transform: DataTransform = { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 };
  /** Float64 origin of the textures (x, y, z) and of the color values. */
  #origin: Vec3 = [0, 0, 0];
  #colorOrigin = 0;
  #lut: ColorscaleTextureHandle | null = null;
  #lutKey: { scale: Colorscale; space: ColorscaleInterpolation } | null = null;
  #alphaTable: Float32Array | null = null;
  #rig: LightRig | null = null;
  #view: ReturnType<MeshModule['createViewLights']> | null = null;
  #translucent = false;
  /** Linear points of the grid's middle row / column ends, for the traversal order. */
  #axes: { center: Vec3; di: Vec3; dj: Vec3 } | null = null;
  #ready: Promise<void>;
  #disposed = false;

  constructor(context: PrimitiveContext, data?: Partial<SurfaceData>) {
    this.#context = context;
    const vec4s = () => [new Vector4(), new Vector4(), new Vector4()];
    this.#uniforms = {
      uHeight: { value: null },
      uCoordX: { value: null },
      uCoordY: { value: null },
      uValue: { value: null },
      uGrid: { value: [2, 2] },
      uMatrix: { value: [0, 0] },
      uOrder: { value: [0, 0, 0] },
      uWorldScale: { value: new Vector3(1, 1, 1) },
      uColorByZ: { value: 1 },
      uColor: { value: new Vector4(1, 1, 1, 1) },
      uOpacity: { value: 1 },
      uClipMin: { value: new Vector3() },
      uClipMax: { value: new Vector3() },
      uLut: { value: null },
      uCRange: { value: new Vector3(0, 1, 0) },
      uK: { value: new Vector4() },
      uAmbient: { value: new Vector3() },
      uHemiSky: { value: new Vector3() },
      uHemiGround: { value: new Vector3() },
      uHemiUp: { value: new Vector3(0, 0, 1) },
      uLightPos: { value: new Float32Array(0) },
      uLightColor: { value: new Float32Array(0) },
      uAlphaLut: { value: null },
      uAlphaScale: { value: 0 },
      uIso: { value: vec4s() },
      uIsoColor: { value: vec4s() },
      uIsoTint: { value: new Vector3(1, 1, 1) },
      uHiLevel: { value: new Vector3() },
      uHiWidth: { value: new Vector3() },
      uHiColor: { value: vec4s() },
      uWire: { value: new Vector4() },
      uWireColor: { value: new Vector4() },
      uHideSurface: { value: 0 },
    };
    this.object = new Mesh(this.#geometry);
    this.object.name = 'holochart:surface';
    this.object.visible = false;
    this.object.frustumCulled = false;
    this.object.onBeforeRender = (_renderer, _scene, camera) => this.#beforeRender(camera);
    if (data) this.update(data);
    this.#ready = loadMeshModule().then(
      (mod) => {
        if (this.#disposed) return;
        this.#attach(mod);
        this.#context.invalidate();
      },
      (error: unknown) => {
        console.error('[holochart] could not load the surface shaders:', error);
      },
    );
  }

  /** Resolves once the shaders have loaded (or failed to). */
  get ready(): Promise<void> {
    return this.#ready;
  }

  /** The drawn data. */
  get data(): Readonly<SurfaceData> {
    return this.#d;
  }

  /** Whether the surface draws translucent (no depth writes, far cells first). */
  get translucent(): boolean {
    return this.#translucent;
  }

  get pickCount(): number {
    const g = this.#d.grid;
    return this.#material && g ? g.nx * g.ny : 0;
  }

  get pickKind(): 'vertex' {
    return 'vertex';
  }

  update(patch: Partial<SurfaceData>): void {
    if (this.#disposed) return;
    this.#d = { ...this.#d, ...patch };
    if ('grid' in patch || 'color' in patch) this.#writeTextures();
    this.#updateUniforms();
    this.#context.invalidate();
  }

  /**
   * Draw the highlight lines through `point` (linear x, y, z; the axes with a highlight style), or
   * none (null).
   */
  setHighlight(point: Readonly<Vec3> | null): void {
    const u = this.#uniforms;
    const o = this.#origin;
    for (let a = 0; a < 3; a++) {
      const style = this.#d.highlight[a];
      const on = point !== null && style !== null && style !== undefined;
      u.uHiWidth.value.setComponent(a, on ? style.width : 0);
      if (on) u.uHiLevel.value.setComponent(a, point[a]! - o[a]!);
    }
    this.#context.invalidate();
  }

  /** Light with a scene's rig (`scene.lighting`) instead of `lightposition` (null: Plotly's). */
  setLightRig(rig: LightRig | null): void {
    this.#rig = rig;
    this.#context.invalidate();
  }

  setTransform(transform: DataTransform): void {
    this.#transform = { ...transform };
    this.#applyTransform();
    this.#context.invalidate();
  }

  setViewport(_size: ViewportSize): void {}

  /** The pick variant of the shader (see the module comment). */
  createPickMaterial(): PickMaterialHandle {
    const mod = this.#mod;
    if (!mod) throw new Error('[holochart] the surface shaders have not loaded yet');
    const uniforms = { ...this.#uniforms, uPickBase: { value: 0 } };
    const material = new ShaderMaterial({
      name: 'holochart:surface:pick',
      glslVersion: GLSL3,
      vertexShader: SURFACE_VERTEX_SHADER,
      fragmentShader: fragmentShader(mod),
      uniforms,
      defines: { PICKING: '', HC_LIGHTS: 0 },
      blending: NoBlending,
      side: DoubleSide,
    });
    return {
      material,
      prepare: (state: Readonly<PickRenderState>): void => {
        uniforms.uPickBase.value = state.base;
        const defines = material.defines as Record<string, unknown>;
        if (setDefine(defines, 'HC_CLIP', this.#d.clip !== null)) material.needsUpdate = true;
        material.depthTest = true;
        material.depthWrite = true;
      },
      dispose: () => material.dispose(),
    };
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    const u = this.#uniforms;
    for (const t of [u.uHeight, u.uCoordX, u.uCoordY, u.uValue, u.uAlphaLut]) t.value?.dispose();
    this.#lut?.release();
    this.#lut = null;
    this.#material?.dispose();
    this.#geometry.dispose();
    this.object.removeFromParent();
  }

  // -------------------------------------------------------------------------------------------

  #attach(mod: MeshModule): void {
    this.#mod = mod;
    this.#view = mod.createViewLights();
    this.#material = new ShaderMaterial({
      name: 'holochart:surface',
      glslVersion: GLSL3,
      vertexShader: SURFACE_VERTEX_SHADER,
      fragmentShader: fragmentShader(mod),
      uniforms: this.#uniforms,
      defines: { HC_LIGHTS: 1, HC_INTENSITY: '' },
      blending: NormalBlending,
      side: DoubleSide,
    });
    this.object.material = this.#material;
    this.#updateUniforms();
  }

  /** Pack the grid and color values into the textures, and set the draw range. */
  #writeTextures(): void {
    const g = this.#d.grid;
    const u = this.#uniforms;
    if (
      !g ||
      g.nx < 2 ||
      g.ny < 2 ||
      // One texel per grid point.
      !fitsTexture(this.#context.capabilities, 'surface grid', g.nx, g.ny)
    ) {
      this.#geometry.setDrawRange(0, 0);
      this.#axes = null;
      return;
    }
    const { nx, ny } = g;
    const packed = packGrid(g, this.#d.color);
    const o = packed.origin;
    this.#origin = o;
    const fill = (u: IUniform<DataTexture | null>, t: PackedTexture): void => {
      u.value = fillTexture(u.value, t.data, t.width, t.height);
    };
    fill(u.uHeight, packed.height);
    fill(u.uCoordX, packed.x);
    fill(u.uCoordY, packed.y);
    fill(u.uValue, packed.value);
    this.#colorOrigin = packed.colorOrigin;
    u.uColorByZ.value = this.#d.color ? 0 : 1;
    u.uGrid.value = [nx, ny];
    u.uMatrix.value = [g.xMatrix ? 1 : 0, g.yMatrix ? 1 : 0];
    this.#geometry.setDrawRange(0, (nx - 1) * (ny - 1) * 6);
    // Traversal axes: the middle row's and column's ends, and the middle point.
    const im = nx >> 1;
    const jm = ny >> 1;
    const at = (i: number, j: number): Vec3 => [gridX(g, i, j), gridY(g, i, j), g.z[j * nx + i]!];
    const sub = (a: Vec3, b: Vec3): Vec3 => {
      const d: Vec3 = [a[0] - b[0], a[1] - b[1], 0];
      return Number.isFinite(d[0]) && Number.isFinite(d[1]) ? d : [0, 0, 0];
    };
    const c = at(im, jm);
    let di = sub(at(nx - 1, jm), at(0, jm));
    let dj = sub(at(im, ny - 1), at(im, 0));
    if (di[0] === 0 && di[1] === 0) di = [1, 0, 0];
    if (dj[0] === 0 && dj[1] === 0) dj = [0, 1, 0];
    const center: Vec3 = [
      Number.isFinite(c[0]) ? c[0] : o[0],
      Number.isFinite(c[1]) ? c[1] : o[1],
      Number.isFinite(c[2]) ? c[2] : o[2],
    ];
    this.#axes = { center, di, dj };
    this.#applyTransform();
  }

  /** Uniforms, defines and blending (cheap; after every update). */
  #updateUniforms(): void {
    const d = this.#d;
    const u = this.#uniforms;
    const o = this.#origin;
    u.uOpacity.value = Math.min(1, Math.max(0, d.opacity));
    const l = this.#mod?.resolveMeshLighting(d.lighting);
    if (l) u.uK.value.set(l.diffuse, l.specular, Math.max(l.roughness, 1e-3), l.fresnel);
    if (d.clip) {
      u.uClipMin.value.set(d.clip.min[0] - o[0], d.clip.min[1] - o[1], d.clip.min[2] - o[2]);
      u.uClipMax.value.set(d.clip.max[0] - o[0], d.clip.max[1] - o[1], d.clip.max[2] - o[2]);
    }
    // Colorscale LUT (shared) and domain relative to the color origin.
    const key = this.#lutKey;
    if (!key || key.scale !== d.colorscale || key.space !== d.interpolation) {
      const next = acquireColorscaleTexture(this.#context.resources, d.colorscale, d.interpolation);
      this.#lut?.release();
      this.#lut = next;
      this.#lutKey = { scale: d.colorscale, space: d.interpolation };
      u.uLut.value = next.texture;
    }
    const co = this.#colorOrigin;
    u.uCRange.value.set(d.cmin - co, d.cmax - co, d.reversescale ? 1 : 0);
    // Opacity scale.
    if (d.opacityscale) {
      this.#alphaTable = opacityscaleTable(d.opacityscale, this.#alphaTable ?? undefined);
      u.uAlphaLut.value = fillTexture(u.uAlphaLut.value, this.#alphaTable, 256, 1);
      u.uAlphaScale.value = 1;
    } else u.uAlphaScale.value = 0;
    // Lines.
    for (let a = 0; a < 3; a++) {
      const c = d.contours[a];
      const iso = u.uIso.value[a]!;
      if (c && c.levels.count > 0) {
        iso.set(c.levels.start - o[a]!, c.levels.size || 1, c.levels.count, c.width);
        u.uIsoColor.value[a]!.set(...c.color);
        u.uIsoTint.value.setComponent(a, c.usecolormap ? 0 : 1);
      } else iso.set(0, 1, 0, 0);
      const h = d.highlight[a];
      if (h) u.uHiColor.value[a]!.set(...h.color);
      else u.uHiWidth.value.setComponent(a, 0);
    }
    const w = d.wireframe;
    if (w) {
      const step = Math.max(1, Math.round(w.step));
      u.uWire.value.set(step, step, w.width, 1);
      u.uWireColor.value.set(...w.color);
    } else u.uWire.value.set(1, 1, 0, 0);
    u.uHideSurface.value = d.hidesurface ? 1 : 0;
    // Blending.
    const lutAlpha = d.colorscale.some((stop) => stop[1][3] < 1);
    const translucent = d.opacity < 1 || d.opacityscale !== null || lutAlpha || d.hidesurface;
    this.#translucent = translucent;
    const m = this.#material;
    if (!m) return;
    m.transparent = translucent;
    m.depthWrite = !translucent;
    const defines = m.defines as Record<string, unknown>;
    let dirty = setDefine(defines, 'HC_UNLIT', d.unlit);
    dirty = setDefine(defines, 'HC_CLIP', d.clip !== null) || dirty;
    if (dirty) m.needsUpdate = true;
    this.object.visible = d.grid !== null && d.grid.nx >= 2 && d.grid.ny >= 2;
  }

  #applyTransform(): void {
    const { scale, offset } = effectiveTransform(this.#transform, this.#origin);
    this.object.scale.set(scale[0], scale[1], scale[2]);
    this.object.position.set(offset[0], offset[1], offset[2]);
    this.#uniforms.uWorldScale.value.set(scale[0], scale[1], scale[2]);
    // Bounds for three.js' transparent sorting.
    const a = this.#axes;
    if (a) {
      const c = a.center;
      const o = this.#origin;
      this.#geometry.boundingSphere = new Sphere(
        new Vector3(c[0] - o[0], c[1] - o[1], c[2] - o[2]),
        0,
      );
    }
  }

  #beforeRender(camera: Camera): void {
    const mod = this.#mod;
    const d = this.#d;
    const u = this.#uniforms;
    if (mod && this.#view && !d.unlit) {
      const lighting = mod.resolveMeshLighting(d.lighting);
      const view = mod.computeViewLights(
        this.#rig?.spec ?? null,
        d.lightposition,
        lighting,
        camera,
        this.#view,
      );
      u.uLightPos.value = view.position;
      u.uLightColor.value = view.color;
      u.uAmbient.value.fromArray(view.ambient);
      u.uHemiSky.value.fromArray(view.hemiSky);
      u.uHemiGround.value.fromArray(view.hemiGround);
      u.uHemiUp.value.fromArray(view.hemiUp);
      const defines = this.#material?.defines as Record<string, unknown> | undefined;
      if (defines && defines['HC_LIGHTS'] !== view.count) {
        defines['HC_LIGHTS'] = view.count;
        this.#material!.needsUpdate = true;
      }
    }
    u.uOrder.value = this.#translucent ? this.#order(camera) : [0, 0, 0];
  }

  /** Cell traversal from the far side (see the module comment): flip i, flip j, swap. */
  #order(camera: Camera): [number, number, number] {
    const a = this.#axes;
    if (!a) return [0, 0, 0];
    const s = this.object.scale;
    const p = this.object.position;
    const o = this.#origin;
    // The view direction toward the grid's middle point, in world units.
    const center = v3.set(
      (a.center[0] - o[0]) * s.x + p.x,
      (a.center[1] - o[1]) * s.y + p.y,
      (a.center[2] - o[2]) * s.z + p.z,
    );
    const view = (camera as { isOrthographicCamera?: boolean }).isOrthographicCamera
      ? camera.getWorldDirection(v3b)
      : center.sub(v3b.setFromMatrixPosition(camera.matrixWorld));
    const along = (dir: Vec3): number => {
      const x = dir[0] * s.x;
      const y = dir[1] * s.y;
      const len = Math.hypot(x, y) || 1;
      return (x * view.x + y * view.y) / len;
    };
    const ai = along(a.di);
    const aj = along(a.dj);
    return [ai > 0 ? 1 : 0, aj > 0 ? 1 : 0, Math.abs(ai) > Math.abs(aj) ? 1 : 0];
  }
}
