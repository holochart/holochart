/**
 * 3D sprite markers (plan E14.2: `scatter3d` `marker.render: 'sprite'`, the default), in the lazily
 * loaded 3D chunk (`lines-markers-3d.ts`).
 *
 * The 2D {@link MarkerSet} already draws screen-facing, px-sized SDF symbols at 3D positions in one
 * instanced draw call, with GPU picking (it projects each center and expands the quad in clip
 * space). Plotly's scatter3d symbols (`circle`, `circle-open`, `cross`, `diamond`, `diamond-open`,
 * `square`, `square-open`, `x`) are all built-in symbols; custom symbols and images work too.
 * `Markers3D` wraps a marker set with what a 3D scene needs on top:
 *
 * - **Blending** (`blend3d.ts`): opaque markers write depth with alpha to coverage, so they occlude
 *   each other, lines, spheres and meshes correctly in any draw order; translucent markers blend
 *   without writing depth.
 * - **Depth sorting** (`depthSort`, for translucent markers): the items are re-ordered back to
 *   front whenever the view changes (throttled, `depth-sort.ts`), by re-writing the marker set's
 *   inputs in view order. Pick ids still report data indices: the pick shader reads each
 *   instance's data index from an `aSourceIndex` attribute instead of `gl_InstanceID`.
 *
 * All {@link MarkerData} fields work as with `MarkerSet` (`update` only; the streaming `patch` is
 * not offered in 3D).
 */
import {
  DynamicDrawUsage,
  InstancedBufferAttribute,
  type Camera,
  type Mesh,
  type WebGLProgramParametersWithUniforms,
} from 'three';
import { MarkerSet, type MarkerData } from '../markers/markers.ts';
import type {
  PickablePrimitive,
  PickElementKind,
  PickMaterialHandle,
  PickRenderState,
} from '../picking/types.ts';
import {
  IDENTITY_TRANSFORM,
  type DataTransform,
  type Primitive,
  type PrimitiveContext,
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
import { DepthSorter } from './depth-sort.ts';
import type { ThrottleClock } from './line-buffers.ts';

/** Construction options of {@link Markers3D}. */
export interface Markers3DOptions {
  /** Default `'auto'` (opaque when every color and opacity is 1, see `blend3d.ts`). */
  blend?: Blend3D;
  /** Sort translucent markers back to front when the view changes. Default false. */
  depthSort?: boolean;
  /** Min interval between re-sorts while the camera moves. Default 100 ms. */
  sortThrottleMs?: number;
  /** Depth test against the scene. Default true. */
  depthTest?: boolean;
  /** three.js render order (trace order). */
  renderOrder?: number;
  /** See `MarkerSetOptions.specialize`. Default true. */
  specialize?: boolean;
  /** Clock override (tests). */
  clock?: ThrottleClock;
}

/** Per-item fields that follow the depth order. */
const PER_ITEM = [
  'x',
  'y',
  'z',
  'size',
  'color',
  'colorValues',
  'lineColor',
  'lineWidth',
  'symbol',
  'opacity',
  'angle',
  'image',
] as const satisfies readonly (keyof MarkerData)[];
type PerItemKey = (typeof PER_ITEM)[number];
/** Fields whose per-item value is 4 floats (colors). */
const RGBA_FIELDS = new Set<PerItemKey>(['color', 'lineColor']);
/** Fields kept in float64 (positions, color values). */
const F64_FIELDS = new Set<PerItemKey>(['x', 'y', 'z', 'colorValues']);

const PICK_ID_LINE = 'vPickId = uPickBase + uint(gl_InstanceID);';
const STYLE_DECL = 'in vec4 aStyle;';

/** Pick vertex shader reading data indices from `aSourceIndex` under `SOURCE_INDEX`. */
export function sourceIndexPickShader(vertexShader: string): string {
  return vertexShader
    .replace(STYLE_DECL, `${STYLE_DECL}\n#ifdef SOURCE_INDEX\nin int aSourceIndex;\n#endif\n`)
    .replace(
      PICK_ID_LINE,
      `\n#ifdef SOURCE_INDEX\n  vPickId = uPickBase + uint(aSourceIndex);\n#else\n  ${PICK_ID_LINE}\n#endif\n`,
    );
}

type Permuted = Float64Array | Float32Array | (number | string | null | undefined)[];

/** 3D sprite markers: a {@link MarkerSet} with 3D blending and optional depth sorting. */
export class Markers3D implements Primitive<MarkerData>, PickablePrimitive {
  /** The underlying marker set (its object is {@link object}). */
  readonly markers: MarkerSet;
  readonly object: Mesh;
  readonly pickKind: PickElementKind = 'point';

  readonly #blend: Blend3D;
  readonly #sorter: DepthSorter | null;
  /** Everything received so far (the marker set holds the permuted copy while sorted). */
  readonly #inputs: Partial<MarkerData> = {};
  readonly #permuted = new Map<PerItemKey, Permuted>();
  #transform: DataTransform = { ...IDENTITY_TRANSFORM };
  #order: Uint32Array | null = null;
  #opaque: boolean | undefined;
  #disposed = false;

  constructor(
    ctx: PrimitiveContext,
    data: Partial<MarkerData> = {},
    options: Markers3DOptions = {},
  ) {
    this.#blend = options.blend ?? 'auto';
    this.markers = new MarkerSet(
      ctx,
      {},
      {
        depthTest: options.depthTest ?? true,
        specialize: options.specialize ?? true,
        ...(options.renderOrder !== undefined ? { renderOrder: options.renderOrder } : {}),
      },
    );
    this.object = this.markers.object;
    this.#sorter = options.depthSort
      ? new DepthSorter(() => this.#resort(), options.sortThrottleMs ?? 100, options.clock)
      : null;
    if (this.#sorter) {
      const sorter = this.#sorter;
      const sync = this.object.onBeforeRender;
      this.object.onBeforeRender = (renderer, scene, camera, geometry, material, group) => {
        sync.call(this.object, renderer, scene, camera, geometry, material, group);
        sorter.observe(camera as Camera, this.object, this.#transform);
      };
    }
    this.update(data);
  }

  /** Number of drawn markers. */
  get count(): number {
    return this.markers.count;
  }

  /** Number of pick ids (one per marker; ids are data indices). */
  get pickCount(): number {
    return this.markers.pickCount;
  }

  /** Resolves once custom symbols and images are ready (see `MarkerSet.ready`). */
  get ready(): Promise<void> {
    return this.markers.ready;
  }

  /** Whether the markers are drawn opaque (depth-writing, see `blend3d.ts`). */
  get opaque(): boolean {
    return this.#opaque === true;
  }

  /** Data index drawn in instance slot `slot` (differs from `slot` only while depth-sorted). */
  sourceIndex(slot: number): number {
    return this.#order ? (this.#order[slot] ?? -1) : slot;
  }

  update(data: Partial<MarkerData>): void {
    if (this.#disposed) return;
    const inputs = this.#inputs as Record<string, unknown>;
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) inputs[key] = value;
    }
    if (!this.#sorter) {
      this.markers.update(data);
    } else if (data.x !== undefined || data.y !== undefined || data.z !== undefined) {
      this.#resort();
    } else {
      const patch: Record<string, unknown> = { ...data };
      for (const key of PER_ITEM) {
        if (data[key] !== undefined) patch[key] = this.#permute(key);
      }
      this.markers.update(patch as Partial<MarkerData>);
      this.#syncSourceIndex();
    }
    this.#updateBlend();
  }

  setTransform(transform: DataTransform): void {
    this.#transform = { ...transform };
    this.markers.setTransform(transform);
  }

  setViewport(size: ViewportSize): void {
    this.markers.setViewport(size);
  }

  /**
   * The marker set's pick material (E2.13); while depth-sorted it writes each instance's data
   * index (`aSourceIndex`) instead of its instance index.
   */
  createPickMaterial(): PickMaterialHandle {
    const inner = this.markers.createPickMaterial();
    const material = inner.material;
    material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
      shader.vertexShader = sourceIndexPickShader(shader.vertexShader);
    };
    const sorted = this.#sorter !== null;
    return {
      material,
      prepare(state: Readonly<PickRenderState>): void {
        inner.prepare(state);
        const defines = material.defines as Record<string, string>;
        if (sorted !== 'SOURCE_INDEX' in defines) {
          if (sorted) defines['SOURCE_INDEX'] = '';
          else delete defines['SOURCE_INDEX'];
          material.needsUpdate = true;
        }
      },
      dispose(): void {
        inner.dispose();
      },
    };
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#sorter?.cancel();
    this.markers.dispose();
    this.#permuted.clear();
  }

  // ---- internals -------------------------------------------------------------------------

  #count(): number {
    const { x, y, z } = this.#inputs;
    if (!x || !y) return 0;
    return Math.min(x.length, y.length, z ? z.length : Infinity);
  }

  /** Re-order every per-item field for the current view and hand it to the marker set. */
  #resort(): void {
    if (this.#disposed || !this.#sorter) return;
    const { x, y, z } = this.#inputs;
    this.#order = this.#sorter.sort(x ?? [], y ?? [], z ?? null, this.#count());
    const patch: Record<string, unknown> = { ...this.#inputs };
    for (const key of PER_ITEM) {
      if (this.#inputs[key] !== undefined) patch[key] = this.#permute(key);
    }
    this.markers.update(patch as Partial<MarkerData>);
    this.#syncSourceIndex();
  }

  /** The current input of `key` in the current order (scalars and single values unchanged). */
  #permute(key: PerItemKey): unknown {
    const value = this.#inputs[key] as unknown;
    const order = this.#order;
    if (!order || value === null || typeof value !== 'object') return value;
    const n = order.length;
    if (RGBA_FIELDS.has(key)) {
      if (!(value instanceof Float32Array)) return value; // one color for all
      const out = this.#scratch(key, n * 4, Float32Array) as Float32Array;
      const last = (value.length >> 2) - 1;
      for (let i = 0; i < n; i++) {
        const j = Math.min(order[i]!, last) * 4;
        for (let c = 0; c < 4; c++) out[i * 4 + c] = j >= 0 ? value[j + c]! : 0;
      }
      return out;
    }
    const src = value as ArrayLike<number | string | null | undefined>;
    if (typeof src[0] === 'string' || key === 'image' || (key === 'symbol' && !isTyped(src))) {
      // Symbol names and image URLs: past the end, symbols repeat the last, images are absent.
      const out = this.#scratch(key, n, Array) as (number | string | null | undefined)[];
      const last = src.length - 1;
      for (let i = 0; i < n; i++) {
        const j = order[i]!;
        out[i] = key === 'image' ? (j <= last ? src[j] : undefined) : src[Math.min(j, last)];
      }
      return out;
    }
    const nums = src as ArrayLike<number>;
    const out = this.#scratch(key, n, F64_FIELDS.has(key) ? Float64Array : Float32Array) as
      Float64Array | Float32Array;
    const last = nums.length - 1;
    const pad = F64_FIELDS.has(key);
    for (let i = 0; i < n; i++) {
      const j = order[i]!;
      out[i] = j <= last ? nums[j]! : pad ? NaN : last >= 0 ? nums[last]! : 0;
    }
    return out;
  }

  #scratch(
    key: PerItemKey,
    length: number,
    kind: typeof Float64Array | typeof Float32Array | typeof Array,
  ): Permuted {
    const cached = this.#permuted.get(key);
    if (cached && cached.length === length && cached.constructor === kind) return cached;
    const next = new kind(length) as Permuted;
    this.#permuted.set(key, next);
    return next;
  }

  /** Keep the `aSourceIndex` attribute of the marker set's (possibly new) geometry current. */
  #syncSourceIndex(): void {
    const order = this.#order;
    if (!order) return;
    const geometry = this.markers.geometry;
    let attribute = geometry.getAttribute('aSourceIndex') as InstancedBufferAttribute | undefined;
    if (!attribute || attribute.array.length < this.markers.capacity) {
      attribute = new InstancedBufferAttribute(new Int32Array(this.markers.capacity), 1);
      attribute.setUsage(DynamicDrawUsage);
      geometry.setAttribute('aSourceIndex', attribute);
    }
    (attribute.array as Int32Array).set(order.subarray(0, this.markers.capacity));
    attribute.clearUpdateRanges();
    attribute.addUpdateRange(0, order.length);
    attribute.needsUpdate = true;
  }

  #updateBlend(): void {
    const i = this.#inputs;
    const colorscale = i.colorValues != null && i.colorscale != null;
    const lineOpaque =
      i.lineWidth === undefined ||
      (typeof i.lineWidth === 'number' && i.lineWidth <= 0) ||
      colorsOpaque(i.lineColor);
    const opaque = isOpaque(
      this.#blend,
      opacitiesOpaque(i.opacity ?? 1) &&
        lineOpaque &&
        (colorscale
          ? colorscaleOpaque(i.colorscale) && (i.nanColor?.[3] ?? 1) >= 1
          : colorsOpaque(i.color)),
    );
    if (opaque === this.#opaque) return;
    this.#opaque = opaque;
    applyBlend3D(this.markers.material, opaque);
  }
}

function isTyped(value: unknown): boolean {
  return ArrayBuffer.isView(value);
}

/** Create {@link Markers3D}. Add `markers.object` to a 3D scene (or `viewport.add(markers)`). */
export function createMarkers3D(
  ctx: PrimitiveContext,
  data: Partial<MarkerData> = {},
  options: Markers3DOptions = {},
): Markers3D {
  return new Markers3D(ctx, data, options);
}
