/**
 * Shared helpers for the line / fill / rect / arc / text primitives: relative-to-center (RTC)
 * encoding, transform + viewport uniforms, per-item attribute expansion, shared instanced geometry,
 * and the default material setup. Everything here except {@link acquireInstancedGeometry} and
 * {@link createPrimitiveMaterial} is pure and unit-tested without WebGL.
 */
import {
  BufferGeometry,
  Float32BufferAttribute,
  GLSL3,
  InstancedBufferGeometry,
  NormalBlending,
  ShaderMaterial,
  Vector2,
  Vector3,
  type IUniform,
} from 'three';
import type {
  ColorInput,
  DataTransform,
  ResourceManager,
  ScalarInput,
  ViewportSize,
} from '../types.ts';
import { effectiveTransform, type Vec3 } from '../precision.ts';

/** Numeric input accepted for coordinates. `Float64Array` is preferred (precision, ADR-008). */
export type NumericArray = ArrayLike<number>;

// RTC helpers live in ../precision.ts (shared with markers); re-exported for primitive modules.
export { computeOrigin, effectiveTransform, type Vec3 } from '../precision.ts';

/** Uniforms shared by every primitive's vertex shader (see `TRANSFORM_GLSL`). */
export interface TransformUniforms {
  [name: string]: IUniform;
  uScale: IUniform<Vector3>;
  uOffset: IUniform<Vector3>;
}

export function createTransformUniforms(): TransformUniforms {
  return { uScale: { value: new Vector3(1, 1, 1) }, uOffset: { value: new Vector3(0, 0, 0) } };
}

/** Write `transform` (relative to `origin`) into the uniforms. */
export function applyTransformUniforms(
  uniforms: TransformUniforms,
  transform: DataTransform,
  origin: Readonly<Vec3>,
): void {
  const { scale, offset } = effectiveTransform(transform, origin);
  uniforms.uScale.value.set(scale[0], scale[1], scale[2]);
  uniforms.uOffset.value.set(offset[0], offset[1], offset[2]);
}

/** Uniforms for screen-space sizing (see `SCREEN_GLSL`). */
export interface ViewportUniforms {
  [name: string]: IUniform;
  /** Viewport size in CSS pixels. */
  uResolution: IUniform<Vector2>;
  /** Device pixels per CSS pixel. */
  uPixelRatio: IUniform<number>;
}

export function createViewportUniforms(): ViewportUniforms {
  return { uResolution: { value: new Vector2(1, 1) }, uPixelRatio: { value: 1 } };
}

export function applyViewportUniforms(uniforms: ViewportUniforms, size: ViewportSize): void {
  uniforms.uResolution.value.set(Math.max(1, size.width), Math.max(1, size.height));
  uniforms.uPixelRatio.value = size.pixelRatio > 0 ? size.pixelRatio : 1;
}

/**
 * Expand a {@link ColorInput} into `4 * count` floats. A tuple is broadcast; a `Float32Array`
 * shorter than `4 * count` is padded by repeating its last complete color (or transparent black
 * when empty), so a partially-streamed color array never reads garbage.
 */
export function expandColor(
  input: ColorInput,
  count: number,
  out: Float32Array = new Float32Array(count * 4),
): Float32Array {
  if (input instanceof Float32Array) {
    const n = Math.min(count, Math.floor(input.length / 4));
    out.set(input.subarray(0, n * 4));
    if (n < count) {
      const base = (n - 1) * 4;
      for (let i = n; i < count; i++) {
        for (let c = 0; c < 4; c++) out[i * 4 + c] = n > 0 ? input[base + c]! : 0;
      }
    }
    return out;
  }
  for (let i = 0; i < count; i++) {
    out[i * 4] = input[0];
    out[i * 4 + 1] = input[1];
    out[i * 4 + 2] = input[2];
    out[i * 4 + 3] = input[3];
  }
  return out;
}

/** Color of item `i` from a {@link ColorInput}, written to `out` (same padding rule as above). */
export function colorAt(input: ColorInput, i: number, out: number[] | Float32Array): void {
  if (input instanceof Float32Array) {
    const n = Math.floor(input.length / 4);
    if (n === 0) {
      out[0] = out[1] = out[2] = out[3] = 0;
      return;
    }
    const j = Math.min(i, n - 1) * 4;
    out[0] = input[j]!;
    out[1] = input[j + 1]!;
    out[2] = input[j + 2]!;
    out[3] = input[j + 3]!;
    return;
  }
  out[0] = input[0];
  out[1] = input[1];
  out[2] = input[2];
  out[3] = input[3];
}

/**
 * Expand a {@link ScalarInput} into `count` floats. A number is broadcast; a short array is padded
 * with its last value (or `fallback` when empty).
 */
export function expandScalar(
  input: ScalarInput,
  count: number,
  fallback = 0,
  out: Float32Array = new Float32Array(count),
): Float32Array {
  if (typeof input === 'number') {
    out.fill(input, 0, count);
    return out;
  }
  const n = Math.min(count, input.length);
  out.set(input.subarray(0, n));
  if (n < count) out.fill(n > 0 ? input[n - 1]! : fallback, n, count);
  return out;
}

/** Value of item `i` from a {@link ScalarInput} (same padding rule as {@link expandScalar}). */
export function scalarAt(input: ScalarInput, i: number, fallback = 0): number {
  if (typeof input === 'number') return input;
  if (input.length === 0) return fallback;
  return input[Math.min(i, input.length - 1)]!;
}

/**
 * Snap a CSS-pixel coordinate to the device-pixel grid (`phase` 0 = pixel edges, 0.5 = pixel
 * centers). CPU mirror of `hcSnap` in `SCREEN_GLSL`, used by tests.
 */
export function snapToDevicePixel(px: number, pixelRatio: number, phase = 0): number {
  return (Math.round(px * pixelRatio - phase) + phase) / pixelRatio;
}

/**
 * Per-primitive instanced geometry that shares its per-vertex template (e.g. a unit quad) through
 * the {@link ResourceManager}.
 *
 * Why the dance in `release`: three.js deletes the GPU buffers of *every* attribute of a geometry
 * when that geometry is disposed. Shared template attributes are therefore detached before
 * disposing the per-primitive geometry — except when this is the template's last user, in which
 * case they are left attached so their GPU buffers are freed too.
 */
export function acquireInstancedGeometry(
  resources: ResourceManager,
  key: string,
  createTemplate: () => BufferGeometry,
): { geometry: InstancedBufferGeometry; release(): void } {
  const template = resources.acquire(key, createTemplate);
  const geometry = new InstancedBufferGeometry();
  geometry.setIndex(template.getIndex());
  const shared = Object.keys(template.attributes);
  for (const name of shared) geometry.setAttribute(name, template.getAttribute(name));
  geometry.instanceCount = 0;
  let released = false;
  return {
    geometry,
    release() {
      if (released) return;
      released = true;
      const last = resources.stats().find((s) => s.key === key)?.refs === 1;
      if (!last) {
        geometry.setIndex(null);
        for (const name of shared) geometry.deleteAttribute(name);
      }
      geometry.dispose();
      resources.release(key);
    },
  };
}

/** A unit quad template: `position.xy` in {0,1}², two triangles. Used for instanced rects/arcs. */
export function createUnitQuadTemplate(): BufferGeometry {
  const geometry = new BufferGeometry();
  // three expects a vec3 'position'; z is unused by the instanced shaders.
  geometry.setAttribute(
    'position',
    new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0], 3),
  );
  geometry.setIndex([0, 1, 2, 2, 1, 3]);
  return geometry;
}

/** Key under which {@link createUnitQuadTemplate} is shared in the {@link ResourceManager}. */
export const UNIT_QUAD_KEY = 'holochart:primitives:unit-quad';

/**
 * Default material for 2D/3D chart primitives: GLSL3 (`in`/`out`, declare
 * `out highp vec4 fragColor;` in the fragment shader), straight (non-premultiplied) alpha blending,
 * depth test on so 3D scenes occlude, depth write off so anti-aliased fringes never punch holes.
 * Colors are written unconverted: inputs are already sRGB (see `types.ts`).
 */
export function createPrimitiveMaterial(params: {
  vertexShader: string;
  fragmentShader: string;
  uniforms: Record<string, IUniform>;
  defines?: Record<string, string | number | boolean>;
}): ShaderMaterial {
  return new ShaderMaterial({
    glslVersion: GLSL3,
    vertexShader: params.vertexShader,
    fragmentShader: params.fragmentShader,
    uniforms: params.uniforms,
    defines: params.defines ?? {},
    transparent: true,
    blending: NormalBlending,
    depthTest: true,
    depthWrite: false,
  });
}
