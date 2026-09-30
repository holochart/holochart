import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { anchorsFor, cullOverlaps, labelBox, outwardNormal } from './labels.ts';

describe('scene label placement', () => {
  it('pushes labels off an edge away from the box center', () => {
    // A horizontal edge below the center: labels go down (screen y is down).
    expect(outwardNormal(0, 100, 200, 100, 100, 50)).toEqual([-0, 1]);
    // A vertical edge left of the center: labels go left.
    const [nx, ny] = outwardNormal(0, 0, 0, 100, 50, 50);
    expect(nx).toBe(-1);
    expect(ny).toBeCloseTo(0, 12);
    // An edge seen end-on: away from the center.
    expect(outwardNormal(10, 0, 10, 0, 0, 0)).toEqual([1, 0]);
  });

  it('normals are unit length and point away from the center', () => {
    const c = fc.double({ min: -500, max: 500, noNaN: true });
    fc.assert(
      fc.property(c, c, c, c, c, c, (ax, ay, bx, by, cx, cy) => {
        fc.pre(Math.hypot(bx - ax, by - ay) > 1e-3);
        const [nx, ny] = outwardNormal(ax, ay, bx, by, cx, cy);
        expect(Math.hypot(nx, ny)).toBeCloseTo(1, 9);
        expect(nx * ((ax + bx) / 2 - cx) + ny * ((ay + by) / 2 - cy)).toBeGreaterThanOrEqual(-1e-6);
      }),
    );
  });

  it('anchors the label on the side facing its edge', () => {
    expect(anchorsFor(0, 1)).toEqual({ anchorX: 'center', anchorY: 'top' });
    expect(anchorsFor(-1, 0)).toEqual({ anchorX: 'right', anchorY: 'middle' });
    expect(anchorsFor(0.7, -0.7)).toEqual({ anchorX: 'left', anchorY: 'bottom' });
    expect(labelBox(10, 20, 30, 8, 'right', 'top')).toEqual({ x0: -20, y0: 20, x1: 10, y1: 28 });
    expect(labelBox(10, 20, 30, 8, 'center', 'middle')).toEqual({ x0: -5, y0: 16, x1: 25, y1: 24 });
  });

  it('culls greedily, in order', () => {
    const box = (x: number) => ({ box: labelBox(x, 0, 10, 10, 'left', 'top'), id: x });
    const kept = cullOverlaps([box(0), box(5), box(11), box(13), box(30)], 2);
    expect(kept.map((k) => k.id)).toEqual([0, 13, 30]);
  });
});
