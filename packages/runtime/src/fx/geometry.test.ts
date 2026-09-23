import { describe, expect, it } from 'vitest';
import {
  avoidOverlaps,
  dragZoneAt,
  limitRange,
  MINDRAG,
  panBy,
  pointInPolygon,
  selectBoxAxes,
  selectionContains,
  zoomAround,
  zoomBox,
  type Placed,
} from './geometry.ts';

// Plot area 400x300 at (100, 50): bottom edge y = 350, x strip below, y strip to the left.
const rect = { x: 100, y: 50, width: 400, height: 300 };

describe('dragZoneAt', () => {
  it('classifies the plot area and the axis strips', () => {
    expect(dragZoneAt(rect, 300, 200)).toBe('plot');
    expect(dragZoneAt(rect, 110, 360)).toBe('x-start');
    expect(dragZoneAt(rect, 300, 360)).toBe('x-middle');
    expect(dragZoneAt(rect, 490, 360)).toBe('x-end');
    // y start is the bottom (range[0]) end.
    expect(dragZoneAt(rect, 90, 340)).toBe('y-start');
    expect(dragZoneAt(rect, 90, 200)).toBe('y-middle');
    expect(dragZoneAt(rect, 90, 60)).toBe('y-end');
  });

  it('returns undefined outside the plot and strips', () => {
    expect(dragZoneAt(rect, 50, 400)).toBeUndefined();
    expect(dragZoneAt(rect, 300, 400)).toBeUndefined();
    expect(dragZoneAt(rect, 510, 200)).toBeUndefined();
  });
});

describe('zoomBox', () => {
  it('zooms both axes for a large drag, normalizing the corners', () => {
    expect(zoomBox(rect, 300, 250, 200, 100, false, false)).toEqual({
      x: true,
      y: true,
      x0: 200,
      x1: 300,
      y0: 100,
      y1: 250,
    });
  });

  it('turns thin drags into full-height or full-width bands', () => {
    const xBand = zoomBox(rect, 200, 100, 300, 100 + MINDRAG - 1, false, false);
    expect(xBand).toEqual({ x: true, y: false, x0: 200, x1: 300, y0: 50, y1: 350 });
    const yBand = zoomBox(rect, 200, 100, 200 + MINDRAG - 1, 200, false, false);
    expect(yBand).toEqual({ x: false, y: true, x0: 100, x1: 500, y0: 100, y1: 200 });
  });

  it('returns null for a drag shorter than MINDRAG on both axes', () => {
    expect(zoomBox(rect, 200, 100, 205, 105, false, false)).toBeNull();
  });

  it('never zooms a fixed axis', () => {
    expect(zoomBox(rect, 200, 100, 300, 200, true, false)).toMatchObject({ x: false, y: true });
    expect(zoomBox(rect, 200, 100, 300, 200, false, true)).toMatchObject({ x: true, y: false });
    expect(zoomBox(rect, 200, 100, 300, 200, true, true)).toBeNull();
  });

  it('clamps the end point to the plot area', () => {
    expect(zoomBox(rect, 200, 100, 900, -40, false, false)).toMatchObject({
      x0: 200,
      x1: 500,
      y0: 50,
      y1: 100,
    });
  });
});

describe('zoomAround / panBy', () => {
  it('scales the range around the anchor', () => {
    expect(zoomAround([0, 10], 5, 0.5)).toEqual([2.5, 7.5]);
    expect(zoomAround([0, 10], 0, 2)).toEqual([0, 20]);
    // Reversed ranges keep their orientation.
    expect(zoomAround([10, 0], 5, 0.5)).toEqual([7.5, 2.5]);
  });

  it('shifts both ends', () => {
    expect(panBy([0, 10], 3)).toEqual([3, 13]);
    expect(panBy([10, 0], -3)).toEqual([7, -3]);
  });
});

describe('limitRange', () => {
  it('leaves the range alone without limits', () => {
    expect(limitRange([-5, 5], undefined, undefined, true)).toEqual([-5, 5]);
    expect(limitRange([-5, 5], Number.NaN, undefined, false)).toEqual([-5, 5]);
  });

  it('slides a panned window back inside, keeping its span', () => {
    expect(limitRange([-5, 5], 0, 100, true)).toEqual([0, 10]);
    expect(limitRange([95, 105], 0, 100, true)).toEqual([90, 100]);
  });

  it('clamps each end of a zoomed window', () => {
    expect(limitRange([-5, 5], 0, 100, false)).toEqual([0, 5]);
    expect(limitRange([-5, 200], 0, 100, false)).toEqual([0, 100]);
  });

  it('clamps a panned window wider than the limits to the limits', () => {
    expect(limitRange([-10, 200], 0, 100, true)).toEqual([0, 100]);
  });

  it('keeps reversed ranges reversed', () => {
    expect(limitRange([5, -5], 0, 100, true)).toEqual([10, 0]);
    expect(limitRange([5, -5], 0, 100, false)).toEqual([5, 0]);
  });

  it('ignores inconsistent limits and zooms that fall entirely outside', () => {
    expect(limitRange([-5, 5], 10, 0, true)).toEqual([-5, 5]);
    expect(limitRange([200, 300], undefined, 100, false)).toEqual([200, 300]);
  });
});

describe('selectBoxAxes', () => {
  it('resolves the select direction', () => {
    expect(selectBoxAxes('h', 1, 50)).toEqual({ x: true, y: false });
    expect(selectBoxAxes('v', 50, 1)).toEqual({ x: false, y: true });
    expect(selectBoxAxes('any', 1, 1)).toEqual({ x: true, y: true });
    expect(selectBoxAxes('d', -30, 10)).toEqual({ x: true, y: false });
    expect(selectBoxAxes('d', 10, -30)).toEqual({ x: false, y: true });
  });
});

describe('pointInPolygon / selectionContains', () => {
  // A concave "L": the square [0,10]^2 minus its top-right quarter.
  const lShape: [number, number][] = [
    [0, 0],
    [10, 0],
    [10, 5],
    [5, 5],
    [5, 10],
    [0, 10],
  ];

  it('tests points against a concave polygon', () => {
    expect(pointInPolygon(lShape, 2, 2)).toBe(true);
    expect(pointInPolygon(lShape, 2, 8)).toBe(true);
    expect(pointInPolygon(lShape, 8, 8)).toBe(false);
    expect(pointInPolygon(lShape, -1, 2)).toBe(false);
    expect(pointInPolygon([], 0, 0)).toBe(false);
  });

  it('uses the box for rect queries and the polygon for lasso ones', () => {
    const box = { x: [0, 10] as const, y: [0, 10] as const };
    expect(selectionContains({ kind: 'rect', ...box }, 8, 8)).toBe(true);
    expect(selectionContains({ kind: 'rect', ...box }, 11, 8)).toBe(false);
    expect(selectionContains({ kind: 'lasso', ...box, polygon: lShape }, 8, 8)).toBe(false);
    expect(selectionContains({ kind: 'lasso', ...box, polygon: lShape }, 2, 8)).toBe(true);
    expect(selectionContains({ kind: 'lasso', ...box, polygon: lShape }, Number.NaN, 2)).toBe(
      false,
    );
  });
});

describe('avoidOverlaps', () => {
  const items = (...wants: number[]): Placed[] => wants.map((want) => ({ want, size: 10, pos: 0 }));

  function expectNoOverlap(placed: Placed[], gap: number): void {
    for (let i = 1; i < placed.length; i++) {
      const a = placed[i - 1] as Placed;
      const b = placed[i] as Placed;
      expect(b.pos - b.size / 2).toBeGreaterThanOrEqual(a.pos + a.size / 2 + gap - 1e-9);
    }
  }

  it('keeps labels that do not collide where they want to be, sorted', () => {
    const placed = items(80, 20, 50);
    avoidOverlaps(placed, 0, 100, 2);
    expect(placed.map((p) => p.pos)).toEqual([20, 50, 80]);
  });

  it('pushes colliding labels apart', () => {
    const placed = items(50, 50, 50);
    avoidOverlaps(placed, 0, 100, 2);
    expectNoOverlap(placed, 2);
    expect(placed[0]?.pos).toBe(50);
  });

  it('pulls an overflowing stack back inside the bounds when it fits', () => {
    const placed = items(95, 96, 97, 98);
    avoidOverlaps(placed, 0, 100, 2);
    expectNoOverlap(placed, 2);
    const last = placed[placed.length - 1] as Placed;
    expect(last.pos + last.size / 2).toBeLessThanOrEqual(100);
    expect((placed[0] as Placed).pos - 5).toBeGreaterThanOrEqual(0);

    const low = items(-20, 0, 1);
    avoidOverlaps(low, 0, 100, 2);
    expectNoOverlap(low, 2);
    expect((low[0] as Placed).pos - 5).toBeGreaterThanOrEqual(0);
  });
});
