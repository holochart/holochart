import type { BufferGeometry, InstancedBufferAttribute } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createResourceManager } from '../resources.ts';
import type { PrimitiveContext } from '../types.ts';
import { rectCoverage, rectScreenGeometry, RectPrimitive } from './rect.ts';

function context() {
  const ctx = { resources: createResourceManager(), invalidate: vi.fn<() => void>() };
  return ctx satisfies PrimitiveContext;
}

function attribute(prim: RectPrimitive, name: string): InstancedBufferAttribute {
  const geometry = (prim.object as unknown as { geometry: BufferGeometry }).geometry;
  return geometry.getAttribute(name) as InstancedBufferAttribute;
}

function rects(ctx: PrimitiveContext, count: number): RectPrimitive {
  const coords = (v: number) => new Float64Array(count).fill(v);
  return new RectPrimitive(ctx, {
    x0: coords(0),
    y0: coords(0),
    x1: coords(4),
    y1: coords(2),
    fill: [1, 0, 0, 1],
  });
}

describe('rect screen geometry without a usable pixel ratio', () => {
  const style = { borderWidth: 0.4, snap: true, borderAlign: 'inside' as const };

  it('snaps as at pixel ratio 1', () => {
    for (const pixelRatio of [0, -1, NaN]) {
      const g = rectScreenGeometry(20.37, 10.2, 40.81, 30.6, { ...style, pixelRatio });
      // Whole CSS px, and a border of one whole px.
      expect([g.x0, g.y0, g.x1, g.y1]).toEqual([20, 10, 41, 31]);
      expect(g.borderWidth).toBe(1);
    }
  });

  it('anti-aliases over one CSS px', () => {
    const g = rectScreenGeometry(0, 0, 40, 40, {
      ...style,
      borderWidth: 0,
      snap: false,
      pixelRatio: 1,
    });
    // 0.2 px inside the left edge: half coverage plus 0.2 of the 1 px ramp.
    expect(rectCoverage(0.2, 20, g, 0, 0).outer).toBeCloseTo(0.7, 12);
    expect(rectCoverage(0.2, 20, g, 0, NaN).outer).toBeCloseTo(0.7, 12);
    // At ratio 2 the ramp is half a px wide: 0.5 + 0.2 / 0.5.
    expect(rectCoverage(0.2, 20, g, 0, 2).outer).toBeCloseTo(0.9, 12);
  });
});

describe('RectPrimitive.update', () => {
  it('keeps the previous value of a field passed as undefined', () => {
    const prim = rects(context(), 3);
    const rectVersion = attribute(prim, 'iRect').version;
    const fillVersion = attribute(prim, 'iFill').version;

    prim.update({ x1: undefined, fill: [0, 1, 0, 1] });

    expect(prim.instanceCount).toBe(3);
    // Corners are stored relative to the center of their bounds (2, 1).
    expect([...attribute(prim, 'iRect').array.slice(0, 4)]).toEqual([-2, -1, 2, 1]);
    expect(attribute(prim, 'iRect').version).toBe(rectVersion);
    expect([...attribute(prim, 'iFill').array.slice(0, 4)]).toEqual([0, 1, 0, 1]);
    expect(attribute(prim, 'iFill').version).toBe(fillVersion + 1);
    prim.dispose();
  });
});

describe('RectPrimitive.dispose', () => {
  it('releases the shared quad once and ignores later updates', () => {
    const ctx = context();
    const keep = rects(ctx, 1);
    const prim = rects(ctx, 2);
    const refs = () => ctx.resources.stats().map((s) => s.refs);
    expect(refs()).toEqual([2]);

    prim.dispose();
    prim.dispose();

    // The second dispose must not take the other primitive's reference.
    expect(refs()).toEqual([1]);
    ctx.invalidate.mockClear();
    prim.update({
      x0: new Float64Array(5),
      y0: new Float64Array(5),
      x1: new Float64Array(5),
      y1: new Float64Array(5),
    });
    expect(prim.instanceCount).toBe(2);
    expect(ctx.invalidate).not.toHaveBeenCalled();
    keep.dispose();
    expect(ctx.resources.stats()).toEqual([]);
  });
});
