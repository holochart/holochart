import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  atlasCell,
  atlasRows,
  coverageToSdf,
  decodeSdf,
  edt2d,
  encodeSdf,
  parseViewBox,
  SDF_SPREAD,
  symbolFrame,
} from './custom-sdf.ts';

/** Anti-aliased coverage of a disk (16× supersampled), like a canvas fill. */
function diskCoverage(size: number, cx: number, cy: number, radius: number): Float32Array {
  const out = new Float32Array(size * size);
  const n = 4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let hits = 0;
      for (let sy = 0; sy < n; sy++) {
        for (let sx = 0; sx < n; sx++) {
          const px = x + (sx + 0.5) / n;
          const py = y + (sy + 0.5) / n;
          if (Math.hypot(px - cx, py - cy) <= radius) hits++;
        }
      }
      out[y * size + x] = hits / (n * n);
    }
  }
  return out;
}

describe('edt2d', () => {
  it('matches a brute-force squared distance transform', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 9 }),
        fc.integer({ min: 1, max: 9 }),
        fc.array(fc.boolean(), { minLength: 81, maxLength: 81 }),
        (w, h, bits) => {
          const seeds = bits.slice(0, w * h);
          if (!seeds.some(Boolean)) seeds[0] = true;
          const grid = new Float64Array(seeds.map((s) => (s ? 0 : 1e20)));
          edt2d(grid, w, h);
          for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
              let best = Infinity;
              seeds.forEach((s, i) => {
                if (s) best = Math.min(best, (x - (i % w)) ** 2 + (y - Math.floor(i / w)) ** 2);
              });
              expect(grid[y * w + x]).toBe(best);
            }
          }
        },
      ),
      { numRuns: 60 },
    );
  });
});

describe('coverageToSdf', () => {
  it('puts the zero crossing on the edge of a disk, negative inside', () => {
    const size = 64;
    const r = 20.3;
    const c = 32;
    const sdf = coverageToSdf(diskCoverage(size, c, c, r), size, size);
    let worst = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const exact = Math.hypot(x + 0.5 - c, y + 0.5 - c) - r;
        // Near the edge the transform is sub-pixel accurate.
        if (Math.abs(exact) < 6) worst = Math.max(worst, Math.abs(sdf[y * size + x]! - exact));
      }
    }
    expect(worst).toBeLessThan(0.75);
    expect(sdf[c * size + c]).toBeLessThan(-r + 1.5);
    expect(sdf[0]).toBeGreaterThan(0);
    // Along a row through the center the sign flips exactly once on each side.
    const row = Array.from(sdf.subarray(c * size, (c + 1) * size));
    const flips = row.slice(1).filter((v, i) => Math.sign(v) !== Math.sign(row[i]!)).length;
    expect(flips).toBe(2);
  });

  it('measures distances to a half-plane edge', () => {
    const w = 16;
    const h = 4;
    // Columns 0–7 inside, 8 half covered, 9+ outside: the edge runs through pixel 8's center.
    const cov = new Float32Array(w * h).map((_, i) => {
      const x = i % w;
      return x < 8 ? 1 : x === 8 ? 0.5 : 0;
    });
    const sdf = coverageToSdf(cov, w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) expect(sdf[y * w + x]).toBe(x - 8);
    }
  });
});

describe('SDF encoding and frames', () => {
  it('encodes the edge as 128 and saturates beyond the spread', () => {
    const pxPerRadius = 40;
    const bytes = encodeSdf([0, -1000, 1000, SDF_SPREAD * pxPerRadius * 0.5], pxPerRadius);
    expect(bytes[0]).toBe(128);
    expect(bytes[1]).toBe(0);
    expect(bytes[2]).toBe(255);
    expect(decodeSdf(bytes[3]!)).toBeCloseTo(SDF_SPREAD / 2, 2);
  });

  it('maps the viewBox onto the marker diameter around the anchor', () => {
    const centered = symbolFrame([0, 0, 24, 24]);
    expect(centered.extent).toBe(1);
    expect(centered.cellHalf).toBe(1 + SDF_SPREAD);
    expect([centered.anchorX, centered.anchorY]).toEqual([12, 12]);
    // A pin anchored at its bottom tip reaches two radii up.
    const pin = symbolFrame([0, 0, 24, 24], [12, 24]);
    expect(pin.extent).toBe(2);
    // Wide boxes scale by their larger side; anchors are clamped into the box.
    const wide = symbolFrame([10, 0, 40, 20], [100, -5]);
    expect([wide.anchorX, wide.anchorY]).toEqual([50, 0]);
    expect(wide.extent).toBe(2);
  });

  it('parses viewBoxes and rejects degenerate ones', () => {
    expect(parseViewBox(undefined)).toEqual([0, 0, 24, 24]);
    expect(parseViewBox('0 0 100,50')).toEqual([0, 0, 100, 50]);
    expect(parseViewBox([1, 2, 3, 4])).toEqual([1, 2, 3, 4]);
    expect(parseViewBox('0 0 0 10')).toBeUndefined();
    expect(parseViewBox('0 0 x 10')).toBeUndefined();
  });

  it('packs cells row by row and grows the atlas in powers of two', () => {
    expect(atlasCell(0, 8, 128)).toEqual([0, 0]);
    expect(atlasCell(9, 8, 128)).toEqual([128, 128]);
    expect([1, 8, 9, 17, 33].map((n) => atlasRows(n, 8))).toEqual([1, 1, 2, 4, 8]);
  });
});
