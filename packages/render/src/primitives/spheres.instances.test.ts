import { Object3D, PerspectiveCamera, Scene, type InstancedBufferAttribute } from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { Colorscale } from '../colorscale/lut.ts';
import { HIDDEN_POSITION } from '../precision.ts';
import { createResourceManager } from '../resources.ts';
import type { PrimitiveContext } from '../types.ts';
import { createSpheres, SphereSet, type SphereSetOptions } from './spheres.ts';

/**
 * Instanced spheres (plan E14.2): what ends up in the instance attributes and uniforms for sizes,
 * opacities, origins, transforms and colorscales, how the pick material follows, and the
 * lifecycle.
 */

function context(): PrimitiveContext & { invalidate: ReturnType<typeof vi.fn<() => void>> } {
  return { resources: createResourceManager(), invalidate: vi.fn<() => void>() };
}

/** A manual clock for the re-sort throttle. */
function fakeClock() {
  let now = 0;
  const timers: { at: number; fn: () => void }[] = [];
  return {
    now: () => now,
    setTimeout(fn: () => void, ms: number) {
      const t = { at: now + ms, fn };
      timers.push(t);
      return t;
    },
    clearTimeout(handle: unknown) {
      const i = timers.indexOf(handle as (typeof timers)[number]);
      if (i >= 0) timers.splice(i, 1);
    },
    advance(ms: number) {
      now += ms;
      for (const t of [...timers].sort((a, b) => a.at - b.at)) {
        if (t.at > now) continue;
        timers.splice(timers.indexOf(t), 1);
        t.fn();
      }
    },
    get pending() {
      return timers.length;
    },
  };
}

const fakeRenderer = {
  getCurrentViewport: (v: { set(...a: number[]): unknown }) => v.set(0, 0, 800, 600),
  getPixelRatio: () => 1,
  getRenderTarget: () => null,
};

/** What three.js does before drawing the spheres from `(0, 0, z)`, looking at the origin. */
function renderFromZ(s: SphereSet, z: number): void {
  const camera = new PerspectiveCamera();
  camera.position.set(0, 0, z);
  camera.lookAt(0, 0, 0);
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
}

function values(s: SphereSet, name: string): number[] {
  const attribute = s.object.geometry.getAttribute(name) as InstancedBufferAttribute;
  return Array.from(attribute.array.subarray(0, s.count * attribute.itemSize));
}

const sizes = (s: SphereSet): number[] => values(s, 'aStyle').filter((_, i) => i % 2 === 0);
const opacities = (s: SphereSet): number[] => values(s, 'aStyle').filter((_, i) => i % 2 === 1);

function uniform(s: SphereSet, name: string): number[] {
  return (s.material.uniforms[name]!.value as { toArray(): number[] }).toArray();
}

const BLUE_RED: Colorscale = [
  [0, [0, 0, 1, 1]],
  [1, [1, 0, 0, 1]],
];
const GREEN: Colorscale = [
  [0, [0, 0.5, 0, 1]],
  [1, [0, 1, 0, 1]],
];
const HIDDEN = Math.fround(HIDDEN_POSITION);

describe('SphereSet instance attributes', () => {
  it('sizes that cannot be drawn become 0; opacities are clamped to 0–1, missing ones are 1', () => {
    const s = new SphereSet(context(), {
      x: [0, 1, 2, 3],
      y: [0, 0, 0, 0],
      size: Float32Array.from([10, -1, Infinity, NaN]),
      opacity: Float32Array.from([0.5, 2, -0.5, NaN]),
    });
    expect(sizes(s)).toEqual([10, 0, 0, 0]);
    expect(opacities(s)).toEqual([0.5, 1, 0, 1]);
    s.dispose();
  });

  it('positions are relative to an explicit origin when one is given', () => {
    const s = new SphereSet(context(), { x: [1000, 1001], y: [0, 1], origin: [1000, 0, 2] });
    expect(s.origin).toEqual([1000, 0, 2]);
    // No z: the spheres sit at data z = 0, i.e. -2 from the origin.
    expect(values(s, 'aPos')).toEqual([0, 0, -2, 1, 1, -2]);
    // Back to the center of the data.
    s.update({ origin: null });
    expect(s.origin).toEqual([1000.5, 0.5, 0]);
    expect(values(s, 'aPos')).toEqual([-0.5, -0.5, 0, 0.5, 0.5, 0]);
    s.dispose();
  });

  it('an undefined field in an update keeps the previous value', () => {
    const s = new SphereSet(context(), { x: [0, 1], y: [0, 0], size: 10 });
    s.update({ size: undefined, opacity: 0.5 });
    expect(sizes(s)).toEqual([10, 10]);
    expect(opacities(s)).toEqual([0.5, 0.5]);
    s.dispose();
  });

  it('colorscale values without a finite number are hidden (drawn with the NaN color)', () => {
    const s = new SphereSet(context(), {
      x: [0, 1, 2, 3],
      y: [0, 0, 0, 0],
      colorValues: [10, NaN, 20],
      colorscale: BLUE_RED,
    });
    // Relative to the center of the finite values (15); item 3 has no value at all.
    expect(values(s, 'aValue')).toEqual([-5, HIDDEN, 5, HIDDEN]);
    s.dispose();
  });

  it('depth-sorted: colorscale values and later style updates follow the view order', () => {
    const s = new SphereSet(
      context(),
      {
        x: [0, 0, 0],
        y: [0, 0, 0],
        z: [1, -1, 0],
        colorValues: [10, 20],
        colorscale: BLUE_RED,
      },
      { depthSort: true },
    );
    // No frame yet: data order.
    expect(values(s, 'aValue')).toEqual([-5, 5, HIDDEN]);
    renderFromZ(s, 5);
    // Farthest first from +z: item 1 (z = -1), item 2 (z = 0), item 0 (z = 1).
    expect(values(s, 'aSourceIndex')).toEqual([1, 2, 0]);
    expect(values(s, 'aValue')).toEqual([5, HIDDEN, -5]);
    s.update({ size: Float32Array.from([1, 2, 3]) });
    expect(sizes(s)).toEqual([2, 3, 1]);
    // A slot that draws nothing has no data index.
    expect(s.sourceIndex(2)).toBe(0);
    expect(s.sourceIndex(3)).toBe(-1);
    s.dispose();
  });
});

describe('SphereSet transform and viewport', () => {
  it('setTransform: scale, and offset + origin · scale (z defaults to scale 1, offset 0)', () => {
    const ctx = context();
    const s = new SphereSet(ctx, { x: [1000, 1001], y: [0, 1], origin: [1000, 0, 2] });
    ctx.invalidate.mockClear();
    s.setTransform({ scaleX: 2, scaleY: 3, offsetX: 5, offsetY: 7 });
    expect(uniform(s, 'uScale')).toEqual([2, 3, 1]);
    expect(uniform(s, 'uOffset')).toEqual([5 + 1000 * 2, 7, 2]);
    expect(ctx.invalidate).toHaveBeenCalledTimes(1);
    s.setTransform({ scaleX: 2, scaleY: 3, scaleZ: 4, offsetX: 5, offsetY: 7, offsetZ: 1 });
    expect(uniform(s, 'uScale')).toEqual([2, 3, 4]);
    expect(uniform(s, 'uOffset')).toEqual([2005, 7, 1 + 2 * 4]);
    // A new origin moves the offset under the same transform.
    s.update({ origin: [0, 0, 0] });
    expect(uniform(s, 'uOffset')).toEqual([5, 7, 1]);
    s.dispose();
  });

  it('setViewport: CSS resolution and pixel ratio, never below 1 px or a ratio of 0', () => {
    const s = new SphereSet(context(), { x: [0], y: [0] });
    s.setViewport({ width: 800, height: 600, pixelRatio: 2 });
    expect(uniform(s, 'uResolution')).toEqual([800, 600]);
    expect(s.material.uniforms['uPixelRatio']!.value).toBe(2);
    s.setViewport({ width: 0, height: -5, pixelRatio: 0 });
    expect(uniform(s, 'uResolution')).toEqual([1, 1]);
    expect(s.material.uniforms['uPixelRatio']!.value).toBe(1);
    s.dispose();
  });

  it('options: render order and depth test', () => {
    const s = new SphereSet(context(), {}, { renderOrder: 4, depthTest: false });
    expect(s.object.renderOrder).toBe(4);
    expect(s.material.depthTest).toBe(false);
    const defaults = createSpheres(context());
    expect(defaults).toBeInstanceOf(SphereSet);
    expect(defaults.object.renderOrder).toBe(0);
    expect(defaults.material.depthTest).toBe(true);
    expect(defaults.count).toBe(0);
    expect(defaults.pickKind).toBe('point');
    s.dispose();
    defaults.dispose();
  });
});

describe('SphereSet colorscale', () => {
  it('a new colorscale swaps the shared LUT; other color updates keep it', () => {
    const ctx = context();
    const s = new SphereSet(ctx, {
      x: [0, 1],
      y: [0, 0],
      colorValues: [4, 6],
      colorscale: BLUE_RED,
      cmin: 0,
      cmax: 10,
    });
    const u = s.material.uniforms;
    const first = u['uColorscale']!.value as unknown;
    expect(first).not.toBeNull();
    expect(ctx.resources.stats().map((r) => r.kind)).toEqual(['texture']);
    // Values are relative to their center (5), and so is the domain.
    expect(uniform(s, 'uCRange')).toEqual([-5, 5]);
    expect(u['uReverse']!.value).toBe(0);

    s.update({ reversescale: true, nanColor: [1, 0, 1, 0.5], cmid: 2 });
    expect(u['uColorscale']!.value).toBe(first);
    expect(u['uReverse']!.value).toBe(1);
    expect(uniform(s, 'uNanColor')).toEqual([1, 0, 1, 0.5]);
    // cmid 2 widens [0, 10] to be symmetric around it: [-6, 10], relative to 5.
    expect(uniform(s, 'uCRange')).toEqual([-11, 5]);
    // A translucent NaN color makes the set translucent.
    expect(s.opaque).toBe(false);

    s.update({ colorscale: GREEN, nanColor: [1, 0, 1, 1] });
    expect(u['uColorscale']!.value).not.toBe(first);
    expect(u['uColorscale']!.value).not.toBeNull();
    // The first LUT was released: still one texture.
    expect(ctx.resources.stats()).toHaveLength(1);
    expect(s.opaque).toBe(true);
    s.dispose();
    expect(ctx.resources.stats()).toHaveLength(0);
  });

  it('the pick material follows the color mode both ways, recompiling only on a change', () => {
    const s = new SphereSet(context(), { x: [0, 1], y: [0, 0] });
    const handle = s.createPickMaterial();
    const pick = handle.material;
    const state = { base: 3, windowWidth: 0, windowHeight: 0, pixelRatio: 1 };
    handle.prepare(state);
    expect(pick.defines).not.toHaveProperty('USE_COLORSCALE');
    // A degenerate pick window never divides by zero.
    expect((pick.uniforms['uResolution']!.value as { x: number }).x).toBeGreaterThan(0);

    s.update({ colorValues: [0, 1], colorscale: BLUE_RED });
    let version = pick.version;
    handle.prepare(state);
    expect(pick.defines).toHaveProperty('USE_COLORSCALE');
    expect(pick.version).toBeGreaterThan(version);

    s.update({ colorValues: null });
    version = pick.version;
    handle.prepare(state);
    expect(pick.defines).not.toHaveProperty('USE_COLORSCALE');
    expect(pick.version).toBeGreaterThan(version);

    version = pick.version;
    handle.prepare(state);
    expect(pick.version).toBe(version);
    handle.dispose();
    s.dispose();
  });
});

describe('SphereSet lifecycle', () => {
  function sortedSet(ctx: PrimitiveContext, options: SphereSetOptions = {}): SphereSet {
    return new SphereSet(
      ctx,
      { x: [0, 0, 0], y: [0, 0, 0], z: [1, -1, 0], opacity: 0.5 },
      { depthSort: true, ...options },
    );
  }

  it('dispose frees the geometry and material once and leaves the scene', () => {
    const ctx = context();
    const s = new SphereSet(ctx, { x: [0, 1], y: [0, 0], colorValues: [0, 1], colorscale: GREEN });
    const scene = new Scene();
    scene.add(s.object);
    const geometry = vi.fn<() => void>();
    const material = vi.fn<() => void>();
    s.object.geometry.addEventListener('dispose', geometry);
    s.material.addEventListener('dispose', material);
    s.dispose();
    s.dispose();
    expect(geometry).toHaveBeenCalledTimes(1);
    expect(material).toHaveBeenCalledTimes(1);
    expect(scene.children).toHaveLength(0);
    expect(ctx.resources.stats()).toHaveLength(0);
  });

  it('a disposed set ignores updates', () => {
    const ctx = context();
    const s = new SphereSet(ctx, { x: [0, 1], y: [0, 0] });
    s.dispose();
    ctx.invalidate.mockClear();
    s.update({ x: [0, 1, 2], y: [0, 0, 0], opacity: 0.5 });
    expect(s.count).toBe(2);
    expect(s.opaque).toBe(true);
    expect(ctx.invalidate).not.toHaveBeenCalled();
  });

  it('dispose cancels the pending re-sort; a later frame rewrites nothing', () => {
    const clock = fakeClock();
    const ctx = context();
    const s = sortedSet(ctx, { clock });
    renderFromZ(s, 5);
    expect(values(s, 'aSourceIndex')).toEqual([1, 2, 0]);
    // A second view inside the throttle interval: the re-sort waits.
    renderFromZ(s, -5);
    expect(clock.pending).toBe(1);
    expect(values(s, 'aSourceIndex')).toEqual([1, 2, 0]);
    s.dispose();
    expect(clock.pending).toBe(0);
    ctx.invalidate.mockClear();
    clock.advance(1000);
    renderFromZ(s, -5);
    expect(values(s, 'aSourceIndex')).toEqual([1, 2, 0]);
    expect(ctx.invalidate).not.toHaveBeenCalled();
  });

  it('the throttled re-sort runs after the interval and requests a frame', () => {
    const clock = fakeClock();
    const ctx = context();
    const s = sortedSet(ctx, { clock, sortThrottleMs: 50 });
    renderFromZ(s, 5);
    renderFromZ(s, -5);
    ctx.invalidate.mockClear();
    clock.advance(49);
    expect(values(s, 'aSourceIndex')).toEqual([1, 2, 0]);
    clock.advance(1);
    // From -z the farthest is z = 1 (item 0), then item 2, then item 1.
    expect(values(s, 'aSourceIndex')).toEqual([0, 2, 1]);
    expect(ctx.invalidate).toHaveBeenCalledTimes(1);
    s.dispose();
  });
});
