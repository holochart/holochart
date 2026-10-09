import { Object3D } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createResourceManager } from '../resources.ts';
import type { DataTransform, Primitive } from '../types.ts';
import {
  extrusionDepths,
  extrusionMaterialSpec,
  syncExtrudedRects,
  UNCLIPPED,
  type ExtrusionHost,
} from './extrusion.ts';
import { loadMeshModule } from './mesh-loader.ts';

/**
 * Trace attributes → extrusion data (plan E8.9, E9.10): `depth` strings that are not a depth,
 * `material` attributes that are not a three.js parameter, and what `syncExtrudedRects` does with
 * layers of lifted primitives and with traces that have nothing to extrude.
 */

describe('extrusionDepths', () => {
  it('reads strings that are no number, and negative ones, as no depth', () => {
    expect(extrusionDepths('deep', 3, () => 10)).toBe(0);
    expect(extrusionDepths('-5', 3, () => 10)).toBe(0);
    expect(extrusionDepths('', 3, () => 10)).toBe(0);
    // Percentages take spaces; of each shape's own width.
    expect([...(extrusionDepths(' 25 % ', 2, (i) => 40 * (i + 1)) as Float32Array)]).toEqual([
      10, 20,
    ]);
  });
});

describe('extrusionMaterialSpec', () => {
  it("is null without a material type (Plotly's model)", () => {
    expect(extrusionMaterialSpec('standard')).toBeNull();
    expect(extrusionMaterialSpec(null)).toBeNull();
    expect(extrusionMaterialSpec({ roughness: 0.2 })).toBeNull();
  });

  it('leaves out unset parameters, shadow flags and a matcap that is no URL', () => {
    expect(
      extrusionMaterialSpec({
        type: 'matcap',
        matcap: '',
        color: null,
        roughness: undefined,
        receiveshadow: true,
      }),
    ).toEqual({ type: 'matcap' });
    expect(extrusionMaterialSpec({ type: 'matcap', matcap: 42 })).toEqual({ type: 'matcap' });
  });

  it('renames parameters to their three.js names and converts CSS colors', () => {
    expect(
      extrusionMaterialSpec({
        type: 'physical',
        clearcoatroughness: 0.3,
        sheencolor: 'rgb(0, 255, 0)',
        sheenroughness: 0.5,
        envmapintensity: 2,
        flatShading: true,
      }),
    ).toEqual({
      type: 'physical',
      clearcoatRoughness: 0.3,
      sheenColor: [0, 1, 0, 1],
      sheenRoughness: 0.5,
      envMapIntensity: 2,
      flatShading: true,
    });
  });
});

describe('syncExtrudedRects', () => {
  function host(trace: Record<string, unknown>) {
    const added: Primitive<unknown>[] = [];
    const h = {
      primitives: { resources: createResourceManager(), invalidate: vi.fn<() => void>() },
      trace,
      transform: { scaleX: 10, scaleY: 10, offsetX: 0, offsetY: 0 },
      add: vi.fn((p: Primitive<unknown>) => void added.push(p)),
      remove: vi.fn((p: Primitive<unknown>) => void added.splice(added.indexOf(p), 1)),
      added,
    } satisfies ExtrusionHost & { added: Primitive<unknown>[] };
    return h;
  }

  const DATA = { x0: [0, 2], x1: [1, 3], y0: [0, 0], y1: [4, 5] };

  it('lifts every primitive of a layer onto the front faces, and puts them back when flat', async () => {
    const mesh = await loadMeshModule();
    const h = host({ depth: 12 });
    const rects = { object: new Object3D() };
    // A layer (e.g. the labels of a bar trace): one transform, several objects.
    const layer = {
      setTransform: vi.fn<(t: DataTransform) => void>(),
      primitives: [{ object: new Object3D() }, { object: new Object3D() }],
    };
    const p = syncExtrudedRects(undefined, h, rects, DATA, [layer], mesh)!;
    // Half a px in front of the 12 px deep front faces.
    expect(layer.setTransform).toHaveBeenCalledTimes(1);
    expect(layer.setTransform).toHaveBeenCalledWith({ ...h.transform, offsetZ: 12.5 });
    expect(layer.primitives.map((l) => l.object.userData[UNCLIPPED])).toEqual([true, true]);
    // No axes: nothing to clip the prisms to.
    expect(p.data.clip).toBeNull();
    expect(p.data.bevel).toBe(0);

    expect(syncExtrudedRects(p, { ...h, trace: {} }, rects, DATA, [layer], mesh)).toBeUndefined();
    expect(h.remove).toHaveBeenCalledWith(p);
    expect(layer.primitives.map((l) => UNCLIPPED in l.object.userData)).toEqual([false, false]);
    expect(rects.object.visible).toBe(true);
  });

  it('adds and removes nothing for a flat trace that was never extruded', async () => {
    const mesh = await loadMeshModule();
    const h = host({ depth: 0 });
    const rects = { object: new Object3D() };
    rects.object.visible = false;
    const label = { object: new Object3D(), setTransform: vi.fn<(t: DataTransform) => void>() };
    expect(syncExtrudedRects(undefined, h, rects, DATA, [label], mesh)).toBeUndefined();
    expect(h.add).not.toHaveBeenCalled();
    expect(h.remove).not.toHaveBeenCalled();
    // The flat rects are shown; labels keep their own transform.
    expect(rects.object.visible).toBe(true);
    expect(label.setTransform).not.toHaveBeenCalled();
    expect(UNCLIPPED in label.object.userData).toBe(false);
  });

  it('stays flat while the rects have no corners to take a percentage of', async () => {
    const mesh = await loadMeshModule();
    const h = host({ depth: '50%' });
    const rects = { object: new Object3D() };
    expect(syncExtrudedRects(undefined, h, rects, {}, [], mesh)).toBeUndefined();
    expect(h.added).toEqual([]);
    expect(rects.object.visible).toBe(true);
  });
});
