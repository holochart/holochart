import { describe, expect, it } from 'vitest';
import {
  buildLineLayout,
  computeDashDistances,
  createThrottle,
  fillLineColors,
  fillLineWidths,
  PIXEL_SCREEN_MATRIX,
  type ThrottleClock,
} from './line-buffers.ts';

const f64 = (...v: number[]): Float64Array => Float64Array.from(v);

function sources(layout: { vertexCount: number; source: Int32Array }): number[] {
  return [...layout.source.subarray(0, layout.vertexCount)];
}

describe('buildLineLayout', () => {
  it('wraps a single polyline in sentinels', () => {
    const l = buildLineLayout({ x: f64(0, 1, 2), y: f64(0, 1, 0) });
    expect(sources(l)).toEqual([-1, 0, 1, 2, -1]);
    expect(l.instanceCount).toBe(2);
  });

  it('breaks at NaN gaps and collapses consecutive gaps', () => {
    const l = buildLineLayout({ x: f64(0, 1, NaN, NaN, 4, 5), y: f64(0, 1, 2, 3, 4, 5) });
    expect(sources(l)).toEqual([-1, 0, 1, -1, 4, 5, -1]);
  });

  it('treats null entries as gaps', () => {
    const l = buildLineLayout({ x: [0, 1, 2, 3], y: [0, null as unknown as number, 1, 2] });
    expect(sources(l)).toEqual([-1, 0, -1, 2, 3, -1]);
  });

  it('connects across gaps with connectGaps', () => {
    const l = buildLineLayout({
      x: f64(0, 1, NaN, 3),
      y: f64(0, 1, 2, 3),
      connectGaps: true,
    });
    expect(sources(l)).toEqual([-1, 0, 1, 3, -1]);
  });

  it('splits multiple polylines at `starts`', () => {
    const l = buildLineLayout({ x: f64(0, 1, 2, 3, 4), y: f64(0, 0, 0, 0, 0), starts: [2, 4] });
    expect(sources(l)).toEqual([-1, 0, 1, -1, 2, 3, -1, 4, -1]);
  });

  it('drops exact consecutive duplicates', () => {
    const l = buildLineLayout({ x: f64(0, 0, 1, 1), y: f64(0, 0, 1, 1) });
    expect(sources(l)).toEqual([-1, 0, 2, -1]);
  });

  it('RTC-encodes positions and flags validity', () => {
    const t0 = 1.7e12;
    const l = buildLineLayout({ x: f64(t0, t0 + 1, t0 + 2), y: f64(0, 0, 0) });
    expect(l.origin[0]).toBe(t0 + 1);
    expect([...l.points.subarray(4, 16)]).toEqual([-1, 0, 0, 1, 0, 0, 0, 1, 1, 0, 0, 1]);
    expect(l.points[3]).toBe(0); // leading sentinel
  });

  it('reuses arrays with enough capacity', () => {
    const a = buildLineLayout({ x: f64(0, 1, 2), y: f64(0, 1, 2) });
    const b = buildLineLayout({ x: f64(5, 6), y: f64(5, 6) }, a);
    expect(b.points).toBe(a.points);
    expect(b.source).toBe(a.source);
  });
});

describe('fillLineColors / fillLineWidths', () => {
  it('maps stream vertices back to source indices', () => {
    const l = buildLineLayout({ x: f64(0, NaN, 2, 3), y: f64(0, 0, 0, 0) });
    const colors = new Float32Array(l.vertexCount * 4);
    fillLineColors(l, Float32Array.from([1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1, 1, 1, 1, 1]), colors);
    // stream: [S, 0, S, 2, 3, S]
    expect([...colors.subarray(4, 8)]).toEqual([1, 0, 0, 1]);
    expect([...colors.subarray(12, 16)]).toEqual([0, 0, 1, 1]);
    expect([...colors.subarray(8, 12)]).toEqual([0, 0, 0, 0]);
    const widths = new Float32Array(l.vertexCount);
    fillLineWidths(l, Float32Array.from([1, 2, 3, 4]), widths);
    expect([...widths]).toEqual([0, 1, 0, 3, 4, 0]);
  });
});

describe('computeDashDistances', () => {
  const identity = { scale: [1, 1, 1] as const, offset: [0, 0, 0] as const };

  it('accumulates screen length modulo the period and resets after gaps', () => {
    const input = { x: f64(0, 3, 3, NaN, 10, 10), y: f64(0, 0, 4, 0, 0, 7) };
    const l = buildLineLayout(input);
    // stream: [S, 0, 1, 2, S, 4, 5, S]
    const out = new Float32Array(l.vertexCount * 2);
    computeDashDistances(l, input, identity, PIXEL_SCREEN_MATRIX, 5, out);
    const phase = (v: number): number => out[v * 2]!;
    const seg = (v: number): number => out[v * 2 + 1]!;
    expect([phase(1), seg(1)]).toEqual([0, 3]);
    expect([phase(2), seg(2)]).toEqual([3, 4]);
    expect(phase(3)).toBeCloseTo(2); // 7 mod 5
    expect(seg(3)).toBe(0);
    expect([phase(5), seg(5)]).toEqual([0, 7]);
    expect(phase(6)).toBeCloseTo(2);
  });

  it('applies the data transform (anisotropic zoom)', () => {
    const input = { x: f64(0, 1), y: f64(0, 1) };
    const l = buildLineLayout(input);
    const out = new Float32Array(l.vertexCount * 2);
    computeDashDistances(
      l,
      input,
      { scale: [30, 40, 1], offset: [7, 9, 0] },
      PIXEL_SCREEN_MATRIX,
      0,
      out,
    );
    expect(out[3]).toBeCloseTo(50);
  });

  it('projects through a perspective screen matrix', () => {
    // Pixel = (x / w, y / w) with w = z: a segment twice as far away is half as long.
    const m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0];
    const near = { x: f64(0, 10), y: f64(0, 0), z: f64(1, 1) };
    const far = { x: f64(0, 10), y: f64(0, 0), z: f64(2, 2) };
    const out = new Float32Array(8);
    computeDashDistances(buildLineLayout(near), near, identity, m, 0, out);
    expect(out[3]).toBeCloseTo(10);
    computeDashDistances(buildLineLayout(far), far, identity, m, 0, out);
    expect(out[3]).toBeCloseTo(5);
  });
});

describe('createThrottle', () => {
  function fakeClock(): ThrottleClock & { t: number; advance(ms: number): void } {
    let timers: { at: number; fn: () => void }[] = [];
    const clock = {
      t: 0,
      now: () => clock.t,
      setTimeout: (fn: () => void, ms: number) => {
        const timer = { at: clock.t + ms, fn };
        timers.push(timer);
        return timer;
      },
      clearTimeout: (h: unknown) => {
        timers = timers.filter((x) => x !== h);
      },
      advance(ms: number) {
        clock.t += ms;
        const due = timers.filter((x) => x.at <= clock.t);
        timers = timers.filter((x) => x.at > clock.t);
        for (const x of due) x.fn();
      },
    };
    return clock;
  }

  it('runs immediately when idle, then coalesces into one trailing run', () => {
    const clock = fakeClock();
    let runs = 0;
    const th = createThrottle(() => runs++, 50, clock);
    th.request();
    expect(runs).toBe(1);
    clock.advance(10);
    th.request();
    th.request();
    expect(runs).toBe(1);
    clock.advance(39);
    expect(runs).toBe(1);
    clock.advance(1);
    expect(runs).toBe(2);
    clock.advance(100);
    th.request();
    expect(runs).toBe(3);
  });

  it('cancel drops the pending run; flush runs it now', () => {
    const clock = fakeClock();
    let runs = 0;
    const th = createThrottle(() => runs++, 50, clock);
    th.request();
    th.request();
    th.cancel();
    clock.advance(100);
    expect(runs).toBe(1);
    th.request(); // idle → immediate
    th.request();
    th.flush();
    expect(runs).toBe(3);
  });
});
