import { describe, expect, it } from 'vitest';
import { arrowGeometry, rotatedBoxExit, type ArrowOptions } from './arrow-geometry.ts';

const OPTIONS: ArrowOptions = {
  arrowside: 'end',
  arrowhead: 1,
  startarrowhead: 1,
  arrowsize: 1,
  startarrowsize: 1,
  arrowwidth: 2,
  standoff: 0,
  startstandoff: 0,
};

describe('arrowGeometry in degenerate cases', () => {
  it('draws nothing when tail and head coincide', () => {
    const p = { x: 30, y: 40 };
    expect(arrowGeometry(p, { ...p }, undefined, OPTIONS)).toEqual({ line: undefined, heads: [] });
    expect(arrowGeometry(p, { x: NaN, y: 40 }, undefined, OPTIONS)).toEqual({
      line: undefined,
      heads: [],
    });
  });

  it('keeps the heads but drops the line when their back-off is longer than the arrow', () => {
    // Head 1 is the triangle (−2.4, ∓3), (0.6, 0) in arrow-width units, backed off by 0.6.
    // At scale 10 × 2 the back-off is 12 px on a 10 px arrow.
    const g = arrowGeometry({ x: 0, y: 0 }, { x: 10, y: 0 }, undefined, {
      ...OPTIONS,
      arrowwidth: 10,
      arrowsize: 2,
    });
    expect(g.line).toBeUndefined();
    expect(g.heads).toHaveLength(1);
    const [a, b, tip] = g.heads[0]!;
    // The base point is 12 px before the head; the tip still lands exactly on it.
    expect(tip!.x).toBeCloseTo(10, 12);
    expect(tip!.y).toBeCloseTo(0, 12);
    expect(a!.x).toBeCloseTo(-2 - 2.4 * 20, 12);
    expect(a!.y).toBeCloseTo(-60, 12);
    expect(b!.x).toBeCloseTo(-2 - 2.4 * 20, 12);
    expect(b!.y).toBeCloseTo(60, 12);
  });

  it('draws a plain line for arrowhead numbers it does not know', () => {
    const tail = { x: 0, y: 0 };
    const head = { x: 0, y: 50 };
    for (const side of ['end', 'start', 'end+start']) {
      const g = arrowGeometry(tail, head, undefined, {
        ...OPTIONS,
        arrowside: side,
        arrowhead: 42,
        startarrowhead: -1,
      });
      expect(g.heads).toEqual([]);
      // No head, no back-off: the line runs the full length.
      expect(g.line).toEqual([tail, head]);
    }
  });

  it('puts a head on the start only when the side asks for it', () => {
    const g = arrowGeometry({ x: 0, y: 0 }, { x: 100, y: 0 }, undefined, {
      ...OPTIONS,
      arrowside: 'start',
    });
    expect(g.heads).toHaveLength(1);
    // The start head points back at the tail: its tip is on the tail, the line starts 0.6 × 2 px in.
    const tip = g.heads[0]![2]!;
    expect(tip.x).toBeCloseTo(0, 12);
    expect(tip.y).toBeCloseTo(0, 12);
    expect(g.line![0].x).toBeCloseTo(1.2, 12);
    expect(g.line![1]).toEqual({ x: 100, y: 0 });
  });
});

describe('rotatedBoxExit with a ray parallel to a side', () => {
  const box = { cx: 0, cy: 0, hw: 10, hh: 5, angle: 0 };

  it('exits through the far side when the ray runs inside the box', () => {
    expect(rotatedBoxExit(box, { x: -4, y: 3 }, { x: 1, y: 0 })).toBeCloseTo(14, 12);
    expect(rotatedBoxExit(box, { x: 2, y: -1 }, { x: 0, y: -1 })).toBeCloseTo(4, 12);
  });

  it('is 0 when the ray runs beside the box', () => {
    expect(rotatedBoxExit(box, { x: 0, y: 20 }, { x: 1, y: 0 })).toBe(0);
    expect(rotatedBoxExit(box, { x: -30, y: 0 }, { x: 0, y: 1 })).toBe(0);
    // The same ray against the box turned a quarter: now it is inside the (5 wide, 10 high) box.
    expect(rotatedBoxExit({ ...box, angle: 90 }, { x: 0, y: 8 }, { x: 1, y: 0 })).toBeCloseTo(5, 9);
  });
});
