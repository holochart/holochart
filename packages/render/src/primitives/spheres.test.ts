import {
  CustomBlending,
  NoBlending,
  NormalBlending,
  Object3D,
  PerspectiveCamera,
  Vector3,
  type InstancedBufferAttribute,
} from 'three';
import { describe, expect, it } from 'vitest';
import { createResourceManager } from '../resources.ts';
import type { PrimitiveContext } from '../types.ts';
import { SPHERE_FRAGMENT, SPHERE_VERTEX } from './spheres.glsl.ts';
import { SphereSet } from './spheres.ts';

function context(): PrimitiveContext {
  return { resources: createResourceManager(), invalidate: () => {} };
}

function attr(s: SphereSet, name: string): InstancedBufferAttribute {
  return s.object.geometry.getAttribute(name) as InstancedBufferAttribute;
}

const fakeRenderer = {
  getCurrentViewport: (v: { set(...a: number[]): unknown }) => v.set(0, 0, 800, 600),
  getPixelRatio: () => 1,
  getRenderTarget: () => null,
};

describe('sphere sizing (shader math mirrored)', () => {
  /**
   * Mirror of the vertex shader: view radius of a px-sized sphere at view-space center `c`, and
   * the half-size of its camera-facing quad.
   */
  function shaderSizes(c: Vector3, sizePx: number, heightPx: number, p11: number) {
    const w = -c.z;
    const pxView = (2 * w) / (heightPx * p11);
    const r = 0.5 * sizePx * pxView;
    const dist = c.length();
    return { r, pxView, quad: (r * dist) / Math.sqrt(dist * dist - r * r) };
  }

  it('a px-sized sphere spans `size` px on screen at the view center (± its perspective bulge)', () => {
    const camera = new PerspectiveCamera(50, 800 / 600, 0.1, 100);
    const p11 = camera.projectionMatrix.elements[5]!;
    for (const [depth, size] of [
      [3, 20],
      [12, 6],
      [40, 64],
    ] as const) {
      const c = new Vector3(0, 0, -depth);
      const { r } = shaderSizes(c, size, 600, p11);
      // Exact perspective silhouette radius (tangent cone) in px.
      const angle = Math.asin(r / depth);
      const px = (Math.tan(angle) / Math.tan((50 / 2) * (Math.PI / 180))) * 300;
      // The sphere's cross-section at its center is `size` px; its silhouette (the tangent cone)
      // is larger by 1/√(1 − (r/D)²): under 0.5 % for markers.
      expect((px * 2) / size).toBeCloseTo(1, 2);
      expect(px * 2).toBeGreaterThanOrEqual(size);
    }
  });

  it('the quad always contains the perspective silhouette, also off-axis', () => {
    // Silhouette of a sphere seen from the origin: the tangent cone of half-angle asin(r / D).
    // In the plane through the center perpendicular to the view ray, the cone's circle has radius
    // r·D / √(D² − r²): the quad half-size, so the projected quad contains the silhouette.
    const r = 0.8;
    const D = 2;
    const quad = (r * D) / Math.sqrt(D * D - r * r);
    const tangentHalfAngle = Math.asin(r / D);
    expect(Math.atan(quad / D)).toBeCloseTo(tangentHalfAngle, 12);
    expect(quad).toBeGreaterThan(r);
  });

  it('shaders: ortho detection through the projection, reserved words avoided, depth written', () => {
    expect(SPHERE_VERTEX).toContain('projectionMatrix[3][3] > 0.5');
    expect(SPHERE_FRAGMENT).toContain('gl_FragDepth');
    expect(SPHERE_VERTEX).not.toMatch(/\bhalf\b/);
    expect(SPHERE_VERTEX).toContain('uPickBase + uint(aSourceIndex)');
  });
});

describe('SphereSet (no GPU)', () => {
  it('one instance per sphere, RTC positions, NaN hidden, pick ids = data indices', () => {
    const s = new SphereSet(context(), {
      x: [1000, 1001, NaN],
      y: [0, 1, 2],
      z: [5, 5, 5],
      size: 10,
    });
    expect(s.count).toBe(3);
    expect(s.pickCount).toBe(3);
    expect(s.object.geometry.instanceCount).toBe(3);
    expect(s.origin).toEqual([1000.5, 1, 5]);
    const pos = attr(s, 'aPos').array as Float32Array;
    expect(Array.from(pos.subarray(0, 6))).toEqual([-0.5, -1, 0, 0.5, 0, 0]);
    expect(pos[6]).toBeGreaterThan(1e37);
    expect(s.sourceIndex(2)).toBe(2);
    s.dispose();
  });

  it('sizing: screen by default, world on request', () => {
    const screen = new SphereSet(context(), { x: [0], y: [0] });
    const world = new SphereSet(context(), { x: [0], y: [0] }, { sizing: 'world' });
    expect(screen.material.uniforms['uWorldSize']!.value).toBe(0);
    expect(world.material.uniforms['uWorldSize']!.value).toBe(1);
    screen.dispose();
    world.dispose();
  });

  it('colorscale mode uses the LUT and values relative to their origin', () => {
    const ctx = context();
    const s = new SphereSet(ctx, {
      x: [0, 1],
      y: [0, 1],
      colorValues: [100, 102],
      colorscale: [
        [0, [0, 0, 1, 1]],
        [1, [1, 0, 0, 1]],
      ],
      cmin: 100,
      cmax: 102,
    });
    expect(s.material.defines).toHaveProperty('USE_COLORSCALE');
    expect(attr(s, 'aFill')).toBeUndefined();
    expect(Array.from(attr(s, 'aValue').array)).toEqual([-1, 1]);
    expect(s.material.uniforms['uCRange']!.value.toArray()).toEqual([-1, 1]);
    s.update({ colorValues: null });
    expect(s.material.defines).not.toHaveProperty('USE_COLORSCALE');
    expect(attr(s, 'aFill')).toBeDefined();
    s.dispose();
    expect(ctx.resources.stats()).toHaveLength(0);
  });

  it('opaque sets use alpha to coverage and write depth; translucent ones blend', () => {
    const s = new SphereSet(context(), { x: [0], y: [0], color: [1, 0, 0, 1] });
    expect(s.opaque).toBe(true);
    expect(s.material.alphaToCoverage).toBe(true);
    expect(s.material.depthWrite).toBe(true);
    expect(s.material.blending).toBe(CustomBlending);
    s.update({ opacity: 0.5 });
    expect(s.opaque).toBe(false);
    expect(s.material.transparent).toBe(true);
    expect(s.material.depthWrite).toBe(false);
    expect(s.material.blending).toBe(NormalBlending);
    s.dispose();
  });

  it('depthSort rewrites instances back to front and keeps data indices for picking', () => {
    const s = new SphereSet(
      context(),
      {
        x: [0, 0, 0],
        y: [0, 0, 0],
        z: [1, -1, 0],
        opacity: 0.5,
        size: Float32Array.from([1, 2, 3]),
      },
      { depthSort: true },
    );
    expect(s.material.defines).toHaveProperty('SOURCE_INDEX');
    // No view observed yet: data order.
    expect(Array.from(attr(s, 'aSourceIndex').array)).toEqual([0, 1, 2]);
    const camera = new PerspectiveCamera();
    camera.position.set(0, 0, 5);
    camera.updateMatrixWorld();
    s.object.updateMatrixWorld();
    s.object.onBeforeRender(
      fakeRenderer as never,
      new Object3D() as never,
      camera,
      s.object.geometry,
      s.material,
      null as never,
    );
    // Farthest (z = -1) first.
    expect(Array.from(attr(s, 'aSourceIndex').array)).toEqual([1, 2, 0]);
    expect(s.sourceIndex(0)).toBe(1);
    const style = attr(s, 'aStyle').array as Float32Array;
    expect([style[0], style[2], style[4]]).toEqual([2, 3, 1]); // sizes follow the order
    const pos = attr(s, 'aPos').array as Float32Array;
    expect([pos[2], pos[5], pos[8]]).toEqual([-1, 0, 1]);
    s.dispose();
  });

  it('pick material mirrors defines and depth state, owns resolution and base', () => {
    const s = new SphereSet(context(), { x: [0, 1], y: [0, 1] }, { depthSort: true });
    s.setViewport({ width: 800, height: 600, pixelRatio: 2 });
    const handle = s.createPickMaterial();
    const pick = handle.material;
    expect(pick.defines).toHaveProperty('PICKING');
    expect(pick.blending).toBe(NoBlending);
    handle.prepare({ base: 7, windowWidth: 5, windowHeight: 5, pixelRatio: 2 });
    expect(pick.defines).toHaveProperty('SOURCE_INDEX');
    expect(pick.uniforms['uPickBase']!.value).toBe(7);
    expect(pick.uniforms['uResolution']!.value.toArray()).toEqual([5, 5]);
    expect(pick.uniforms['uScale']).toBe(s.material.uniforms['uScale']);
    expect(pick.depthWrite).toBe(s.material.depthWrite);
    expect(s.material.uniforms['uResolution']!.value.toArray()).toEqual([800, 600]);
    handle.dispose();
    s.dispose();
  });

  it('lighting defaults and overrides', () => {
    const s = new SphereSet(context(), {}, { lighting: { ambient: 0.2, direction: [0, 0, 2] } });
    const u = s.material.uniforms;
    expect(u['uLight']!.value.toArray()).toEqual([0.2, 0.65, 0.25, 32]);
    expect(u['uLightDir']!.value.toArray()).toEqual([0, 0, 1]);
    s.setLighting({});
    expect(u['uLight']!.value.x).toBe(0.4);
    s.dispose();
  });
});
