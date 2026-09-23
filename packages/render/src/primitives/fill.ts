/**
 * Fill & polygon primitive (plan E2.6): triangulated polygons with holes, exact even-odd / nonzero
 * handling for self-intersecting "toself" fills, and many polygons batched into one draw call.
 *
 * Used by area / stacked-area fills, shapes, choropleths, treemap-like tilings, contour bands, and
 * sankey links. See `fill-triangulate.ts` for the input layout and `fill-arrangement.ts` for the
 * exact fill-rule algorithm and its limits.
 */
import { BufferAttribute, BufferGeometry, DoubleSide, Mesh, type ShaderMaterial } from 'three';
import type {
  ColorInput,
  DataTransform,
  Primitive,
  PrimitiveContext,
  ViewportSize,
} from '../types.ts';
import { IDENTITY_TRANSFORM } from '../types.ts';
import {
  applyTransformUniforms,
  computeOrigin,
  createPrimitiveMaterial,
  createTransformUniforms,
  type TransformUniforms,
  type Vec3,
} from './common.ts';
import { FILL_FRAGMENT_GLSL, FILL_VERTEX_GLSL } from './fill.glsl.ts';
import {
  encodeFillPositions,
  triangulateFills,
  writeFillColors,
  type FillGeometryInput,
  type FillTriangulation,
} from './fill-triangulate.ts';

export * from './fill-triangulate.ts';

/**
 * How a polygon is painted. Only `'solid'` (per-polygon {@link FillData.color}) is implemented.
 *
 * Reserved for E8.10 / `fillgradient`: `{ kind: 'linear-gradient' | 'radial-gradient', ... }` and
 * `{ kind: 'pattern', ... }`. Those will add per-vertex attributes derived from the same
 * `vertexStarts` ranges (e.g. polygon-bbox-relative UVs) plus a LUT/pattern texture, so the
 * triangulation and batching stay unchanged.
 */
export type FillPaint = { kind: 'solid' };

/** Data for {@link FillPrimitive}. */
export interface FillData extends FillGeometryInput {
  /** Per-polygon color (sRGB 0–1 RGBA, straight alpha): one tuple or 4 floats per polygon. */
  color: ColorInput;
  /** Multiplies every polygon's alpha (uniform: changing it uploads nothing). Default 1. */
  opacity?: number;
  /** Paint style; defaults to `{ kind: 'solid' }`. See {@link FillPaint}. */
  paint?: FillPaint;
}

const GEOMETRY_KEYS = ['x', 'y', 'z', 'rings', 'polygons', 'fillRule'] as const;

interface FillUniforms extends TransformUniforms {
  uOpacity: { value: number };
}

/**
 * Batched polygon fills: one merged indexed geometry, one draw call for any number of polygons.
 *
 * Updates: geometry keys (`x`, `y`, `z`, `rings`, `polygons`, `fillRule`) re-triangulate; `color`
 * alone rewrites only the color attribute; `opacity` and {@link setTransform} touch uniforms only.
 */
export class FillPrimitive implements Primitive<FillData> {
  readonly object: Mesh<BufferGeometry, ShaderMaterial>;
  private readonly context: PrimitiveContext;
  private readonly uniforms: FillUniforms;
  private readonly material: ShaderMaterial;
  private data: FillData;
  private tri: FillTriangulation;
  private origin: Vec3 = [0, 0, 0];
  private transform: DataTransform = { ...IDENTITY_TRANSFORM };
  private geometry: BufferGeometry;
  private positionAttr: BufferAttribute;
  private colorAttr: BufferAttribute;
  private indexAttr: BufferAttribute;
  private disposed = false;

  constructor(context: PrimitiveContext, data: FillData) {
    this.context = context;
    this.data = { ...data };
    this.uniforms = { ...createTransformUniforms(), uOpacity: { value: data.opacity ?? 1 } };
    this.material = createPrimitiveMaterial({
      vertexShader: FILL_VERTEX_GLSL,
      fragmentShader: FILL_FRAGMENT_GLSL,
      uniforms: this.uniforms,
    });
    // Fills have no meaningful facing: axis flips (negative scale) and 3D views see both sides.
    this.material.side = DoubleSide;

    this.origin = computeOrigin(data.x, data.y, data.z);
    this.tri = triangulateFills(this.data, this.origin);
    const { geometry, position, color, index } = allocateGeometry(
      this.tri.vertexCount,
      this.tri.indices.length,
    );
    this.geometry = geometry;
    this.positionAttr = position;
    this.colorAttr = color;
    this.indexAttr = index;
    this.object = new Mesh(geometry, this.material);
    // Buffers are RTC-encoded and transformed in the shader, so three's bounds are meaningless.
    this.object.frustumCulled = false;
    this.writeGeometry();
    this.writeColors();
    applyTransformUniforms(this.uniforms, this.transform, this.origin);
  }

  /** Number of polygons (items addressed by per-polygon colors). */
  get polygonCount(): number {
    return this.tri.polygonCount;
  }

  /** Current triangulation (read-only; for picking and tests). */
  get triangulation(): Readonly<FillTriangulation> {
    return this.tri;
  }

  update(patch: Partial<FillData>): void {
    if (this.disposed) return;
    const geometryChanged = GEOMETRY_KEYS.some((key) => key in patch);
    this.data = { ...this.data, ...patch };
    if (patch.opacity !== undefined) this.uniforms.uOpacity.value = patch.opacity;
    if ('opacity' in patch && patch.opacity === undefined) this.uniforms.uOpacity.value = 1;
    if (geometryChanged) {
      this.origin = computeOrigin(this.data.x, this.data.y, this.data.z);
      this.tri = triangulateFills(this.data, this.origin);
      this.writeGeometry();
      this.writeColors();
      applyTransformUniforms(this.uniforms, this.transform, this.origin);
    } else if ('color' in patch) {
      this.writeColors();
    }
    this.context.invalidate();
  }

  setTransform(transform: DataTransform): void {
    this.transform = { ...transform };
    applyTransformUniforms(this.uniforms, this.transform, this.origin);
    this.context.invalidate();
  }

  /** Fills have no screen-space sizing yet (reserved for screen-space pattern fills). */
  setViewport(size: ViewportSize): void {
    void size;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.object.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }

  /** Upload positions + indices, growing (replacing) the geometry only when capacity is exceeded. */
  private writeGeometry(): void {
    const { vertexCount, indices } = this.tri;
    if (
      vertexCount * 3 > this.positionAttr.array.length ||
      indices.length > this.indexAttr.array.length
    ) {
      const grown = allocateGeometry(Math.ceil(vertexCount * 1.5), Math.ceil(indices.length * 1.5));
      // Replacing the geometry (rather than its attributes) lets three free the old GPU buffers.
      this.geometry.dispose();
      this.geometry = grown.geometry;
      this.positionAttr = grown.position;
      this.colorAttr = grown.color;
      this.indexAttr = grown.index;
      this.object.geometry = grown.geometry;
    }
    encodeFillPositions(this.tri.positions, this.origin, this.positionAttr.array as Float32Array);
    (this.indexAttr.array as Uint32Array).set(indices);
    markRange(this.positionAttr, vertexCount * 3);
    markRange(this.indexAttr, indices.length);
    this.geometry.setDrawRange(0, indices.length);
  }

  private writeColors(): void {
    writeFillColors(this.data.color, this.tri.vertexStarts, this.colorAttr.array as Float32Array);
    markRange(this.colorAttr, this.tri.vertexCount * 4);
  }
}

/** Create a {@link FillPrimitive}. */
export function createFillPrimitive(context: PrimitiveContext, data: FillData): FillPrimitive {
  return new FillPrimitive(context, data);
}

function allocateGeometry(
  vertexCapacity: number,
  indexCapacity: number,
): {
  geometry: BufferGeometry;
  position: BufferAttribute;
  color: BufferAttribute;
  index: BufferAttribute;
} {
  // Never allocate empty GL buffers; a small floor also absorbs tiny streaming updates.
  const vcap = Math.max(4, vertexCapacity);
  const icap = Math.max(6, indexCapacity);
  const geometry = new BufferGeometry();
  const position = new BufferAttribute(new Float32Array(vcap * 3), 3);
  const color = new BufferAttribute(new Float32Array(vcap * 4), 4);
  const index = new BufferAttribute(new Uint32Array(icap), 1);
  geometry.setAttribute('position', position);
  geometry.setAttribute('aColor', color);
  geometry.setIndex(index);
  geometry.setDrawRange(0, 0);
  return { geometry, position, color, index };
}

/** Upload only the used prefix of an attribute (plan §E16.3). */
function markRange(attribute: BufferAttribute, count: number): void {
  attribute.clearUpdateRanges();
  if (count > 0) attribute.addUpdateRange(0, count);
  attribute.needsUpdate = true;
}
