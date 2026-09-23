import { BackSide, NoBlending } from 'three';
import { describe, expect, it } from 'vitest';
import { createResourceManager } from '../resources.ts';
import { MARKER_FRAGMENT, MARKER_VERTEX } from './markers.glsl.ts';
import { createMarkers } from './markers.ts';

function context() {
  return { resources: createResourceManager(), invalidate: () => {} };
}

describe('MarkerSet pick variant (E2.13)', () => {
  it('is a pickable primitive counting drawn instances as points', () => {
    const m = createMarkers(context(), { x: [0, 1, 2], y: [0, 1, 2] });
    expect(m.pickCount).toBe(3);
    expect(m.pickKind).toBe('point');
    m.update({ x: [0], y: [0] });
    expect(m.pickCount).toBe(1);
  });

  it('shares the SDF shaders under a PICKING define and leaves the visible material alone', () => {
    const m = createMarkers(context(), { x: [0], y: [0] });
    const handle = m.createPickMaterial();
    const pick = handle.material;
    expect(pick).not.toBe(m.material);
    expect(pick.vertexShader).toBe(MARKER_VERTEX);
    expect(pick.fragmentShader).toBe(MARKER_FRAGMENT);
    expect(pick.defines).toHaveProperty('PICKING');
    expect(m.material.defines).not.toHaveProperty('PICKING');
    expect(pick.blending).toBe(NoBlending);
    expect(MARKER_FRAGMENT).toContain('holochartEncodePickId(vPickId)');
    expect(MARKER_VERTEX).toContain('uPickBase + uint(gl_InstanceID)');
    handle.dispose();
  });

  it('shares data uniforms but owns resolution and pick base', () => {
    const m = createMarkers(context(), { x: [0, 1], y: [0, 1] });
    m.setViewport({ width: 800, height: 600, pixelRatio: 2 });
    const handle = m.createPickMaterial();
    const u = handle.material.uniforms;
    const v = m.material.uniforms;
    expect(u.uScale).toBe(v.uScale);
    expect(u.uOffset).toBe(v.uOffset);
    expect(u.uSymbols).toBe(v.uSymbols);
    expect(u.uResolution).not.toBe(v.uResolution);
    handle.prepare({ base: 1234, windowWidth: 6.5, windowHeight: 6.5, pixelRatio: 2 });
    expect(u.uPickBase!.value).toBe(1234);
    expect(u.uResolution!.value.toArray()).toEqual([6.5, 6.5]);
    // The visible pass is untouched.
    expect(v.uResolution!.value.toArray()).toEqual([800, 600]);
    // Transform changes reach the pick pass through the shared uniforms.
    m.setTransform({ scaleX: 3, scaleY: 4, offsetX: 0, offsetY: 0 });
    expect(u.uScale!.value.x).toBe(3);
  });

  it('mirrors the color mode define and depth state on prepare', () => {
    const m = createMarkers(context(), { x: [0, 1], y: [0, 1] }, { depthWrite: true });
    const handle = m.createPickMaterial();
    const state = { base: 0, windowWidth: 1, windowHeight: 1, pixelRatio: 1 };
    handle.prepare(state);
    expect(handle.material.defines).not.toHaveProperty('USE_COLORSCALE');
    expect(handle.material.depthWrite).toBe(true);
    expect(handle.material.transparent).toBe(true);

    m.update({
      colorValues: [0, 1],
      colorscale: [
        [0, [0, 0, 0, 1]],
        [1, [1, 1, 1, 1]],
      ],
    });
    m.material.side = BackSide;
    const version = handle.material.version;
    handle.prepare(state);
    expect(handle.material.defines).toHaveProperty('USE_COLORSCALE');
    expect(handle.material.version).toBeGreaterThan(version);
    expect(handle.material.side).toBe(BackSide);
    // Unchanged mode: no recompile.
    const again = handle.material.version;
    handle.prepare(state);
    expect(handle.material.version).toBe(again);
  });

  it('exposes drawn positions and world mapping for CPU indexes', () => {
    const m = createMarkers(context(), { x: [10, 20], y: [1, 3], origin: [15, 2, 0] });
    expect(Array.from(m.positionArray!.subarray(0, 6))).toEqual([-5, -1, 0, 5, 1, 0]);
    m.setTransform({ scaleX: 2, scaleY: 1, offsetX: 1, offsetY: 0 });
    // world = pos * scale + offset → 20 * 2 + 1 = 41 for x of item 1.
    expect(5 * m.worldScale.x + m.worldOffset.x).toBe(41);
    const v = m.positionVersion;
    m.update({ color: [1, 0, 0, 1] });
    expect(m.positionVersion).toBe(v);
    m.update({ y: [2, 4] });
    expect(m.positionVersion).toBeGreaterThan(v);
  });
});
