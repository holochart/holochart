/**
 * Raster primitive: an RGBA pixel grid drawn as ONE textured quad in data space (plan E11.3, the
 * `image` trace). Unlike {@link ImagePrimitive} (layout images, fitted into a box), the quad is
 * placed exactly: pixel column 0 starts at `x0` and the last one ends at `x1`, row 0 starts at `y0`
 * and the last row ends at `y1` — in either direction, so a reversed y axis (Plotly's default for
 * images) shows row 0 at the top without flipping anything.
 *
 * - **Texture**: `RGBA8` (`UnsignedByteType`), row 0 first, no flip, uploaded premultiplied (on
 *   the CPU, so linear filtering doesn't bleed the color of transparent pixels) and
 *   un-premultiplied in the shader for the straight-alpha blend.
 * - **Sampling**: `smoothing: false` → nearest texel (Plotly's pixelated default), `true` →
 *   bilinear (`zsmooth: 'fast'`).
 * - **Precision**: the RTC origin is `(x0, y0)` (ADR-008), and like the heatmap the fragment
 *   shader finds its texel from its pixel center rather than the interpolated varying, so pixel
 *   edges don't jitter along the quad's diagonal.
 *
 * Zoom / pan only rewrite transform uniforms; opacity is a uniform; smoothing sets the filters;
 * only new pixels upload (reusing the texture when the size is unchanged).
 */
import {
  ClampToEdgeWrapping,
  DataTexture,
  DoubleSide,
  LinearFilter,
  Mesh,
  NearestFilter,
  NoColorSpace,
  RGBAFormat,
  UnsignedByteType,
  Vector2,
  type BufferGeometry,
  type ShaderMaterial,
  type Texture,
} from 'three';
import type { Vec3 } from '../precision.ts';
import type { DataTransform, Primitive, PrimitiveContext, ViewportSize } from '../types.ts';
import { IDENTITY_TRANSFORM } from '../types.ts';
import { fitsTexture } from '../capabilities.ts';
import {
  UNIT_QUAD_KEY,
  applyTransformUniforms,
  applyViewportUniforms,
  createPrimitiveMaterial,
  createTransformUniforms,
  createUnitQuadTemplate,
  createViewportUniforms,
  syncViewportUniforms,
  type TransformUniforms,
  type ViewportUniforms,
} from './common.ts';
import { TRANSFORM_GLSL } from './common.glsl.ts';

/** RGBA pixels: 4 bytes per pixel, row-major, row 0 first, straight (not premultiplied) alpha. */
export interface RasterPixels {
  readonly data: ArrayLike<number>;
  readonly width: number;
  readonly height: number;
}

/** Data for {@link RasterPrimitive}. */
export interface RasterData {
  pixels: RasterPixels;
  /** Linear data coordinate where pixel column 0 starts. */
  x0: number;
  /** Where the last column ends (`x1 < x0` runs the columns the other way). */
  x1: number;
  /** Where pixel row 0 starts. */
  y0: number;
  /** Where the last row ends. */
  y1: number;
  /** Bilinear filtering instead of nearest texels. Default false. */
  smoothing: boolean;
  /** Multiplies alpha (uniform). Default 1. */
  opacity: number;
}

/** Required fields of {@link RasterData}; the rest have defaults. */
export type RasterInput = Partial<RasterData> &
  Pick<RasterData, 'pixels' | 'x0' | 'x1' | 'y0' | 'y1'>;

export const RASTER_VERTEX_SHADER = /* glsl */ `
${TRANSFORM_GLSL}

uniform vec2 uSize;  // (x1 - x0, y1 - y0)
out vec2 vUv;

void main() {
  vUv = position.xy;
  gl_Position = hcDataToClip(vec3(position.xy * uSize, 0.0));
}
`;

export const RASTER_FRAGMENT_SHADER = /* glsl */ `
uniform vec3 uScale;             // shared with the vertex stage (TRANSFORM_GLSL)
uniform vec3 uOffset;
uniform sampler2D uTex;          // RGBA8, premultiplied
uniform vec2 uSize;
uniform float uOpacity;
uniform vec2 uResolution;        // viewport size, CSS px (= 2D world px)
uniform vec4 uViewport;          // GL viewport, device px

in vec2 vUv;
out highp vec4 fragColor;

// Texture coordinate from the fragment's pixel center (see heatmap.glsl.ts), else the varying.
vec2 rsUv() {
  vec2 world = (gl_FragCoord.xy - uViewport.xy) * uResolution / uViewport.zw;
  vec2 local = (world - uOffset.xy) / uScale.xy;
  bool ok = all(greaterThan(abs(uScale.xy), vec2(0.0))) && all(greaterThan(abs(uSize), vec2(0.0)));
  return ok ? local / uSize : vUv;
}

void main() {
  vec2 uv = rsUv();
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) discard;
  vec4 c = texture(uTex, uv);
  if (c.a <= 0.0) discard;
  fragColor = vec4(c.rgb / c.a, c.a * uOpacity);
}
`;

/**
 * Premultiplied RGBA8 copy of `pixels` (the texture layout). Missing trailing bytes are
 * transparent. `out` is reused when it has the right length.
 */
export function premultiplyPixels(pixels: RasterPixels, out?: Uint8Array): Uint8Array {
  const n = Math.max(0, pixels.width) * Math.max(0, pixels.height) * 4;
  const data = out?.length === n ? out : new Uint8Array(n);
  const src = pixels.data;
  const m = Math.min(n, src.length - (src.length % 4));
  for (let k = 0; k < m; k += 4) {
    const a = src[k + 3]!;
    const f = a / 255;
    data[k] = Math.round(src[k]! * f);
    data[k + 1] = Math.round(src[k + 1]! * f);
    data[k + 2] = Math.round(src[k + 2]! * f);
    data[k + 3] = a;
  }
  data.fill(0, m);
  return data;
}

/** Uniforms of the raster material (exposed for tests and debugging). */
export interface RasterUniforms extends TransformUniforms, ViewportUniforms {
  uTex: { value: Texture | null };
  uSize: { value: Vector2 };
  uOpacity: { value: number };
}

/** One pixel grid, one draw call. See the module header. */
export class RasterPrimitive implements Primitive<RasterData> {
  readonly object: Mesh<BufferGeometry, ShaderMaterial>;
  readonly uniforms: RasterUniforms;
  private readonly context: PrimitiveContext;
  private readonly material: ShaderMaterial;
  private data: RasterData;
  private origin: Vec3 = [0, 0, 0];
  private transform: DataTransform = { ...IDENTITY_TRANSFORM };
  private texture: DataTexture | undefined;
  private pending: Promise<void> = Promise.resolve();
  /** Bumped per {@link load} and on dispose, so late pixels of stale loads are dropped. */
  private generation = 0;
  private disposed = false;

  constructor(context: PrimitiveContext, data: RasterInput) {
    this.context = context;
    this.data = withDefaults(data);
    this.uniforms = {
      ...createTransformUniforms(),
      ...createViewportUniforms(),
      uTex: { value: null },
      uSize: { value: new Vector2(1, 1) },
      uOpacity: { value: 1 },
    };
    this.material = createPrimitiveMaterial({
      vertexShader: RASTER_VERTEX_SHADER,
      fragmentShader: RASTER_FRAGMENT_SHADER,
      uniforms: this.uniforms,
    });
    // Reversed axes and negative steps mirror the quad: draw both faces.
    this.material.side = DoubleSide;
    const quad = context.resources.acquire(UNIT_QUAD_KEY, createUnitQuadTemplate);
    this.object = new Mesh(quad, this.material);
    this.object.frustumCulled = false;
    this.object.onBeforeRender = (renderer) => {
      syncViewportUniforms(this.uniforms, renderer);
    };
    this.writePixels();
    this.writePlacement();
    this.writeStyle();
  }

  /** The current data (with defaults applied). */
  get current(): Readonly<RasterData> {
    return this.data;
  }

  /**
   * Resolves (never rejects) once the pixels of the last {@link load} are uploaded, or it failed;
   * `chart.ready` waits for it.
   */
  get ready(): Promise<void> {
    return this.pending;
  }

  /**
   * Show pixels that arrive later (e.g. a decoded picture): until then the current pixels stay;
   * `undefined` or a rejection keeps them.
   */
  load(pixels: Promise<RasterPixels | undefined>): void {
    const generation = ++this.generation;
    this.pending = pixels.then(
      (p) => {
        if (p && generation === this.generation && !this.disposed) this.update({ pixels: p });
      },
      () => undefined,
    );
  }

  update(patch: Partial<RasterData>): void {
    if (this.disposed) return;
    const prev = this.data;
    this.data = withDefaults({ ...prev, ...definedOnly(patch) });
    if (patch.pixels !== undefined && patch.pixels !== prev.pixels) this.writePixels();
    this.writePlacement();
    this.writeStyle();
    this.context.invalidate();
  }

  /** Uniforms only: the texture is never touched. */
  setTransform(transform: DataTransform): void {
    this.transform = { ...transform };
    applyTransformUniforms(this.uniforms, this.transform, this.origin);
    this.context.invalidate();
  }

  setViewport(size: ViewportSize): void {
    applyViewportUniforms(this.uniforms, size);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.generation++;
    this.object.removeFromParent();
    this.texture?.dispose();
    this.texture = undefined;
    this.uniforms.uTex.value = null;
    this.material.dispose();
    this.context.resources.release(UNIT_QUAD_KEY);
  }

  private writePixels(): void {
    const { pixels } = this.data;
    const w = Math.max(0, Math.floor(pixels.width));
    const h = Math.max(0, Math.floor(pixels.height));
    if (w === 0 || h === 0 || !fitsTexture(this.context.capabilities, 'image', w, h)) {
      this.texture?.dispose();
      this.texture = undefined;
      this.uniforms.uTex.value = null;
      return;
    }
    const t = this.texture;
    if (t && t.image.width === w && t.image.height === h) {
      premultiplyPixels(pixels, t.image.data as Uint8Array);
      t.needsUpdate = true;
      return;
    }
    t?.dispose();
    const texture = new DataTexture(
      premultiplyPixels({ data: pixels.data, width: w, height: h }),
      w,
      h,
      RGBAFormat,
      UnsignedByteType,
    );
    texture.wrapS = ClampToEdgeWrapping;
    texture.wrapT = ClampToEdgeWrapping;
    texture.generateMipmaps = false;
    texture.colorSpace = NoColorSpace;
    texture.flipY = false;
    texture.premultiplyAlpha = false;
    texture.unpackAlignment = 4;
    texture.name = 'holochart:raster';
    texture.needsUpdate = true;
    this.texture = texture;
    this.uniforms.uTex.value = texture;
  }

  private writePlacement(): void {
    const { x0, x1, y0, y1 } = this.data;
    this.origin = [x0, y0, 0];
    this.uniforms.uSize.value.set(x1 - x0, y1 - y0);
    applyTransformUniforms(this.uniforms, this.transform, this.origin);
  }

  private writeStyle(): void {
    const d = this.data;
    this.uniforms.uOpacity.value = d.opacity;
    if (this.texture) {
      const filter = d.smoothing ? LinearFilter : NearestFilter;
      if (this.texture.magFilter !== filter) {
        this.texture.magFilter = filter;
        this.texture.minFilter = filter;
        this.texture.needsUpdate = true;
      }
    }
    this.object.visible =
      this.texture !== undefined &&
      [d.x0, d.x1, d.y0, d.y1].every(Number.isFinite) &&
      d.x0 !== d.x1 &&
      d.y0 !== d.y1;
  }
}

function definedOnly(patch: Partial<RasterData>): Partial<RasterData> {
  const out: Partial<RasterData> = {};
  for (const key of Object.keys(patch) as (keyof RasterData)[]) {
    if (patch[key] !== undefined) (out as Record<string, unknown>)[key] = patch[key];
  }
  return out;
}

function withDefaults(d: RasterInput): RasterData {
  return { ...d, smoothing: d.smoothing ?? false, opacity: d.opacity ?? 1 };
}

/** Create a {@link RasterPrimitive}. */
export function createRasterPrimitive(ctx: PrimitiveContext, data: RasterInput): RasterPrimitive {
  return new RasterPrimitive(ctx, data);
}
