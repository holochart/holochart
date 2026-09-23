import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { createResourceManager } from '../resources.ts';
import { effectiveTransform } from './common.ts';
import {
  RectPrimitive,
  packRects,
  rectCount,
  rectCoverage,
  rectScreenGeometry,
  roundedRectSDF,
  snapRectSpan,
} from './rect.ts';

describe('packRects', () => {
  it('uses the shortest coordinate array as the count', () => {
    expect(rectCount({ x0: [0, 1, 2], y0: [0, 0], x1: [1, 2, 3], y1: [1, 1, 1] })).toBe(2);
  });

  it('RTC-encodes corners so ms timestamps stay precise in float32', () => {
    const t0 = 1_700_000_000_000;
    const packed = packRects({
      x0: new Float64Array([t0 + 100, t0 + 300]),
      x1: new Float64Array([t0 + 200, t0 + 400]),
      y0: new Float64Array([0, 0]),
      y1: new Float64Array([5, 7]),
    });
    expect(packed.origin[0]).toBe(t0 + 250);
    expect([...packed.rect]).toEqual([-150, -3.5, -50, 1.5, 50, -3.5, 150, 3.5]);
    // 1 px per ms, window starting at t0: world x of the first bar's left edge is 100.
    const { scale, offset } = effectiveTransform(
      { scaleX: 1, scaleY: 1, offsetX: -t0, offsetY: 0 },
      packed.origin,
    );
    const world = Math.fround(Math.fround(packed.rect[0]! * scale[0]) + Math.fround(offset[0]));
    expect(world).toBeCloseTo(100, 3);
  });

  it('zeroes rects with non-finite coordinates (culled) without skewing the origin', () => {
    const packed = packRects({ x0: [0, NaN], y0: [0, 0], x1: [10, 5], y1: [10, 5] });
    expect(packed.origin).toEqual([5, 5, 0]);
    expect([...packed.rect.subarray(4)]).toEqual([0, 0, 0, 0]);
  });

  it('packs z relative to its own origin and broadcasts a short z array', () => {
    const packed = packRects({ x0: [0, 0], y0: [0, 0], x1: [1, 1], y1: [1, 1], z: [4] });
    expect(packed.origin[2]).toBe(4);
    expect([...packed.z]).toEqual([0, 0]);
  });
});

describe('roundedRectSDF', () => {
  it('is exact for a sharp box', () => {
    expect(roundedRectSDF(0, 0, 10, 5, 0)).toBe(-5);
    expect(roundedRectSDF(12, 0, 10, 5, 0)).toBe(2);
    expect(roundedRectSDF(13, 9, 10, 5, 0)).toBe(5); // corner: hypot(3, 4)
  });

  it('rounds corners with radius r', () => {
    // The corner circle is centred at (hx - r, hy - r).
    expect(roundedRectSDF(10, 5, 10, 5, 2)).toBeCloseTo(Math.SQRT2 * 2 - 2, 12);
    expect(roundedRectSDF(8 + Math.SQRT1_2 * 2, 3 + Math.SQRT1_2 * 2, 10, 5, 2)).toBeCloseTo(0, 12);
    // Edges away from the corners are unaffected.
    expect(roundedRectSDF(10, 0, 10, 5, 2)).toBeCloseTo(0, 12);
  });

  it('is 1-Lipschitz (a true distance field)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -50, max: 50, noNaN: true }),
        fc.double({ min: -50, max: 50, noNaN: true }),
        fc.double({ min: -1, max: 1, noNaN: true }),
        fc.double({ min: -1, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (x, y, dx, dy, rf) => {
          const r = rf * 8;
          const a = roundedRectSDF(x, y, 20, 8, r);
          const b = roundedRectSDF(x + dx, y + dy, 20, 8, r);
          return Math.abs(a - b) <= Math.hypot(dx, dy) + 1e-9;
        },
      ),
    );
  });
});

describe('pixel snapping', () => {
  it('snaps a span to device pixels without collapsing it', () => {
    expect(snapRectSpan(10.3, 20.6, 1)).toEqual([10, 21]);
    expect(snapRectSpan(10.3, 10.45, 1)).toEqual([10, 11]);
    expect(snapRectSpan(10.45, 10.3, 1)).toEqual([10, 9]);
    expect(snapRectSpan(10.3, 20.6, 2)).toEqual([10.5, 20.5]);
    expect(snapRectSpan(5, 5, 1)).toEqual([5, 5]);
  });

  const style = { borderWidth: 1, snap: true, borderAlign: 'inside' as const, pixelRatio: 1 };

  /** Coverage sampled at device-pixel centers of one row, as [outer, border-only] pairs. */
  function row(g: ReturnType<typeof rectScreenGeometry>, dpr: number, from: number, to: number) {
    const out: { x: number; outer: number; border: number }[] = [];
    for (let i = Math.floor(from * dpr); i < to * dpr; i++) {
      const x = (i + 0.5) / dpr;
      const c = rectCoverage(x, (g.y0 + g.y1) / 2, g, 0, dpr);
      out.push({ x, outer: c.outer, border: c.outer * (1 - c.inner) });
    }
    return out;
  }

  it('a snapped 1px border covers exactly one device-pixel column at DPR 1', () => {
    const g = rectScreenGeometry(20.37, 10.2, 40.81, 30.6, style);
    expect([g.x0, g.x1]).toEqual([20, 41]);
    const cells = row(g, 1, 15, 45);
    for (const c of cells) {
      expect(c.outer === 0 || c.outer === 1).toBe(true);
      expect(c.border === 0 || c.border === 1).toBe(true);
    }
    expect(cells.filter((c) => c.border === 1).map((c) => c.x)).toEqual([20.5, 40.5]);
  });

  it('a snapped 1px border covers two device-pixel columns at DPR 2', () => {
    const g = rectScreenGeometry(20.37, 10.2, 40.81, 30.6, { ...style, pixelRatio: 2 });
    const cells = row(g, 2, 15, 45);
    for (const c of cells) expect(c.border === 0 || c.border === 1).toBe(true);
    expect(cells.filter((c) => c.border === 1).length).toBe(4);
  });

  it('unsnapped fractional edges blur the border over two columns', () => {
    const g = rectScreenGeometry(20.37, 10.2, 40.81, 30.6, { ...style, snap: false });
    const partial = row(g, 1, 15, 45).filter((c) => c.border > 0 && c.border < 1);
    expect(partial.length).toBeGreaterThan(0);
  });

  it('rounds the border width to whole device pixels (at least one)', () => {
    expect(rectScreenGeometry(0, 0, 10, 10, { ...style, borderWidth: 0.4 }).borderWidth).toBe(1);
    expect(rectScreenGeometry(0, 0, 10, 10, { ...style, borderWidth: 1.6 }).borderWidth).toBe(2);
    expect(
      rectScreenGeometry(0, 0, 10, 10, { ...style, borderWidth: 0.4, pixelRatio: 2 }).borderWidth,
    ).toBe(0.5);
  });

  it('centered odd-width borders snap the outer edge to a pixel boundary', () => {
    const g = rectScreenGeometry(20.37, 10.2, 40.81, 30.6, { ...style, borderAlign: 'center' });
    expect(g.outset).toBe(0.5);
    expect([g.x0, g.x1]).toEqual([20.5, 40.5]);
    const cells = row(g, 1, 15, 45);
    for (const c of cells) expect(c.outer === 0 || c.outer === 1).toBe(true);
    expect(cells.filter((c) => c.border === 1).map((c) => c.x)).toEqual([20.5, 40.5]);
  });
});

describe('rectCoverage', () => {
  const opts = { borderWidth: 2, snap: false, borderAlign: 'inside' as const, pixelRatio: 1 };

  it('treats inverted rects like normalized ones', () => {
    const a = rectScreenGeometry(10, 20, 50, 60, opts);
    const b = rectScreenGeometry(50, 60, 10, 20, opts);
    for (const [x, y] of [
      [10, 20],
      [11, 40],
      [30, 40],
      [49.5, 59.5],
      [55, 40],
    ] as const) {
      expect(rectCoverage(x, y, b, 5, 1)).toEqual(rectCoverage(x, y, a, 5, 1));
    }
  });

  it('clamps the corner radius to half the smaller side (a pill)', () => {
    const g = rectScreenGeometry(0, 0, 100, 20, { ...opts, borderWidth: 0 });
    // With r clamped to 10, the ends are semicircles centred at (10, 10) and (90, 10).
    expect(
      rectCoverage(10 - 10 * Math.SQRT1_2 + 2, 10 + 10 * Math.SQRT1_2 - 2, g, 1e6, 1).outer,
    ).toBe(1);
    expect(rectCoverage(1, 1, g, 1e6, 1).outer).toBe(0);
    expect(rectCoverage(1, 1, g, 0, 1).outer).toBe(1);
  });

  it('draws fill inside the border and border in the ring', () => {
    const g = rectScreenGeometry(0, 0, 40, 40, opts);
    expect(rectCoverage(20, 20, g, 0, 1)).toEqual({ outer: 1, inner: 1 });
    expect(rectCoverage(1, 20, g, 0, 1)).toEqual({ outer: 1, inner: 0 });
    expect(rectCoverage(-1, 20, g, 0, 1).outer).toBe(0);
  });

  it('without a border the edge fringe is pure fill', () => {
    const g = rectScreenGeometry(0, 0, 40, 40, { ...opts, borderWidth: 0 });
    const c = rectCoverage(0.2, 20, g, 0, 1);
    expect(c.inner).toBe(1);
    expect(c.outer).toBeCloseTo(0.7, 12);
  });

  it('coverage stays in [0, 1]', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -20, max: 80, noNaN: true }),
        fc.double({ min: -20, max: 80, noNaN: true }),
        fc.double({ min: 0, max: 30, noNaN: true }),
        fc.double({ min: 0, max: 10, noNaN: true }),
        (x, y, r, bw) => {
          const g = rectScreenGeometry(3.3, 7.1, 57.9, 41.2, { ...opts, borderWidth: bw });
          const c = rectCoverage(x, y, g, r, 1.5);
          return c.outer >= 0 && c.outer <= 1 && c.inner >= 0 && c.inner <= 1;
        },
      ),
    );
  });
});

describe('RectPrimitive', () => {
  function create(count: number) {
    const resources = createResourceManager();
    let invalidations = 0;
    const ctx = { resources, invalidate: () => void invalidations++ };
    const coords = (v: number) => new Float64Array(count).fill(v);
    const prim = new RectPrimitive(ctx, {
      x0: coords(0),
      y0: coords(0),
      x1: coords(1),
      y1: coords(1),
      fill: [1, 0, 0, 1],
    });
    return { prim, resources, invalidations: () => invalidations };
  }

  it('draws all rects with one instanced mesh', () => {
    const { prim } = create(40);
    expect(prim.instanceCount).toBe(40);
    expect(prim.object.frustumCulled).toBe(false);
  });

  it('style-only updates re-upload only the affected attribute', () => {
    const { prim } = create(3);
    const geometry = (prim.object as unknown as { geometry: import('three').BufferGeometry })
      .geometry;
    const versions = () =>
      Object.fromEntries(
        ['iRect', 'iFill', 'iBorderColor', 'iStyle'].map((n) => [
          n,
          (geometry.getAttribute(n) as import('three').InstancedBufferAttribute).version,
        ]),
      );
    const before = versions();
    prim.update({ fill: new Float32Array([0, 1, 0, 1, 0, 0, 1, 1, 1, 1, 1, 1]) });
    const after = versions();
    expect(after.iFill).toBe(before.iFill! + 1);
    expect(after.iRect).toBe(before.iRect);
    expect(after.iBorderColor).toBe(before.iBorderColor);
    expect(after.iStyle).toBe(before.iStyle);
    prim.update({ y1: new Float64Array([2, 3, 4]) });
    expect(versions().iRect).toBe(after.iRect! + 1);
    expect(versions().iFill).toBe(after.iFill);
  });

  it('grows capacity and releases the shared quad on dispose', () => {
    const { prim, resources } = create(4);
    prim.update({
      x0: new Float64Array(100),
      y0: new Float64Array(100),
      x1: new Float64Array(100).fill(1),
      y1: new Float64Array(100).fill(1),
    });
    expect(prim.instanceCount).toBe(100);
    expect(resources.stats().map((s) => s.refs)).toEqual([1]);
    prim.dispose();
    expect(resources.stats()).toEqual([]);
  });
});
