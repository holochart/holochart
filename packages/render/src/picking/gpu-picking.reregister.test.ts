import {
  BoxGeometry,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  type Camera,
  type Color,
  type Scene,
  type ShaderMaterial,
  type Vector2,
  type WebGLRenderer,
  type WebGLRenderTarget,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createMarkers, type MarkerSet } from '../markers/markers.ts';
import { createResourceManager } from '../resources.ts';
import { createGpuPicker, type GpuPickView } from './gpu-picking.ts';
import { encodePickId } from './pick-id.ts';

interface Drawn {
  mesh: Mesh;
  base: number;
  material: ShaderMaterial;
}

/**
 * A stand-in for WebGLRenderer (as in gpu-picking.test.ts): records what the pick pass draws and
 * "reads back" pixels painted by `paint(i, j, n, drawn)` (a pick id or -1), rows bottom-up.
 */
function fakeRenderer(paint?: (i: number, j: number, n: number, drawn: Drawn[]) => number) {
  let target: WebGLRenderTarget | null = null;
  const renders: Drawn[][] = [];
  let lastDrawn: Drawn[] = [];
  const renderer = {
    info: { render: { calls: 0, triangles: 0, points: 0, lines: 0, frame: 0 } },
    autoClear: true,
    getContext: () => ({ isContextLost: () => false }),
    getSize: (v: Vector2) => v.set(400, 300),
    getPixelRatio: () => 1,
    getRenderTarget: () => target,
    getActiveCubeFace: () => 0,
    getActiveMipmapLevel: () => 0,
    setRenderTarget: (t: WebGLRenderTarget | null) => {
      target = t;
    },
    getClearColor: (c: Color) => c.setRGB(1, 1, 1),
    getClearAlpha: () => 1,
    setClearColor: vi.fn(),
    clear: vi.fn(),
    render: vi.fn((scene: Scene, _camera: Camera) => {
      lastDrawn = scene.children
        .filter((o) => o.visible)
        .map((o) => {
          const mesh = o as Mesh;
          const material = mesh.material as ShaderMaterial;
          return { mesh, material, base: material.uniforms.uPickBase!.value as number };
        });
      renders.push(lastDrawn);
    }),
    readRenderTargetPixelsAsync: async (
      _t: WebGLRenderTarget,
      _x: number,
      _y: number,
      w: number,
      h: number,
      buf: Uint8Array,
    ) => {
      const rgba = new Float32Array(4);
      buf.fill(0);
      for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
          const id = paint?.(i, j, w, lastDrawn) ?? -1;
          if (id < 0) continue;
          encodePickId(id, rgba);
          for (let c = 0; c < 4; c++) buf[(j * w + i) * 4 + c] = Math.floor(rgba[c]! * 255);
        }
      }
      await Promise.resolve();
      return buf;
    },
  };
  return { renderer: renderer as unknown as WebGLRenderer & typeof renderer, renders };
}

function view(): GpuPickView {
  const camera = new PerspectiveCamera(45, 320 / 240, 0.1, 100);
  camera.position.set(0, 0, 5);
  camera.lookAt(0, 0, 0);
  return {
    camera,
    renderArea: { x: 40, y: 30, width: 320, height: 240 },
    scissor: { x: 40, y: 30, width: 320, height: 240 },
  };
}

function markers(n: number): MarkerSet {
  const xs = Array.from({ length: n }, (_, i) => i);
  return createMarkers(
    { resources: createResourceManager(), invalidate: () => {} },
    { x: xs, y: xs, z: xs },
  );
}

const box = () => new Mesh(new BoxGeometry(), new MeshBasicMaterial());
const drawnFor = (drawn: Drawn[], source: Mesh) =>
  drawn.find((d) => d.mesh.geometry === source.geometry)!;
const CENTER = { x: 200, y: 150 };

describe('GpuPicker re-registration', () => {
  it('rebuilds the pick material when the picked element changes, and only then', async () => {
    // 2×2 segments, not indexed: 8 triangles of 3 vertices each.
    const surface = new Mesh(new PlaneGeometry(1, 1, 2, 2).toNonIndexed(), new MeshBasicMaterial());
    const after = box();
    const { renderer, renders } = fakeRenderer();
    const picker = createGpuPicker(renderer, view());
    const id = picker.register(surface, { element: 'vertex' });
    picker.register(after);

    await picker.pick(CENTER);
    const asVertices = drawnFor(renders[0]!, surface).material;
    expect(asVertices.defines).toHaveProperty('PICK_VERTEX');
    // Ids are laid out in registration order: the box comes after the surface's 24 vertices.
    expect(drawnFor(renders[0]!, after).base).toBe(24);

    // Same options (another trace index only): the material is kept.
    expect(picker.register(surface, { element: 'vertex', traceIndex: 4 })).toBe(id);
    await picker.pick(CENTER);
    expect(drawnFor(renders[1]!, surface).material).toBe(asVertices);

    const disposed = vi.fn();
    asVertices.addEventListener('dispose', disposed);
    expect(picker.register(surface, { element: 'triangle', traceIndex: 4 })).toBe(id);
    await picker.pick(CENTER);
    const asTriangles = drawnFor(renders[2]!, surface).material;
    expect(asTriangles).not.toBe(asVertices);
    expect(asTriangles.defines).toHaveProperty('PICK_TRIANGLE');
    expect(asTriangles.defines).not.toHaveProperty('PICK_VERTEX');
    expect(drawnFor(renders[2]!, after).base).toBe(8);
    expect(disposed).toHaveBeenCalledTimes(1);
    // One proxy per source: the old one left the pick scene.
    expect(renders[2]).toHaveLength(2);
  });

  it('turns a pickable into an occluder and back', async () => {
    const wall = box();
    const m = markers(3);
    const { renderer, renders } = fakeRenderer((i, j, n, drawn) =>
      i === (n - 1) / 2 && j === i ? drawnFor(drawn, wall).base : -1,
    );
    const picker = createGpuPicker(renderer, view());
    picker.register(wall, { traceIndex: 5 });
    picker.register(m);
    expect(await picker.pick(CENTER)).toMatchObject([{ traceIndex: 5, object: wall }]);
    expect(drawnFor(renders[0]!, m.object).base).toBe(1);

    picker.register(wall, { traceIndex: 5, occludeOnly: true });
    const hits = await picker.pick(CENTER);
    const occluder = drawnFor(renders[1]!, wall).material;
    expect(occluder.colorWrite).toBe(false);
    expect(occluder.defines).toHaveProperty('PICK_OCCLUDER');
    // It takes no ids any more: the markers start at 0, and the pixel reports marker 0.
    expect(drawnFor(renders[1]!, m.object).base).toBe(0);
    expect(hits).toMatchObject([{ traceIndex: 0, pointIndex: 0, kind: 'point' }]);

    picker.register(wall, { traceIndex: 5 });
    expect(await picker.pick(CENTER)).toMatchObject([{ traceIndex: 5, object: wall }]);
    expect(drawnFor(renders[2]!, wall).material.colorWrite).toBe(true);
  });
});

describe('GpuPicker.pick edge cases', () => {
  it('draws nothing for a marker set without points', async () => {
    const empty = markers(0);
    const { renderer, renders } = fakeRenderer(() => 0);
    const picker = createGpuPicker(renderer, view());
    picker.register(empty);
    // Nothing that could be hit: no GPU work.
    await expect(picker.pick(CENTER)).resolves.toEqual([]);
    expect(renders).toHaveLength(0);

    const solid = box();
    picker.register(solid, { traceIndex: 1 });
    const hits = await picker.pick(CENTER);
    expect(renders[0]).toHaveLength(1);
    expect(renders[0]![0]!.mesh.geometry).toBe(solid.geometry);
    expect(hits).toMatchObject([{ traceIndex: 1, pointIndex: -1, kind: 'object' }]);

    // Points arriving later are picked without registering again.
    empty.update({ x: [0, 1], y: [0, 1], z: [0, 1] });
    await picker.pick(CENTER);
    expect(renders[1]).toHaveLength(2);
    expect(drawnFor(renders[1]!, solid).base).toBe(2);
  });

  it('skips ids that belong to no pickable and still reports the real hits', async () => {
    const m = markers(4);
    const { renderer } = fakeRenderer((i, j, n) => {
      const h = (n - 1) / 2;
      if (i === h && j === h) return 4000; // under the cursor, but nothing owns this id
      if (i === h + 1 && j === h) return 2; // one px to the right: marker 2
      return -1;
    });
    const picker = createGpuPicker(renderer, view());
    picker.register(m, { traceIndex: 6 });
    const all = await picker.pick({ ...CENTER, radius: 2, mode: 'all' });
    expect(all).toMatchObject([{ traceIndex: 6, pointIndex: 2, kind: 'point' }]);
    const closest = await picker.pick({ ...CENTER, radius: 2 });
    expect(closest).toMatchObject([{ traceIndex: 6, pointIndex: 2 }]);
  });

  it('resolves [] when disposed while the readback was in flight', async () => {
    const m = markers(4);
    const { renderer } = fakeRenderer(() => 1);
    const picker = createGpuPicker(renderer, view());
    picker.register(m);
    const pending = picker.pick(CENTER);
    expect(renderer.render).toHaveBeenCalledTimes(1);
    picker.dispose();
    await expect(pending).resolves.toEqual([]);
  });
});
