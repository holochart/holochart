import pngjs from 'pngjs';
import { describe, expect, it } from 'vitest';
import { comparePng } from './compare.ts';

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
