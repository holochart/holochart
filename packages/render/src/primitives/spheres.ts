/**
 * Instanced lit spheres (plan E14.2: `scatter3d` `marker.render: 'sphere'`, a Holochart extension),
 * in the lazily loaded 3D chunk (`lines-markers-3d.ts`).
 *
 * One draw call per set: a camera-facing quad instanced per sphere and ray-cast in the fragment
 * shader (`spheres.glsl.ts`): exact round silhouettes at any size and zoom, per-pixel Blinn–Phong
 * lighting, and `gl_FragDepth` from the hit point, so spheres intersect each other and every other
 * depth-tested object correctly. Four vertices per sphere keep a million of them cheap on the
 * vertex side (a tessellated sphere mesh would need hundreds).
 *
 * ## Sizing (decision)
 *
 * `sizing: 'screen'` (default): `size` is the diameter in CSS px **at the sphere's center**, like
 * sprite markers (Plotly `marker.size`), so switching `marker.render` keeps the apparent sizes; the
 * spheres keep that size while zooming, like Plotly's markers. `sizing: 'world'`: `size` is the
 * diameter in world units (the scene's normalized space, not per-axis data units, which may be
 * scaled differently per axis and would turn spheres into ellipsoids); the spheres then grow and
 * shrink with the view like real objects.
 *
 * ## Colors, blending, sorting
 *
 * Per-sphere sRGB colors (`color`) or values through a colorscale LUT (`colorValues` +
 * `colorscale`, Plotly `cmin` / `cmax` / `cmid` / `reversescale` semantics), times `opacity`.
 * Opaque sets write depth with alpha to coverage; translucent ones blend (`blend3d.ts`), optionally
 * sorted back to front (`depthSort`): the instances are rewritten in view order through a throttle
 * while the camera moves, and pick ids keep reporting data indices (`aSourceIndex`).
 *
 * Lighting: one directional key light in view space plus ambient (`lighting`), independent of the
 * scene's three.js lights so charts look the same in any scene.
 */
import {
  DynamicDrawUsage,
  Float32BufferAttribute,
  GLSL3,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  NoBlending,
  ShaderMaterial,
  Vector2,
  Vector3,
  Vector4,
  type Camera,
  type IUniform,
  type Texture,
} from 'three';
import {
  acquireColorscaleTexture,
  resolveColorDomain,
  type Colorscale,
  type ColorscaleTextureHandle,
} from '../colorscale/lut.ts';
import type {
  PickablePrimitive,
  PickElementKind,
  PickMaterialHandle,
  PickRenderState,
} from '../picking/types.ts';
import { HIDDEN_POSITION, rtcAxisOrigin } from '../precision.ts';
import {
  IDENTITY_TRANSFORM,
  type ColorInput,
  type DataTransform,
  type Primitive,
  type PrimitiveContext,
  type RGBA,
  type ScalarInput,
  type ViewportSize,
} from '../types.ts';
import {
  applyBlend3D,
  colorscaleOpaque,
  colorsOpaque,
  isOpaque,
  opacitiesOpaque,
  type Blend3D,
} from './blend3d.ts';
import { colorAt, scalarAt, syncViewportUniforms, type ViewportSource } from './common.ts';
import { DepthSorter } from './depth-sort.ts';
import type { ThrottleClock } from './line-buffers.ts';
import { SPHERE_FRAGMENT, SPHERE_VERTEX } from './spheres.glsl.ts';

/** Data of a {@link SphereSet}. Every field is optional in updates. */
export interface SphereData {
  /** Data-space centers (float64 recommended). */
  x: ArrayLike<number>;
  y: ArrayLike<number>;
  z: ArrayLike<number> | null;
  /** Explicit RTC origin; default: center of the finite data bounds. */
  origin: readonly [number, number, number] | null;
  /** Diameter: CSS px at the center (`sizing: 'screen'`) or world units. Default 6. */
  size: ScalarInput;
  /** sRGB 0–1 RGBA, per sphere or one. Ignored while `colorValues` + `colorscale` are set. */
  color: ColorInput;
  colorValues: ArrayLike<number> | null;
  colorscale: Colorscale | null;
  cmin: number;
  cmax: number;
  cmid: number | null;
  reversescale: boolean;
  nanColor: RGBA;
  /** Multiplies the color alpha. Default 1. */
  opacity: ScalarInput;
}

/** How `size` is measured (see the module docs). */
export type SphereSizing = 'screen' | 'world';

/** Key light (view space) and material response. */
export interface SphereLighting {
  /** Ambient term (fraction of the color). Default 0.4. */
  ambient: number;
  /** Diffuse (Lambert) term. Default 0.65. */
  diffuse: number;
  /** Specular (Blinn–Phong) highlight strength, added as white. Default 0.25. */
  specular: number;
  /** Specular exponent. Default 32. */
  shininess: number;
  /** Direction towards the light in view space (+x right, +y up, +z towards the viewer). */
  direction: readonly [number, number, number];
}

export const DEFAULT_SPHERE_LIGHTING: Readonly<SphereLighting> = Object.freeze({
  ambient: 0.4,
  diffuse: 0.65,
  specular: 0.25,
  shininess: 32,
  direction: [-0.35, 0.55, 0.75] as const,
});

export interface SphereSetOptions {
  /** Default `'screen'`. */
  sizing?: SphereSizing;
  /** Default `'auto'` (opaque when every color and opacity is 1, see `blend3d.ts`). */
  blend?: Blend3D;
  /** Sort translucent spheres back to front when the view changes. Default false. */
  depthSort?: boolean;
  /** Min interval between re-sorts while the camera moves. Default 100 ms. */
  sortThrottleMs?: number;
  /** Depth test against the scene. Default true. */
  depthTest?: boolean;
  /** three.js render order (trace order). */
  renderOrder?: number;
  lighting?: Partial<SphereLighting>;
  /** Clock override (tests). */
  clock?: ThrottleClock;
}

export const SPHERE_DEFAULTS: Readonly<SphereData> = Object.freeze({
  x: new Float64Array(0),
  y: new Float64Array(0),
  z: null,
  origin: null,
  size: 6,
  color: [31 / 255, 119 / 255, 180 / 255, 1] as RGBA,
  colorValues: null,
  colorscale: null,
  cmin: 0,
  cmax: 1,
  cmid: null,
  reversescale: false,
  nanColor: [0.5, 0.5, 0.5, 1] as RGBA,
  opacity: 1,
});

type Group = 'position' | 'style' | 'fill' | 'value' | 'index';
const GROUPS: readonly Group[] = ['position', 'style', 'fill', 'value', 'index'];
const FIELD_GROUP: Partial<Record<keyof SphereData, Group>> = {
  x: 'position',
  y: 'position',
  z: 'position',
  origin: 'position',
  size: 'style',
  opacity: 'style',
  color: 'fill',
  colorValues: 'value',
};
const ITEM_SIZE: Record<Group, number> = { position: 3, style: 2, fill: 4, value: 1, index: 1 };
const ATTRIBUTE: Record<Group, string> = {
  position: 'aPos',
  style: 'aStyle',
  fill: 'aFill',
  value: 'aValue',
  index: 'aSourceIndex',
};

const QUAD_CORNERS = [-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0];
const QUAD_INDEX = [0, 1, 2, 0, 2, 3];

interface SphereUniforms {
  [name: string]: IUniform;
  uScale: IUniform<Vector3>;
  uOffset: IUniform<Vector3>;
  uResolution: IUniform<Vector2>;
  uPixelRatio: IUniform<number>;
  uWorldSize: IUniform<number>;
  uLightDir: IUniform<Vector3>;
  uLight: IUniform<Vector4>;
  uColorscale: IUniform<Texture | null>;
  uCRange: IUniform<Vector2>;
  uReverse: IUniform<number>;
  uNanColor: IUniform<Vector4>;
}

function toByte(v: number): number {
  return v >= 1 ? 255 : v > 0 ? Math.round(v * 255) : 0;
}

/**
 * Instanced lit sphere impostors (see the module docs): one draw call, `pickCount` = number of
 * spheres, pick ids are data indices.
 */
export class SphereSet implements Primitive<SphereData>, PickablePrimitive {
  readonly object: Mesh<InstancedBufferGeometry, ShaderMaterial>;
  readonly material: ShaderMaterial;
  readonly pickKind: PickElementKind = 'point';

  readonly #ctx: PrimitiveContext;
  readonly #uniforms: SphereUniforms;
  readonly #inputs: SphereData = { ...SPHERE_DEFAULTS };
  readonly #arrays: Partial<Record<Group, Float32Array | Uint8Array | Int32Array>> = {};
  readonly #blend: Blend3D;
  readonly #sorter: DepthSorter | null;
  #geometry: InstancedBufferGeometry;
  #count = 0;
  #capacity = 0;
  #colorscaleMode = false;
  #origin: [number, number, number] = [0, 0, 0];
  #valueOrigin = 0;
  #transform: DataTransform = { ...IDENTITY_TRANSFORM };
  #colorscale: ColorscaleTextureHandle | null = null;
  /** Instance slot → data index while depth-sorted, else null (identity). */
  #order: Uint32Array | null = null;
  #opaque: boolean | undefined;
  #disposed = false;

  constructor(
    ctx: PrimitiveContext,
    data: Partial<SphereData> = {},
    options: SphereSetOptions = {},
  ) {
    this.#ctx = ctx;
    this.#blend = options.blend ?? 'auto';
    this.#uniforms = {
      uScale: { value: new Vector3(1, 1, 1) },
      uOffset: { value: new Vector3() },
      uResolution: { value: new Vector2(1, 1) },
      uPixelRatio: { value: 1 },
      uWorldSize: { value: options.sizing === 'world' ? 1 : 0 },
      uLightDir: { value: new Vector3() },
      uLight: { value: new Vector4() },
      uColorscale: { value: null },
      uCRange: { value: new Vector2(0, 1) },
      uReverse: { value: 0 },
      uNanColor: { value: new Vector4() },
    };
    this.setLighting(options.lighting ?? {});
    this.material = new ShaderMaterial({
      name: 'holochart:spheres',
      glslVersion: GLSL3,
      vertexShader: SPHERE_VERTEX,
      fragmentShader: SPHERE_FRAGMENT,
      uniforms: this.#uniforms,
      depthTest: options.depthTest ?? true,
    });
    this.#sorter = options.depthSort
      ? new DepthSorter(() => this.#resort(), options.sortThrottleMs ?? 100, options.clock)
      : null;
    this.#geometry = this.#createGeometry();
    this.object = new Mesh(this.#geometry, this.material);
    this.object.name = 'holochart:spheres';
    this.object.frustumCulled = false;
    if (options.renderOrder !== undefined) this.object.renderOrder = options.renderOrder;
    this.object.onBeforeRender = (renderer, _scene, camera) => this.#beforeRender(renderer, camera);
    this.update(data);
  }

  /** Number of drawn spheres. */
  get count(): number {
    return this.#count;
  }

  /** Number of pick ids (one per sphere). */
  get pickCount(): number {
    return this.#count;
  }

  /** Current float64 RTC origin. */
  get origin(): readonly [number, number, number] {
    return this.#origin;
  }

  /** Whether the set is drawn opaque (depth-writing, see `blend3d.ts`). */
  get opaque(): boolean {
    return this.#opaque === true;
  }

  /** Data index drawn in instance slot `slot` (differs from `slot` only while depth-sorted). */
  sourceIndex(slot: number): number {
    return this.#order ? (this.#order[slot] ?? -1) : slot;
  }

  /** Change the lighting (omitted fields take the defaults). */
  setLighting(lighting: Partial<SphereLighting>): void {
    const l = { ...DEFAULT_SPHERE_LIGHTING, ...lighting };
    const [dx, dy, dz] = l.direction;
    this.#uniforms.uLightDir.value.set(dx, dy, dz).normalize();
    this.#uniforms.uLight.value.set(l.ambient, l.diffuse, l.specular, Math.max(1, l.shininess));
    this.#ctx.invalidate();
  }

  update(data: Partial<SphereData>): void {
    if (this.#disposed) return;
    const inputs = this.#inputs as unknown as Record<string, unknown>;
    const touched = new Set<Group>();
    for (const key of Object.keys(data) as (keyof SphereData)[]) {
      const value = data[key];
      if (value === undefined) continue;
      inputs[key] = value;
      const group = FIELD_GROUP[key];
      if (group) touched.add(group);
    }
    const positions = touched.has('position');
    const count = positions ? this.#inputCount() : this.#count;
    const mode = this.#inputs.colorValues != null && this.#inputs.colorscale != null;
    let all = false;
    if (count > this.#capacity || count < this.#capacity / 4 || mode !== this.#colorscaleMode) {
      this.#colorscaleMode = mode;
      this.#reallocate(count);
      all = true;
    }
    this.#count = count;
    if (positions) {
      const o = this.#inputs.origin;
      const { x, y, z } = this.#inputs;
      this.#origin = o
        ? [o[0], o[1], o[2]]
        : [rtcAxisOrigin(x, count), rtcAxisOrigin(y, count), rtcAxisOrigin(z, count)];
      this.#applyTransform();
      if (this.#sorter) {
        this.#order = this.#sorter.sort(x, y, z, count);
        all = true;
      }
    }
    if (touched.has('value')) this.#valueOrigin = rtcAxisOrigin(this.#inputs.colorValues, count);
    for (const group of GROUPS) {
      if (all || touched.has(group)) this.#write(group);
    }
    this.#geometry.instanceCount = count;
    this.#updateColorUniforms(data);
    this.#updateBlend();
    this.#ctx.invalidate();
  }

  setTransform(transform: DataTransform): void {
    this.#transform = { ...transform };
    this.#applyTransform();
    this.#ctx.invalidate();
  }

  setViewport(size: ViewportSize): void {
    this.#uniforms.uResolution.value.set(Math.max(1, size.width), Math.max(1, size.height));
    this.#uniforms.uPixelRatio.value = size.pixelRatio > 0 ? size.pixelRatio : 1;
  }

  /**
   * Pick material (E2.13): the same shaders with `PICKING`, writing data indices; shares every
   * uniform except the resolution (the pick window's) and the pick id base.
   */
  createPickMaterial(): PickMaterialHandle {
    const uniforms: SphereUniforms & { uPickBase: IUniform<number> } = {
      ...this.#uniforms,
      uResolution: { value: new Vector2(1, 1) },
      uPickBase: { value: 0 },
    };
    const source = this.material;
    const material = new ShaderMaterial({
      name: 'holochart:spheres:pick',
      glslVersion: GLSL3,
      vertexShader: SPHERE_VERTEX,
      fragmentShader: SPHERE_FRAGMENT,
      uniforms,
      defines: { PICKING: '' },
      blending: NoBlending,
    });
    return {
      material,
      prepare(state: Readonly<PickRenderState>): void {
        uniforms.uPickBase.value = state.base;
        uniforms.uResolution.value.set(
          Math.max(1e-6, state.windowWidth),
          Math.max(1e-6, state.windowHeight),
        );
        const defines = material.defines as Record<string, string>;
        const sourceDefines = source.defines as Record<string, string>;
        for (const name of ['USE_COLORSCALE', 'SOURCE_INDEX']) {
          if (name in sourceDefines === name in defines) continue;
          if (name in sourceDefines) defines[name] = '';
          else delete defines[name];
          material.needsUpdate = true;
        }
        material.depthTest = source.depthTest;
        material.depthWrite = source.depthWrite;
        material.transparent = source.transparent;
      },
      dispose(): void {
        material.dispose();
      },
    };
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#sorter?.cancel();
    this.object.removeFromParent();
    this.#geometry.dispose();
    this.material.dispose();
    this.#colorscale?.release();
    this.#colorscale = null;
  }

  // ---- internals -------------------------------------------------------------------------

  #inputCount(): number {
    const { x, y, z } = this.#inputs;
    return Math.min(x.length, y.length, z ? z.length : Infinity);
  }

  #beforeRender(renderer: ViewportSource, camera: Camera): void {
    syncViewportUniforms(this.#uniforms, renderer);
    this.#sorter?.observe(camera, this.object, this.#transform);
  }

  /** Rewrite every instance in the sorter's current order (throttled, from `#beforeRender`). */
  #resort(): void {
    if (this.#disposed || !this.#sorter) return;
    const { x, y, z } = this.#inputs;
    this.#order = this.#sorter.sort(x, y, z, this.#count);
    for (const group of GROUPS) this.#write(group);
    this.#ctx.invalidate();
  }

  #applyTransform(): void {
    const t = this.#transform;
    const sz = t.scaleZ ?? 1;
    const o = this.#origin;
    this.#uniforms.uScale.value.set(t.scaleX, t.scaleY, sz);
    this.#uniforms.uOffset.value.set(
      t.offsetX + o[0] * t.scaleX,
      t.offsetY + o[1] * t.scaleY,
      (t.offsetZ ?? 0) + o[2] * sz,
    );
  }

  #updateBlend(): void {
    const i = this.#inputs;
    const opaque = isOpaque(
      this.#blend,
      opacitiesOpaque(i.opacity) &&
        (this.#colorscaleMode
          ? colorscaleOpaque(i.colorscale) && i.nanColor[3] >= 1
          : colorsOpaque(i.color)),
    );
    if (opaque !== this.#opaque) applyBlend3D(this.material, opaque);
    this.#opaque = opaque;
  }

  #updateColorUniforms(data: Partial<SphereData>): void {
    const inputs = this.#inputs;
    const u = this.#uniforms;
    if (this.#colorscaleMode) {
      if (!this.#colorscale || data.colorscale !== undefined) {
        const next = acquireColorscaleTexture(this.#ctx.resources, inputs.colorscale!);
        this.#colorscale?.release();
        this.#colorscale = next;
      }
      u.uColorscale.value = this.#colorscale.texture;
    } else if (this.#colorscale) {
      this.#colorscale.release();
      this.#colorscale = null;
      u.uColorscale.value = null;
    }
    const [lo, hi] = resolveColorDomain(inputs.cmin, inputs.cmax, inputs.cmid);
    u.uCRange.value.set(lo - this.#valueOrigin, hi - this.#valueOrigin);
    u.uReverse.value = inputs.reversescale ? 1 : 0;
    const n = inputs.nanColor;
    u.uNanColor.value.set(n[0], n[1], n[2], n[3]);
  }

  #createGeometry(): InstancedBufferGeometry {
    const geometry = new InstancedBufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(QUAD_CORNERS, 3));
    geometry.setIndex(QUAD_INDEX);
    for (const group of GROUPS) {
      const array = this.#arrays[group];
      if (!array) continue;
      const attribute = new InstancedBufferAttribute(
        array,
        ITEM_SIZE[group],
        array instanceof Uint8Array,
      );
      attribute.setUsage(DynamicDrawUsage);
      geometry.setAttribute(ATTRIBUTE[group], attribute);
    }
    geometry.instanceCount = this.#count;
    return geometry;
  }

  /** Allocate exactly `capacity` items for the groups in use and swap in a new geometry. */
  #reallocate(capacity: number): void {
    const cap = Math.max(1, capacity);
    for (const group of GROUPS) {
      const needed =
        group === 'fill'
          ? !this.#colorscaleMode
          : group === 'value'
            ? this.#colorscaleMode
            : group === 'index'
              ? this.#sorter !== null
              : true;
      if (!needed) {
        delete this.#arrays[group];
        continue;
      }
      const length = cap * ITEM_SIZE[group];
      this.#arrays[group] =
        group === 'fill'
          ? new Uint8Array(length)
          : group === 'index'
            ? new Int32Array(length)
            : new Float32Array(length);
    }
    this.#capacity = cap;
    const defines = this.material.defines as Record<string, string>;
    const want = { USE_COLORSCALE: this.#colorscaleMode, SOURCE_INDEX: this.#sorter !== null };
    for (const [name, on] of Object.entries(want)) {
      if (on === name in defines) continue;
      if (on) defines[name] = '';
      else delete defines[name];
      this.material.needsUpdate = true;
    }
    const old = this.#geometry as InstancedBufferGeometry | undefined;
    this.#geometry = this.#createGeometry();
    if (this.object) this.object.geometry = this.#geometry;
    old?.dispose();
  }

  /** Write every item of `group` (in the sorted order, if any) and schedule its upload. */
  #write(group: Group): void {
    const out = this.#arrays[group];
    if (!out) return;
    const n = this.#count;
    const order = this.#order;
    const src = this.#inputs;
    switch (group) {
      case 'position': {
        const { x, y, z } = src;
        const [ox, oy, oz] = this.#origin;
        for (let i = 0; i < n; i++) {
          const j = order ? order[i]! : i;
          const px = x[j]!;
          const py = y[j]!;
          const pz = z ? z[j]! : 0;
          const k = i * 3;
          if (Number.isFinite(px) && Number.isFinite(py) && Number.isFinite(pz)) {
            out[k] = px - ox;
            out[k + 1] = py - oy;
            out[k + 2] = pz - oz;
          } else {
            out[k] = out[k + 1] = out[k + 2] = HIDDEN_POSITION;
          }
        }
        break;
      }
      case 'style':
        for (let i = 0; i < n; i++) {
          const j = order ? order[i]! : i;
          const size = scalarAt(src.size, j, 0);
          const opacity = scalarAt(src.opacity, j, 1);
          out[i * 2] = size > 0 && size < Infinity ? size : 0;
          out[i * 2 + 1] = opacity >= 0 ? Math.min(opacity, 1) : opacity === opacity ? 0 : 1;
        }
        break;
      case 'fill': {
        const rgba = [0, 0, 0, 0];
        for (let i = 0; i < n; i++) {
          colorAt(src.color, order ? order[i]! : i, rgba);
          for (let c = 0; c < 4; c++) out[i * 4 + c] = toByte(rgba[c]!);
        }
        break;
      }
      case 'value': {
        const values = src.colorValues;
        const vo = this.#valueOrigin;
        for (let i = 0; i < n; i++) {
          const j = order ? order[i]! : i;
          const v = values && j < values.length ? values[j]! : NaN;
          out[i] = Number.isFinite(v) ? v - vo : HIDDEN_POSITION;
        }
        break;
      }
      case 'index':
        for (let i = 0; i < n; i++) out[i] = order ? order[i]! : i;
        break;
    }
    const attribute = this.#geometry.getAttribute(ATTRIBUTE[group]) as InstancedBufferAttribute;
    attribute.clearUpdateRanges();
    attribute.addUpdateRange(0, n * ITEM_SIZE[group]);
    attribute.needsUpdate = true;
  }
}

/** Create a {@link SphereSet}. Add `spheres.object` to a 3D scene (or `viewport.add(spheres)`). */
export function createSpheres(
  ctx: PrimitiveContext,
  data: Partial<SphereData> = {},
  options: SphereSetOptions = {},
): SphereSet {
  return new SphereSet(ctx, data, options);
}
