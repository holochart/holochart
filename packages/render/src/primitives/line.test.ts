import { describe, expect, it } from 'vitest';
import type { InstancedInterleavedBuffer, InterleavedBufferAttribute } from 'three';
import { createResourceManager } from '../resources.ts';
import type { PrimitiveContext } from '../types.ts';
import { LinePrimitive } from './line.ts';

function context(): PrimitiveContext & { invalidations: number } {
  const ctx = {
    resources: createResourceManager(),
    invalidations: 0,
    invalidate() {
      ctx.invalidations++;
    },
  };
  return ctx;
}

function buffer(line: LinePrimitive, name: string): InstancedInterleavedBuffer {
  const attr = line.object.geometry.getAttribute(name) as InterleavedBufferAttribute;
  return attr.data as InstancedInterleavedBuffer;
}

const series = (n: number) => ({
  x: Float64Array.from({ length: n }, (_, i) => i),
  y: Float64Array.from({ length: n }, (_, i) => Math.sin(i)),
});

describe('LinePrimitive (no GPU)', () => {
  it('draws one instance per stream segment in a single mesh', () => {
    const line = new LinePrimitive(context(), series(10));
    expect(line.instanceCount).toBe(9);
    expect(line.object.geometry.instanceCount).toBe(9);
    line.dispose();
  });

  it('style-only updates touch only the affected buffer', () => {
    const line = new LinePrimitive(context(), series(10));
    const v = (n: string) => buffer(line, n).version;
    const before = { p: v('aA'), c: v('aColorA'), w: v('aWidth') };
    line.update({ color: [1, 0, 0, 1] });
    expect(v('aA')).toBe(before.p);
    expect(v('aColorA')).toBe(before.c + 1);
    expect(v('aWidth')).toBe(before.w);
    line.update({ join: 'round', opacity: 0.5 });
    expect(v('aColorA')).toBe(before.c + 1);
    expect(line.object.material).toBeDefined();
    line.dispose();
  });

  it('grows its buffers when the data outgrows capacity and releases shared geometry', () => {
    const ctx = context();
    const line = new LinePrimitive(ctx, series(4));
    const g0 = line.object.geometry;
    line.update(series(1000));
    expect(line.object.geometry).not.toBe(g0);
    expect(line.instanceCount).toBe(999);
    expect(ctx.resources.stats()).toHaveLength(1);
    line.dispose();
    expect(ctx.resources.stats()).toHaveLength(0);
  });

  it('recomputes the dash phase when the transform changes (throttled)', () => {
    let now = 0;
    const pending: (() => void)[] = [];
    const clock = {
      now: () => now,
      setTimeout: (fn: () => void) => pending.push(fn),
      clearTimeout: () => {},
    };
    const line = new LinePrimitive(
      context(),
      { x: Float64Array.from([0, 1, 2]), y: Float64Array.from([0, 0, 0]), dash: [4, 4] },
      { clock },
    );
    const dist = () => buffer(line, 'aDist').array as Float32Array;
    // stream [S, 0, 1, 2, S]: vertex 2 phase = 1 px at identity transform
    expect(dist()[4]).toBe(1);
    line.setTransform({ scaleX: 3, scaleY: 1, offsetX: 0, offsetY: 0 });
    expect(dist()[4]).toBe(3); // idle → immediate
    now += 10;
    line.setTransform({ scaleX: 5, scaleY: 1, offsetX: 0, offsetY: 0 });
    expect(dist()[4]).toBe(3); // throttled
    now += 100;
    pending.shift()!();
    expect(dist()[4]).toBe(5); // trailing run
    line.dispose();
  });

  it('sizes buffers from the exact vertex count (E16.9)', () => {
    const line = new LinePrimitive(context(), series(100_000));
    // [S, 100k points, S]: no power-of-two or gap-per-point over-allocation.
    expect(line.stream.capacity).toBe(100_002);
    line.dispose();
  });
});

/** Deterministic PRNG (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The drawn stream in data space: `[x, y, valid, width]` per live vertex. */
function drawn(line: LinePrimitive): number[][] {
  const { head, vertexCount, origin } = line.stream;
  const points = buffer(line, 'aA').array as Float32Array;
  const widths = buffer(line, 'aWidth').array as Float32Array;
  const colors = buffer(line, 'aColorA').array as Float32Array;
  const out: number[][] = [];
  for (let v = head; v < head + vertexCount; v++) {
    const valid = points[v * 4 + 3]!;
    out.push(
      valid
        ? [
            points[v * 4]! + origin[0],
            points[v * 4 + 1]! + origin[1],
            1,
            widths[v]!,
            colors[v * 4]!,
          ]
        : [0, 0, 0, widths[v]!, colors[v * 4]!],
    );
  }
  return out;
}

function expectSameStream(a: LinePrimitive, b: LinePrimitive): void {
  const da = drawn(a);
  const db = drawn(b);
  expect(da.length).toBe(db.length);
  for (let i = 0; i < da.length; i++) {
    const [ax, ay, av, aw, ac] = da[i]!;
    const [bx, by, bv, bw, bc] = db[i]!;
    expect(av).toBe(bv);
    expect(aw).toBe(bw);
    expect(ac).toBe(bc);
    // Positions are float32 offsets from different RTC origins.
    expect(Math.abs(ax! - bx!)).toBeLessThan(1e-3);
    expect(Math.abs(ay! - by!)).toBeLessThan(1e-3);
  }
  expect(a.instanceCount).toBe(b.instanceCount);
  expect(a.object.geometry.instanceCount).toBe(b.object.geometry.instanceCount);
}

/** Sum of uploaded floats in the pending update ranges of an attribute's buffer. */
function uploaded(line: LinePrimitive, name: string): number {
  return buffer(line, name).updateRanges.reduce((sum, r) => sum + r.count, 0);
}

describe('LinePrimitive.splice (streaming, E7.2)', () => {
  const style = { color: [0.2, 0.4, 0.6, 1] as [number, number, number, number], width: 3 };

  it('appends with a rolling window, uploading only the changed vertices', () => {
    const ctx = context();
    const n = 1000;
    let x = Float64Array.from({ length: n }, (_, i) => i);
    let y = Float64Array.from({ length: n }, (_, i) => Math.sin(i / 10));
    const line = new LinePrimitive(ctx, { x, y, ...style });
    for (let step = 0; step < 50; step++) {
      const k = 10;
      const nx = new Float64Array(n);
      const ny = new Float64Array(n);
      nx.set(x.subarray(k));
      ny.set(y.subarray(k));
      for (let j = 0; j < k; j++) {
        const i = n + step * k + j;
        nx[n - k + j] = i;
        ny[n - k + j] = Math.sin(i / 10);
      }
      line.splice(nx, ny, { from: k, to: n, at: 0 });
      x = nx;
      y = ny;
      if (step > 0) {
        // Head sentinel + tail (k points + trailing sentinel), in floats (stride 4).
        expect(uploaded(line, 'aA')).toBeLessThanOrEqual(4 * (k + 4));
      }
      expect(
        (line.object.geometry.getAttribute('aPrev') as InterleavedBufferAttribute).offset,
      ).toBe(line.stream.head * 4);
    }
    const fresh = new LinePrimitive(context(), { x, y, ...style });
    expectSameStream(line, fresh);
    line.dispose();
    fresh.dispose();
  });

  it('matches a full rebuild for random edits with gaps, duplicates and both ends', () => {
    const random = rng(7);
    const value = (): number => {
      const r = random();
      if (r < 0.08) return NaN;
      if (r < 0.16) return 5; // frequent exact duplicates
      return Math.round(random() * 20) / 2;
    };
    for (const connectGaps of [false, true]) {
      let x = Float64Array.from({ length: 40 }, value);
      let y = Float64Array.from({ length: 40 }, value);
      const line = new LinePrimitive(context(), { x, y, connectGaps, ...style });
      for (let step = 0; step < 300; step++) {
        const n = x.length;
        const kind = random();
        const dropFront = Math.floor(random() * Math.min(8, n));
        const dropBack = kind < 0.5 ? 0 : Math.floor(random() * Math.min(8, n - dropFront));
        const from = dropFront;
        const to = n - dropBack;
        if (to <= from) continue;
        const addFront = kind < 0.3 ? 0 : Math.floor(random() * 6);
        const addBack = Math.floor(random() * 12);
        const m = addFront + (to - from) + addBack;
        const nx = new Float64Array(m);
        const ny = new Float64Array(m);
        for (let j = 0; j < addFront; j++) [nx[j], ny[j]] = [value(), value()];
        nx.set(x.subarray(from, to), addFront);
        ny.set(y.subarray(from, to), addFront);
        for (let j = addFront + to - from; j < m; j++) [nx[j], ny[j]] = [value(), value()];
        line.splice(nx, ny, { from, to, at: addFront });
        x = nx;
        y = ny;
        const fresh = new LinePrimitive(context(), { x, y, connectGaps, ...style });
        expectSameStream(line, fresh);
        fresh.dispose();
      }
      line.dispose();
    }
    // ~2.5 s alone (600 full rebuilds to compare against); more under a loaded parallel run.
  }, 20_000);

  it('prepends with room left at the front', () => {
    let x = Float64Array.from({ length: 200 }, (_, i) => i);
    let y = Float64Array.from({ length: 200 }, (_, i) => i % 7);
    const line = new LinePrimitive(context(), { x, y, ...style });
    for (let step = 1; step <= 40; step++) {
      const c = 5;
      const nx = new Float64Array(x.length + c);
      const ny = new Float64Array(y.length + c);
      for (let j = 0; j < c; j++) [nx[j], ny[j]] = [-step * c + j, j];
      nx.set(x, c);
      ny.set(y, c);
      line.splice(nx, ny, { from: 0, to: x.length, at: c });
      x = nx;
      y = ny;
    }
    const fresh = new LinePrimitive(context(), { x, y, ...style });
    expectSameStream(line, fresh);
    line.dispose();
    fresh.dispose();
  });

  it('falls back to a full update for per-point widths', () => {
    const x = Float64Array.from([0, 1, 2, 3]);
    const y = Float64Array.from([0, 1, 0, 1]);
    const line = new LinePrimitive(context(), { x, y, width: Float32Array.from([1, 2, 3, 4]) });
    const nx = Float64Array.from([1, 2, 3, 4]);
    line.splice(nx, Float64Array.from([1, 0, 1, 0]), { from: 1, to: 4, at: 0 });
    line.update({ width: Float32Array.from([2, 3, 4, 5]) });
    const fresh = new LinePrimitive(context(), {
      x: nx,
      y: Float64Array.from([1, 0, 1, 0]),
      width: Float32Array.from([2, 3, 4, 5]),
    });
    expectSameStream(line, fresh);
  });
});
