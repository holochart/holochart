import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { createMarkers } from '../markers/markers.ts';
import { createResourceManager } from '../resources.ts';
import { PointPicker2D, arrayPointSource, markerPointSource } from './cpu-picking.ts';

describe('PointPicker2D', () => {
  it('closest: nearest point within the radius, in world pixels', () => {
    const picker = new PointPicker2D();
    picker.add(arrayPointSource([0, 10, 20], [0, 0, 0]), 3);
    const [hit] = picker.pick(12, 1, 5);
    expect(hit).toEqual({
      traceIndex: 3,
      pointIndex: 1,
      distance: Math.hypot(2, 1),
      kind: 'point',
    });
    expect(picker.pick(15, 0, 4.9)).toEqual([]);
    expect(picker.pick(15, 0, 5)).toHaveLength(1);
  });

  it('measures distances after the source → world transform (anisotropic, negative scales)', () => {
    // Data x in [0, 1] stretched to 1000 px, y flipped and compressed.
    const source = arrayPointSource([0, 0.5, 1], [0, 1, 2], {
      scaleX: 1000,
      scaleY: -10,
      offsetX: 5,
      offsetY: 100,
    });
    const picker = new PointPicker2D();
    picker.add(source);
    // World of point 1 = (505, 90).
    expect(picker.pick(507, 91, 5)).toEqual([
      { traceIndex: 0, pointIndex: 1, distance: Math.hypot(2, 1), kind: 'point' },
    ]);
    // Pan/zoom is applied at query time: no rebuild needed.
    source.setTransform({ scaleX: 10, scaleY: 10, offsetX: 0, offsetY: 0 });
    expect(picker.pick(10, 20, 1)[0]?.pointIndex).toBe(2);
  });

  it('all: every point in the radius, sorted by distance then trace', () => {
    const picker = new PointPicker2D();
    picker.add(arrayPointSource([0, 3, -4], [0, 0, 0]), 0);
    picker.add(arrayPointSource([3], [0]), 1);
    const hits = picker.pick(0, 0, 4, 'all');
    expect(hits.map((h) => [h.traceIndex, h.pointIndex, h.distance])).toEqual([
      [0, 0, 0],
      [0, 1, 3],
      [1, 0, 3],
      [0, 2, 4],
    ]);
  });

  it('x / y: per trace, the point nearest along one axis (any distance on the other)', () => {
    const picker = new PointPicker2D();
    picker.add(arrayPointSource([0, 10, 11], [500, 0, -300]), 0);
    picker.add(arrayPointSource([9.5, 30], [1000, 0]), 1);
    const hits = picker.pick(10.4, 0, 2, 'x');
    expect(hits.map((h) => [h.traceIndex, h.pointIndex, +h.distance.toFixed(6)])).toEqual([
      [0, 1, 0.4],
      [1, 0, 0.9],
    ]);
    const ys = picker.pick(0, 499, 2, 'y');
    expect(ys.map((h) => [h.traceIndex, h.pointIndex])).toEqual([[0, 0]]);
  });

  it('x mode breaks ties by the other axis', () => {
    const picker = new PointPicker2D();
    picker.add(arrayPointSource([5, 5], [100, 3]));
    expect(picker.pick(5, 0, 1, 'x')[0]?.pointIndex).toBe(1);
  });

  it('skips NaN gaps and handles degenerate scales', () => {
    const source = arrayPointSource([NaN, 1, 2], [0, NaN, 0], {
      scaleX: 0,
      scaleY: 1,
      offsetX: 50,
      offsetY: 0,
    });
    const picker = new PointPicker2D();
    picker.add(source);
    // All x collapse to 50; only point 2 is finite in both axes.
    expect(picker.pick(51, 0, 2)).toEqual([
      { traceIndex: 0, pointIndex: 2, distance: 1, kind: 'point' },
    ]);
    expect(picker.pick(60, 0, 2)).toEqual([]);
  });

  it('rebuilds lazily when the source version changes', () => {
    const x = [0, 10];
    const source = arrayPointSource(x, [0, 0]);
    const read = vi.spyOn(source, 'readPositions');
    const picker = new PointPicker2D();
    picker.add(source);
    picker.pick(0, 0, 1);
    picker.pick(10, 0, 1);
    expect(read).toHaveBeenCalledTimes(1);
    source.invalidate([100, 10], [0, 0]);
    expect(picker.pick(100, 0, 1)[0]?.pointIndex).toBe(0);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('registration lifecycle', () => {
    const picker = new PointPicker2D();
    const a = arrayPointSource([0], [0]);
    const b = arrayPointSource([1], [0]);
    const ida = picker.add(a, 1);
    expect(picker.add(a, 4)).toBe(ida); // re-adding updates the trace
    expect(picker.pick(0, 0, 1)[0]?.traceIndex).toBe(4);
    const idb = picker.add(b);
    expect(picker.size).toBe(2);
    expect(picker.remove(ida)).toBe(true);
    expect(picker.remove(ida)).toBe(false);
    expect(picker.has(a)).toBe(false);
    expect(picker.remove(b)).toBe(true);
    expect(picker.has(b)).toBe(false);
    expect(idb).not.toBe(ida);
    picker.add(a);
    picker.clear();
    expect(picker.size).toBe(0);
    expect(picker.pick(0, 0, 10)).toEqual([]);
  });

  it('rejects bad queries', () => {
    const picker = new PointPicker2D();
    picker.add(arrayPointSource([0], [0]));
    expect(picker.pick(NaN, 0, 5)).toEqual([]);
    expect(picker.pick(0, 0, -1)).toEqual([]);
    expect(picker.pick(0, 0, NaN)).toEqual([]);
    expect(picker.pick(1e9, 0, Infinity)).toHaveLength(1);
  });

  it('closest agrees with brute force', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(
            fc.double({ min: -50, max: 50, noNaN: true }),
            fc.double({ min: -50, max: 50, noNaN: true }),
          ),
          { maxLength: 60 },
        ),
        fc.double({ min: 0.1, max: 3, noNaN: true }),
        fc.double({ min: -3, max: 3, noNaN: true }),
        fc.double({ min: -40, max: 40, noNaN: true }),
        fc.double({ min: -40, max: 40, noNaN: true }),
        fc.double({ min: 0, max: 30, noNaN: true }),
        (pts, sx, sy, qx, qy, r) => {
          const xs = pts.map((p) => p[0]);
          const ys = pts.map((p) => p[1]);
          const t = { scaleX: sx, scaleY: sy, offsetX: 1, offsetY: -2 };
          const picker = new PointPicker2D();
          picker.add(arrayPointSource(xs, ys, t));
          let best = Infinity;
          for (let i = 0; i < xs.length; i++) {
            const d = Math.hypot(xs[i]! * sx + 1 - qx, ys[i]! * sy - 2 - qy);
            if (d <= r) best = Math.min(best, d);
          }
          const hit = picker.pick(qx, qy, r)[0];
          if (best === Infinity) expect(hit).toBeUndefined();
          else expect(hit?.distance).toBeCloseTo(best, 9);
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe('markerPointSource', () => {
  function markers(data: Parameters<typeof createMarkers>[1]) {
    return createMarkers({ resources: createResourceManager(), invalidate: () => {} }, data);
  }

  it('indexes the drawn RTC positions and follows setTransform live', () => {
    const m = markers({ x: [1000, 1010, NaN], y: [5, 6, 7] });
    const picker = new PointPicker2D();
    picker.add(markerPointSource(m), 2);
    m.setTransform({ scaleX: 2, scaleY: 1, offsetX: -2000, offsetY: 0 });
    // Point 1 world = (20, 6).
    expect(picker.pick(21, 6, 2)).toEqual([
      { traceIndex: 2, pointIndex: 1, distance: 1, kind: 'point' },
    ]);
    // The hidden gap (NaN x) is never returned.
    expect(picker.pick(0, 7, 1000, 'all').map((h) => h.pointIndex)).toEqual([0, 1]);
  });

  it('rebuilds after update and patch (streaming appends)', () => {
    const m = markers({ x: [0, 1], y: [0, 0] });
    const source = markerPointSource(m);
    const picker = new PointPicker2D();
    picker.add(source);
    const v0 = source.version;
    m.update({ x: [0, 1, 2], y: [0, 0, 0] });
    expect(source.version).not.toBe(v0);
    expect(picker.pick(2, 0, 0.1)[0]?.pointIndex).toBe(2);
    const v1 = source.version;
    m.patch(3, 1, { x: [3], y: [0] });
    expect(source.version).not.toBe(v1);
    expect(source.count).toBe(4);
    expect(picker.pick(3, 0, 0.1)[0]?.pointIndex).toBe(3);
    // Style-only updates do not bump the version.
    const v2 = source.version;
    m.update({ size: 12 });
    m.setTransform({ scaleX: 1, scaleY: 1, offsetX: 1, offsetY: 0 });
    expect(source.version).toBe(v2);
  });

  it('handles an empty marker set', () => {
    const m = markers({});
    expect(m.positionArray).toBeNull();
    const picker = new PointPicker2D();
    picker.add(markerPointSource(m));
    expect(picker.pick(0, 0, 100)).toEqual([]);
  });
});
