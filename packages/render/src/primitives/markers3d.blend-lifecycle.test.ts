import { CustomBlending, NormalBlending } from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { Colorscale } from '../colorscale/lut.ts';
import { createResourceManager } from '../resources.ts';
import type { PrimitiveContext } from '../types.ts';
import { createMarkers3D, Markers3D } from './markers3d.ts';

/**
 * 3D sprite markers (plan E14.2): when a set counts as opaque (depth-writing) or translucent,
 * what the construction options and the `Primitive` methods do to the underlying marker set, and
 * its lifecycle.
 */

function context(): PrimitiveContext & { invalidate: ReturnType<typeof vi.fn<() => void>> } {
  return { resources: createResourceManager(), invalidate: vi.fn<() => void>() };
}

const POINTS = { x: [1, 3], y: [0, 0], z: [5, 5] };

const OPAQUE_SCALE: Colorscale = [
  [0, [0, 0, 1, 1]],
  [1, [1, 0, 0, 1]],
];
const FADING_SCALE: Colorscale = [
  [0, [0, 0, 1, 0.2]],
  [1, [1, 0, 0, 1]],
];

describe('Markers3D blending', () => {
  it('with a colorscale, the stops and the NaN color decide; `color` is ignored', () => {
    const m = new Markers3D(context(), {
      ...POINTS,
      colorValues: [0, 1],
      colorscale: OPAQUE_SCALE,
      // Not drawn while the colorscale is on.
      color: [1, 0, 0, 0.5],
    });
    expect(m.opaque).toBe(true);
    expect(m.markers.material.depthWrite).toBe(true);
    m.update({ colorscale: FADING_SCALE });
    expect(m.opaque).toBe(false);
    expect(m.markers.material.depthWrite).toBe(false);
    expect(m.markers.material.blending).toBe(NormalBlending);
    // Opaque stops, but values that are not finite would draw translucent.
    m.update({ colorscale: OPAQUE_SCALE, nanColor: [0.5, 0.5, 0.5, 0.4] });
    expect(m.opaque).toBe(false);
    m.update({ nanColor: [0.5, 0.5, 0.5, 1] });
    expect(m.opaque).toBe(true);
    // Without values the explicit (translucent) color is drawn again.
    m.update({ colorValues: null });
    expect(m.opaque).toBe(false);
    m.dispose();
  });

  it('a translucent border counts only where a border is drawn', () => {
    const m = new Markers3D(context(), { ...POINTS, lineColor: [0, 0, 0, 0.5], lineWidth: 0 });
    expect(m.opaque).toBe(true);
    // Per-item widths: some border may be drawn.
    m.update({ lineWidth: Float32Array.from([0, 2]) });
    expect(m.opaque).toBe(false);
    m.update({ lineColor: [0, 0, 0, 1] });
    expect(m.opaque).toBe(true);
    m.dispose();
  });

  it('`blend` overrides what the data says', () => {
    const forced = new Markers3D(context(), { ...POINTS, opacity: 0.3 }, { blend: 'opaque' });
    expect(forced.opaque).toBe(true);
    expect(forced.markers.material.alphaToCoverage).toBe(true);
    expect(forced.markers.material.depthWrite).toBe(true);
    expect(forced.markers.material.blending).toBe(CustomBlending);
    const blended = new Markers3D(context(), POINTS, { blend: 'translucent' });
    expect(blended.opaque).toBe(false);
    expect(blended.markers.material.transparent).toBe(true);
    expect(blended.markers.material.depthWrite).toBe(false);
    forced.dispose();
    blended.dispose();
  });
});

describe('Markers3D options and Primitive methods', () => {
  it('render order and depth test reach the marker set', () => {
    const m = new Markers3D(context(), POINTS, { renderOrder: 7, depthTest: false });
    expect(m.object.renderOrder).toBe(7);
    expect(m.markers.material.depthTest).toBe(false);
    const defaults = new Markers3D(context(), POINTS);
    expect(defaults.object.renderOrder).toBe(0);
    expect(defaults.markers.material.depthTest).toBe(true);
    m.dispose();
    defaults.dispose();
  });

  it('setTransform places the markers: scale, and offset + origin · scale', () => {
    const m = new Markers3D(context(), POINTS);
    // The RTC origin is the center of the data: (2, 0, 5).
    m.setTransform({ scaleX: 2, scaleY: 3, scaleZ: 4, offsetX: 10, offsetY: 20, offsetZ: 5 });
    expect(m.markers.worldScale.toArray()).toEqual([2, 3, 4]);
    expect(m.markers.worldOffset.toArray()).toEqual([10 + 2 * 2, 20, 5 + 5 * 4]);
    m.dispose();
  });

  it('setViewport sets the CSS resolution and pixel ratio of the sprites', () => {
    const m = new Markers3D(context(), POINTS);
    const u = m.markers.material.uniforms;
    m.setViewport({ width: 800, height: 600, pixelRatio: 2 });
    expect(u['uResolution']!.value.toArray()).toEqual([800, 600]);
    expect(u['uPixelRatio']!.value).toBe(2);
    m.dispose();
  });

  it('is ready at once with built-in symbols', async () => {
    const m = new Markers3D(context(), { ...POINTS, symbol: ['circle-open', 'x'] });
    await expect(m.ready).resolves.toBeUndefined();
    m.dispose();
  });

  it('createMarkers3D: an empty, opaque set until data arrives', () => {
    const m = createMarkers3D(context());
    expect(m).toBeInstanceOf(Markers3D);
    expect(m.count).toBe(0);
    expect(m.pickCount).toBe(0);
    expect(m.pickKind).toBe('point');
    expect(m.opaque).toBe(true);
    m.update(POINTS);
    expect(m.count).toBe(2);
    expect(m.pickCount).toBe(2);
    m.dispose();
  });
});

describe('Markers3D lifecycle', () => {
  it('dispose releases every shared resource, once; later updates are ignored', () => {
    const ctx = context();
    const m = new Markers3D(ctx, { ...POINTS, colorValues: [0, 1], colorscale: OPAQUE_SCALE });
    expect(ctx.resources.stats().length).toBeGreaterThan(0);
    const disposed = vi.fn<() => void>();
    m.markers.geometry.addEventListener('dispose', disposed);
    m.dispose();
    m.dispose();
    expect(disposed).toHaveBeenCalledTimes(1);
    expect(ctx.resources.stats()).toHaveLength(0);
    m.update({ opacity: 0.2, x: [0], y: [0], z: [0] });
    expect(m.count).toBe(2);
    expect(m.opaque).toBe(true);
  });

  it('the pick material is compiled once, not on every pick', () => {
    const m = new Markers3D(context(), POINTS, { depthSort: true });
    const handle = m.createPickMaterial();
    const state = { base: 0, windowWidth: 5, windowHeight: 5, pixelRatio: 1 };
    handle.prepare(state);
    const version = handle.material.version;
    handle.prepare({ ...state, base: 12 });
    expect(handle.material.version).toBe(version);
    expect(handle.material.uniforms['uPickBase']!.value).toBe(12);
    const disposed = vi.fn<() => void>();
    handle.material.addEventListener('dispose', disposed);
    handle.dispose();
    expect(disposed).toHaveBeenCalledTimes(1);
    m.dispose();
  });
});
