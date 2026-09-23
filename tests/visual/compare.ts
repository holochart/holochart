import pixelmatch from 'pixelmatch';
import pngjs from 'pngjs';

const { PNG } = pngjs;

/** Default max fraction of differing pixels (overridden per example by `meta.testTolerance`). */
export const DEFAULT_TOLERANCE = 0.001;

/** Per-pixel YIQ color distance below which pixels count as equal (pixelmatch `threshold`). */
export const PIXEL_THRESHOLD = 0.1;

export interface CompareResult {
  /** True when the images have the same size and the differing fraction is within tolerance. */
  pass: boolean;
  /** Human-readable summary, suitable for an assertion message. */
  message: string;
  diffPixels: number;
  totalPixels: number;
  /** `diffPixels / totalPixels` (1 when the sizes differ). */
  ratio: number;
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

/** Compares two PNG buffers with pixelmatch against a tolerated fraction of differing pixels. */
export function comparePng(
  actual: Buffer,
  baseline: Buffer,
  tolerance: number = DEFAULT_TOLERANCE,
): CompareResult {
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
  const pass = ratio <= tolerance;
  const exact = exactDiff(a.data, b.data);
  return {
    pass,
    message:
      `${diffPixels} of ${totalPixels} pixels differ (${(ratio * 100).toFixed(4)}%, ` +
      `tolerance ${(tolerance * 100).toFixed(4)}%); exact: ${exact.pixels} px, max Δ ${exact.maxDelta}`,
    diffPixels,
    totalPixels,
    ratio,
    exactPixels: exact.pixels,
    maxDelta: exact.maxDelta,
    diffPng: PNG.sync.write(diff),
  };
}
