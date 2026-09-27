/**
 * The lazily loaded half of custom marker symbols and image sprites (plan E8.11; the registry is
 * `custom.ts`, which imports this module with a dynamic `import()` on first use, so charts without
 * custom markers never load it).
 *
 * - **SDF atlas** (`R8`, cells of {@link SDF_CELL} px, 8 per row): each registered SVG path is
 *   filled with `Path2D` on a canvas, turned into a signed distance field (`custom-sdf.ts`) and
 *   stored as bytes (0.5 = the edge). The marker fragment shader samples it bilinearly in place of
 *   the analytic shape distance, so fills, `-open` / `-dot` variants, `marker.line` and
 *   `marker.angle` work as for built-in symbols.
 * - **Image atlas** (`RGBA8`, premultiplied, mipmapped, same cell grid): `marker.image` sources are
 *   decoded (CORS-safe: `crossOrigin = 'anonymous'` for non-`data:` URLs) and fitted into a cell
 *   keeping their aspect ratio, with an 8 px transparent gutter so mip levels 0–3 never bleed into
 *   the neighbours; `text:` glyphs are drawn there with `fillText`. Glyphs that come out single-colored
 *   are flagged as masks and tinted with the marker color (color emoji keep their colors).
 * - **Meta table** (`RGBA32F`, 256 × 2): per SDF slot (row 0) `(extent, cellHalf, ready, 0)`, per
 *   image slot (row 1) `(1, cellHalf, ready, tint)`. Markers whose slot is not ready are hidden.
 *
 * Atlases grow by doubling their rows; a grown atlas is a new texture, handed to every marker
 * material through the `custom.ts` listeners. The textures are module-level and shared by every
 * chart (three.js uploads them per renderer).
 */
import {
  type IUniform,
  type Texture,
  DataTexture,
  FloatType,
  LinearFilter,
  LinearMipmapLinearFilter,
  NearestFilter,
  NoColorSpace,
  RedFormat,
  RGBAFormat,
  UnsignedByteType,
  type MagnificationTextureFilter,
  type MinificationTextureFilter,
  type PixelFormat,
} from 'three';
import {
  atlasCell,
  atlasRows,
  coverageToSdf,
  encodeSdf,
  parseViewBox,
  SDF_CELL,
  SDF_SPREAD,
  symbolFrame,
} from './custom-sdf.ts';

/** The shape of a symbol definition this module reads (see `CustomSymbolDefinition`). */
interface SymbolInput {
  path: string;
  viewBox?: readonly [number, number, number, number] | string;
  anchor?: readonly [number, number];
  fillRule?: 'nonzero' | 'evenodd';
}

const COLUMNS = 8;
const META_WIDTH = 256;
/** Image cells: content fits the inner square, leaving this gutter on each side. */
const IMAGE_GUTTER = 8;
const IMAGE_CONTENT = SDF_CELL - 2 * IMAGE_GUTTER;
/** Half the image cell in radius units (the content square spans ±1). */
const IMAGE_CELL_HALF = SDF_CELL / IMAGE_CONTENT;
const GLYPH_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

interface Atlas {
  data: Uint8Array;
  channels: number;
  texture: DataTexture;
}

/** Marker materials to update when a texture or cell changes (see {@link attach}). */
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}
const meta = new Float32Array(META_WIDTH * 2 * 4);
const metaTexture = dataTexture(meta, META_WIDTH, 2, RGBAFormat, FloatType, 'meta');
let sdfAtlas = createAtlas(1, 1);
let imageAtlas = createAtlas(1, 4);

function dataTexture(
  data: Float32Array | Uint8Array,
  width: number,
  height: number,
  format: PixelFormat,
  type: typeof FloatType | typeof UnsignedByteType,
  name: string,
  filters: [MagnificationTextureFilter, MinificationTextureFilter] = [NearestFilter, NearestFilter],
): DataTexture {
  const texture = new DataTexture(data, width, height, format, type);
  texture.magFilter = filters[0];
  texture.minFilter = filters[1];
  texture.generateMipmaps = filters[1] === LinearMipmapLinearFilter;
  texture.colorSpace = NoColorSpace;
  texture.flipY = false;
  texture.unpackAlignment = 1;
  texture.name = `holochart:custom-markers:${name}`;
  texture.needsUpdate = true;
  return texture;
}

function createAtlas(rows: number, channels: number, old?: Atlas): Atlas {
  const width = COLUMNS * SDF_CELL;
  const height = rows * SDF_CELL;
  const data = new Uint8Array(width * height * channels);
  // Empty SDF cells read "far outside".
  if (channels === 1) data.fill(255);
  if (old) data.set(old.data);
  const texture =
    channels === 1
      ? dataTexture(data, width, height, RedFormat, UnsignedByteType, 'sdf', [
          LinearFilter,
          LinearFilter,
        ])
      : dataTexture(data, width, height, RGBAFormat, UnsignedByteType, 'images', [
          LinearFilter,
          LinearMipmapLinearFilter,
        ]);
  old?.texture.dispose();
  return { data, channels, texture };
}

/** The atlas with room for `slot` (a new, larger one when it had none). */
function ensureSlot(atlas: Atlas, slot: number): Atlas {
  const rows = atlasRows(slot + 1, COLUMNS);
  return rows * SDF_CELL > atlas.texture.image.height
    ? createAtlas(rows, atlas.channels, atlas)
    : atlas;
}

/** Copy a cell's pixels (`SDF_CELL²` × channels) into slot `slot`. */
function writeCell(atlas: Atlas, slot: number, pixels: Uint8Array | Uint8ClampedArray): void {
  const [x0, y0] = atlasCell(slot, COLUMNS, SDF_CELL);
  const stride = COLUMNS * SDF_CELL * atlas.channels;
  const row = SDF_CELL * atlas.channels;
  for (let y = 0; y < SDF_CELL; y++) {
    atlas.data.set(
      pixels.subarray(y * row, (y + 1) * row),
      (y0 + y) * stride + x0 * atlas.channels,
    );
  }
  atlas.texture.needsUpdate = true;
}

function setMeta(row: 0 | 1, slot: number, values: [number, number, number, number]): void {
  meta.set(values, (row * META_WIDTH + slot) * 4);
  metaTexture.needsUpdate = true;
}

type Canvas2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

function context2d(): Canvas2D {
  const canvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(SDF_CELL, SDF_CELL)
      : Object.assign(document.createElement('canvas'), { width: SDF_CELL, height: SDF_CELL });
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as Canvas2D | null;
  if (!ctx) throw new Error('no 2D canvas context for custom markers');
  return ctx;
}

/** The custom-marker uniforms of the marker materials. */
export interface CustomMarkerUniforms {
  uCustomSdf: IUniform<Texture | null>;
  uCustomImages: IUniform<Texture | null>;
  uCustomMeta: IUniform<Texture | null>;
}

/**
 * Point a marker material's custom uniforms at the atlases and keep them there (atlases are
 * replaced when they grow); `changed` runs now and after every atlas update (to redraw). Returns
 * the detach function.
 */
export function attach(uniforms: CustomMarkerUniforms, changed: () => void): () => void {
  const sync = (): void => {
    uniforms.uCustomSdf.value = sdfAtlas.texture;
    uniforms.uCustomImages.value = imageAtlas.texture;
    uniforms.uCustomMeta.value = metaTexture;
    changed();
  };
  listeners.add(sync);
  sync();
  return () => listeners.delete(sync);
}

/** The current textures (replaced when an atlas grows). */
export function textures(): { sdf: DataTexture; images: DataTexture; meta: DataTexture } {
  return { sdf: sdfAtlas.texture, images: imageAtlas.texture, meta: metaTexture };
}

/** Rasterize `def` into SDF slot `slot` (replacing what was there). */
export function setSymbol(slot: number, def: SymbolInput): void {
  const viewBox = parseViewBox(def.viewBox);
  if (!viewBox) throw new TypeError(`invalid viewBox ${String(def.viewBox)}`);
  const frame = symbolFrame(viewBox, def.anchor);
  const ctx = context2d();
  ctx.setTransform(
    frame.scale,
    0,
    0,
    frame.scale,
    SDF_CELL / 2 - frame.anchorX * frame.scale,
    SDF_CELL / 2 - frame.anchorY * frame.scale,
  );
  ctx.fillStyle = '#fff';
  ctx.fill(new Path2D(def.path), def.fillRule ?? 'nonzero');
  const rgba = ctx.getImageData(0, 0, SDF_CELL, SDF_CELL).data;
  const coverage = new Float32Array(SDF_CELL * SDF_CELL);
  for (let i = 0; i < coverage.length; i++) coverage[i] = rgba[i * 4 + 3]! / 255;
  const distances = coverageToSdf(coverage, SDF_CELL, SDF_CELL);
  sdfAtlas = ensureSlot(sdfAtlas, slot);
  writeCell(sdfAtlas, slot, encodeSdf(distances, SDF_CELL / (2 * frame.cellHalf)));
  setMeta(0, slot, [frame.extent, frame.cellHalf, 1, 0]);
  notify();
}

/** Premultiply RGBA bytes in place (mipmaps of straight alpha would darken edges). */
export function premultiply(rgba: Uint8Array | Uint8ClampedArray): void {
  for (let i = 0; i < rgba.length; i += 4) {
    const a = rgba[i + 3]! / 255;
    rgba[i] = Math.round(rgba[i]! * a);
    rgba[i + 1] = Math.round(rgba[i + 1]! * a);
    rgba[i + 2] = Math.round(rgba[i + 2]! * a);
  }
}

/**
 * Whether straight-alpha RGBA pixels drawn in white are a single-colored mask: every visible pixel
 * is (almost) white, as for a monochrome glyph (a color emoji has other colors).
 */
export function isMask(rgba: ArrayLike<number>): boolean {
  let visible = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3]! < 16) continue;
    visible++;
    if (rgba[i]! < 235 || rgba[i + 1]! < 235 || rgba[i + 2]! < 235) return false;
  }
  return visible > 0;
}

/** Store drawn cell pixels (straight alpha) in image slot `slot`. */
function storeImage(slot: number, rgba: Uint8ClampedArray, tint: boolean): void {
  premultiply(rgba);
  imageAtlas = ensureSlot(imageAtlas, slot);
  writeCell(imageAtlas, slot, rgba);
  setMeta(1, slot, [1, IMAGE_CELL_HALF, 1, tint ? 1 : 0]);
  notify();
}

async function loadImage(source: string): Promise<HTMLImageElement> {
  const img = new Image();
  // data:/blob: URLs are same-origin; crossOrigin on them breaks some browsers for no benefit.
  if (!/^(?:data|blob):/i.test(source)) img.crossOrigin = 'anonymous';
  img.src = source;
  await img.decode();
  return img;
}

/**
 * Decode `source` (URL or data URI) into image slot `slot`: fitted into the cell's content square
 * keeping its aspect ratio, centered; `text:…` sources are glyphs ({@link setText}). Rejects when
 * it cannot be loaded or read (a cross-origin image without CORS headers taints the canvas); the
 * slot then stays hidden.
 */
export async function setImage(slot: number, source: string): Promise<void> {
  if (source.startsWith('text:')) return setText(slot, source.slice(5));
  const img = await loadImage(source);
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!(w > 0 && h > 0)) throw new Error(`marker image ${source.slice(0, 60)} is empty`);
  const k = IMAGE_CONTENT / Math.max(w, h);
  const ctx = context2d();
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, (SDF_CELL - w * k) / 2, (SDF_CELL - h * k) / 2, w * k, h * k);
  storeImage(slot, ctx.getImageData(0, 0, SDF_CELL, SDF_CELL).data, false);
}

/**
 * Draw the text glyph(s) `text` (`marker.symbol: 'text:…'`) into image slot `slot`, scaled so its
 * ink box fits the cell's content square, in white: color emoji keep their colors, anything else
 * becomes a mask tinted with the marker color.
 */
export function setText(slot: number, text: string): void {
  const ctx = context2d();
  const probe = 100;
  ctx.font = `${probe}px ${GLYPH_FONT}`;
  const m = ctx.measureText(text);
  const left = m.actualBoundingBoxLeft;
  const width = left + m.actualBoundingBoxRight;
  const height = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
  if (!(width > 0 && height > 0)) throw new Error(`marker glyph ${text} has no ink`);
  const k = IMAGE_CONTENT / Math.max(width, height);
  ctx.setTransform(
    k,
    0,
    0,
    k,
    SDF_CELL / 2 + (left - width / 2) * k,
    SDF_CELL / 2 + ((m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2) * k,
  );
  ctx.fillStyle = '#fff';
  ctx.fillText(text, 0, 0);
  const rgba = ctx.getImageData(0, 0, SDF_CELL, SDF_CELL).data;
  storeImage(slot, rgba, isMask(rgba));
}

// ---- shader code ------------------------------------------------------------------------------
// Codes (see custom.ts): 1000 + 8 × slot + kind; kind 0–3 = SDF symbol variant, 4 = image.

const VERTEX_PARTS: Record<string, string> = {
  decl: `uniform sampler2D uCustomMeta;
flat out int vCustomSlot;`,
  decode: `int cSlot = -1;
  int cKind = 0;
  if (code >= 1000) {
    cSlot = (code - 1000) / 8;
    cKind = code - 1000 - 8 * cSlot;
    code = cKind < 4 ? 100 * cKind : 0;
  }`,
  meta: `vec4 cMeta = vec4(0.0, 0.0, 1.0, 0.0);
  if (cSlot >= 0) {
    cMeta = texelFetch(uCustomMeta, ivec2(cSlot, cKind == 4 ? 1 : 0), 0);
    extent = cMeta.x;
    meta = vec4(cKind == 4 ? 4.0 : 3.0, extent, cMeta.w, 0.0);
  }`,
  hidden: `#ifndef MARKER_SYMBOL
  hidden = hidden || cMeta.z < 0.5;
#endif`,
  stroke: `#ifndef MARKER_SYMBOL
  if (cKind == 4) lw = 0.0;
#endif`,
  varyings: `#ifndef MARKER_SYMBOL
  vCustomSlot = cSlot;
  vShape.w = cMeta.y;
  if (cKind == 4 && cMeta.w < 0.5) vFill = vec4(1.0, 1.0, 1.0, opacity);
#endif`,
};

const FRAGMENT_PARTS: Record<string, string> = {
  decl: `uniform sampler2D uCustomSdf;
uniform sampler2D uCustomImages;
flat in int vCustomSlot;
#define CUSTOM_CELL ${SDF_CELL.toFixed(1)}
#define CUSTOM_SPREAD ${SDF_SPREAD.toFixed(6)}
// Texture coordinates of q (cell-relative, ±0.5, y up) in atlas cell \`slot\`.
vec2 customUv(sampler2D atlas, int slot, vec2 q) {
  vec2 size = vec2(textureSize(atlas, 0));
  int cols = int(size.x / CUSTOM_CELL);
  vec2 cell = vec2(float(slot - (slot / cols) * cols), float(slot / cols)) * CUSTOM_CELL;
  vec2 t = cell + vec2(0.5 + q.x, 0.5 - q.y) * CUSTOM_CELL;
  return clamp(t, cell + 0.5, cell + CUSTOM_CELL - 0.5) / size;
}
// Signed distance (radius units) to a custom symbol's edge; beyond the cell, plus the way there.
float customSdf(vec2 p, int slot, float hc) {
  vec2 q = clamp(p, -hc, hc);
  float v = texture(uCustomSdf, customUv(uCustomSdf, slot, q / (2.0 * hc))).r;
  return (v - 0.5) * (2.0 * CUSTOM_SPREAD) + length(p - q);
}
// Premultiplied image texel; the mip level follows the drawn size (at most level 3: the gutter).
vec4 customImage(vec2 p, int slot, float hc, float rDevice) {
  if (abs(p.x) > hc || abs(p.y) > hc) return vec4(0.0);
  float lod = clamp(log2(CUSTOM_CELL / (2.0 * hc * rDevice)), 0.0, 3.0);
  return textureLod(uCustomImages, customUv(uCustomImages, slot, p / (2.0 * hc)), lod);
}`,
  area: `if (areaKind == 3) dArea = customSdf(p, vCustomSlot, vShape.w) * r;`,
  color: `if (areaKind == 4) {
    vec4 t = customImage(p, vCustomSlot, vShape.w, r * uPixelRatio);
    color = noDot == 1 ? fillP * t.a : t * vFill.a;
  }`,
};

function inject(source: string, parts: Record<string, string>): string {
  return source.replace(/^([ \t]*).*\/\/ @custom-([a-z]+).*$/gm, (line, indent: string, hook) => {
    const part = parts[hook as string];
    return part === undefined ? line : indent + part;
  });
}

const injected = new Map<string, string>();

/** The marker vertex (`fragment` false) or fragment shader with the custom-marker code in. */
export function customShader(source: string, fragment: boolean): string {
  let out = injected.get(source);
  if (out === undefined) {
    out = inject(source, fragment ? FRAGMENT_PARTS : VERTEX_PARTS);
    injected.set(source, out);
  }
  return out;
}
