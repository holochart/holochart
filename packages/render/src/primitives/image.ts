/**
 * Image primitive: one texture drawn in a data-space box, fitted like SVG `preserveAspectRatio`
 * (Plotly `layout.images[]`). The fit is solved on the CPU in world px and passed as two vec4
 * uniforms (quad rect + uv rect), so transform, box, fit, align, and opacity changes upload nothing.
 */
import {
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  Texture,
  Vector4,
  type BufferGeometry,
  type ShaderMaterial,
} from 'three';
import type { DataTransform, Primitive, PrimitiveContext, ViewportSize } from '../types.ts';
import { IDENTITY_TRANSFORM } from '../types.ts';
import { UNIT_QUAD_KEY, createPrimitiveMaterial, createUnitQuadTemplate } from './common.ts';

/** How the image fills its box: Plotly `sizing` 'contain' → 'contain', 'fill' → 'cover', 'stretch' → 'stretch'. */
export type ImageFit = 'contain' | 'cover' | 'stretch';

/**
 * Anything `texImage2D` accepts, with its pixel size. WebGL ignores the flip / premultiply pixel-store
 * flags for `ImageBitmap`, so create bitmaps with `imageOrientation: 'flipY'` and
 * `premultiplyAlpha: 'premultiply'`.
 */
export type ImageSourceLike = HTMLImageElement | HTMLCanvasElement | ImageBitmap | OffscreenCanvas;

/** Data for {@link ImagePrimitive}. */
export interface ImageQuadData {
  /** URL or data URI (loaded asynchronously), or an already-decoded image. */
  source: string | ImageSourceLike;
  /** Box corners in data coordinates (any order; mapped through the transform). */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Default 'contain'. */
  fit: ImageFit;
  /** Where the image sits in (contain) or is cropped from (cover) its box: 0 = left, 0.5 = center, 1 = right. Default 0.5. */
  alignX: number;
  /** 0 = top, 0.5 = middle, 1 = bottom (screen sense: top = max world y). Default 0.5. */
  alignY: number;
  /** Multiplies alpha (uniform). Default 1. */
  opacity: number;
}

/** Options for {@link createImagePrimitive}. */
export interface ImageOptions {
  /** Loader override (tests, custom fetching). Default: an HTMLImageElement with crossOrigin 'anonymous' for non-data:/blob: URLs, awaiting `decode()` when available. */
  load?(source: string): Promise<ImageSourceLike>;
  /** Warning sink (default console.warn). */
  warn?(message: string): void;
}

/** Load status of an {@link ImagePrimitive}. */
export type ImageStatus = 'loading' | 'loaded' | 'error';

/** Result of {@link fitImage}: world-px quad `[x0, y0, x1, y1]` and uv sub-rect `[u0, v0, u1, v1]`. */
export interface ImageFitResult {
  rect: [number, number, number, number];
  uv: [number, number, number, number];
}

/**
 * Pure fit math in world px: the quad to draw and the texture sub-rect (uv 0–1, v up = image top at
 * v=1 with flipY) to sample. Returns undefined for an empty box or zero natural size.
 */
export function fitImage(
  box: { x0: number; y0: number; x1: number; y1: number },
  natural: { width: number; height: number },
  fit: ImageFit,
  alignX: number,
  alignY: number,
): ImageFitResult | undefined {
  const bx = Math.min(box.x0, box.x1);
  const by = Math.min(box.y0, box.y1);
  const W = Math.max(box.x0, box.x1) - bx;
  const H = Math.max(box.y0, box.y1) - by;
  const { width: w, height: h } = natural;
  // `!(a > 0)` also rejects NaN (e.g. a box corner that is not on a numeric axis).
  if (!(W > 0 && H > 0 && w > 0 && h > 0) || !Number.isFinite(W + H)) return undefined;
  const boxRect: ImageFitResult['rect'] = [bx, by, bx + W, by + H];
  if (fit === 'stretch') return { rect: boxRect, uv: [0, 0, 1, 1] };
  // alignY is in screen sense (0 = top), world y is up: the leftover goes below by (1 - alignY).
  const ay = 1 - alignY;
  if (fit === 'contain') {
    const s = Math.min(W / w, H / h);
    const x = bx + (W - w * s) * alignX;
    const y = by + (H - h * s) * ay;
    return { rect: [x, y, x + w * s, y + h * s], uv: [0, 0, 1, 1] };
  }
  const s = Math.max(W / w, H / h);
  const fu = W / (w * s);
  const fv = H / (h * s);
  const u = (1 - fu) * alignX;
  const v = (1 - fv) * ay;
  return { rect: boxRect, uv: [u, v, u + fu, v + fv] };
}

const VERTEX_GLSL = /* glsl */ `
uniform vec4 uRect;
uniform vec4 uUv;
out vec2 vUv;

void main() {
  vUv = mix(uUv.xy, uUv.zw, position.xy);
  vec2 world = mix(uRect.xy, uRect.zw, position.xy);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 0.0, 1.0);
}
`;

// Texels are premultiplied on upload so linear/mipmap filtering doesn't bleed the (often black)
// color of transparent pixels into edges; un-premultiply for the straight-alpha blend.
const FRAGMENT_GLSL = /* glsl */ `
uniform sampler2D uTex;
uniform float uOpacity;
in vec2 vUv;
out highp vec4 fragColor;

void main() {
  vec4 c = texture(uTex, vUv);
  if (c.a <= 0.0) discard;
  fragColor = vec4(c.rgb / c.a, c.a * uOpacity);
}
`;

/** Sources already warned about, shared across primitives so a broken logo warns once per page. */
const warnedSources = new Set<string>();

async function loadImage(source: string): Promise<ImageSourceLike> {
  const img = new Image();
  // data:/blob: URLs are same-origin; crossOrigin on them breaks some browsers for no benefit.
  if (!/^(?:data|blob):/i.test(source)) img.crossOrigin = 'anonymous';
  img.src = source;
  await img.decode();
  return img;
}

/**
 * A single fitted image. `ready` resolves (never rejects) once the current source has loaded or
 * failed; nothing is drawn until then, or after a failure.
 */
export class ImagePrimitive implements Primitive<ImageQuadData> {
  readonly object: Mesh<BufferGeometry, ShaderMaterial>;
  private readonly context: PrimitiveContext;
  private readonly options: ImageOptions;
  private readonly material: ShaderMaterial;
  private readonly uniforms = {
    uRect: { value: new Vector4() },
    uUv: { value: new Vector4(0, 0, 1, 1) },
    uTex: { value: null as Texture | null },
    uOpacity: { value: 1 },
  };
  private data: ImageQuadData;
  private transform: DataTransform = { ...IDENTITY_TRANSFORM };
  private texture: Texture | undefined;
  private natural = { width: 0, height: 0 };
  private state: ImageStatus = 'loading';
  private pending: Promise<void> = Promise.resolve();
  /** Bumped per source change and on dispose, so late loads of stale sources are dropped. */
  private generation = 0;
  private disposed = false;

  constructor(
    context: PrimitiveContext,
    data: Pick<ImageQuadData, 'source' | 'x0' | 'y0' | 'x1' | 'y1'> & Partial<ImageQuadData>,
    options: ImageOptions = {},
  ) {
    this.context = context;
    this.options = options;
    this.data = withDefaults(data);
    this.uniforms.uOpacity.value = this.data.opacity;
    this.material = createPrimitiveMaterial({
      vertexShader: VERTEX_GLSL,
      fragmentShader: FRAGMENT_GLSL,
      uniforms: this.uniforms,
    });
    // Every image draws the same static unit quad (placed by uniforms), so share one through the
    // resource manager instead of allocating per-image buffers; released (not disposed) on dispose.
    const quad = context.resources.acquire(UNIT_QUAD_KEY, createUnitQuadTemplate);
    this.object = new Mesh(quad, this.material);
    // The quad is placed in the shader, so three's bounds are meaningless.
    this.object.frustumCulled = false;
    this.object.visible = false;
    this.setSource(this.data.source);
  }

  /** Resolves once the current source has loaded or failed (never rejects). */
  get ready(): Promise<void> {
    return this.pending;
  }

  get status(): ImageStatus {
    return this.state;
  }

  /** Natural pixel width of the loaded image (0 until loaded). */
  get naturalWidth(): number {
    return this.natural.width;
  }

  /** Natural pixel height of the loaded image (0 until loaded). */
  get naturalHeight(): number {
    return this.natural.height;
  }

  update(patch: Partial<ImageQuadData>): void {
    if (this.disposed) return;
    const prev = this.data;
    this.data = withDefaults({ ...prev, ...patch, source: patch.source ?? prev.source });
    this.uniforms.uOpacity.value = this.data.opacity;
    if (this.data.source !== prev.source) this.setSource(this.data.source);
    else this.refit();
    this.context.invalidate();
  }

  setTransform(transform: DataTransform): void {
    this.transform = { ...transform };
    this.refit();
    this.context.invalidate();
  }

  /** Images have no screen-space sizing. */
  setViewport(size: ViewportSize): void {
    void size;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.generation++;
    this.object.removeFromParent();
    this.texture?.dispose();
    this.texture = undefined;
    this.material.dispose();
    this.context.resources.release(UNIT_QUAD_KEY);
  }

  private setSource(source: string | ImageSourceLike): void {
    const generation = ++this.generation;
    this.texture?.dispose();
    this.texture = undefined;
    this.uniforms.uTex.value = null;
    this.natural = { width: 0, height: 0 };
    if (typeof source !== 'string') {
      this.pending = Promise.resolve();
      this.accept(source);
      return;
    }
    this.state = 'loading';
    this.refit();
    const load = this.options.load ?? loadImage;
    // `new Promise` also turns a synchronously throwing loader into a rejection.
    this.pending = new Promise<ImageSourceLike>((resolve) => resolve(load(source))).then(
      (image) => {
        if (generation === this.generation) this.accept(image);
      },
      () => {
        if (generation !== this.generation) return;
        this.state = 'error';
        if (warnedSources.has(source)) return;
        warnedSources.add(source);
        const warn = this.options.warn ?? ((m: string) => console.warn(m));
        warn(`[holochart] image failed to load: ${source.slice(0, 80)}`);
      },
    );
  }

  private accept(image: ImageSourceLike): void {
    const texture = new Texture(image);
    // Colors stay unconverted (NoColorSpace), like every other primitive's sRGB inputs.
    texture.premultiplyAlpha = true;
    texture.minFilter = LinearMipmapLinearFilter;
    texture.magFilter = LinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
    this.texture = texture;
    this.uniforms.uTex.value = texture;
    this.natural =
      'naturalWidth' in image
        ? { width: image.naturalWidth, height: image.naturalHeight }
        : { width: image.width, height: image.height };
    this.state = 'loaded';
    this.refit();
    this.context.invalidate();
  }

  /** Map the box to world px (float64), fit, and write the uniforms; hide when nothing to draw. */
  private refit(): void {
    const { x0, y0, x1, y1, fit, alignX, alignY } = this.data;
    const t = this.transform;
    const box = {
      x0: x0 * t.scaleX + t.offsetX,
      y0: y0 * t.scaleY + t.offsetY,
      x1: x1 * t.scaleX + t.offsetX,
      y1: y1 * t.scaleY + t.offsetY,
    };
    const result = this.texture ? fitImage(box, this.natural, fit, alignX, alignY) : undefined;
    this.object.visible = result !== undefined;
    if (!result) return;
    this.uniforms.uRect.value.set(...result.rect);
    this.uniforms.uUv.value.set(...result.uv);
  }
}

function withDefaults(
  d: Pick<ImageQuadData, 'source' | 'x0' | 'y0' | 'x1' | 'y1'> & Partial<ImageQuadData>,
): ImageQuadData {
  return {
    ...d,
    fit: d.fit ?? 'contain',
    alignX: d.alignX ?? 0.5,
    alignY: d.alignY ?? 0.5,
    opacity: d.opacity ?? 1,
  };
}

/** Create an {@link ImagePrimitive}. */
export function createImagePrimitive(
  context: PrimitiveContext,
  data: Pick<ImageQuadData, 'source' | 'x0' | 'y0' | 'x1' | 'y1'> & Partial<ImageQuadData>,
  options?: ImageOptions,
): ImagePrimitive {
  return new ImagePrimitive(context, data, options);
}
