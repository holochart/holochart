import { describe, expect, it } from 'vitest';
import {
  ARROWHEADS,
  arrowGeometry,
  inRotatedBox,
  rotatedBoxCorners,
  rotatedBoxExit,
} from './arrow-geometry.ts';

describe('arrow geometry', () => {
  it('backs the line off for standoff and the head, whose tip lands on the stood-off point', () => {
    const o = {
      arrowside: 'end',
      arrowhead: 2,
      startarrowhead: 1,
      arrowsize: 1,
      startarrowsize: 1,
      arrowwidth: 2,
      standoff: 5,
      startstandoff: 0,
    };
    const a = arrowGeometry({ x: 0, y: 0 }, { x: 100, y: 0 }, undefined, o);
    // Head 2 backs off 1.3 × width 2.
    expect(a.line?.[1].x).toBeCloseTo(100 - 5 - 2.6);
    expect(a.heads).toHaveLength(1);
    const tipX = Math.max(...(a.heads[0] ?? []).map((p) => p.x));
    expect(tipX).toBeCloseTo(95);
    // Both ends with startstandoff; the start head points back at the tail.
    const both = arrowGeometry({ x: 0, y: 0 }, { x: 0, y: 100 }, undefined, {
      ...o,
      arrowside: 'end+start',
      startstandoff: 3,
    });
    expect(both.heads).toHaveLength(2);
    const startTip = Math.min(...(both.heads[0] ?? []).map((p) => p.y));
    expect(startTip).toBeCloseTo(3);
    // Heads 0 (none): no polygons; circles / squares don't rotate.
    expect(
      arrowGeometry({ x: 0, y: 0 }, { x: 50, y: 0 }, undefined, { ...o, arrowhead: 0 }).heads,
    ).toEqual([]);
    const sq = arrowGeometry({ x: 0, y: 0 }, { x: 50, y: 50 }, undefined, { ...o, arrowhead: 7 });
    const xs = (sq.heads[0] ?? []).map((p) => p.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(8);
  });

  it('draws nothing when the standoffs eat the whole arrow', () => {
    const o = {
      arrowside: 'end',
      arrowhead: 1,
      startarrowhead: 1,
      arrowsize: 1,
      startarrowsize: 1,
      arrowwidth: 1,
      standoff: 60,
      startstandoff: 50,
    };
    expect(arrowGeometry({ x: 0, y: 0 }, { x: 100, y: 0 }, undefined, o)).toEqual({
      line: undefined,
      heads: [],
    });
  });

  it('clips rays at rotated boxes', () => {
    const box = { cx: 0, cy: 0, hw: 10, hh: 5, angle: 0 };
    expect(rotatedBoxExit(box, { x: 0, y: 0 }, { x: 1, y: 0 })).toBeCloseTo(10);
    expect(rotatedBoxExit({ ...box, angle: 90 }, { x: 0, y: 0 }, { x: 1, y: 0 })).toBeCloseTo(5);
    expect(rotatedBoxExit(box, { x: 50, y: 0 }, { x: 1, y: 0 })).toBe(0);
  });

  it('declares Plotly arrowheads 0–7 plus the bar (8)', () => {
    expect(ARROWHEADS).toHaveLength(9);
    expect(ARROWHEADS[0]?.points).toEqual([]);
    expect(ARROWHEADS[6]?.points).toHaveLength(16);
  });

  it('places corners and hit-tests rotated boxes', () => {
    const box = { cx: 10, cy: 20, hw: 4, hh: 2, angle: 90 };
    const corners = rotatedBoxCorners(box);
    expect(corners[0]?.x).toBeCloseTo(12);
    expect(corners[0]?.y).toBeCloseTo(16);
    expect(rotatedBoxCorners(box, 1)[0]?.y).toBeCloseTo(17);
    expect(inRotatedBox(box, 11, 23)).toBe(true);
    expect(inRotatedBox(box, 13, 20)).toBe(false);
    expect(inRotatedBox(box, 13, 20, 1)).toBe(true);
  });
});
