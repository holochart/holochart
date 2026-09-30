import { attr, coerceContainer } from '@mk7s/holochart-core';
import { describe, expect, it } from 'vitest';
import { defaults } from './__testing__/points.ts';
import {
  SCENE_LIGHTING_DEFAULTS,
  sceneLightingAttributes,
  sceneLightingSpec,
  sceneMaterialAttributes,
  sceneMaterialSpec,
  sceneMeshLighting,
  supplySceneLightingLayout,
} from './lighting-attributes.ts';

/** A trace's lighting attributes, defaulted from `input` as a trace module would. */
function traceLighting(type: Parameters<typeof sceneLightingAttributes>[0], input: object = {}) {
  const schema = attr.object({ ...sceneLightingAttributes(type), ...sceneMaterialAttributes });
  return coerceContainer(schema, input);
}

describe('trace lighting attributes', () => {
  it("declares plotly.js' defaults per trace type", () => {
    const surface = traceLighting('surface');
    expect(surface['lighting']).toEqual({
      ambient: 0.8,
      diffuse: 0.8,
      specular: 0.05,
      roughness: 0.5,
      fresnel: 0.2,
    });
    expect(surface['lightposition']).toEqual({ x: 10, y: 1e4, z: 0 });
    const mesh = traceLighting('mesh3d');
    expect(mesh['lighting']).toMatchObject({
      facenormalsepsilon: 1e-6,
      vertexnormalsepsilon: 1e-12,
    });
    expect(mesh['lightposition']).toEqual({ x: 1e5, y: 1e5, z: 0 });
    expect(traceLighting('cone')['lighting']).toEqual(mesh['lighting']);
    expect(traceLighting('isosurface')['lighting']).toMatchObject({ facenormalsepsilon: 0 });
    expect(SCENE_LIGHTING_DEFAULTS.volume).toBe(SCENE_LIGHTING_DEFAULTS.isosurface);
  });

  it("clamps to Plotly's ranges and takes custom defaults", () => {
    const out = traceLighting(
      { lighting: { ambient: 0.3 }, lightposition: [1, 2, 3] },
      { lighting: { ambient: 2, specular: 1.5 } },
    );
    // Out of range falls back to the default; only the given coefficients are declared.
    expect(out['lighting']).toEqual({ ambient: 0.3 });
    expect(out['lightposition']).toEqual({ x: 1, y: 2, z: 3 });
  });

  it('maps the defaulted attributes onto the mesh primitive', () => {
    const full = traceLighting('mesh3d', {
      lighting: { ambient: 0.5 },
      lightposition: { x: -1 },
      material: {
        type: 'physical',
        roughness: 0.2,
        clearcoat: 1,
        clearcoatroughness: 0.1,
        emissive: '#ff0000',
        castshadow: true,
      },
    });
    const m = sceneMeshLighting(full);
    expect(m.lighting).toMatchObject({ ambient: 0.5, diffuse: 0.8 });
    expect(m.lightposition).toEqual([-1, 1e5, 0]);
    expect(m.castShadow).toBe(true);
    expect(m.receiveShadow).toBe(false);
    expect(m.material).toMatchObject({
      type: 'physical',
      roughness: 0.2,
      clearcoat: 1,
      clearcoatRoughness: 0.1,
      emissive: [1, 0, 0, 1],
      steps: 3,
    });
    expect(m.material).not.toHaveProperty('castshadow');
  });

  it("gives no material for Plotly's model (the default)", () => {
    expect(sceneMeshLighting(traceLighting('surface')).material).toBeNull();
    expect(sceneMaterialSpec({ material: { type: 'flat' } })).toEqual({ type: 'flat' });
    expect(sceneMaterialSpec({})).toBeNull();
  });
});

describe('scene.lighting', () => {
  it('stays unset unless the figure or the template gives it', () => {
    const out: Record<string, unknown> = {};
    supplySceneLightingLayout({}, undefined, out);
    expect(out).not.toHaveProperty('lighting');
    expect(sceneLightingSpec(out['lighting'])).toBeNull();
    supplySceneLightingLayout({}, { lighting: { ambient: { intensity: 0.5 } } }, out);
    expect(out['lighting']).toMatchObject({ ambient: { intensity: 0.5 } });
  });

  it('defaults to one Plotly light, and `[]` to none; the hemisphere only when given', () => {
    const out: Record<string, unknown> = {};
    supplySceneLightingLayout({ lighting: {} }, undefined, out);
    const spec = sceneLightingSpec(out['lighting'])!;
    expect(spec.ambient).toEqual({ color: [1, 1, 1, 1], intensity: 0.8 });
    expect(spec.directional).toEqual([
      {
        color: [1, 1, 1, 1],
        intensity: 0.8,
        space: 'clip',
        castShadow: false,
        position: [1e5, 1e5, 0],
      },
    ]);
    expect(spec.hemisphere).toBeUndefined();
    expect(spec.shadows).toBeUndefined();
    supplySceneLightingLayout(
      { lighting: { directional: [], hemisphere: { skycolor: 'blue' } } },
      undefined,
      out,
    );
    const spec2 = sceneLightingSpec(out['lighting'])!;
    expect(spec2.directional).toEqual([]);
    expect(spec2.hemisphere).toMatchObject({ skyColor: [0, 0, 1, 1], intensity: 0.5 });
  });

  it('converts lights, the environment and shadows for the render light rig', () => {
    const out: Record<string, unknown> = {};
    supplySceneLightingLayout(
      {
        lighting: {
          directional: [
            { position: { x: 1, y: -1, z: 3 }, space: 'scene', castshadow: true, intensity: 1 },
            { visible: false },
          ],
          environment: 'studio',
          environmentintensity: 0.6,
          shadows: { ground: true, opacity: 0.5 },
        },
      },
      undefined,
      out,
    );
    const spec = sceneLightingSpec(out['lighting'], [2, 1, 0.5])!;
    expect(spec.directional).toEqual([
      { color: [1, 1, 1, 1], intensity: 1, space: 'scene', castShadow: true, position: [1, -1, 3] },
    ]);
    expect(spec.environment).toBe('studio');
    expect(spec.environmentIntensity).toBe(0.6);
    expect(spec.shadows).toMatchObject({ opacity: 0.5, mapSize: 1024, up: [0, 0, 1] });
    // The ground sits just below the axis box; the shadowed region covers the box.
    expect(spec.shadows!.ground).toBeCloseTo(-0.25 - 1e-3, 9);
    expect(spec.shadows!.extent).toBeCloseTo((Math.hypot(2, 1, 0.5) / 2) * 1.25, 9);
  });

  it('is part of the scene defaults', () => {
    const { fullLayout } = defaults([{ x: [0], y: [0], z: [0] }], {
      scene: { lighting: { ambient: { color: 'red' } }, autorotate: { speed: 30 } },
    });
    const scene = fullLayout['scene'] as Record<string, Record<string, unknown>>;
    expect(scene['lighting']!['ambient']).toEqual({ color: 'rgb(255, 0, 0)', intensity: 0.8 });
    expect(scene['autorotate']).toEqual({ speed: 30, axis: 'z' });
    const plain = defaults([{ x: [0], y: [0], z: [0] }]).fullLayout['scene'] as object;
    expect(plain).not.toHaveProperty('lighting');
    expect(plain).toHaveProperty('autorotate', { speed: 0, axis: 'z' });
  });
});
