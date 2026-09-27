import pngjs from 'pngjs';
import { describe, expect, it } from 'vitest';
import { comparePng, domMask, worstWindow } from './compare.ts';

const { PNG } = pngjs;

function solid(width: number, height: number, rgba: [number, number, number, number]): Buffer {
  const png = new PNG({ width, height });
  for (let i = 0; i < width * height; i++) png.data.set(rgba, i * 4);
  return PNG.sync.write(png);
}

function withDot(base: Buffer, x: number, y: number): Buffer {
  const png = PNG.sync.read(base);
  png.data.set([255, 0, 0, 255], (y * png.width + x) * 4);
  return PNG.sync.write(png);
}

describe('comparePng', () => {
  const white = solid(100, 100, [255, 255, 255, 255]);

  it('passes identical images', () => {
    const result = comparePng(white, white);
    expect(result.pass).toBe(true);
    expect(result.diffPixels).toBe(0);
    expect(result.diffPng).toBeInstanceOf(Buffer);
  });

  it('applies the tolerance as a fraction of pixels', () => {
    const changed = withDot(withDot(white, 10, 10), 50, 50); // 2 / 10 000 = 0.0002
    expect(comparePng(changed, white, 0.001).pass).toBe(true);
    const strict = comparePng(changed, white, 0.0001);
    expect(strict.pass).toBe(false);
    expect(strict.diffPixels).toBe(2);
    expect(strict.ratio).toBeCloseTo(0.0002);
  });

  it('fails on a size mismatch without a diff image', () => {
    const result = comparePng(solid(10, 10, [0, 0, 0, 255]), solid(10, 11, [0, 0, 0, 255]));
    expect(result.pass).toBe(false);
    expect(result.message).toMatch(/size mismatch/);
    expect(result.diffPng).toBeUndefined();
    expect(result.exactPixels).toBe(100);
    expect(result.maxDelta).toBe(255);
  });

  it('reports exact differences that pixelmatch tolerates', () => {
    const png = PNG.sync.read(white);
    png.data.set([253, 255, 255, 255], 0); // Δ2 on one channel: below the YIQ threshold
    png.data.set([255, 255, 250, 255], 4 * 99); // Δ5
    const result = comparePng(PNG.sync.write(png), white);
    expect(result.diffPixels).toBe(0);
    expect(result.exactPixels).toBe(2);
    expect(result.maxDelta).toBe(5);
    expect(result.message).toMatch(/exact: 2 px, max Δ 5/);
  });

  it('reports zero exact difference for identical images', () => {
    const result = comparePng(white, white);
    expect(result.exactPixels).toBe(0);
    expect(result.maxDelta).toBe(0);
  });
});

const W = 720;
const H = 420;

/**
 * A light "title" on a dark 720 × 420 image (a typical example size): 1 px vertical strokes 4 px
 * apart and 11 px tall (like 11 px text), `width` px wide, starting at `x`.
 */
function titled(x: number, width = 160): Buffer {
  const png = PNG.sync.read(solid(W, H, [10, 10, 15, 255]));
  for (let y = 6; y < 17; y++) {
    for (let i = x; i < x + width; i += 4) png.data.set([236, 238, 244, 255], (y * W + i) * 4);
  }
  return PNG.sync.write(png);
}

describe('comparePng window check (E20.3)', () => {
  it('fails a title moved from left to centre that the whole-image fraction lets pass', () => {
    const left = titled(4);
    const centre = titled(160);
    const result = comparePng(centre, left, 0.004);
    // Few pixels overall: within the example tolerances the suite used to rely on alone.
    expect(result.ratio).toBeLessThan(0.004);
    expect(result.tileDiffPixels).toBeGreaterThan(16);
    expect(result.pass).toBe(false);
    expect(result.message).toMatch(/worst 32 px window: \d+ px at \(\d+, \d+\) \(limit 16\)/);
    // A 2 px nudge of the same title fails too.
    expect(comparePng(titled(6), left, 0.004).pass).toBe(false);
  });

  it('tolerates isolated pixel noise spread over the image', () => {
    const png = PNG.sync.read(titled(4));
    // One differing pixel every 40 px: a lot overall, never more than a few per window.
    for (let y = 30; y < H; y += 40) {
      for (let x = 0; x < W; x += 40) png.data.set([255, 0, 0, 255], (y * W + x) * 4);
    }
    const result = comparePng(PNG.sync.write(png), titled(4), 0.004);
    expect(result.diffPixels).toBeGreaterThan(50);
    expect(result.tileDiffPixels).toBeLessThanOrEqual(4);
    expect(result.pass).toBe(true);
  });

  it('counts a cluster on a window edge whole (overlapping windows)', () => {
    const png = PNG.sync.read(solid(96, 96, [255, 255, 255, 255]));
    // 6 × 4 px straddling the edges at x = 32 and y = 32 of the aligned tiles.
    for (let y = 30; y < 34; y++) {
      for (let x = 29; x < 35; x++) png.data.set([0, 0, 0, 255], (y * 96 + x) * 4);
    }
    const result = comparePng(PNG.sync.write(png), solid(96, 96, [255, 255, 255, 255]), 1);
    expect(result.tileDiffPixels).toBe(24);
    expect(result.pass).toBe(false);
    expect(
      comparePng(PNG.sync.write(png), solid(96, 96, [255, 255, 255, 255]), {
        tolerance: 1,
        tileTolerance: 24 / 1024,
      }).pass,
    ).toBe(true);
  });

  it('skips windows touching exempt (DOM-drawn) pixels, but counts them overall', () => {
    const exempt = new Uint8Array(W * H);
    exempt.fill(1, 0, 24 * W);
    const moved = comparePng(titled(160), titled(4), { tolerance: 0.004, exempt });
    expect(moved.tileDiffPixels).toBe(0);
    expect(moved.diffPixels).toBeGreaterThan(0);
    expect(moved.pass).toBe(true);
    expect(comparePng(titled(160), titled(4), { tolerance: 0.0001, exempt }).pass).toBe(false);
  });
});

describe('worstWindow', () => {
  it('handles images smaller than a window', () => {
    expect(worstWindow(5, 3, (i) => i % 2 === 0)).toEqual({ pixels: 8, x: 0, y: 0 });
  });
});

describe('domMask', () => {
  it('marks where DOM elements drew, grown by the margin', () => {
    const empty = solid(40, 30, [255, 255, 255, 255]);
    const label = PNG.sync.read(empty);
    label.data.set([0, 0, 0, 255], (10 * 40 + 20) * 4);
    const mask = domMask(PNG.sync.write(label), empty, 2);
    if (!mask) throw new Error('no mask');
    const on = (x: number, y: number) => mask[y * 40 + x];
    expect(on(20, 10)).toBe(1);
    expect(on(22, 12)).toBe(1);
    expect(on(18, 8)).toBe(1);
    expect(on(23, 10)).toBe(0);
    expect(on(20, 13)).toBe(0);
    expect(mask.reduce((n, v) => n + v, 0)).toBe(25);
  });

  it('is undefined when no DOM element drew', () => {
    const empty = solid(8, 8, [255, 255, 255, 255]);
    expect(domMask(empty, empty)).toBeUndefined();
  });
});
