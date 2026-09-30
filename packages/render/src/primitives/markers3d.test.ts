import { CustomBlending, NormalBlending, Object3D, PerspectiveCamera } from 'three';
import type { InstancedBufferAttribute } from 'three';
import { describe, expect, it } from 'vitest';
import { MARKER_VERTEX } from '../markers/markers.glsl.ts';
import { createResourceManager } from '../resources.ts';
import type { PrimitiveContext } from '../types.ts';
import { colorscaleOpaque, colorsOpaque, isOpaque, opacitiesOpaque } from './blend3d.ts';
import { linesMarkers3DModule, loadLinesMarkers3D } from './lines-markers-3d-loader.ts';
import { Markers3D, sourceIndexPickShader } from './markers3d.ts';

function context(): PrimitiveContext {
  return { resources: createResourceManager(), invalidate: () => {} };
}

const fakeRenderer = {
  getCurrentViewport: (v: { set(...a: number[]): unknown }) => v.set(0, 0, 800, 600),
  getPixelRatio: () => 1,
  getRenderTarget: () => null,
};

function render(m: Markers3D, camera: PerspectiveCamera): void {
  m.object.updateMatrixWorld();
  m.object.onBeforeRender(
    fakeRenderer as never,
    new Object3D() as never,
    camera,
    m.object.geometry,
    m.markers.material,
    null as never,
  );
}

describe('blend3d', () => {
  it('detects opaque data', () => {
    expect(colorsOpaque([1, 0, 0, 1])).toBe(true);
    expect(colorsOpaque(Float32Array.from([1, 0, 0, 1, 0, 0, 0, 0.9]))).toBe(false);
    expect(colorsOpaque(undefined)).toBe(true);
    expect(opacitiesOpaque(1)).toBe(true);
    expect(opacitiesOpaque(Float32Array.from([1, 0.5]))).toBe(false);
    expect(opacitiesOpaque([1, NaN])).toBe(false);
    expect(colorscaleOpaque([[0, [0, 0, 0, 1]]])).toBe(true);
    expect(colorscaleOpaque([[0, [0, 0, 0, 0.5]]])).toBe(false);
    expect(isOpaque('auto', false)).toBe(false);
    expect(isOpaque('opaque', false)).toBe(true);
    expect(isOpaque('translucent', true)).toBe(false);
  });
});

describe('Markers3D', () => {
  it('passes data through to a MarkerSet and draws opaque markers with alpha to coverage', () => {
    const m = new Markers3D(context(), {
      x: [0, 1, 2],
      y: [0, 1, 2],
      z: [0, 1, 2],
      symbol: ['circle', 'diamond-open', 'x'],
      size: 12,
    });
    expect(m.count).toBe(3);
    expect(m.pickCount).toBe(3);
    expect(m.object).toBe(m.markers.object);
    expect(m.opaque).toBe(true);
    expect(m.markers.material.alphaToCoverage).toBe(true);
    expect(m.markers.material.depthWrite).toBe(true);
    expect(m.markers.material.blending).toBe(CustomBlending);
    m.update({ opacity: 0.4 });
    expect(m.opaque).toBe(false);
    expect(m.markers.material.depthWrite).toBe(false);
    expect(m.markers.material.blending).toBe(NormalBlending);
    // A translucent border counts only when there is a border.
    m.update({ opacity: 1, lineColor: [0, 0, 0, 0.5] });
    expect(m.opaque).toBe(true);
    m.update({ lineWidth: 2 });
    expect(m.opaque).toBe(false);
    expect(m.sourceIndex(2)).toBe(2);
    m.dispose();
  });

  it('depthSort re-orders every per-item field back to front and records data indices', () => {
    const color = Float32Array.from([1, 0, 0, 0.5, 0, 1, 0, 0.5, 0, 0, 1, 0.5]);
    const m = new Markers3D(
      context(),
      {
        x: [0, 0, 0],
        y: [0, 0, 0],
        z: [1, -1, 0],
        color,
        size: Float32Array.from([10, 20, 30]),
        symbol: ['circle', 'square', 'x'],
        image: ['a.png'],
      },
      { depthSort: true },
    );
    const camera = new PerspectiveCamera();
    camera.position.set(0, 0, 5);
    camera.updateMatrixWorld();
    render(m, camera);
    // Farthest first: z = -1 (item 1), z = 0 (item 2), z = 1 (item 0).
    expect([0, 1, 2].map((i) => m.sourceIndex(i))).toEqual([1, 2, 0]);
    const g = m.markers.geometry;
    const index = g.getAttribute('aSourceIndex') as InstancedBufferAttribute;
    expect(Array.from(index.array.subarray(0, 3))).toEqual([1, 2, 0]);
    expect(Array.from((g.getAttribute('aSize') as InstancedBufferAttribute).array)).toEqual([
      20, 30, 10,
    ]);
    const pos = (g.getAttribute('aPos') as InstancedBufferAttribute).array;
    expect([pos[2], pos[5], pos[8]]).toEqual([-1, 0, 1]);
    const fill = (g.getAttribute('aFill') as InstancedBufferAttribute).array;
    expect(Array.from(fill.subarray(0, 4))).toEqual([0, 255, 0, 128]);

    // A style-only update keeps the order.
    m.update({ size: Float32Array.from([1, 2, 3]) });
    expect(Array.from((g.getAttribute('aSize') as InstancedBufferAttribute).array)).toEqual([
      2, 3, 1,
    ]);
    m.dispose();
  });

  it('pick material reads data indices from aSourceIndex only while sorted', () => {
    const injected = sourceIndexPickShader(MARKER_VERTEX);
    expect(injected).toContain('in int aSourceIndex;');
    expect(injected).toContain('vPickId = uPickBase + uint(aSourceIndex);');
    expect(injected).toContain('vPickId = uPickBase + uint(gl_InstanceID);');

    const state = { base: 0, windowWidth: 1, windowHeight: 1, pixelRatio: 1 };
    const sorted = new Markers3D(context(), { x: [0], y: [0], z: [0] }, { depthSort: true });
    const handle = sorted.createPickMaterial();
    handle.prepare(state);
    expect(handle.material.defines).toHaveProperty('SOURCE_INDEX');
    expect(handle.material.defines).toHaveProperty('PICKING');
    const shader = { vertexShader: handle.material.vertexShader } as never;
    handle.material.onBeforeCompile(shader, null as never);
    expect((shader as { vertexShader: string }).vertexShader).toContain('aSourceIndex');
    handle.dispose();
    sorted.dispose();

    const plain = new Markers3D(context(), { x: [0], y: [0], z: [0] });
    const h2 = plain.createPickMaterial();
    h2.prepare(state);
    expect(h2.material.defines).not.toHaveProperty('SOURCE_INDEX');
    h2.dispose();
    plain.dispose();
  });
});

describe('lazy 3D chunk loader', () => {
  it('loads the module once and exposes it synchronously afterwards', async () => {
    const [a, b] = await Promise.all([loadLinesMarkers3D(), loadLinesMarkers3D()]);
    expect(a).toBe(b);
    expect(linesMarkers3DModule()).toBe(a);
    expect(typeof a.createLine3D).toBe('function');
    expect(typeof a.createMarkers3D).toBe('function');
    expect(typeof a.createSpheres).toBe('function');
  });
});
