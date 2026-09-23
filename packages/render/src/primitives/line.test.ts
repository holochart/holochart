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
});
