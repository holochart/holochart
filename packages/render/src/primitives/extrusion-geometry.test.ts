import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  clampBevel,
  extrudeOutline,
  polygonOutline,
  PrismBuffers,
  rectOutline,
  rectPrismVertexCount,
  sectorOutline,
  type Outline,
} from './extrusion-geometry.ts';

/**
 * Prism geometry of the extrusion primitive (plan E8.9): vertex counts, unit normals pointing out
 * of the prism, and closed (watertight, consistently oriented) surfaces with the expected volume.
 */

function prism(outline: Outline, depth: number, bevel = 0, segments = 3): PrismBuffers {
  const out = new PrismBuffers();
  extrudeOutline(out, outline, 0, depth, bevel, segments, 0);
  return out;
}

const key = (p: readonly number[], i: number): string =>
  `${p[i * 3]!.toFixed(5)},${p[i * 3 + 1]!.toFixed(5)},${p[i * 3 + 2]!.toFixed(5)}`;

/**
 * Whether the surface is closed: after welding coincident vertices, every edge belongs to exactly
 * two triangles, once in each direction (consistent orientation).
 */
function watertight(b: PrismBuffers): boolean {
  const edges = new Map<string, number>();
  const idx = b.indices;
  for (let t = 0; t < idx.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = key(b.positions, idx[t + e]!);
      const c = key(b.positions, idx[t + ((e + 1) % 3)]!);
      if (a === c) return false;
      edges.set(`${a}>${c}`, (edges.get(`${a}>${c}`) ?? 0) + 1);
    }
  }
  for (const [edge, n] of edges) {
    const [a, c] = edge.split('>') as [string, string];
    if (n !== 1 || edges.get(`${c}>${a}`) !== 1) return false;
  }
  return true;
}

/** Signed volume (divergence theorem): positive when triangles face outward. */
function volume(b: PrismBuffers): number {
  const p = b.positions;
  let v = 0;
  for (let t = 0; t < b.indices.length; t += 3) {
    const [i, j, k] = [b.indices[t]! * 3, b.indices[t + 1]! * 3, b.indices[t + 2]! * 3];
    v +=
      p[i]! * (p[j + 1]! * p[k + 2]! - p[j + 2]! * p[k + 1]!) -
      p[i + 1]! * (p[j]! * p[k + 2]! - p[j + 2]! * p[k]!) +
      p[i + 2]! * (p[j]! * p[k + 1]! - p[j + 1]! * p[k]!);
  }
  return v / 6;
}

/** Whether every triangle's face normal agrees with its vertices' shading normals. */
function normalsOutward(b: PrismBuffers): boolean {
  const p = b.positions;
  const n = b.normals;
  for (let t = 0; t < b.indices.length; t += 3) {
    const [i, j, k] = [b.indices[t]!, b.indices[t + 1]!, b.indices[t + 2]!];
    const ux = p[j * 3]! - p[i * 3]!;
    const uy = p[j * 3 + 1]! - p[i * 3 + 1]!;
    const uz = p[j * 3 + 2]! - p[i * 3 + 2]!;
    const vx = p[k * 3]! - p[i * 3]!;
    const vy = p[k * 3 + 1]! - p[i * 3 + 1]!;
    const vz = p[k * 3 + 2]! - p[i * 3 + 2]!;
    const fx = uy * vz - uz * vy;
    const fy = uz * vx - ux * vz;
    const fz = ux * vy - uy * vx;
    for (const v of [i, j, k]) {
      if (fx * n[v * 3]! + fy * n[v * 3 + 1]! + fz * n[v * 3 + 2]! < -1e-9) return false;
    }
  }
  return true;
}

describe('rect prisms', () => {
  it('is a closed box with flat faces without a bevel', () => {
    const b = prism(rectOutline(0, 0, 40, 20, 0, 3), 10);
    expect(b.vertexCount).toBe(rectPrismVertexCount(0));
    expect(watertight(b)).toBe(true);
    expect(volume(b)).toBeCloseTo(40 * 20 * 10, 6);
    expect(normalsOutward(b)).toBe(true);
    // 6 faces, 2 triangles each.
    expect(b.indices.length / 3).toBe(12);
    // Flat shading: every normal is an axis.
    for (let i = 0; i < b.normals.length; i += 3) {
      const axes = [b.normals[i]!, b.normals[i + 1]!, b.normals[i + 2]!].map(Math.abs).sort();
      expect(axes).toEqual([0, 0, 1]);
    }
  });

  it('rounds the front and side edges with a bevel, closed and oriented', () => {
    for (const segments of [1, 3, 6]) {
      const b = prism(rectOutline(0, 0, 40, 20, 4, segments), 10, 4, segments);
      expect(b.vertexCount).toBe(rectPrismVertexCount(segments));
      expect(watertight(b)).toBe(true);
      expect(normalsOutward(b)).toBe(true);
      const v = volume(b);
      expect(v).toBeLessThan(40 * 20 * 10);
      expect(v).toBeGreaterThan(0.85 * 40 * 20 * 10);
    }
  });

  it('has unit normals, +z on the front face and horizontal on the walls', () => {
    const b = prism(rectOutline(-5, 2, 15, 30, 3, 4), 12, 3, 4);
    for (let i = 0; i < b.normals.length; i += 3) {
      const [x, y, z] = [b.normals[i]!, b.normals[i + 1]!, b.normals[i + 2]!];
      expect(Math.hypot(x, y, z)).toBeCloseTo(1, 9);
      const pz = b.positions[i + 2]!;
      if (pz === 12) expect(z).toBeCloseTo(1, 9);
      else if (pz > 0 && pz < 9) expect(z).toBe(0);
    }
  });

  it('clamps the bevel to half the size and the depth', () => {
    expect(clampBevel(10, 8, 30, 20)).toBe(4);
    expect(clampBevel(10, 30, 30, 3)).toBe(3);
    expect(clampBevel(-1, 30, 30, 3)).toBe(0);
    expect(clampBevel(NaN, 30, 30, 3)).toBe(0);
  });

  it('stays closed for any size, depth and bevel', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 1, max: 200, noNaN: true }),
        fc.double({ min: 1, max: 200, noNaN: true }),
        fc.double({ min: 0.5, max: 80, noNaN: true }),
        fc.double({ min: 0, max: 60, noNaN: true }),
        fc.integer({ min: 1, max: 8 }),
        (w, h, depth, bevel, segments) => {
          const b0 = clampBevel(bevel, w, h, depth);
          // A bevel reaching the middle collapses the front face: skip that degenerate case.
          fc.pre(b0 === 0 || b0 < Math.min(w, h) / 2 - 1e-3);
          const b = prism(rectOutline(0, 0, w, h, b0, b0 > 0 ? segments : 0), depth, b0, segments);
          expect(watertight(b)).toBe(true);
          expect(normalsOutward(b)).toBe(true);
          expect(volume(b)).toBeGreaterThan(0);
          expect(volume(b)).toBeLessThanOrEqual(w * h * depth * (1 + 1e-9));
        },
      ),
    );
  });
});

describe('sector and polygon prisms', () => {
  it('extrudes pie slices and annular sectors', () => {
    const pie = prism(sectorOutline(0, 0, 0, 50, 0, Math.PI / 3, 12), 10);
    expect(watertight(pie)).toBe(true);
    expect(normalsOutward(pie)).toBe(true);
    // A regular 12-gon sector of radius 50 over 60°.
    const n = 12;
    const area = (n * 50 * 50 * Math.sin(Math.PI / 3 / n)) / 2;
    expect(volume(pie)).toBeCloseTo(area * 10, 6);
    const ring = prism(sectorOutline(0, 0, 20, 50, 0.3, 2.2, 16), 8, 2, 3);
    expect(watertight(ring)).toBe(true);
    expect(normalsOutward(ring)).toBe(true);
    expect(volume(ring)).toBeGreaterThan(0);
  });

  it('extrudes polygons in either orientation, with a given triangulation', () => {
    // An L shape (concave), clockwise, with its triangulation.
    const points = [0, 0, 0, 20, 10, 20, 10, 10, 20, 10, 20, 0];
    const cap = [0, 1, 2, 0, 2, 3, 0, 3, 5, 3, 4, 5];
    const b = prism(polygonOutline(points, cap), 5);
    expect(watertight(b)).toBe(true);
    expect(normalsOutward(b)).toBe(true);
    expect(volume(b)).toBeCloseTo(300 * 5, 6);
    // Counter-clockwise and convex: the default fan.
    const square = prism(polygonOutline([0, 0, 10, 0, 10, 10, 0, 10]), 2);
    expect(watertight(square)).toBe(true);
    expect(volume(square)).toBeCloseTo(200, 6);
  });

  it('draws nothing for too few points or no depth', () => {
    expect(prism(polygonOutline([0, 0, 1, 1]), 5).indices).toEqual([]);
    expect(prism(rectOutline(0, 0, 10, 10, 0, 0), 0).indices).toEqual([]);
  });
});
