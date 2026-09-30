import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  sceneAspect,
  sceneExtent,
  sceneRange,
  sceneScale,
  sceneTicks,
  sceneTransform,
  unionExtent,
} from './axes.ts';

const linear = (extra: Record<string, unknown> = {}) => ({
  type: 'linear',
  autorange: true,
  ...extra,
});

describe('scene autorange (Plotly 3D)', () => {
  it('pads the data extent by 1/32 of its span on each side', () => {
    const scale = sceneScale(linear());
    expect(sceneRange(scale, linear(), [0, 32])).toEqual([-1, 33]);
  });

  it('spans ±1 around a single value and [-1, 1] without data', () => {
    const scale = sceneScale(linear());
    expect(sceneRange(scale, linear(), [5, 5])).toEqual([4, 6]);
    expect(sceneRange(scale, linear(), undefined)).toEqual([-1, 1]);
  });

  it('includes 0 with rangemode tozero, then pads', () => {
    const scale = sceneScale(linear());
    expect(sceneRange(scale, linear({ rangemode: 'tozero' }), [16, 32])).toEqual([-1, 33]);
  });

  it('honors reversed and partial autorange and fixed ranges', () => {
    const scale = sceneScale(linear());
    expect(sceneRange(scale, linear({ autorange: 'reversed' }), [0, 32])).toEqual([33, -1]);
    expect(sceneRange(scale, linear({ autorange: false, range: [2, 3] }), [0, 32])).toEqual([2, 3]);
    expect(sceneRange(scale, linear({ autorange: 'max', range: [0, null] }), [10, 42])).toEqual([
      0, 43,
    ]);
  });

  it('extents skip non-finite values', () => {
    expect(sceneExtent([3, NaN, -1, Infinity, 2])).toEqual([-1, 3]);
    expect(sceneExtent([NaN])).toBeUndefined();
    expect(unionExtent([[0, 1], undefined, [-2, 0.5]])).toEqual([-2, 1]);
    expect(unionExtent([undefined])).toBeUndefined();
  });
});

describe('aspect modes (Plotly rules)', () => {
  const lin = ['linear', 'linear', 'linear'] as const;

  it('cube and manual', () => {
    expect(sceneAspect('cube', [2, 3, 4], lin, [10, 1, 1])).toEqual([1, 1, 1]);
    expect(sceneAspect('manual', [2, 3, 4], lin, [10, 1, 1])).toEqual([2, 3, 4]);
  });

  it('data: spans over their geometric mean, per axis type', () => {
    const [x, y, z] = sceneAspect('data', [1, 1, 1], lin, [8, 2, 1]);
    // Geometric mean of 8, 2, 1 is ∛16.
    const g = Math.cbrt(16);
    expect(x).toBeCloseTo(8 / g, 12);
    expect(y).toBeCloseTo(2 / g, 12);
    expect(z).toBeCloseTo(1 / g, 12);
    // A log axis is compared with itself only: ratio 1.
    const mixed = sceneAspect('data', [1, 1, 1], ['linear', 'linear', 'log'], [4, 1, 7]);
    expect(mixed[2]).toBeCloseTo(1, 12);
    expect(mixed[0]).toBeCloseTo(2, 12);
    // No data on an axis counts as a span of 1.
    expect(sceneAspect('data', [1, 1, 1], lin, [0, 0, 0])).toEqual([1, 1, 1]);
  });

  it('auto: data unless the longest axis is more than 4 times the shortest', () => {
    const near = sceneAspect('auto', [1, 1, 1], lin, [4, 1, 1]);
    expect(Math.max(...near) / Math.min(...near)).toBeCloseTo(4, 12);
    expect(sceneAspect('auto', [1, 1, 1], lin, [5, 1, 1])).toEqual([1, 1, 1]);
  });
});

describe('scene transform', () => {
  it('maps each range onto [-a/2, a/2], reversed ranges flipped', () => {
    const range = fc
      .tuple(
        fc.double({ min: -1e6, max: 1e6, noNaN: true }),
        fc.double({ min: 1e-3, max: 1e6, noNaN: true }),
      )
      .map(([a, d]) => [a, a + d] as [number, number]);
    const aspect = fc.double({ min: 0.1, max: 5, noNaN: true });
    fc.assert(
      fc.property(range, range, range, aspect, aspect, aspect, (rx, ry, rz, ax, ay, az) => {
        const t = sceneTransform([rx, [ry[1], ry[0]], rz], [ax, ay, az]);
        const tol = (a: number): number => 1e-6 * Math.max(1, a);
        expect(Math.abs(rx[0] * t.scaleX + t.offsetX + ax / 2)).toBeLessThan(tol(ax));
        expect(Math.abs(rx[1] * t.scaleX + t.offsetX - ax / 2)).toBeLessThan(tol(ax));
        // Reversed y: its first range value lands on -a/2.
        expect(Math.abs(ry[1] * t.scaleY + t.offsetY + ay / 2)).toBeLessThan(tol(ay));
        expect(Math.abs(rz[1] * t.scaleZ + t.offsetZ - az / 2)).toBeLessThan(tol(az));
      }),
    );
  });
});

describe('scene ticks', () => {
  it('about one tick per 40 px, 4 to 9 of them, unless nticks is set', () => {
    const scale = sceneScale(linear());
    scale.setRange(0, 100);
    const count = (len: number, axis = linear()): number =>
      sceneTicks(scale, axis, len).filter((t) => t.l >= 0 && t.l <= 100).length;
    expect(count(40)).toBeGreaterThanOrEqual(3);
    expect(count(40)).toBeLessThanOrEqual(6);
    expect(count(2000)).toBeLessThanOrEqual(11);
    expect(count(400)).toBeGreaterThan(count(40));
    expect(count(2000, linear({ nticks: 2 }))).toBeLessThanOrEqual(3);
  });

  it('writes date labels on one line', () => {
    const scale = sceneScale({ type: 'date' });
    scale.setRange(Date.UTC(2024, 0, 1), Date.UTC(2024, 0, 3));
    const ticks = sceneTicks(scale, { type: 'date', tickmode: 'auto' }, 400);
    expect(ticks.length).toBeGreaterThan(0);
    expect(ticks.some((t) => t.text.includes('<br>'))).toBe(false);
  });
});
