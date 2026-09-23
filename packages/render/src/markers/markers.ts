/**
 * Instanced SDF marker primitive (plan E2.4, E16.3, E16.4).
 *
 * One draw call per marker set: a unit quad instanced `count` times. Per-instance attributes are
 * split by edit type so a restyle uploads only what changed:
 *
 * | attribute | type            | fields                                    |
 * |-----------|-----------------|-------------------------------------------|
 * | `aPos`    | float32 × 3     | x, y, z (RTC-encoded, see `precision.ts`) |
 * | `aSize`   | float32         | size                                      |
 * | `aFill`   | u8 × 4 (norm.)  | color            (explicit-color mode)    |
 * | `aValue`  | float32         | colorValues      (colorscale mode)        |
 * | `aLine`   | u8 × 4 (norm.)  | lineColor                                 |
 * | `aStyle`  | float32 × 4     | lineWidth, symbol, opacity, angle         |
 *
 * Updates write into CPU arrays and register `updateRanges` covering only the touched items; the
 * arrays are kept so three.js can re-upload them after a context restore. Sizes are CSS px and
 * markers are screen-space sized, so the same primitive works in 2D pixel space and in 3D.
 */
import {
  DynamicDrawUsage,
  Float32BufferAttribute,
  GLSL3,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  NoBlending,
  NormalBlending,
  ShaderMaterial,
  Vector2,
  Vector3,
  Vector4,
  type DataTexture,
  type IUniform,
  type Texture,
} from 'three';
import {
  acquireColorscaleTexture,
  resolveColorDomain,
  type Colorscale,
  type ColorscaleTextureHandle,
} from '../colorscale/lut.ts';
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
import type {
  PickablePrimitive,
  PickElementKind,
  PickMaterialHandle,
  PickRenderState,
} from '../picking/types.ts';
import { syncViewportUniforms } from '../primitives/common.ts';
import { MARKER_FRAGMENT, MARKER_VERTEX } from './markers.glsl.ts';
import { HIDDEN_POSITION, rtcAxisOrigin, rtcEncodePositions, rtcOffset } from '../precision.ts';
import { createSymbolTexture, resolveSymbol, SYMBOL_TEXTURE_KEY } from './symbols.ts';

/** Symbol per marker set or per item: names (`'diamond-open'`) or Plotly numeric codes. */
export type SymbolInput = number | string | ArrayLike<number | string>;

/** Data accepted by {@link MarkerSet.update}. Every field is optional in updates. */
export interface MarkerData {
  /** Data-space x (float64 recommended). */
  x: ArrayLike<number>;
  y: ArrayLike<number>;
  /** Optional z for 3D. */
  z: ArrayLike<number> | null;
  /** Explicit RTC origin; default: center of the finite data bounds, recomputed when x/y/z change. */
  origin: readonly [number, number, number] | null;
  /** Diameter in CSS px. Default 6. */
  size: ScalarInput;
  /** Fill color (sRGB 0–1 RGBA). Ignored while `colorValues` + `colorscale` are set. */
  color: ColorInput;
  /** Numeric values mapped through `colorscale` (non-finite → `nanColor`). */
  colorValues: ArrayLike<number> | null;
  colorscale: Colorscale | null;
  cmin: number;
  cmax: number;
  /** Plotly semantics: widens cmin/cmax to be symmetric around cmid. */
  cmid: number | null;
  reversescale: boolean;
  nanColor: RGBA;
  lineColor: ColorInput;
  /** Border width in CSS px. Default 0. */
  lineWidth: ScalarInput;
  symbol: SymbolInput;
  /** Multiplies fill and line alpha. Default 1. */
  opacity: ScalarInput;
  /** Rotation in degrees, clockwise on screen (Plotly `marker.angle`). Default 0. */
  angle: ScalarInput;
}

/** Fields accepted by {@link MarkerSet.patch} (arrays indexed from the patch start). */
export type MarkerPatch = Partial<
  Pick<
    MarkerData,
    | 'x'
    | 'y'
    | 'z'
    | 'size'
    | 'color'
    | 'colorValues'
    | 'lineColor'
    | 'lineWidth'
    | 'symbol'
    | 'opacity'
    | 'angle'
  >
>;

export interface MarkerSetOptions {
  /** Depth test against other 3D content. Default true. */
  depthTest?: boolean;
  /** Default false (anti-aliased edges are translucent). */
  depthWrite?: boolean;
  /** three.js render order (trace order / zorder, E2.14). */
  renderOrder?: number;
}

/** Plotly-like defaults (first colorway color, `#444` lines). */
export const MARKER_DEFAULTS: Readonly<MarkerData> = Object.freeze({
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
  lineColor: [68 / 255, 68 / 255, 68 / 255, 1] as RGBA,
  lineWidth: 0,
  symbol: 0,
  opacity: 1,
  angle: 0,
});

type Group = 'position' | 'size' | 'fill' | 'value' | 'line' | 'style';
const GROUPS: readonly Group[] = ['position', 'size', 'fill', 'value', 'line', 'style'];
const FIELD_GROUP: Partial<Record<keyof MarkerData, Group>> = {
  x: 'position',
  y: 'position',
  z: 'position',
  origin: 'position',
  size: 'size',
  color: 'fill',
  colorValues: 'value',
  lineColor: 'line',
  lineWidth: 'style',
  symbol: 'style',
  opacity: 'style',
  angle: 'style',
};
const ITEM_SIZE: Record<Group, number> = {
  position: 3,
  size: 1,
  fill: 4,
  value: 1,
  line: 4,
  style: 4,
};
const ATTRIBUTE: Record<Group, string> = {
  position: 'aPos',
  size: 'aSize',
  fill: 'aFill',
  value: 'aValue',
  line: 'aLine',
  style: 'aStyle',
};

interface MarkerUniforms {
  [name: string]: IUniform;
  uScale: IUniform<Vector3>;
  uOffset: IUniform<Vector3>;
  uResolution: IUniform<Vector2>;
  uPixelRatio: IUniform<number>;
  uSymbols: IUniform<Texture | null>;
  uColorscale: IUniform<Texture | null>;
  uCRange: IUniform<Vector2>;
  uReverse: IUniform<number>;
  uNanColor: IUniform<Vector4>;
}

const QUAD_CORNERS = [-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0];
const QUAD_INDEX = [0, 1, 2, 0, 2, 3];
const GROWTH = 1.5;

function scalarAtIndex(
  input: ScalarInput | ArrayLike<number>,
  j: number,
  fallback: number,
): number {
  if (typeof input === 'number') return input;
  const n = input.length;
  if (n === 0) return fallback;
  return input[j < n ? j : n - 1]!;
}

function toByte(v: number): number {
  return v >= 1 ? 255 : v > 0 ? Math.round(v * 255) : 0;
}

/** Write colors for items `[start, end)` (source index `i - srcOffset`) as normalized u8 RGBA. */
function writeColors(
  out: Uint8Array,
  input: ColorInput,
  start: number,
  end: number,
  srcOffset: number,
): void {
  if (!(input instanceof Float32Array)) {
    const r = toByte(input[0]);
    const g = toByte(input[1]);
    const b = toByte(input[2]);
    const a = toByte(input[3]);
    for (let i = start; i < end; i++) {
      const k = i * 4;
      out[k] = r;
      out[k + 1] = g;
      out[k + 2] = b;
      out[k + 3] = a;
    }
    return;
  }
  const n = input.length >> 2;
  for (let i = start; i < end; i++) {
    const k = i * 4;
    if (n === 0) {
      out[k] = out[k + 1] = out[k + 2] = out[k + 3] = 0;
      continue;
    }
    const j = Math.min(i - srcOffset, n - 1) * 4;
    out[k] = toByte(input[j]!);
    out[k + 1] = toByte(input[j + 1]!);
    out[k + 2] = toByte(input[j + 2]!);
    out[k + 3] = toByte(input[j + 3]!);
  }
}

/** Symbol code of source item `j`. */
function symbolAt(input: SymbolInput, j: number): number {
  if (typeof input === 'number' || typeof input === 'string') return resolveSymbol(input);
  const n = input.length;
  if (n === 0) return 0;
  const v = input[j < n ? j : n - 1]!;
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 400 ? v : resolveSymbol(v);
}

export class MarkerSet implements Primitive<MarkerData>, PickablePrimitive {
  readonly object: Mesh<InstancedBufferGeometry, ShaderMaterial>;
  readonly material: ShaderMaterial;
  /** Pick ids count data points (one per instance). */
  readonly pickKind: PickElementKind = 'point';

  readonly #context: PrimitiveContext;
  readonly #uniforms: MarkerUniforms;
  readonly #inputs: MarkerData = { ...MARKER_DEFAULTS };
  readonly #arrays: Partial<Record<Group, Float32Array | Uint8Array>> = {};
  #geometry: InstancedBufferGeometry;
  #count = 0;
  #capacity = 0;
  #colorscaleMode = false;
  #origin: [number, number, number] = [0, 0, 0];
  #valueOrigin = 0;
  #transform: DataTransform = { ...IDENTITY_TRANSFORM };
  #colorscale: ColorscaleTextureHandle | null = null;
  #positionVersion = 0;
  #disposed = false;

  constructor(
    context: PrimitiveContext,
    data: Partial<MarkerData> = {},
    options: MarkerSetOptions = {},
  ) {
    this.#context = context;
    const symbols = context.resources.acquire<DataTexture>(SYMBOL_TEXTURE_KEY, createSymbolTexture);
    this.#uniforms = {
      uScale: { value: new Vector3(1, 1, 1) },
      uOffset: { value: new Vector3() },
      uResolution: { value: new Vector2(1, 1) },
      uPixelRatio: { value: 1 },
      uSymbols: { value: symbols },
      uColorscale: { value: null },
      uCRange: { value: new Vector2(0, 1) },
      uReverse: { value: 0 },
      uNanColor: { value: new Vector4() },
    };
    this.material = new ShaderMaterial({
      name: 'holochart:markers',
      glslVersion: GLSL3,
      vertexShader: MARKER_VERTEX,
      fragmentShader: MARKER_FRAGMENT,
      uniforms: this.#uniforms,
      transparent: true,
      blending: NormalBlending,
      depthTest: options.depthTest ?? true,
      depthWrite: options.depthWrite ?? false,
    });
    this.#geometry = this.#createGeometry();
    this.object = new Mesh(this.#geometry, this.material);
    this.object.name = 'holochart:markers';
    // Keep screen-space sizing right even if setViewport is never called (see syncViewportUniforms).
    this.object.onBeforeRender = (renderer) => {
      syncViewportUniforms(this.#uniforms, renderer);
    };
    // The quad's bounds say nothing about where instances are.
    this.object.frustumCulled = false;
    if (options.renderOrder !== undefined) this.object.renderOrder = options.renderOrder;
    this.update(data);
  }

  /** Number of drawn markers. */
  get count(): number {
    return this.#count;
  }

  /** Allocated instance capacity. */
  get capacity(): number {
    return this.#capacity;
  }

  /** Current float64 RTC origin. */
  get origin(): readonly [number, number, number] {
    return this.#origin;
  }

  /** Whether fill colors come from `colorValues` through the colorscale LUT. */
  get colorscaleMode(): boolean {
    return this.#colorscaleMode;
  }

  get geometry(): InstancedBufferGeometry {
    return this.#geometry;
  }

  /** Number of pick ids (= drawn instances) for GPU picking. */
  get pickCount(): number {
    return this.#count;
  }

  /**
   * Incremented whenever drawn positions or the count change (update, patch, reallocation), so
   * CPU spatial indexes over {@link positionArray} know when to rebuild. Transform changes do not
   * bump it: they are applied at query time through {@link worldScale} / {@link worldOffset}.
   */
  get positionVersion(): number {
    return this.#positionVersion;
  }

  /**
   * The RTC-encoded float32 positions actually drawn (x, y, z per item, valid for `[0, count)`;
   * gaps hold `HIDDEN_POSITION`), or null before anything was allocated. Read-only: owned by the
   * marker set, replaced on reallocation.
   */
  get positionArray(): Float32Array | null {
    return (this.#arrays.position as Float32Array | undefined) ?? null;
  }

  /** Per-axis scale from {@link positionArray} to world space: `world = pos * scale + offset`. */
  get worldScale(): Readonly<Vector3> {
    return this.#uniforms.uScale.value;
  }

  /** Per-axis offset from {@link positionArray} to world space (float64 RTC offset). */
  get worldOffset(): Readonly<Vector3> {
    return this.#uniforms.uOffset.value;
  }

  /**
   * Create the GPU-picking variant of this marker set's material (E2.13): the same shaders with
   * `PICKING` defined, sharing every uniform except the resolution (the pick window's) and the pick
   * id base. The visible material is untouched. The caller owns and disposes the handle.
   */
  createPickMaterial(): PickMaterialHandle {
    const uniforms: MarkerUniforms & { uPickBase: IUniform<number> } = {
      ...this.#uniforms,
      uResolution: { value: new Vector2(1, 1) },
      uPickBase: { value: 0 },
    };
    const source = this.material;
    const material = new ShaderMaterial({
      name: 'holochart:markers:pick',
      glslVersion: GLSL3,
      vertexShader: MARKER_VERTEX,
      fragmentShader: MARKER_FRAGMENT,
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
        // Mirror the visible pass: color-mode define (which attributes exist) and depth state /
        // transparent bucket (so occlusion and draw order match).
        const defines = material.defines as Record<string, string>;
        const colorscale = 'USE_COLORSCALE' in (source.defines as Record<string, string>);
        if (colorscale !== 'USE_COLORSCALE' in defines) {
          if (colorscale) defines.USE_COLORSCALE = '';
          else delete defines.USE_COLORSCALE;
          material.needsUpdate = true;
        }
        material.depthTest = source.depthTest;
        material.depthWrite = source.depthWrite;
        material.transparent = source.transparent;
        material.side = source.side;
      },
      dispose(): void {
        material.dispose();
      },
    };
  }

  update(data: Partial<MarkerData>): void {
    this.#assertAlive();
    const inputs = this.#inputs as unknown as Record<string, unknown>;
    const touched = new Set<Group>();
    for (const key of Object.keys(data) as (keyof MarkerData)[]) {
      const value = data[key];
      if (value === undefined) continue;
      inputs[key] = value;
      const group = FIELD_GROUP[key];
      if (group) touched.add(group);
    }

    const prevCount = this.#count;
    const positionsChanged = touched.has('position');
    const count = positionsChanged ? this.#inputCount() : prevCount;
    const mode = this.#inputs.colorValues != null && this.#inputs.colorscale != null;
    const modeChanged = mode !== this.#colorscaleMode;
    this.#colorscaleMode = mode;

    let rebuild = false;
    if (count > this.#capacity || modeChanged) {
      this.#reallocate(Math.max(count, this.#capacity), prevCount);
      rebuild = true;
    }
    this.#count = count;

    if (positionsChanged) {
      const o = this.#inputs.origin;
      this.#origin = o
        ? [o[0], o[1], o[2]]
        : [
            rtcAxisOrigin(this.#inputs.x, count),
            rtcAxisOrigin(this.#inputs.y, count),
            rtcAxisOrigin(this.#inputs.z, count),
          ];
      this.#applyTransform();
    }
    if (touched.has('value')) {
      this.#valueOrigin = rtcAxisOrigin(this.#inputs.colorValues, count);
    }

    // Growing, or a new geometry, needs every attribute written for the new items.
    const writeAll = rebuild || count > prevCount;
    for (const group of GROUPS) {
      if (!this.#arrays[group]) continue;
      if (!writeAll && !touched.has(group)) continue;
      this.#write(group, 0, count, 0);
      if (!rebuild) this.#markRange(group, 0, count);
    }

    if (positionsChanged || rebuild || count !== prevCount) this.#positionVersion++;
    this.#geometry.instanceCount = count;
    this.#updateColorUniforms(data);
    this.#context.invalidate();
  }

  /**
   * Patch items `[start, start + count)` in place, uploading only that range. Arrays in `data` are
   * indexed from `start`. Extends the set when the range passes the current count (streaming
   * appends); `start` must not exceed the current count. `x` and `y` (and `z` for 3D) must be given
   * together. Positions are encoded against the current origin. Appended items take fields that
   * are not in the patch from the last {@link update} inputs.
   */
  patch(start: number, count: number, data: MarkerPatch): void {
    this.#assertAlive();
    if (!Number.isInteger(start) || start < 0 || start > this.#count) {
      throw new RangeError(`patch start ${start} is outside [0, ${this.#count}]`);
    }
    if (count <= 0) return;
    const end = start + count;
    const prevCount = this.#count;
    let rebuild = false;
    if (end > this.#capacity) {
      this.#reallocate(Math.max(end, Math.ceil(this.#capacity * GROWTH)), prevCount);
      rebuild = true;
    }
    this.#count = Math.max(prevCount, end);

    const given: Partial<Record<Group, boolean>> = {};
    for (const key of Object.keys(data) as (keyof MarkerPatch)[]) {
      const group = FIELD_GROUP[key];
      if (group && data[key] !== undefined) given[group] = true;
    }

    for (const group of GROUPS) {
      if (!this.#arrays[group]) continue;
      if (given[group]) {
        this.#write(group, start, end, start, data);
        if (!rebuild) this.#markRange(group, start, end);
      } else if (end > prevCount) {
        const from = Math.max(start, prevCount);
        this.#write(group, from, end, 0);
        if (!rebuild) this.#markRange(group, from, end);
      }
    }
    if (given.position || rebuild || this.#count !== prevCount) this.#positionVersion++;
    this.#geometry.instanceCount = this.#count;
    this.#context.invalidate();
  }

  setTransform(transform: DataTransform): void {
    this.#transform = { ...transform };
    this.#applyTransform();
    this.#context.invalidate();
  }

  setViewport(size: ViewportSize): void {
    this.#uniforms.uResolution.value.set(Math.max(1, size.width), Math.max(1, size.height));
    this.#uniforms.uPixelRatio.value = size.pixelRatio > 0 ? size.pixelRatio : 1;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.object.removeFromParent();
    this.#geometry.dispose();
    this.material.dispose();
    this.#colorscale?.release();
    this.#colorscale = null;
    this.#context.resources.release(SYMBOL_TEXTURE_KEY);
  }

  // ---- internals -------------------------------------------------------------------------

  #assertAlive(): void {
    if (this.#disposed) throw new Error('MarkerSet has been disposed');
  }

  #inputCount(): number {
    const { x, y, z } = this.#inputs;
    return Math.min(x.length, y.length, z ? z.length : Infinity);
  }

  #applyTransform(): void {
    const t = this.#transform;
    const sz = t.scaleZ ?? 1;
    const oz = t.offsetZ ?? 0;
    const o = this.#origin;
    this.#uniforms.uScale.value.set(t.scaleX, t.scaleY, sz);
    this.#uniforms.uOffset.value.set(
      rtcOffset(t.offsetX, o[0], t.scaleX),
      rtcOffset(t.offsetY, o[1], t.scaleY),
      rtcOffset(oz, o[2], sz),
    );
  }

  #updateColorUniforms(data: Partial<MarkerData>): void {
    const inputs = this.#inputs;
    const u = this.#uniforms;
    if (this.#colorscaleMode) {
      const scale = inputs.colorscale!;
      if (!this.#colorscale || data.colorscale !== undefined) {
        const next = acquireColorscaleTexture(this.#context.resources, scale);
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

  /**
   * Allocate arrays for `capacity` items (keeping the first `keep` items), switch the material
   * variant if the color mode changed, and swap in a new geometry. The old geometry is disposed so
   * its GPU buffers are freed (three.js only frees buffers of attributes still attached).
   */
  #reallocate(capacity: number, keep: number): void {
    const cap = Math.max(1, capacity);
    for (const group of GROUPS) {
      const needed =
        group === 'fill' ? !this.#colorscaleMode : group === 'value' ? this.#colorscaleMode : true;
      const old = this.#arrays[group];
      if (!needed) {
        delete this.#arrays[group];
        continue;
      }
      const length = cap * ITEM_SIZE[group];
      if (old && old.length === length) continue;
      const next =
        group === 'fill' || group === 'line' ? new Uint8Array(length) : new Float32Array(length);
      if (old) next.set(old.subarray(0, Math.min(old.length, keep * ITEM_SIZE[group], length)));
      this.#arrays[group] = next;
    }
    this.#capacity = cap;

    const defines = this.material.defines as Record<string, string>;
    const hasDefine = 'USE_COLORSCALE' in defines;
    if (hasDefine !== this.#colorscaleMode) {
      if (this.#colorscaleMode) defines.USE_COLORSCALE = '';
      else delete defines.USE_COLORSCALE;
      this.material.needsUpdate = true;
    }

    const old = this.#geometry as InstancedBufferGeometry | undefined;
    this.#geometry = this.#createGeometry();
    if (this.object) this.object.geometry = this.#geometry;
    old?.dispose();
  }

  #markRange(group: Group, start: number, end: number): void {
    const attribute = this.#geometry.getAttribute(ATTRIBUTE[group]) as
      InstancedBufferAttribute | undefined;
    if (!attribute || end <= start) return;
    const size = ITEM_SIZE[group];
    attribute.addUpdateRange(start * size, (end - start) * size);
    attribute.needsUpdate = true;
  }

  /**
   * Write `group` for items `[start, end)`. Sources come from `patch` when given (indexed at
   * `i - srcOffset`), otherwise from the stored inputs.
   */
  #write(group: Group, start: number, end: number, srcOffset: number, patch?: MarkerPatch): void {
    const inputs = this.#inputs;
    const src = { ...inputs, ...stripUndefined(patch) } as MarkerData;
    switch (group) {
      case 'position': {
        const out = this.#arrays.position as Float32Array;
        rtcEncodePositions(out, start, end, srcOffset, this.#origin, src.x, src.y, src.z);
        return;
      }
      case 'size': {
        const out = this.#arrays.size as Float32Array;
        for (let i = start; i < end; i++) {
          const v = scalarAtIndex(src.size, i - srcOffset, 0);
          out[i] = v > 0 && v < Infinity ? v : 0;
        }
        return;
      }
      case 'fill':
        writeColors(this.#arrays.fill as Uint8Array, src.color, start, end, srcOffset);
        return;
      case 'line':
        writeColors(this.#arrays.line as Uint8Array, src.lineColor, start, end, srcOffset);
        return;
      case 'value': {
        const out = this.#arrays.value as Float32Array;
        const values = src.colorValues;
        const vo = this.#valueOrigin;
        for (let i = start; i < end; i++) {
          const j = i - srcOffset;
          const v = values && j < values.length ? values[j]! : NaN;
          out[i] = Number.isFinite(v) ? v - vo : HIDDEN_POSITION;
        }
        return;
      }
      case 'style': {
        const out = this.#arrays.style as Float32Array;
        const constantSymbol =
          typeof src.symbol === 'number' || typeof src.symbol === 'string'
            ? resolveSymbol(src.symbol)
            : -1;
        for (let i = start; i < end; i++) {
          const j = i - srcOffset;
          const k = i * 4;
          const lw = scalarAtIndex(src.lineWidth, j, 0);
          const op = scalarAtIndex(src.opacity, j, 1);
          const angle = scalarAtIndex(src.angle, j, 0);
          out[k] = lw > 0 && lw < Infinity ? lw : 0;
          out[k + 1] = constantSymbol >= 0 ? constantSymbol : symbolAt(src.symbol, j);
          out[k + 2] = op >= 0 ? Math.min(op, 1) : op === op ? 0 : 1;
          out[k + 3] = Number.isFinite(angle) ? angle : 0;
        }
        return;
      }
    }
  }
}

function stripUndefined<T extends object>(value: T | undefined): Partial<T> {
  if (!value) return {};
  const out: Partial<T> = {};
  for (const key of Object.keys(value) as (keyof T)[]) {
    if (value[key] !== undefined) out[key] = value[key];
  }
  return out;
}

/** Create a marker set (plan E2.4). Add `markers.object` to a viewport via `viewport.add(markers)`. */
export function createMarkers(
  context: PrimitiveContext,
  data: Partial<MarkerData> = {},
  options: MarkerSetOptions = {},
): MarkerSet {
  return new MarkerSet(context, data, options);
}
