import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  arrowLength,
  bandCenterAt,
  bandOutline,
  loopOutline,
  outlineArea,
  outlineBounds,
  outlineContains,
  roundedRoute,
} from './geometry.ts';
import type { CircularPath } from './layout.ts';

describe('sankey ribbons: bands', () => {
  it('draws a straight link as a quad of its width', () => {
    const o = bandOutline(10, 50, 110, 50, 20);
    expect(o.x).toEqual([10, 110, 110, 10]);
    expect(o.y).toEqual([40, 40, 60, 60]);
    expect(Math.abs(outlineArea(o))).toBe(2000);
  });

  it('keeps a constant thickness across the flow (area = width × run)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 200, noNaN: true }),
        fc.double({ min: 0, max: 400, noNaN: true }),
        fc.double({ min: 30, max: 500, noNaN: true }),
        fc.double({ min: 0, max: 400, noNaN: true }),
        fc.double({ min: 0.5, max: 60, noNaN: true }),
        (x0, y0, run, y1, w) => {
          const o = bandOutline(x0, y0, x0 + run, y1, w);
          expect(Math.abs(outlineArea(o))).toBeCloseTo(w * run, 6);
        },
      ),
    );
  });

  it('follows Plotly’s curve: ends flat, halfway point in the middle', () => {
    // 96 px: 16 segments, so sample 8 is the halfway point.
    const o = bandOutline(0, 0, 96, 100, 10);
    const n = o.x.length / 2;
    expect(n).toBe(17);
    // Top edge: first and last samples, and the middle one at (48, 50 − 5).
    expect([o.x[0], o.y[0]]).toEqual([0, -5]);
    expect([o.x[n - 1], o.y[n - 1]]).toEqual([96, 95]);
    expect(o.x[8]).toBeCloseTo(48, 9);
    expect(o.y[8]).toBeCloseTo(45, 9);
    expect(bandCenterAt(0, 0, 100, 100, 50)).toBeCloseTo(50, 6);
    expect(bandCenterAt(0, 0, 100, 100, 0)).toBeCloseTo(0, 6);
    expect(bandCenterAt(100, 100, 0, 0, 25)).toBeCloseTo(bandCenterAt(0, 0, 100, 100, 25), 6);
  });

  it('samples neighbouring links alike, so their shared edges match', () => {
    // Two links stacked at both ends: the lower edge of one is the upper edge of the other.
    const a = bandOutline(0, 10, 200, 110, 20);
    const b = bandOutline(0, 25, 200, 125, 10);
    const n = a.x.length / 2;
    const aBottom = a.y.slice(n).reverse();
    const bTop = b.y.slice(0, n);
    aBottom.forEach((y, i) => expect(y).toBeCloseTo(bTop[i]!, 9));
  });

  it('ends in an arrowhead, at most half the gap long', () => {
    expect(arrowLength(0, 100, 15)).toBe(15);
    expect(arrowLength(0, 20, 15)).toBe(10);
    const o = bandOutline(0, 50, 100, 50, 20, 15);
    expect(o.x).toEqual([0, 85, 100, 85, 0]);
    expect(o.y).toEqual([40, 40, 50, 60, 60]);
    expect(outlineContains(o, 95, 50)).toBe(true);
    expect(outlineContains(o, 95, 42)).toBe(false);
  });
});

describe('sankey ribbons: loops', () => {
  const PATH: CircularPath = {
    sourceX: 100,
    sourceY: 50,
    targetX: 20,
    targetY: 60,
    rightX: 125,
    leftX: -5,
    rSource: 20,
    rTarget: 20,
    extent: 200,
  };

  it('rounds the corners of an orthogonal route with arcs', () => {
    const s = roundedRoute(
      [
        [0, 0],
        [100, 0],
        [100, 100],
      ],
      [30],
    );
    // Straight to the arc start, then points 30 px from the arc center (70, 30).
    expect(s[0]).toMatchObject({ x: 0, y: 0 });
    const arc = s.slice(1, -1);
    for (const p of arc) expect(Math.hypot(p.x - 70, p.y - 30)).toBeCloseTo(30, 9);
    expect(arc[0]).toMatchObject({ x: 70, y: 0 });
    expect(arc[arc.length - 1]!.x).toBeCloseTo(100, 9);
    expect(arc[arc.length - 1]!.y).toBeCloseTo(30, 9);
    // Radii shrink to fit short segments.
    const tight = roundedRoute(
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ],
      [30, 30],
    );
    for (const p of tight) expect(p.x).toBeLessThanOrEqual(10 + 1e-9);
  });

  it('draws a loop band around the route, as wide as the link', () => {
    const w = 10;
    const o = loopOutline(PATH, w);
    const [x0, y0, x1, y1] = outlineBounds(o);
    expect(x0).toBeCloseTo(PATH.leftX - w / 2, 3);
    expect(x1).toBeCloseTo(PATH.rightX + w / 2, 3);
    expect(y0).toBeCloseTo(PATH.sourceY - w / 2, 3);
    expect(y1).toBeCloseTo(PATH.extent + w / 2, 3);
    // On the lane, not inside the loop.
    expect(outlineContains(o, 60, PATH.extent)).toBe(true);
    expect(outlineContains(o, 60, PATH.extent - w)).toBe(false);
    expect(outlineContains(o, 60, 120)).toBe(false);
    // Its area is the width times the length of the center line.
    const len =
      PATH.rightX -
      PATH.sourceX +
      (PATH.extent - PATH.sourceY) +
      (PATH.rightX - PATH.leftX) +
      (PATH.extent - PATH.targetY) +
      (PATH.targetX - PATH.leftX);
    const corners = 4 * (2 * 20 - (Math.PI / 2) * 20);
    // (Arcs are flattened to chords: within 0.5 %.)
    expect(Math.abs(outlineArea(o)) / (w * (len - corners))).toBeCloseTo(1, 2);
  });

  it('ends a loop in an arrowhead at the target', () => {
    const o = loopOutline(PATH, 10, 8);
    const tip = o.x.indexOf(PATH.targetX);
    expect(tip).toBeGreaterThan(0);
    expect(o.y[tip]).toBe(PATH.targetY);
    expect(Math.max(...o.x.filter((_, i) => o.y[i]! > 50 && o.y[i]! < 70 && o.x[i]! < 60))).toBe(
      PATH.targetX,
    );
  });
});
