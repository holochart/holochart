import { describe, expect, it } from 'vitest';
import { layoutFigure } from './__testing__/figure.ts';
import { clipAngles } from '../barpolar/plot.ts';
import { polygonBarRing } from '../barpolar/geometry.ts';
import { rerange, radialDragMode, zoomRing } from './drag.ts';

const deg = (d: number): number => (d * Math.PI) / 180;

describe('barpolar stacking (plotly.js setGroupPositions)', () => {
  const theta = ['a', 'b', 'c'];

  it('stacks bars outwards per position, (1 - bargap) wide', () => {
    const f = layoutFigure({
      data: [
        { type: 'barpolar', r: [1, 2, 3], theta },
        { type: 'barpolar', r: [4, 5, 6], theta },
      ],
    });
    const a = f.calcs[0]!.bars!;
    const b = f.calcs[1]!.bars!;
    expect([...a.s0]).toEqual([0, 0, 0]);
    expect([...b.s0]).toEqual([1, 2, 3]);
    expect([...b.s1]).toEqual([5, 7, 9]);
    // Category slots: width 0.9 centered on the category.
    expect(a.p0[1]).toBeCloseTo(0.55, 12);
    expect(a.p1[1]).toBeCloseTo(1.45, 12);
    // The radial autorange covers the stacks, padded.
    const [lo, hi] = f.subplot().rl;
    expect(lo).toBe(0);
    expect(hi).toBeGreaterThan(9);
  });

  it('overlays with polar.barmode overlay, and keeps traces with a base out of stacks', () => {
    const f = layoutFigure({
      data: [
        { type: 'barpolar', r: [1, 2, 3], theta },
        { type: 'barpolar', r: [4, 5, 6], theta },
      ],
      layout: { polar: { barmode: 'overlay', bargap: 0.5 } },
    });
    expect([...f.calcs[1]!.bars!.s0]).toEqual([0, 0, 0]);
    expect(f.calcs[0]!.bars!.p1[0]! - f.calcs[0]!.bars!.p0[0]!).toBeCloseTo(0.5, 12);
    const based = layoutFigure({
      data: [
        { type: 'barpolar', r: [1, 2, 3], theta },
        { type: 'barpolar', r: [1, 1, 1], theta, base: 5 },
      ],
    });
    expect([...based.calcs[1]!.bars!.s0]).toEqual([5, 5, 5]);
    expect([...based.calcs[1]!.bars!.s1]).toEqual([6, 6, 6]);
  });

  it('reads width and offset in the trace’s theta unit on linear axes', () => {
    const f = layoutFigure({
      data: [{ type: 'barpolar', r: [1, 2], theta: [0, 90], width: 30, offset: 0 }],
    });
    const bars = f.calcs[0]!.bars!;
    expect(bars.p0[1]).toBeCloseTo(deg(90), 12);
    expect(bars.p1[1]).toBeCloseTo(deg(120), 12);
    // Default: the smallest angle between bars, less 10 %.
    const g = layoutFigure({ data: [{ type: 'barpolar', r: [1, 2], theta: [0, 90] }] });
    const w = g.calcs[0]!.bars!.p1[0]! - g.calcs[0]!.bars!.p0[0]!;
    expect(w).toBeCloseTo(deg(81), 12);
  });

  it('clips bar angles to the sector', () => {
    expect(clipAngles(deg(-10), deg(10), 0, Math.PI)).toEqual([0, deg(10)]);
    const wrapped = clipAngles(deg(350), deg(370), 0, Math.PI)!;
    expect(wrapped[0]).toBeCloseTo(0, 12);
    expect(wrapped[1]).toBeCloseTo(deg(10), 12);
    expect(clipAngles(deg(200), deg(220), 0, Math.PI)).toBeUndefined();
  });

  it('follows the polygon edges on linear grids', () => {
    const square = [0, 90, 180, 270].map(deg);
    const ring = polygonBarRing(0, 10, deg(-45), deg(45), square);
    // Along the edges through the vertex at 0°, down to the center.
    expect(ring.at(-1)).toEqual([0, 0]);
    expect(ring.some(([x, y]) => Math.abs(x - 10) < 1e-9 && Math.abs(y) < 1e-9)).toBe(true);
  });
});

describe('fill links', () => {
  it('links tonext fills to the previous scatterpolar trace of the subplot', () => {
    const f = layoutFigure({
      data: [
        { type: 'scatterpolar', r: [1, 1, 1], theta: [0, 120, 240] },
        { type: 'barpolar', r: [1], theta: [0] },
        { type: 'scatterpolar', r: [2, 2, 2], theta: [0, 120, 240], fill: 'tonext' },
        { type: 'scatterpolar', subplot: 'polar2', r: [3], theta: [0], fill: 'tonext' },
      ],
    });
    expect(f.calcs[2]!.previous?.index).toBe(0);
    expect(f.calcs[3]!.previous).toBeUndefined();
  });
});

describe('drags (plotly.js Polar.updateRadialDrag / main drag)', () => {
  it('re-ranges along the axis, rotates across it', () => {
    expect(radialDragMode(20, 0, 0, 1)).toBe('range');
    expect(radialDragMode(0, -20, 0, 1)).toBe('rotate');
    // The inner handle never rotates.
    expect(radialDragMode(0, -20, 0, 0)).toBe('range');
    // 0.75 of the range per radius, outwards shrinking it.
    expect(rerange([0, 10], 1, 40, 0, 0, 200, 0)).toEqual([0, 8.5]);
    expect(rerange([0, 10], 1, -40, 0, 0, 200, 0)).toEqual([0, 11.5]);
    // Along an axis at 90°: moving up (dy < 0) is outwards.
    expect(rerange([0, 10], 1, 0, -40, Math.PI / 2, 200, 0)![1]).toBeCloseTo(8.5, 12);
    // Never flipping the range.
    expect(rerange([0, 10], 1, 400, 0, 0, 200, 0)).toBeUndefined();
  });

  it('turns a zoom box into a ring, snapping to the center and the edge', () => {
    expect(zoomRing(50, 150, 200, 0)).toEqual([50, 150]);
    expect(zoomRing(150, 50, 200, 0)).toEqual([50, 150]);
    expect(zoomRing(10, 150, 200, 0)).toEqual([0, 150]);
    expect(zoomRing(50, 190, 200, 0)).toEqual([50, 200]);
    expect(zoomRing(50, 60, 200, 0)).toBeNull();
  });
});
