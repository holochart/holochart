/**
 * Text decoration lines (Plotly `font.lineposition`: underline, overline, line-through) for the
 * text primitive (plan E8.3).
 *
 * troika has no text decorations, so the primitive draws them itself: one mesh per primitive, one
 * instanced unit quad per decoration line, created only when some label is decorated. Never one
 * object per label (`holochart/no-per-point-objects`).
 *
 * - Geometry comes from troika's typeset result ({@link computeDecorationRects}, pure and unit
 *   tested): per line, the extent of the visible glyphs' caret positions, at the baseline found
 *   from `topBaseline` and the line advance.
 * - Placement: each quad's matrix is its label member's matrix (local to the batch) times the
 *   decoration rect. The matrices live in a float data texture rather than instanced attributes,
 *   like troika's `BatchedText` does: three uploads instanced attributes *before* `onBeforeRender`,
 *   where per-frame placement (billboards, screen-size text) happens, whereas textures upload when
 *   bound, so decorations follow their labels in the same frame.
 * - Colors are the labels' sRGB colors, written unconverted like every other chart primitive.
 *
 * Imports three but not troika, so it is safe for the initial bundle chunk.
 */
import {
  DataTexture,
  DoubleSide,
  FloatType,
  Mesh,
  NearestFilter,
  RGBAFormat,
  type ShaderMaterial,
} from 'three';
import type { RGBA, ResourceManager } from '../types.ts';
import {
  UNIT_QUAD_KEY,
  acquireInstancedGeometry,
  createPrimitiveMaterial,
  createUnitQuadTemplate,
} from './common.ts';
import type { TextDecorationLines } from './text-style.ts';

/** The subset of troika's `textRenderInfo` decoration geometry is derived from. */
export interface DecorationLayoutInfo {
  /**
   * Per UTF-16 code unit of the text: `startX, endX, bottomY, topY` of its caret box, in the
   * text's local units (troika's `caretPositions`). Carets share `bottomY`/`topY` within a line.
   */
  caretPositions?: ArrayLike<number> | null;
  /** y of the first line's baseline. */
  topBaseline: number;
}

/** Sizes for {@link computeDecorationRects}, in the text's local units (font units). */
export interface DecorationMetrics {
  /** The font size the text was typeset at. */
  fontSize: number;
  /** Distance between consecutive baselines (`fontSize * lineHeight`). */
  lineAdvance: number;
  /** Minimum line thickness (1 px for screen-sized text, 0 for world-sized text). Default 1. */
  minThickness?: number;
}

/** Underline center below the baseline, in em (close to typical fonts' underline position). */
export const UNDERLINE_OFFSET = 0.1;
/** Line-through center above the baseline, in em (about half the x-height). */
export const LINE_THROUGH_OFFSET = 0.3;
/** Line thickness in em (before the minimum). */
export const DECORATION_THICKNESS = 1 / 14;

/**
 * troika's caret bottom is about the font's descender below the baseline; this estimate (in em)
 * only has to be within half a line advance of it to find each line's baseline.
 */
const CARET_BOTTOM_ESTIMATE = 0.2;

/**
 * Decoration rects of one typeset label, appended to `out` as `x0, y0, x1, y1` quadruples in the
 * label's local units (+y up, the frame troika typesets in).
 *
 * Per line (a run of carets sharing a bottom), the rect spans the carets of the non-whitespace
 * characters, so leading/trailing spaces and line breaks are not underlined. Baselines are
 * `topBaseline − i·lineAdvance` for line `i`. Underline: centered {@link UNDERLINE_OFFSET} em below
 * the baseline; overline: just under the caret top (the ascender line); line-through: centered
 * {@link LINE_THROUGH_OFFSET} em above the baseline. Thickness: `max(minThickness, fontSize / 14)`.
 */
export function computeDecorationRects(
  info: DecorationLayoutInfo,
  text: string,
  lines: TextDecorationLines,
  metrics: DecorationMetrics,
  out: number[] = [],
): number[] {
  const carets = info.caretPositions;
  const { fontSize, lineAdvance } = metrics;
  if (!carets || !(fontSize > 0) || !(lineAdvance > 0)) return out;
  if (!lines.under && !lines.over && !lines.through) return out;
  const thickness = Math.max(metrics.minThickness ?? 1, fontSize * DECORATION_THICKNESS);
  const half = thickness / 2;
  const eps = fontSize * 1e-3;
  const n = Math.min(text.length, Math.floor(carets.length / 4));

  let open = false;
  let x0 = 0;
  let x1 = 0;
  let bottom = 0;
  let top = 0;
  const flush = (): void => {
    if (!open) return;
    open = false;
    const line = Math.max(
      0,
      Math.round((info.topBaseline - bottom - CARET_BOTTOM_ESTIMATE * fontSize) / lineAdvance),
    );
    const baseline = info.topBaseline - line * lineAdvance;
    if (lines.under) {
      const y = baseline - UNDERLINE_OFFSET * fontSize;
      out.push(x0, y - half, x1, y + half);
    }
    if (lines.over) out.push(x0, top - thickness, x1, top);
    if (lines.through) {
      const y = baseline + LINE_THROUGH_OFFSET * fontSize;
      out.push(x0, y - half, x1, y + half);
    }
  };

  for (let i = 0; i < n; i++) {
    if (/\s/.test(text.charAt(i))) continue;
    const a = carets[i * 4]!;
    const b = carets[i * 4 + 1]!;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const bot = carets[i * 4 + 2]!;
    const tp = carets[i * 4 + 3]!;
    if (a === 0 && b === 0 && bot === 0 && tp === 0) continue; // no caret recorded
    if (open && Math.abs(bot - bottom) <= eps) {
      x0 = Math.min(x0, lo);
      x1 = Math.max(x1, hi);
      top = Math.max(top, tp);
    } else {
      flush();
      open = true;
      x0 = lo;
      x1 = hi;
      bottom = bot;
      top = tp;
    }
  }
  flush();
  return out;
}

/**
 * Write the matrix of a unit-quad instance covering `rect` = `[x0, y0, x1, y1]` in the space of
 * `matrix` (column-major 4×4): only columns 0, 1, and 3 are needed since quads lie in z = 0.
 * `out` receives 12 floats at `offset`: `x̂·w`, `ŷ·h`, and the transformed corner `(x0, y0)`.
 */
export function decorationInstanceColumns(
  matrix: ArrayLike<number>,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  out: Float32Array,
  offset: number,
): void {
  const w = x1 - x0;
  const h = y1 - y0;
  for (let r = 0; r < 4; r++) {
    const c0 = matrix[r]!;
    const c1 = matrix[4 + r]!;
    const c3 = matrix[12 + r]!;
    out[offset + r] = c0 * w;
    out[offset + 4 + r] = c1 * h;
    out[offset + 8 + r] = c0 * x0 + c1 * y0 + c3;
  }
}

/** Texels per decoration: 3 matrix columns + color. */
const TEXELS = 4;
/** Data texture width in texels (a multiple of {@link TEXELS}, so an instance never wraps rows). */
const TEXTURE_WIDTH = 1024;

const VERTEX_SHADER = /* glsl */ `
uniform highp sampler2D uDecorations;

flat out vec4 vColor;

vec4 texel(int i) {
  return texelFetch(uDecorations, ivec2(i % ${TEXTURE_WIDTH}, i / ${TEXTURE_WIDTH}), 0);
}

void main() {
  int base = gl_InstanceID * ${TEXELS};
  vec4 local = texel(base + 2) + position.x * texel(base) + position.y * texel(base + 1);
  vColor = texel(base + 3);
  gl_Position = projectionMatrix * modelViewMatrix * local;
}
`;

const FRAGMENT_SHADER = /* glsl */ `
flat in vec4 vColor;

out highp vec4 fragColor;

void main() {
  if (vColor.a <= 0.0) discard;
  fragColor = vColor;
}
`;

/**
 * All decoration lines of one text primitive, in one draw call. Fill it with
 * {@link TextDecorationLayer.begin} / {@link TextDecorationLayer.add} /
 * {@link TextDecorationLayer.end}, then {@link TextDecorationLayer.place} whenever the label
 * members' matrices change.
 */
export class TextDecorationLayer {
  /** Add next to the text batch (same parent space as the batch's members). */
  readonly mesh: Mesh;
  private readonly material: ShaderMaterial;
  private readonly buffers: ReturnType<typeof acquireInstancedGeometry>;
  private readonly dataUniform: { value: DataTexture | null } = { value: null };
  private texture: DataTexture | null = null;
  private capacity = 0;
  private count = 0;
  /** Per instance: owning member index. */
  private owners = new Int32Array(0);
  /** Per instance: rect `x0, y0, x1, y1` in member-local units. */
  private rects = new Float32Array(0);
  /** Per instance: straight-alpha sRGB color. */
  private colors = new Float32Array(0);

  constructor(resources: ResourceManager) {
    this.buffers = acquireInstancedGeometry(resources, UNIT_QUAD_KEY, createUnitQuadTemplate);
    this.material = createPrimitiveMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      uniforms: { uDecorations: this.dataUniform },
    });
    // Rotated or billboarded labels may face away; text is double-sided too.
    this.material.side = DoubleSide;
    this.mesh = new Mesh(this.buffers.geometry, this.material);
    this.mesh.name = 'holochart:text-decorations';
    // The unit quad's bounds say nothing about where the instances are.
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  /** Number of decoration lines. */
  get instanceCount(): number {
    return this.count;
  }

  /** Start a new set of decorations (drops the previous ones). */
  begin(): void {
    this.count = 0;
  }

  /** Add the rects (`x0, y0, x1, y1` quadruples) of member `owner`, drawn in `color`. */
  add(owner: number, rects: readonly number[], color: RGBA): void {
    const n = Math.floor(rects.length / 4);
    this.reserve(this.count + n);
    const alpha = Number.isFinite(color[3]) ? Math.min(1, Math.max(0, color[3])) : 1;
    for (let k = 0; k < n; k++) {
      const i = this.count++;
      this.owners[i] = owner;
      for (let c = 0; c < 4; c++) this.rects[i * 4 + c] = rects[k * 4 + c]!;
      this.colors[i * 4] = color[0];
      this.colors[i * 4 + 1] = color[1];
      this.colors[i * 4 + 2] = color[2];
      this.colors[i * 4 + 3] = alpha;
    }
  }

  /** Finish the set started by {@link begin}. */
  end(): void {
    this.buffers.geometry.instanceCount = this.count;
    this.mesh.visible = this.count > 0;
  }

  /**
   * Write every instance's matrix from its member's current matrix (`matrixOf(owner)`,
   * column-major, local to the batch) and flag the texture for upload.
   */
  place(matrixOf: (owner: number) => ArrayLike<number> | null): void {
    if (this.count === 0) return;
    const texture = this.ensureTexture();
    const data = texture.image.data as Float32Array;
    for (let i = 0; i < this.count; i++) {
      const offset = i * TEXELS * 4;
      const matrix = matrixOf(this.owners[i]!);
      if (!matrix) {
        // No member any more: collapse the quad.
        data.fill(0, offset, offset + 12);
      } else {
        const r = i * 4;
        decorationInstanceColumns(
          matrix,
          this.rects[r]!,
          this.rects[r + 1]!,
          this.rects[r + 2]!,
          this.rects[r + 3]!,
          data,
          offset,
        );
      }
      data.set(this.colors.subarray(i * 4, i * 4 + 4), offset + 12);
    }
    texture.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.texture?.dispose();
    this.texture = null;
    this.material.dispose();
    this.buffers.release();
  }

  private reserve(n: number): void {
    if (n <= this.owners.length) return;
    const size = Math.max(16, 2 ** Math.ceil(Math.log2(n)));
    const owners = new Int32Array(size);
    owners.set(this.owners);
    const rects = new Float32Array(size * 4);
    rects.set(this.rects);
    const colors = new Float32Array(size * 4);
    colors.set(this.colors);
    this.owners = owners;
    this.rects = rects;
    this.colors = colors;
  }

  /** The data texture, (re)allocated to hold at least {@link count} instances. */
  private ensureTexture(): DataTexture {
    if (this.texture && this.capacity >= this.count) return this.texture;
    const perRow = TEXTURE_WIDTH / TEXELS;
    const rows = Math.max(1, 2 ** Math.ceil(Math.log2(Math.ceil(this.count / perRow))));
    const texture = new DataTexture(
      new Float32Array(TEXTURE_WIDTH * rows * 4),
      TEXTURE_WIDTH,
      rows,
      RGBAFormat,
      FloatType,
    );
    texture.minFilter = NearestFilter;
    texture.magFilter = NearestFilter;
    texture.generateMipmaps = false;
    this.texture?.dispose();
    this.texture = texture;
    this.capacity = perRow * rows;
    this.dataUniform.value = texture;
    return texture;
  }
}
