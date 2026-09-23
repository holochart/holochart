import { describe, expect, it } from 'vitest';
import {
  OrthographicCamera,
  Scene,
  Vector4,
  type Mesh,
  type ShaderMaterial,
  type Vector2,
  type WebGLRenderer,
} from 'three';
import { createMarkers } from '../markers/markers.ts';
import { createResourceManager } from '../resources.ts';
import type { PrimitiveContext } from '../types.ts';
import { createArcPrimitive } from './arc.ts';
import { createViewportUniforms, syncViewportUniforms, type ViewportSource } from './common.ts';
import { LinePrimitive } from './line.ts';
import { createRectPrimitive } from './rect.ts';

/** A renderer stand-in reporting a fixed GL viewport (device px), pixel ratio, and target. */
function fakeRenderer(
  viewport: [number, number, number, number],
  pixelRatio: number,
  renderTarget: unknown = null,
): ViewportSource {
  return {
    getCurrentViewport: (target: Vector4) => target.set(...viewport),
    getPixelRatio: () => pixelRatio,
    getRenderTarget: () => renderTarget as ReturnType<WebGLRenderer['getRenderTarget']>,
  };
}

function context(): PrimitiveContext {
  return { resources: createResourceManager(), invalidate() {} };
}

/** Run a primitive's pre-draw hook the way three does just before issuing its draw call. */
function beforeDraw(mesh: Mesh, renderer: ViewportSource): void {
  mesh.onBeforeRender(
    renderer as WebGLRenderer,
    new Scene(),
    new OrthographicCamera(),
    mesh.geometry,
    mesh.material as ShaderMaterial,
    null as never,
  );
}

function resolutionOf(mesh: Mesh): [number, number, number] {
  const uniforms = (mesh.material as ShaderMaterial).uniforms;
  const res = uniforms.uResolution!.value as Vector2;
  return [res.x, res.y, uniforms.uPixelRatio!.value as number];
}

describe('syncViewportUniforms', () => {
  it('derives CSS resolution and pixel ratio from the canvas viewport', () => {
    const u = createViewportUniforms();
    expect(syncViewportUniforms(u, fakeRenderer([0, 0, 2048, 1280], 2))).toBe(true);
    expect(u.uResolution.value.toArray()).toEqual([1024, 640]);
    expect(u.uPixelRatio.value).toBe(2);
    expect(u.uViewport.value.toArray()).toEqual([0, 0, 2048, 1280]);
    // Unchanged viewport: no change reported (callers use this to skip dash recomputes).
    expect(syncViewportUniforms(u, fakeRenderer([0, 0, 2048, 1280], 2))).toBe(false);
  });

  it('tracks the origin of scissored sub-viewports for gl_FragCoord math', () => {
    const u = createViewportUniforms();
    syncViewportUniforms(u, fakeRenderer([300, 100, 600, 400], 1));
    expect(u.uViewport.value.toArray()).toEqual([300, 100, 600, 400]);
    expect(u.uResolution.value.toArray()).toEqual([600, 400]);
  });

  it('keeps the explicit logical size when drawing into a render target', () => {
    const u = createViewportUniforms();
    u.uResolution.value.set(800, 500);
    u.uPixelRatio.value = 2;
    expect(syncViewportUniforms(u, fakeRenderer([0, 0, 64, 64], 1, {}))).toBe(false);
    expect(u.uResolution.value.toArray()).toEqual([800, 500]);
    expect(u.uPixelRatio.value).toBe(2);
    expect(u.uViewport.value.toArray()).toEqual([0, 0, 64, 64]);
  });
});

// Regression for spike B: primitives added to a scene without setViewport kept the 1×1 default
// resolution, so every screen-space quad covered the whole canvas (seconds of GPU per frame).
describe('primitives size themselves from the renderer without setViewport', () => {
  const canvas = fakeRenderer([0, 0, 2048, 1280], 2);
  const cases: [string, () => Mesh][] = [
    ['LinePrimitive', () => new LinePrimitive(context(), { x: [0, 1, 2], y: [0, 1, 0] }).object],
    [
      'RectPrimitive',
      () => createRectPrimitive(context(), { x0: [0], y0: [0], x1: [1], y1: [1] }).object,
    ],
    ['ArcPrimitive', () => createArcPrimitive(context(), { x: [0], y: [0] }).object],
    ['MarkerSet', () => createMarkers(context(), { x: [0, 1], y: [0, 1] }).object],
  ];
  for (const [name, make] of cases) {
    it(name, () => {
      const mesh = make();
      expect(resolutionOf(mesh)).toEqual([1, 1, 1]);
      beforeDraw(mesh, canvas);
      expect(resolutionOf(mesh)).toEqual([1024, 640, 2]);
    });
  }
});
