import type { BufferGeometry, InstancedBufferAttribute } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createResourceManager } from '../resources.ts';
import type { PrimitiveContext } from '../types.ts';
import { ArcPrimitive, packArcs } from './arc.ts';

const SHAPE = {
  innerRadius: 0,
  outerRadius: 10,
  startAngle: 0,
  endAngle: 1,
  cornerRadius: 0,
  padAngle: 0,
  padRadius: 0,
};

function context() {
  const ctx = { resources: createResourceManager(), invalidate: vi.fn<() => void>() };
  return ctx satisfies PrimitiveContext;
}

function attribute(prim: ArcPrimitive, name: string): InstancedBufferAttribute {
  const geometry = (prim.object as unknown as { geometry: BufferGeometry }).geometry;
  return geometry.getAttribute(name) as InstancedBufferAttribute;
}

describe('packArcs with z', () => {
  it('encodes z relative to its own origin and repeats the last z for later wedges', () => {
    const packed = packArcs({ x: [0, 10, 20], y: [1, 1, 1], z: [5, 9], ...SHAPE });
    expect(packed.origin).toEqual([10, 1, 7]);
    expect([...packed.center]).toEqual([-10, 0, -2, 0, 0, 2, 10, 0, 2]);
  });

  it('treats an empty z like no z: the plane z = 0', () => {
    const flat = packArcs({ x: [0, 10], y: [1, 3], ...SHAPE });
    const empty = packArcs({ x: [0, 10], y: [1, 3], z: [], ...SHAPE });
    expect(empty.origin).toEqual([5, 2, 0]);
    expect([...empty.center]).toEqual([-5, -1, 0, 5, 1, 0]);
    expect(empty).toEqual(flat);
  });
});

describe('ArcPrimitive.update', () => {
  it('keeps the previous value of a field passed as undefined', () => {
    const prim = new ArcPrimitive(context(), {
      x: [0, 1, 2],
      y: [0, 0, 0],
      outerRadius: 20,
      endAngle: 1,
    });
    const shapeVersion = attribute(prim, 'iShape').version;
    const widthVersion = attribute(prim, 'iBorderWidth').version;

    prim.update({ outerRadius: undefined, borderWidth: 3 });

    // iShape is (r0, r1, mid, half): the outer radius is still 20.
    const shape = attribute(prim, 'iShape').array;
    expect([shape[1], shape[5], shape[9]]).toEqual([20, 20, 20]);
    expect(attribute(prim, 'iShape').version).toBe(shapeVersion);
    expect([...attribute(prim, 'iBorderWidth').array.slice(0, 3)]).toEqual([3, 3, 3]);
    expect(attribute(prim, 'iBorderWidth').version).toBe(widthVersion + 1);
    prim.dispose();
  });

  it('re-centers and re-uploads centers and bounds when only z changes', () => {
    const prim = new ArcPrimitive(context(), { x: [0, 10], y: [0, 0], outerRadius: 20 });
    const versions = () =>
      ['iCenter', 'iBounds', 'iFill'].map((name) => attribute(prim, name).version);
    const [center, bounds, fill] = versions();

    prim.update({ z: [100, 300] });

    expect([...attribute(prim, 'iCenter').array.slice(0, 6)]).toEqual([-5, 0, -100, 5, 0, 100]);
    expect(versions()).toEqual([center! + 1, bounds! + 1, fill]);
    // The z origin (200) reaches the shader through the offset uniform: offset + origin × scale.
    prim.setTransform({ scaleX: 1, scaleY: 1, scaleZ: 2, offsetX: 0, offsetY: 0, offsetZ: 7 });
    const offset = prim.object.material as unknown as {
      uniforms: Record<string, { value: { toArray(): number[] } }>;
    };
    expect(offset.uniforms.uOffset!.value.toArray()).toEqual([5, 0, 7 + 200 * 2]);
    prim.dispose();
  });
});

describe('ArcPrimitive.dispose', () => {
  it('releases the shared quad once and ignores later updates', () => {
    const ctx = context();
    const keep = new ArcPrimitive(ctx, { x: [0], y: [0] });
    const prim = new ArcPrimitive(ctx, { x: [0, 1], y: [0, 0] });
    const refs = () => ctx.resources.stats().map((s) => s.refs);
    expect(refs()).toEqual([2]);

    prim.dispose();
    prim.dispose();

    // The second dispose must not take the other primitive's reference.
    expect(refs()).toEqual([1]);
    ctx.invalidate.mockClear();
    prim.update({ x: [0, 1, 2, 3], y: [0, 0, 0, 0] });
    expect(prim.instanceCount).toBe(2);
    expect(ctx.invalidate).not.toHaveBeenCalled();
    keep.dispose();
    expect(ctx.resources.stats()).toEqual([]);
  });
});
