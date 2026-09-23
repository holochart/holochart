import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  emulateShaderWorld,
  HIDDEN_POSITION as HIDDEN64,
  rtcAxisOrigin,
  rtcEncodePositions,
  rtcOffset,
} from './precision.ts';

const HIDDEN_POSITION = Math.fround(HIDDEN64);

describe('RTC origin', () => {
  it('is the center of the finite range', () => {
    expect(rtcAxisOrigin([1, 5, NaN, 3], 4)).toBe(3);
    expect(rtcAxisOrigin([NaN, Infinity, -Infinity], 3)).toBe(0);
    expect(rtcAxisOrigin(null, 3)).toBe(0);
    expect(rtcAxisOrigin([10, 20, 1000], 2)).toBe(15);
  });
});

describe('RTC encoding', () => {
  it('subtracts the origin and hides non-finite points', () => {
    const out = new Float32Array(9);
    rtcEncodePositions(out, 0, 3, 0, [10, 20, 0], [11, NaN, 9], [22, 1, 18], null);
    expect([...out]).toEqual([
      1,
      2,
      0,
      HIDDEN_POSITION,
      HIDDEN_POSITION,
      HIDDEN_POSITION,
      -1,
      -2,
      0,
    ]);
  });

  it('hides items past the end of a source array and honors source offsets', () => {
    const out = new Float32Array(9);
    rtcEncodePositions(out, 1, 3, 1, [0, 0, 0], [5], [6], [7]);
    expect([...out.subarray(3)]).toEqual([
      5,
      6,
      7,
      HIDDEN_POSITION,
      HIDDEN_POSITION,
      HIDDEN_POSITION,
    ]);
  });
});

describe('precision (E16.4)', () => {
  // 2026-06-01T00:00:00Z in ms, one sample per ms for an hour.
  const T0 = Date.UTC(2026, 5, 1);
  const HOUR = 3_600_000;

  /** Pixel positions for a 1-second window [w0, w0 + 1000) mapped onto 1000 px. */
  function project(
    t: number,
    w0: number,
    origin: number,
  ): { exact: number; rtc: number; naive: number } {
    const scale = 1000 / 1000; // px per ms
    const offset = -w0 * scale;
    const exact = t * scale + offset;
    const rtc = emulateShaderWorld(
      Math.fround(t - origin),
      scale,
      rtcOffset(offset, origin, scale),
    );
    const naive = emulateShaderWorld(Math.fround(t), scale, offset);
    return { exact, rtc, naive };
  }

  it('renders ms timestamps in 2026 zoomed to a 1 s window exactly (sub-pixel)', () => {
    const origin = rtcAxisOrigin([T0, T0 + HOUR], 2);
    for (const w0 of [T0, T0 + HOUR / 2, T0 + HOUR - 1000]) {
      for (let k = 0; k <= 1000; k += 7) {
        const { exact, rtc } = project(w0 + k, w0, origin);
        expect(Math.abs(rtc - exact)).toBeLessThan(0.25);
      }
      // Adjacent milliseconds stay 1 px apart.
      const a = project(w0 + 500, w0, origin).rtc;
      const b = project(w0 + 501, w0, origin).rtc;
      expect(b - a).toBeCloseTo(1, 1);
    }
  });

  it('would fail without RTC (documents why it exists)', () => {
    const { exact, naive } = project(T0 + 1234, T0 + 1000, 0);
    // float32 cannot even represent individual ms at 1.78e12 (ulp = 131072 ms).
    expect(Math.abs(naive - exact)).toBeGreaterThan(100);
  });

  it('keeps sub-pixel error for random windows over a one-hour series', () => {
    const origin = rtcAxisOrigin([T0, T0 + HOUR], 2);
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: HOUR - 1000 }),
        fc.integer({ min: 0, max: 1000 }),
        (start, k) => {
          const w0 = T0 + start;
          const { exact, rtc } = project(w0 + k, w0, origin);
          return Math.abs(rtc - exact) < 0.25;
        },
      ),
    );
  });
});
