import { Group, Object3D, Scene, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createResourceManager } from '../resources.ts';
import type { DataTransform, Primitive, PrimitiveContext } from '../types.ts';
import {
  createExtrusionPrimitive,
  EXTRUSION_LIGHTING,
  extrusionDepths,
  extrusionMaterialSpec,
  syncExtrudedRects,
  UNCLIPPED,
  type ExtrusionHost,
} from './extrusion.ts';
import { rectPrismVertexCount } from './extrusion-geometry.ts';
import { loadMeshModule } from './mesh-loader.ts';
import { plotlyLitColor } from './lighting-model.ts';
import { PLOTLY_LIGHTING } from './lighting.ts';

/**
 * The extrusion primitive (plan E8.9, E9.10): prisms of rects in world px through the mesh
 * primitive, clip box and rebuilds on zoom, pointer ray casts, and the trace-attribute glue.
 */

function context(): PrimitiveContext {
  return { resources: createResourceManager(), invalidate: vi.fn<() => void>() };
}

const T: DataTransform = { scaleX: 10, scaleY: 20, offsetX: 5, offsetY: 0 };

describe('extrusionDepths', () => {
  it('reads px, percentages of the shape width and per-shape arrays', () => {
    expect(extrusionDepths(12, 3, () => 0)).toBe(12);
    expect(extrusionDepths(-4, 3, () => 0)).toBe(0);
    expect(extrusionDepths('7', 3, () => 0)).toBe(7);
    expect([...(extrusionDepths('50%', 3, (i) => (i + 1) * 10) as Float32Array)]).toEqual([
      5, 10, 15,
    ]);
    expect([...(extrusionDepths([1, -2, 'x', 4], 3, () => 0) as Float32Array)]).toEqual([1, 0, 0]);
    expect(extrusionDepths(undefined, 3, () => 0)).toBe(0);
  });
});

describe('extrusionMaterialSpec', () => {
  it("is null for Plotly's model and converts three.js parameters", () => {
    expect(extrusionMaterialSpec(undefined)).toBeNull();
    expect(extrusionMaterialSpec({ type: 'plotly', roughness: 0.2 })).toBeNull();
    const spec = extrusionMaterialSpec({
      type: 'standard',
      metalness: 0.5,
      emissive: '#ff0000',
      emissiveintensity: 2,
      castshadow: true,
    });
    expect(spec).toEqual({
      type: 'standard',
      metalness: 0.5,
      emissive: [1, 0, 0, 1],
      emissiveIntensity: 2,
    });
  });
});

describe('ExtrusionPrimitive', () => {
  it('draws one prism per rect with depth, in world px, through one mesh', async () => {
    const mesh = await loadMeshModule();
    const p = createExtrusionPrimitive(
      context(),
      {
        x0: [0, 2, NaN],
        x1: [1, 3, 5],
        y0: [0, 0, 0],
        y1: [2, 4, 1],
        depth: new Float32Array([10, 0, 5]),
        color: new Float32Array([1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1]),
      },
      mesh,
    );
    p.setTransform(T);
    // Only the first rect: the second has no depth, the third a missing corner.
    const layout = p.mesh.layout;
    expect(layout.vertexCount).toBe(rectPrismVertexCount(0));
    expect(p.maxDepth).toBe(10);
    const positions = p.mesh.data.positions;
    const xs = [...positions].filter((_, i) => i % 3 === 0);
    expect(Math.min(...xs)).toBe(5);
    expect(Math.max(...xs)).toBe(15);
    const zs = [...positions].filter((_, i) => i % 3 === 2);
    expect(Math.max(...zs)).toBe(10);
    // Colors per vertex from the rect's color; the prisms are left out of 2.5D clipping.
    expect([...(p.mesh.data.color as Float32Array).slice(0, 4)]).toEqual([1, 0, 0, 1]);
    expect(p.mesh.object.userData[UNCLIPPED]).toBe(true);
    expect(p.object).toBeInstanceOf(Group);
    p.dispose();
  });

  it('moves on a pan and rebuilds on a zoom; clips to the axis ranges', async () => {
    const mesh = await loadMeshModule();
    const p = createExtrusionPrimitive(
      context(),
      { x0: [0], x1: [1], y0: [0], y1: [2], depth: 8, clip: { x: [0, 0.5], y: [0, 10] } },
      mesh,
    );
    p.setTransform(T);
    const built = p.mesh.data.positions;
    expect(p.mesh.data.clip).toEqual({ min: [5, 0, -1e9], max: [10, 200, 1e9] });
    p.setTransform({ ...T, offsetX: 25 });
    // Same geometry, moved by the offset change (and the clip box moved back into its frame).
    expect(p.mesh.data.positions).toBe(built);
    expect(p.mesh.object.position.x).toBe(20);
    expect(p.mesh.data.clip).toEqual({ min: [5, 0, -1e9], max: [10, 200, 1e9] });
    p.setTransform({ ...T, scaleX: 20 });
    expect(p.mesh.data.positions).not.toBe(built);
    expect(p.mesh.object.position.x).toBe(0);
    p.dispose();
  });

  it('adds the light rig for three.js material types only', async () => {
    const mesh = await loadMeshModule();
    const p = createExtrusionPrimitive(context(), { x0: [0], x1: [1], y0: [0], y1: [1] }, mesh);
    expect(p.object.children).toHaveLength(1);
    p.update({ material: { type: 'standard' } });
    expect(p.object.children).toHaveLength(2);
    p.update({ material: null });
    expect(p.object.children).toHaveLength(1);
    p.dispose();
  });

  it('lights three.js material types with one set of lights per scene', async () => {
    const mesh = await loadMeshModule();
    const scene = new Scene();
    const make = () =>
      createExtrusionPrimitive(
        context(),
        { x0: [0], x1: [1], y0: [0], y1: [1], material: { type: 'standard' } },
        mesh,
      );
    const [a, b] = [make(), make()];
    scene.add(a.object, b.object);
    scene.updateMatrixWorld();
    const rigs = [a, b].map((p) => p.object.children[1]!);
    expect(rigs.map((r) => r.visible)).toEqual([true, false]);
    a.dispose();
    scene.updateMatrixWorld();
    expect(rigs[1]!.visible).toBe(true);
    b.dispose();
  });

  it('ray-casts the prisms: front faces as they are, sides to the middle, inside the clip', async () => {
    const mesh = await loadMeshModule();
    const p = createExtrusionPrimitive(
      context(),
      { x0: [0, 3], x1: [2, 5], y0: [0, 0], y1: [3, 1], depth: 10, clip: { x: [0, 4], y: [0, 5] } },
      mesh,
    );
    p.setTransform({ scaleX: 10, scaleY: 10, offsetX: 0, offsetY: 0 });
    const down = new Vector3(0, 0, -1);
    // Straight down onto the first bar's front face at (5, 7).
    let hit = p.raycast(new Vector3(5, 7, 100), down);
    expect(hit).toMatchObject({ t: 90, x: 5, y: 7, index: 0 });
    // Into its left side (x = 0), from the left: moved to the middle across it (x = 10).
    hit = p.raycast(new Vector3(-50, 12, 5), new Vector3(1, 0, 0));
    expect(hit).toMatchObject({ x: 10, y: 12, index: 0 });
    // The second bar is cut at x = 40 by the clip box: nothing beyond it.
    expect(p.raycast(new Vector3(45, 5, 100), down)).toBeUndefined();
    expect(p.raycast(new Vector3(35, 5, 100), down)?.index).toBe(1);
    // A miss.
    expect(p.raycast(new Vector3(25, 5, 100), down)).toBeUndefined();
    p.dispose();
  });

  it('lights front faces with their exact color in the flat view', () => {
    const light = EXTRUSION_LIGHTING.directional![0]!;
    const l = light.position as [number, number, number];
    const len = Math.hypot(...l);
    const L: [number, number, number] = [l[0] / len, l[1] / len, l[2] / len];
    const lighting = {
      ...PLOTLY_LIGHTING,
      // The rig's ambient and light intensity scale Plotly's coefficients.
      ambient: PLOTLY_LIGHTING.ambient * EXTRUSION_LIGHTING.ambient!.intensity!,
      diffuse: PLOTLY_LIGHTING.diffuse * light.intensity!,
      specular: 0,
    };
    const front = plotlyLitColor([0.5, 0.25, 1], [0, 0, 1], L, [0, 0, 1], lighting);
    expect(front).toEqual([0.5, 0.25, 1]);
    const top = plotlyLitColor([1, 1, 1], [0, 1, 0], L, [0, 0, 1], lighting)[0];
    const right = plotlyLitColor([1, 1, 1], [1, 0, 0], L, [0, 0, 1], lighting)[0];
    expect(top).toBeLessThan(1);
    expect(right).toBeLessThan(top);
  });
});

describe('syncExtrudedRects', () => {
  function host(trace: Record<string, unknown>) {
    const added: Primitive<unknown>[] = [];
    const h: ExtrusionHost & { added: Primitive<unknown>[] } = {
      primitives: context(),
      trace,
      transform: { scaleX: 10, scaleY: 10, offsetX: 0, offsetY: 0 },
      xaxis: { scale: { range: [0, 10] } },
      yaxis: { scale: { range: [0, 10] } },
      add: (p) => void added.push(p),
      remove: (p) => {
        added.splice(added.indexOf(p), 1);
        p.dispose();
      },
      added,
    };
    return h;
  }

  const rects = () => ({ object: new Object3D() });
  const DATA = {
    x0: new Float64Array([0, 2]),
    x1: new Float64Array([1, 3]),
    y0: new Float64Array([0, 0]),
    y1: new Float64Array([4, 5]),
    fill: new Float32Array(8).fill(1),
    opacity: 0.8,
  };

  it('extrudes a trace with depth, hides its flat rects and lifts its labels', async () => {
    const mesh = await loadMeshModule();
    const h = host({ depth: '50%', bevel: { size: 2, segments: 2 }, material: { type: 'flat' } });
    const flat = rects();
    const label = { object: new Object3D(), setTransform: vi.fn() };
    const p = syncExtrudedRects(undefined, h, flat, DATA, [label, undefined], mesh);
    expect(p).toBeDefined();
    expect(h.added).toEqual([p]);
    expect(flat.object.visible).toBe(false);
    // 50 % of each bar's width (10 px).
    expect(p!.data.depth).toEqual(new Float32Array([5, 5]));
    expect(p!.data.bevel).toBe(2);
    expect(p!.data.segments).toBe(2);
    expect(p!.data.material).toEqual({ type: 'flat' });
    expect(p!.data.opacity).toBe(0.8);
    expect(p!.data.front).toBe('x');
    expect(p!.data.clip).toEqual({ x: [0, 10], y: [0, 10] });
    expect(label.setTransform).toHaveBeenCalledWith(expect.objectContaining({ offsetZ: 5.5 }));
    expect(label.object.userData[UNCLIPPED]).toBe(true);
    // Updated in place; flat again: removed, rects shown, labels back in the 2.5D clip.
    expect(syncExtrudedRects(p, h, flat, DATA, [label], mesh)).toBe(p);
    expect(syncExtrudedRects(p, { ...h, trace: { depth: 0 } }, flat, DATA, [label], mesh)).toBe(
      undefined,
    );
    expect(h.added).toEqual([]);
    expect(flat.object.visible).toBe(true);
    expect(label.object.userData[UNCLIPPED]).toBeUndefined();
  });

  it('measures percentages along the position axis of horizontal bars', async () => {
    const mesh = await loadMeshModule();
    const p = syncExtrudedRects(
      undefined,
      host({ depth: '100%', orientation: 'h' }),
      rects(),
      DATA,
      [],
      mesh,
    );
    expect(p!.data.depth).toEqual(new Float32Array([40, 50]));
    expect(p!.data.front).toBe('y');
  });
});
