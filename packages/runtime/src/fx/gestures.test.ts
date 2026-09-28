import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { CLICK_TOLERANCE } from './geometry.ts';
import {
  DOUBLE_TAP_DISTANCE,
  isDoubleTap,
  isPageScroll,
  isTap,
  pinchFactor,
  pinchRange,
  TAP_TOLERANCE,
  tapTolerance,
  touchActionFor,
} from './gestures.ts';

describe('tap vs drag', () => {
  it('gives fingers and pens a larger tolerance than a mouse', () => {
    expect(tapTolerance('mouse')).toBe(CLICK_TOLERANCE);
    expect(tapTolerance(undefined)).toBe(CLICK_TOLERANCE);
    expect(tapTolerance('touch')).toBe(TAP_TOLERANCE);
    expect(tapTolerance('pen')).toBe(TAP_TOLERANCE);
    expect(isTap(6, 6, 'touch')).toBe(true);
    expect(isTap(6, 6, 'mouse')).toBe(false);
    expect(isTap(TAP_TOLERANCE, 0, 'touch')).toBe(true);
    expect(isTap(TAP_TOLERANCE + 0.5, 0, 'touch')).toBe(false);
  });

  it('classifies by travel distance only (property)', () => {
    const d = fc.double({ min: -50, max: 50, noNaN: true });
    fc.assert(
      fc.property(d, d, fc.constantFrom('mouse', 'pen', 'touch'), (dx, dy, type) => {
        expect(isTap(dx, dy, type)).toBe(Math.hypot(dx, dy) <= tapTolerance(type));
        // Direction doesn't matter.
        expect(isTap(-dx, dy, type)).toBe(isTap(dx, -dy, type));
      }),
    );
  });

  it('pairs taps into double taps within the delay and distance', () => {
    expect(isDoubleTap(200, 20, -20, 300, 'touch')).toBe(true);
    expect(isDoubleTap(200, DOUBLE_TAP_DISTANCE + 1, 0, 300, 'touch')).toBe(false);
    expect(isDoubleTap(300, 0, 0, 300, 'touch')).toBe(false);
    // A mouse double click keeps the click tolerance.
    expect(isDoubleTap(200, CLICK_TOLERANCE, 0, 300, 'mouse')).toBe(true);
    expect(isDoubleTap(200, CLICK_TOLERANCE + 1, 0, 300, 'mouse')).toBe(false);
  });

  it('leaves vertical-first swipes to the page only under pan-y', () => {
    expect(isPageScroll('pan-y', 3, 12)).toBe(true);
    expect(isPageScroll('pan-y', 12, 3)).toBe(false);
    expect(isPageScroll('pan-y', -12, -12)).toBe(false);
    expect(isPageScroll('none', 0, 20)).toBe(false);
    expect(isPageScroll('manipulation', 0, 20)).toBe(false);
  });
});

describe('touchActionFor', () => {
  it('keeps vertical page scrolling in zoom mode (the default)', () => {
    expect(touchActionFor('zoom', true, true, true, undefined)).toBe('pan-y');
    expect(touchActionFor('zoom', true, false, true, undefined)).toBe('pan-y');
    // Nothing can zoom: taps only.
    expect(touchActionFor('zoom', true, false, false, undefined)).toBe('manipulation');
  });

  it('takes every gesture for tools picked on purpose', () => {
    for (const mode of ['select', 'lasso', 'drawrect', 'drawopenpath'] as const) {
      expect(touchActionFor(mode, true, false, false, undefined)).toBe('none');
    }
    expect(touchActionFor('pan', true, true, true, undefined)).toBe('none');
    // Only x pans: vertical swipes stay the page's.
    expect(touchActionFor('pan', true, true, false, undefined)).toBe('pan-y');
    expect(touchActionFor('pan', true, false, false, undefined)).toBe('manipulation');
  });

  it('leaves swipes and pinches to the page when dragging is off or there is no cartesian plot', () => {
    for (const mode of [false, 'orbit', 'turntable'] as const) {
      expect(touchActionFor(mode, true, true, true, undefined)).toBe('manipulation');
    }
    expect(touchActionFor('zoom', false, false, false, undefined)).toBe('manipulation');
    expect(touchActionFor('select', false, false, false, undefined)).toBe('manipulation');
  });

  it('uses the most restrictive of the dragmode and the traces', () => {
    expect(touchActionFor(false, false, false, false, 'pan-y')).toBe('pan-y');
    expect(touchActionFor('zoom', true, true, true, 'none')).toBe('none');
    expect(touchActionFor('select', true, true, true, 'pan-y')).toBe('none');
    expect(touchActionFor(false, true, true, true, 'none')).toBe('none');
  });
});

describe('pinch', () => {
  it('zooms by the ratio of finger distances', () => {
    expect(pinchFactor(100, 200)).toBe(0.5);
    expect(pinchFactor(200, 100)).toBe(2);
    // Fingers on top of each other count as 1 px apart (no division by zero).
    expect(pinchFactor(0, 0)).toBe(1);
    expect(pinchFactor(10, 0)).toBe(10);
  });

  it('zooms around a fixed midpoint', () => {
    // [0, 10] over 100 px, midpoint at 50 px (value 5), fingers twice as far apart.
    expect(pinchRange([0, 10], 100, 50, 50, 0.5)).toEqual([2.5, 7.5]);
    // Midpoint at 20 px (value 2): 2 stays under it.
    expect(pinchRange([0, 10], 100, 20, 20, 0.5)).toEqual([1, 6]);
  });

  it('pans with the midpoint without zooming', () => {
    // Midpoint moved 30 px toward range[1]: the range moves 3 units the other way.
    expect(pinchRange([0, 10], 100, 50, 80, 1)).toEqual([-3, 7]);
    // Reversed axis.
    expect(pinchRange([10, 0], 100, 50, 80, 1)).toEqual([13, 3]);
  });

  it('keeps the value under the start midpoint under the current midpoint (property)', () => {
    const value = fc.double({ min: -1e6, max: 1e6, noNaN: true });
    const span = fc.double({ min: 1e-3, max: 1e6, noNaN: true });
    const px = fc.double({ min: 0, max: 1000, noNaN: true });
    fc.assert(
      fc.property(
        value,
        span,
        fc.boolean(),
        fc.integer({ min: 10, max: 2000 }),
        px,
        px,
        fc.double({ min: 0.01, max: 100, noNaN: true }),
        (r0, w, reversed, length, p0, p1, factor) => {
          const start: [number, number] = reversed ? [r0 + w, r0] : [r0, r0 + w];
          const out = pinchRange(start, length, p0, p1, factor);
          const at = (r: readonly [number, number], p: number): number =>
            r[0] + (p / length) * (r[1] - r[0]);
          const tol = 1e-9 * (Math.abs(r0) + w * (1 + factor) + 1);
          // The grabbed value follows the midpoint.
          expect(Math.abs(at(out, p1) - at(start, p0))).toBeLessThanOrEqual(tol);
          // The span scales by the factor, orientation kept.
          expect(Math.abs(out[1] - out[0] - (start[1] - start[0]) * factor)).toBeLessThanOrEqual(
            tol,
          );
        },
      ),
    );
  });
});
