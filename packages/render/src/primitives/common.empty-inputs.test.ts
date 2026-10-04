import { BufferGeometry, Float32BufferAttribute, Vector4 } from 'three';
import { describe, expect, it } from 'vitest';
import { createResourceManager } from '../resources.ts';
import {
  acquireInstancedGeometry,
  applyViewportUniforms,
  colorAt,
  createViewportUniforms,
  expandColor,
  expandScalar,
  scalarAt,
  syncViewportUniforms,
  type ViewportSource,
} from './common.ts';

describe('per-item inputs without any item', () => {
  it('expands an empty color array to transparent black, overwriting what the buffer held', () => {
    const out = new Float32Array(8).fill(9);
    expect(expandColor(new Float32Array(0), 2, out)).toBe(out);
    expect([...out]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    // Fewer than four components is no color either.
    expect([...expandColor(new Float32Array([1, 1, 1]), 1)]).toEqual([0, 0, 0, 0]);
  });

  it('reads transparent black from an empty color array, and the last complete color past the end', () => {
    const out = [9, 9, 9, 9];
    colorAt(new Float32Array(0), 3, out);
    expect(out).toEqual([0, 0, 0, 0]);
    // Two complete colors and a stray component.
    const colors = new Float32Array([1, 0, 0, 1, 0, 1, 0, 0.5, 0.25]);
    colorAt(colors, 0, out);
    expect(out).toEqual([1, 0, 0, 1]);
    colorAt(colors, 7, out);
    expect(out).toEqual([0, 1, 0, 0.5]);
    colorAt([0.25, 0.5, 0.75, 1], 7, out);
    expect(out).toEqual([0.25, 0.5, 0.75, 1]);
  });

  it('falls back for an empty scalar array', () => {
    const none = new Float32Array(0);
    expect(scalarAt(none, 2, 7)).toBe(7);
    expect(scalarAt(none, 2)).toBe(0);
    expect(scalarAt(new Float32Array([3, 4]), 5, 7)).toBe(4);
    expect(scalarAt(1.5, 5, 7)).toBe(1.5);
    expect([...expandScalar(none, 3, 5)]).toEqual([5, 5, 5]);
    expect([...expandScalar(none, 2)]).toEqual([0, 0]);
  });
});

describe('viewport uniforms for a degenerate viewport', () => {
  it('applyViewportUniforms keeps at least 1 CSS px and a pixel ratio of 1', () => {
    const uniforms = createViewportUniforms();
    applyViewportUniforms(uniforms, { width: 0, height: 0.5, pixelRatio: 0 });
    expect(uniforms.uResolution.value.toArray()).toEqual([1, 1]);
    expect(uniforms.uPixelRatio.value).toBe(1);
    applyViewportUniforms(uniforms, { width: 640, height: 480, pixelRatio: -2 });
    expect(uniforms.uResolution.value.toArray()).toEqual([640, 480]);
    expect(uniforms.uPixelRatio.value).toBe(1);
  });

  it('syncViewportUniforms treats a renderer without a pixel ratio as ratio 1', () => {
    const uniforms = createViewportUniforms();
    const renderer: ViewportSource = {
      getCurrentViewport: (v: Vector4) => v.set(0, 0, 300, 200),
      getPixelRatio: () => 0,
      getRenderTarget: () => null,
    };
    expect(syncViewportUniforms(uniforms, renderer)).toBe(true);
    // Device px are CSS px at ratio 1.
    expect(uniforms.uResolution.value.toArray()).toEqual([300, 200]);
    expect(uniforms.uPixelRatio.value).toBe(1);
    expect(uniforms.uViewport.value.toArray()).toEqual([0, 0, 300, 200]);
    expect(syncViewportUniforms(uniforms, renderer)).toBe(false);
  });
});

describe('acquireInstancedGeometry', () => {
  it('releases its reference to the shared template once', () => {
    const resources = createResourceManager();
    const template = () => {
      const g = new BufferGeometry();
      g.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
      g.setIndex([0, 1, 2]);
      return g;
    };
    const a = acquireInstancedGeometry(resources, 'quad', template);
    const b = acquireInstancedGeometry(resources, 'quad', template);
    expect(resources.stats()).toMatchObject([{ key: 'quad', refs: 2 }]);

    a.release();
    a.release();

    // The second release must not take b's reference.
    expect(resources.stats()).toMatchObject([{ key: 'quad', refs: 1 }]);
    // a let go of the shared attributes (so disposing it freed nothing b draws with).
    expect(a.geometry.getAttribute('position')).toBeUndefined();
    expect(a.geometry.getIndex()).toBeNull();
    expect(b.geometry.getAttribute('position')).toBeDefined();
    b.release();
    expect(resources.stats()).toEqual([]);
  });
});
