import { describe, expect, it } from 'vitest';
import {
  extrudeOutline,
  polygonOutline,
  PrismBuffers,
  rectOutline,
  sectorOutline,
  type Outline,
} from './extrusion-geometry.ts';

/**
 * Outlines of the extrusion primitive (plan E8.9) at their corners: rects given by any two
 * opposite corners, the miter that insets a sharp corner (exact, and capped where the corner is a
 * needle), cap triangulations given in either orientation, and rings that repeat their first point.
 */

function prism(outline: Outline, depth: number, bevel = 0, segments = 3): PrismBuffers {
  const out = new PrismBuffers();
  extrudeOutline(out, outline, 0, depth, bevel, segments, 0);
  return out;
}

const key = (p: readonly number[], i: number): string =>
  `${p[i * 3]!.toFixed(5)},${p[i * 3 + 1]!.toFixed(5)},${p[i * 3 + 2]!.toFixed(5)}`;

/** Closed surface: welded, every edge belongs to two triangles, once in each direction. */
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
  return edges.size > 0;
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

/** The z component of the face normal of every cap triangle at height `z`. */
function capFacing(b: PrismBuffers, z: number): number[] {
  const p = b.positions;
  const out: number[] = [];
  for (let t = 0; t < b.indices.length; t += 3) {
    const [i, j, k] = [b.indices[t]!, b.indices[t + 1]!, b.indices[t + 2]!];
    if (p[i * 3 + 2] !== z || p[j * 3 + 2] !== z || p[k * 3 + 2] !== z) continue;
    out.push(
      (p[j * 3]! - p[i * 3]!) * (p[k * 3 + 1]! - p[i * 3 + 1]!) -
        (p[j * 3 + 1]! - p[i * 3 + 1]!) * (p[k * 3]! - p[i * 3]!),
    );
  }
  return out;
}

describe('rectOutline', () => {
  it('takes its two corners in any order: the same counter-clockwise ring', () => {
    const ring = rectOutline(0, 0, 40, 20, 4, 3);
    expect(rectOutline(40, 20, 0, 0, 4, 3)).toEqual(ring);
    expect(rectOutline(40, 0, 0, 20, 4, 3)).toEqual(ring);
    expect(rectOutline(0, 20, 40, 0, 4, 3)).toEqual(ring);
    // Still facing out (a clockwise ring would give a negative volume).
    const b = prism(rectOutline(40, 20, 0, 0, 0, 0), 10);
    expect(watertight(b)).toBe(true);
    expect(volume(b)).toBeCloseTo(40 * 20 * 10, 6);
  });
});

describe('sharp corners', () => {
  /** The inset direction of outline point `i` along the wall normal there. */
  const along = (o: Outline, i: number): number => o.ox[i]! * o.nx[i]! + o.oy[i]! * o.ny[i]!;

  it('insets along the miter: both edges of the corner move by the inset', () => {
    // A quarter pie slice: at its center the straight edges meet at 90°.
    const o = sectorOutline(0, 0, 0, 50, 0, Math.PI / 2, 8);
    const n = o.x.length;
    for (const i of [n - 2, n - 1]) {
      expect([o.x[i], o.y[i]]).toEqual([0, 0]);
      // Moving the corner by -offset · d moves the wall by d along its normal.
      expect(along(o, i)).toBeCloseTo(1, 12);
    }
    // The miter of a right angle is its diagonal.
    expect(Math.hypot(o.ox[n - 1]!, o.oy[n - 1]!)).toBeCloseTo(Math.SQRT2, 12);
  });

  it('caps the miter of a needle (a thin pie slice), which would run away along its bisector', () => {
    // A 0.02 rad slice: the exact miter at its center is 1 / sin(0.01) = 100 px per px of inset.
    const a1 = 0.02;
    const o = sectorOutline(0, 0, 0, 50, 0, a1, 2);
    const n = o.x.length;
    const [ox, oy] = [o.ox[n - 1]!, o.oy[n - 1]!];
    expect([o.ox[n - 2], o.oy[n - 2]]).toEqual([ox, oy]);
    const exact = 1 / Math.sin(a1 / 2);
    expect(exact).toBeGreaterThan(99);
    expect(Math.hypot(ox, oy)).toBeLessThan(exact / 10);
    // Still along the bisector, toward the outside of the corner (away from the slice).
    const bisector = [Math.cos(a1 / 2), Math.sin(a1 / 2)] as const;
    expect(ox * bisector[0] + oy * bisector[1]).toBeLessThan(0);
    expect(ox * bisector[1] - oy * bisector[0]).toBeCloseTo(0, 9);
    // Both walls move by the same amount, less than the inset.
    expect(along(o, n - 1)).toBeCloseTo(along(o, n - 2), 12);
    expect(along(o, n - 1)).toBeGreaterThan(0);
    expect(along(o, n - 1)).toBeLessThan(1);
    // So a bevelled needle keeps its center within a px of where it was.
    const b = prism(o, 5, 1, 2);
    const xs = b.positions.filter((_, i) => i % 3 === 0);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThanOrEqual(50);
    const front = b.positions.filter((_, i) => i % 3 === 0 && b.positions[i + 2] === 5);
    expect(Math.min(...front)).toBeLessThan(1);
  });
});

describe('polygonOutline', () => {
  // An L shape, counter-clockwise: area 300.
  const L = [0, 0, 20, 0, 20, 10, 10, 10, 10, 20, 0, 20];

  it('turns the triangles of a given cap counter-clockwise, whichever way each runs', () => {
    // A triangulation of the L from its corner 0, two of its triangles clockwise.
    const ccw = [0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 5];
    const mixed = [0, 1, 2, 0, 3, 2, 0, 3, 4, 0, 5, 4];
    for (const cap of [ccw, mixed]) {
      const b = prism(polygonOutline(L, cap), 5);
      expect(watertight(b)).toBe(true);
      expect(volume(b)).toBeCloseTo(300 * 5, 6);
      // Four front triangles facing the viewer, four back ones facing away.
      const front = capFacing(b, 5);
      const back = capFacing(b, 0);
      expect(front).toHaveLength(4);
      expect(front.every((z) => z > 0)).toBe(true);
      expect(back).toHaveLength(4);
      expect(back.every((z) => z < 0)).toBe(true);
    }
  });

  it('takes a ring that repeats its first point at the end', () => {
    const open = prism(polygonOutline([0, 0, 10, 0, 10, 10, 0, 10]), 2);
    const closed = prism(polygonOutline([0, 0, 10, 0, 10, 10, 0, 10, 0, 0]), 2);
    // The zero-length closing edge has no direction: no NaN reaches the buffers.
    expect(closed.normals.every(Number.isFinite)).toBe(true);
    expect(closed.positions.every(Number.isFinite)).toBe(true);
    expect(volume(closed)).toBeCloseTo(volume(open), 9);
    expect(volume(closed)).toBeCloseTo(200, 9);
    expect(watertight(closed)).toBe(true);
  });
});
