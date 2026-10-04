import {
  CustomBlending,
  NoBlending,
  NormalBlending,
  PerspectiveCamera,
  type InstancedInterleavedBuffer,
  type InterleavedBufferAttribute,
} from 'three';
import { describe, expect, it } from 'vitest';
import { createResourceManager } from '../resources.ts';
import type { PrimitiveContext } from '../types.ts';
import { LINE_FRAGMENT_SHADER, LINE_VERTEX_SHADER } from './line.glsl.ts';
import { inject, LINE3D_FRAGMENT_SHADER, LINE3D_VERTEX_SHADER } from './line3d.glsl.ts';
import { Line3D } from './line3d.ts';

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

function attribute(line: Line3D, name: string): InterleavedBufferAttribute {
  return line.object.geometry.getAttribute(name) as InterleavedBufferAttribute;
}

function buffer(line: Line3D, name: string): InstancedInterleavedBuffer {
  return attribute(line, name).data as InstancedInterleavedBuffer;
}

const helix = (n: number) => ({
  x: Float64Array.from({ length: n }, (_, i) => Math.cos(i / 3)),
  y: Float64Array.from({ length: n }, (_, i) => Math.sin(i / 3)),
  z: Float64Array.from({ length: n }, (_, i) => i / n - 0.5),
});

describe('3D line shaders (injected into the 2D line shaders)', () => {
  it('replace the 2D near guard with clip-space near clipping and keep the 2D shaders intact', () => {
    expect(LINE3D_VERTEX_SHADER).toContain('float dA = cA.z + cA.w;');
    expect(LINE3D_VERTEX_SHADER).toContain('const float NEAR_EPS = 1e-5;');
    expect(LINE3D_VERTEX_SHADER).not.toContain('if (cA.w < W_EPS) cA = mix');
    expect(LINE3D_VERTEX_SHADER).toContain('bool hasPrev = aPrev.w > 0.5 && sA == 0.0;');
    expect(LINE3D_VERTEX_SHADER).toContain('vColorA = mix(aColorA, aColorB, sA);');
    // The 2D program is untouched (its text is what 2D baselines were rendered with).
    expect(LINE_VERTEX_SHADER).toContain('if (cA.w < W_EPS) cA = mix');
    expect(LINE_VERTEX_SHADER).not.toContain('NEAR_EPS');
    expect(LINE_FRAGMENT_SHADER).not.toContain('PICKING');
  });

  it('place the inner quad vertices on the end points (exact depth; the 2D quad is unchanged)', () => {
    expect(LINE3D_VERTEX_SHADER).toContain(
      'float along = position.z > 0.5 ? (atB ? len : 0.0) : (atB ? len + reachB : -reachA);',
    );
    expect(LINE_VERTEX_SHADER).toContain('float along = atB ? len + reachB : -reachA;');
    // A segment that crosses depths keeps the quad it had (its corners carry the end depths).
    for (const shader of [LINE_VERTEX_SHADER, LINE3D_VERTEX_SHADER]) {
      expect(shader).toMatch(/if \(cA\.z \/ cA\.w != cB\.z \/ cB\.w\) \{\s+reachA = formerA;/);
    }
    const line = new Line3D(context(), helix(4));
    expect(line.object.geometry.getAttribute('position').count).toBe(8);
    expect(line.object.geometry.index?.count).toBe(18);
  });

  it('write per-vertex pick ids only under PICKING', () => {
    expect(LINE3D_VERTEX_SHADER).toMatch(/#ifdef PICKING\s+in int aSrcA;/);
    expect(LINE3D_VERTEX_SHADER).toContain('uPickBase + uint(aSrcA)');
    expect(LINE3D_FRAGMENT_SHADER).toContain(
      'holochartEncodePickId(t < vPickSplit ? vPickIds.x : vPickIds.y)',
    );
    expect(LINE3D_FRAGMENT_SHADER).toMatch(/#else\s+fragColor = vec4\(color\.rgb, alpha\);/);
  });

  it('inject() fails loudly on a missing or repeated anchor', () => {
    expect(inject('a b c', 'b', 'X')).toBe('a X c');
    expect(() => inject('a b c', 'q', 'X')).toThrow(/anchor/);
    expect(() => inject('b b', 'b', 'X')).toThrow(/anchor/);
  });
});

describe('Line3D (no GPU)', () => {
  it('draws one instance per stream segment and binds source indices as int attributes', () => {
    const line = new Line3D(context(), helix(10));
    expect(line.instanceCount).toBe(9);
    expect(line.object.geometry.instanceCount).toBe(9);
    expect(line.pickCount).toBe(10);
    const srcA = attribute(line, 'aSrcA');
    const srcB = attribute(line, 'aSrcB');
    expect(srcA.data.array).toBeInstanceOf(Int32Array);
    expect(srcA.offset).toBe(1);
    expect(srcB.offset).toBe(2);
    // Stream [S, 0, 1, …, 9, S]: instance k joins inputs k and k + 1.
    expect(Array.from(srcA.data.array.subarray(0, 12))).toEqual([
      -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, -1,
    ]);
    line.dispose();
  });

  it('breaks at NaN gaps and keeps input indices as pick ids', () => {
    const line = new Line3D(context(), {
      x: [0, 1, NaN, 3, 4],
      y: [0, 1, 2, 3, 4],
      z: [0, 0, 0, 0, 0],
    });
    const src = buffer(line, 'aSrcA').array as Int32Array;
    expect(Array.from(src.subarray(0, 7))).toEqual([-1, 0, 1, -1, 3, 4, -1]);
    expect(line.pickCount).toBe(5);
    line.dispose();
  });

  it('style-only updates re-upload only their buffer', () => {
    const line = new Line3D(context(), helix(20));
    const v = (n: string) => buffer(line, n).version;
    const before = { p: v('aA'), c: v('aColorA'), w: v('aWidth') };
    line.update({ color: [1, 0, 0, 1] });
    expect(v('aA')).toBe(before.p);
    expect(v('aColorA')).toBe(before.c + 1);
    expect(v('aWidth')).toBe(before.w);
    line.dispose();
  });

  it('is opaque (alpha to coverage, depth write) unless a color or the opacity is translucent', () => {
    const line = new Line3D(context(), { ...helix(5), color: [0, 0, 1, 1] });
    const m = line.material;
    expect(line.opaque).toBe(true);
    expect(m.alphaToCoverage).toBe(true);
    expect(m.depthWrite).toBe(true);
    expect(m.transparent).toBe(false);
    expect(m.blending).toBe(CustomBlending);
    line.update({ opacity: 0.5 });
    expect(line.opaque).toBe(false);
    expect(m.alphaToCoverage).toBe(false);
    expect(m.depthWrite).toBe(false);
    expect(m.transparent).toBe(true);
    expect(m.blending).toBe(NormalBlending);
    line.update({ opacity: 1, color: Float32Array.from([1, 0, 0, 1, 0, 1, 0, 0.5]) });
    expect(line.opaque).toBe(false);
    const forced = new Line3D(context(), { ...helix(5), opacity: 0.2 }, { blend: 'opaque' });
    expect(forced.opaque).toBe(true);
    line.dispose();
    forced.dispose();
  });

  it('computes the dash phase from the camera in syncCamera (float64, near-clipped)', () => {
    const ctx = context();
    const line = new Line3D(ctx, { ...helix(30), dash: 'dash', width: 2 });
    line.setViewport({ width: 800, height: 600, pixelRatio: 1 });
    const dist = buffer(line, 'aDist').array as Float32Array;
    expect(Array.from(dist.subarray(0, 8))).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    const camera = new PerspectiveCamera(45, 800 / 600, 0.1, 100);
    camera.position.set(0, 0, 4);
    camera.updateMatrixWorld();
    const version = buffer(line, 'aDist').version;
    line.syncCamera(camera);
    expect(buffer(line, 'aDist').version).toBe(version + 1);
    // Vertex 1 (the first input) has phase 0 and a positive visible length; phases stay < period.
    expect(dist[2]).toBe(0);
    expect(dist[3]).toBeGreaterThan(1);
    const period = 18 + 18; // 'dash' at width 2 → max(2, 3) × [3, 3]
    for (let v = 1; v <= 30; v++) {
      expect(dist[v * 2]).toBeGreaterThanOrEqual(0);
      expect(dist[v * 2]).toBeLessThan(period);
    }
    // Same camera again: nothing to recompute.
    line.syncCamera(camera);
    expect(buffer(line, 'aDist').version).toBe(version + 1);
    line.dispose();
  });

  it('solid lines never compute dashes', () => {
    const line = new Line3D(context(), helix(10));
    const version = buffer(line, 'aDist').version;
    const camera = new PerspectiveCamera();
    camera.position.set(0, 0, 3);
    camera.updateMatrixWorld();
    line.syncCamera(camera);
    expect(buffer(line, 'aDist').version).toBe(version);
    line.dispose();
  });

  it('pick material: PICKING shaders, shared data uniforms, own resolution / viewport / base', () => {
    const line = new Line3D(context(), helix(8));
    line.setViewport({ width: 640, height: 480, pixelRatio: 2 });
    const handle = line.createPickMaterial();
    const pick = handle.material;
    expect(pick.defines).toHaveProperty('PICKING');
    expect(line.material.defines).not.toHaveProperty('PICKING');
    expect(pick.blending).toBe(NoBlending);
    expect(pick.uniforms['uScale']).toBe(line.material.uniforms['uScale']);
    expect(pick.uniforms['uDash']).toBe(line.material.uniforms['uDash']);
    expect(pick.uniforms['uResolution']).not.toBe(line.material.uniforms['uResolution']);
    expect(pick.uniforms['uViewport']).not.toBe(line.material.uniforms['uViewport']);
    handle.prepare({ base: 500, windowWidth: 9, windowHeight: 9, pixelRatio: 2 });
    expect(pick.uniforms['uPickBase']!.value).toBe(500);
    expect(pick.uniforms['uResolution']!.value.toArray()).toEqual([9, 9]);
    expect(pick.depthWrite).toBe(line.material.depthWrite);
    expect(pick.transparent).toBe(line.material.transparent);
    expect(line.material.uniforms['uResolution']!.value.toArray()).toEqual([640, 480]);
    handle.dispose();
    line.dispose();
  });

  it('reuses its buffers for similar sizes and releases the shared quad on dispose', () => {
    const ctx = context();
    const line = new Line3D(ctx, helix(100));
    const g = line.object.geometry;
    line.update(helix(90));
    expect(line.object.geometry).toBe(g);
    line.update(helix(1000));
    expect(line.object.geometry).not.toBe(g);
    expect(line.instanceCount).toBe(999);
    expect(ctx.resources.stats()).toHaveLength(1);
    line.dispose();
    expect(ctx.resources.stats()).toHaveLength(0);
  });
});
