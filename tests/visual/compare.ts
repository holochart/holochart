import pixelmatch from 'pixelmatch';
import pngjs from 'pngjs';

const { PNG } = pngjs;

/** Default max fraction of differing pixels (overridden per example by `meta.testTolerance`). */
export const DEFAULT_TOLERANCE = 0.001;

/** Per-pixel YIQ color distance below which pixels count as equal (pixelmatch `threshold`). */
export const PIXEL_THRESHOLD = 0.1;

/**
 * Side of the square windows of the local check, px. Windows overlap by half (a 16 px stride), so
 * a cluster of differences on a window edge is still counted whole by one of them.
 */
export const TILE_SIZE = 32;

/**
 * Default max fraction of differing pixels in any one window (overridden per example by
 * `meta.testTileTolerance`): 16 of 1,024 px. The whole-image fraction lets a moved title pass
 * (thin text changes few pixels overall, plan E20.3), but moved text concentrates its differences:
 * a title moved from left to centre differs by about 100 px in its worst window. SwiftShader
 * renders are pixel-identical run to run and across macOS and Linux (docs/spikes/e-determinism.md),
 * so the local check only has to leave room for isolated edge pixels.
 */
export const DEFAULT_TILE_TOLERANCE = 16 / (TILE_SIZE * TILE_SIZE);

/** Options of {@link comparePng}. */
export interface CompareOptions {
  /** Max fraction of differing pixels over the whole image (default {@link DEFAULT_TOLERANCE}). */
  tolerance?: number;
  /** Max fraction of differing pixels in any window (default {@link DEFAULT_TILE_TOLERANCE}). */
  tileTolerance?: number;
  /**
   * Pixels exempt from the window check (still counted in the whole-image fraction): a
   * `width × height` mask, non-zero = exempt. The visual suite passes the DOM-drawn parts of the
   * example (hover labels, menus, sliders), whose text the OS rasterizes: fonts differ between
   * macOS and the Linux CI image, so their pixels legitimately differ there. Windows that touch an
   * exempt pixel are skipped.
   */
  exempt?: Uint8Array;
}

export interface CompareResult {
  /**
   * True when the images have the same size, the differing fraction is within tolerance and no
   * window (outside the exempt pixels) exceeds the tile tolerance.
   */
  pass: boolean;
  /** Human-readable summary, suitable for an assertion message. */
  message: string;
  diffPixels: number;
  totalPixels: number;
  /** `diffPixels / totalPixels` (1 when the sizes differ). */
  ratio: number;
  /**
   * Differing pixels in the worst {@link TILE_SIZE} window checked (not exempt); the window's
   * top-left corner is `tileX`, `tileY`. `totalPixels` when the sizes differ.
   */
  tileDiffPixels: number;
  tileX: number;
  tileY: number;
  /**
   * Pixels whose RGBA differs at all (no threshold, no anti-aliasing detection), for reporting
   * only: it shows drift hidden inside the pixelmatch tolerance (plan E20.9). Equals
   * `totalPixels` when the sizes differ.
   */
  exactPixels: number;
  /** Largest absolute per-channel difference over all pixels (0–255; 255 when sizes differ). */
  maxDelta: number;
  /** PNG highlighting differing pixels; absent when the sizes differ. */
  diffPng?: Buffer;
}

/** Strict comparison of two same-size RGBA buffers: differing pixels and the largest channel Δ. */
export function exactDiff(a: Uint8Array, b: Uint8Array): { pixels: number; maxDelta: number } {
  let pixels = 0;
  let maxDelta = 0;
  for (let i = 0; i < a.length; i += 4) {
    let d = 0;
    for (let c = 0; c < 4; c++) d = Math.max(d, Math.abs(a[i + c]! - b[i + c]!));
    if (d) pixels++;
    if (d > maxDelta) maxDelta = d;
  }
  return { pixels, maxDelta };
}

/**
 * The worst {@link TILE_SIZE} window of a diff: counts `isDiff` pixels per half-size cell, then
 * sums 2 × 2 cells (windows at a half-size stride, clipped at the image edges). Windows with an
 * exempt pixel are skipped.
 */
export function worstWindow(
  width: number,
  height: number,
  isDiff: (i: number) => boolean,
  exempt?: Uint8Array,
): { pixels: number; x: number; y: number } {
  const cell = TILE_SIZE / 2;
  const cols = Math.ceil(width / cell);
  const rows = Math.ceil(height / cell);
  const counts = new Uint32Array(cols * rows);
  const blocked = new Uint8Array(cols * rows);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const c = Math.floor(y / cell) * cols + Math.floor(x / cell);
      if (exempt?.[i]) blocked[c] = 1;
      else if (isDiff(i)) counts[c]!++;
    }
  }
  let worst = { pixels: 0, x: 0, y: 0 };
  for (let r = 0; r < Math.max(rows - 1, 1); r++) {
    for (let q = 0; q < Math.max(cols - 1, 1); q++) {
      let sum = 0;
      let skip = false;
      for (let dr = 0; dr < 2 && r + dr < rows; dr++) {
        for (let dq = 0; dq < 2 && q + dq < cols; dq++) {
          const c = (r + dr) * cols + q + dq;
          if (blocked[c]) skip = true;
          sum += counts[c]!;
        }
      }
      if (!skip && sum > worst.pixels) worst = { pixels: sum, x: q * cell, y: r * cell };
    }
  }
  return worst;
}

/**
 * Compares two PNG buffers with pixelmatch: the fraction of differing pixels over the whole image
 * must be within `tolerance`, and the fraction in every {@link TILE_SIZE} window (outside
 * `exempt`) within `tileTolerance`, so localized changes such as moved text fail (plan E20.3).
 * A number as the third argument is the whole-image tolerance.
 */
export function comparePng(
  actual: Buffer,
  baseline: Buffer,
  options: number | CompareOptions = {},
): CompareResult {
  const opts = typeof options === 'number' ? { tolerance: options } : options;
  const tolerance = opts.tolerance ?? DEFAULT_TOLERANCE;
  const tileTolerance = opts.tileTolerance ?? DEFAULT_TILE_TOLERANCE;
  const a = PNG.sync.read(actual);
  const b = PNG.sync.read(baseline);
  if (a.width !== b.width || a.height !== b.height) {
    const totalPixels = a.width * a.height;
    return {
      pass: false,
      message: `size mismatch: actual ${a.width}×${a.height}, baseline ${b.width}×${b.height}`,
      diffPixels: totalPixels,
      totalPixels,
      ratio: 1,
      tileDiffPixels: totalPixels,
      tileX: 0,
      tileY: 0,
      exactPixels: totalPixels,
      maxDelta: 255,
    };
  }
  const { width, height } = a;
  const diff = new PNG({ width, height });
  const diffPixels = pixelmatch(a.data, b.data, diff.data, width, height, {
    threshold: PIXEL_THRESHOLD,
  });
  const totalPixels = width * height;
  const ratio = totalPixels ? diffPixels / totalPixels : 0;
  // Differing pixels are the ones pixelmatch painted in its diff color (pure red; anti-aliased
  // pixels are yellow, equal ones gray).
  const d = diff.data;
  const worst = worstWindow(
    width,
    height,
    (i) => d[4 * i] === 255 && d[4 * i + 1] === 0 && d[4 * i + 2] === 0,
    opts.exempt,
  );
  const tileLimit = Math.floor(tileTolerance * TILE_SIZE * TILE_SIZE);
  const pass = ratio <= tolerance && worst.pixels <= tileLimit;
  const exact = exactDiff(a.data, b.data);
  return {
    pass,
    message:
      `${diffPixels} of ${totalPixels} pixels differ (${(ratio * 100).toFixed(4)}%, ` +
      `tolerance ${(tolerance * 100).toFixed(4)}%); worst ${TILE_SIZE} px window: ` +
      `${worst.pixels} px at (${worst.x}, ${worst.y}) (limit ${tileLimit}); ` +
      `exact: ${exact.pixels} px, max Δ ${exact.maxDelta}`,
    diffPixels,
    totalPixels,
    ratio,
    tileDiffPixels: worst.pixels,
    tileX: worst.x,
    tileY: worst.y,
    exactPixels: exact.pixels,
    maxDelta: exact.maxDelta,
    diffPng: PNG.sync.write(diff),
  };
}

/** How far the DOM mask of {@link domMask} extends past the DOM-drawn pixels, px. */
export const DOM_MASK_MARGIN = 6;

/**
 * Pixels drawn by DOM elements (hover labels, menus, sliders, the modebar): where a screenshot
 * with the example's canvases hidden differs from one with everything hidden, grown by `margin`
 * px (DOM text of a different font can be a little wider or narrower). Returns a
 * `width × height` mask for {@link CompareOptions.exempt}, or `undefined` when nothing is DOM.
 */
export function domMask(
  withoutCanvas: Buffer,
  withoutAnything: Buffer,
  margin: number = DOM_MASK_MARGIN,
): Uint8Array | undefined {
  const a = PNG.sync.read(withoutCanvas);
  const b = PNG.sync.read(withoutAnything);
  if (a.width !== b.width || a.height !== b.height) return undefined;
  const { width, height } = a;
  const rows = new Uint8Array(width * height);
  let any = false;
  // Grow horizontally while marking, then vertically.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      let same = true;
      for (let c = 0; c < 4 && same; c++) same = a.data[4 * i + c] === b.data[4 * i + c];
      if (same) continue;
      any = true;
      const x0 = Math.max(0, x - margin);
      const x1 = Math.min(width - 1, x + margin);
      rows.fill(1, y * width + x0, y * width + x1 + 1);
    }
  }
  if (!any) return undefined;
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!rows[y * width + x]) continue;
      for (let yy = Math.max(0, y - margin); yy <= Math.min(height - 1, y + margin); yy++) {
        mask[yy * width + x] = 1;
      }
    }
  }
  return mask;
}
