import {
  BoxGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector2,
  type Camera,
  type Color,
  type WebGLRenderer,
  type WebGLRenderTarget,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createMarkers, type MarkerSet } from '../markers/markers.ts';
import { createResourceManager } from '../resources.ts';
import { GpuPicker, createGpuPicker, type GpuPickView } from './gpu-picking.ts';
import { encodePickId } from './pick-id.ts';
import { pickProjection, computePickWindow, createPickWindow } from './pick-window.ts';

const CSS_W = 400;
const CSS_H = 300;

interface Drawn {
  mesh: Mesh;
  base: number;
  material: ShaderMaterial;
}

/**
 * A stand-in for WebGLRenderer: records what the pick pass draws and "reads back" pixels painted by
 * `paint(i, j, drawn)` (returns a pick id or -1), rows bottom-up like readPixels.
 */
function fakeRenderer(
  options: {
    dpr?: number;
    paint?: (i: number, j: number, n: number, drawn: Drawn[]) => number;
  } = {},
) {
  const dpr = options.dpr ?? 1;
  let target: WebGLRenderTarget | null = null;
  let lost = false;
  const renders: { drawn: Drawn[]; camera: Camera; target: WebGLRenderTarget | null }[] = [];
  let lastDrawn: Drawn[] = [];
  const renderer = {
    info: { render: { calls: 7, triangles: 70, points: 0, lines: 0, frame: 3 } },
    autoClear: true,
    getContext: () => ({ isContextLost: () => lost }),
    getSize: (v: Vector2) => v.set(CSS_W, CSS_H),
    getPixelRatio: () => dpr,
    getRenderTarget: () => target,
    getActiveCubeFace: () => 0,
    getActiveMipmapLevel: () => 0,
    setRenderTarget: vi.fn((t: WebGLRenderTarget | null) => {
      target = t;
    }),
    getClearColor: (c: Color) => c.setRGB(1, 0.5, 0.25),
    getClearAlpha: () => 0.75,
    setClearColor: vi.fn(),
    clear: vi.fn(),
    render: vi.fn((scene: Scene, camera: Camera) => {
      lastDrawn = scene.children
        .filter((o) => o.visible)
        .map((o) => {
          const mesh = o as Mesh;
          const material = mesh.material as ShaderMaterial;
          return { mesh, material, base: material.uniforms.uPickBase!.value as number };
        });
      renders.push({ drawn: lastDrawn, camera, target });
      renderer.info.render.calls += 100;
      renderer.info.render.frame += 1;
    }),
    readRenderTargetPixelsAsync: vi.fn(
      async (
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
            const id = options.paint?.(i, j, w, lastDrawn) ?? -1;
            if (id < 0) continue;
            encodePickId(id, rgba);
            for (let c = 0; c < 4; c++) buf[(j * w + i) * 4 + c] = Math.floor(rgba[c]! * 255);
          }
        }
        await Promise.resolve();
        return buf;
      },
    ),
  };
  return {
    renderer: renderer as unknown as WebGLRenderer & typeof renderer,
    renders,
    setLost: (v: boolean) => void (lost = v),
  };
}

function view(scene?: Object3D): GpuPickView {
  const camera = new PerspectiveCamera(45, 320 / 240, 0.1, 100);
  camera.position.set(0, 0, 5);
  camera.lookAt(0, 0, 0);
  return {
    camera,
    renderArea: { x: 40, y: 30, width: 320, height: 240 },
    scissor: { x: 40, y: 30, width: 320, height: 240 },
    ...(scene ? { scene } : {}),
  };
}

function markers(n = 10): MarkerSet {
  const xs = Array.from({ length: n }, (_, i) => i);
  return createMarkers(
    { resources: createResourceManager(), invalidate: () => {} },
    {
      x: xs,
      y: xs,
      z: xs,
    },
  );
}

const drawnFor = (drawn: Drawn[], source: Mesh) =>
  drawn.find((d) => d.mesh.geometry === source.geometry)!;

describe('GpuPicker registration lifecycle', () => {
  it('registers, re-registers, and unregisters by id or object', () => {
    const { renderer } = fakeRenderer();
    const picker = createGpuPicker(renderer, view());
    expect(picker).toBeInstanceOf(GpuPicker);
    const mesh = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    const m = markers();
    const a = picker.register(mesh, { traceIndex: 2 });
    const b = picker.register(m);
    expect(a).not.toBe(b);
    expect(picker.register(mesh, { traceIndex: 5 })).toBe(a);
    expect(picker.size).toBe(2);
    expect(picker.has(mesh)).toBe(true);
    expect(picker.unregister(a)).toBe(true);
    expect(picker.unregister(a)).toBe(false);
    expect(picker.has(mesh)).toBe(false);
    expect(picker.unregister(m)).toBe(true);
    expect(picker.size).toBe(0);
  });

  it('validates targets and options', () => {
    const picker = createGpuPicker(fakeRenderer().renderer, view());
    expect(() => picker.register({} as Object3D)).toThrow(TypeError);
    expect(() => picker.register(new Object3D(), { traceIndex: 1.5 })).toThrow(RangeError);
  });

  it('dispose releases everything and makes picks resolve empty', async () => {
    const { renderer } = fakeRenderer();
    const picker = createGpuPicker(renderer, view());
    picker.register(new Object3D());
    picker.dispose();
    picker.dispose();
    expect(picker.disposed).toBe(true);
    expect(picker.size).toBe(0);
    expect(() => picker.register(new Object3D())).toThrow(/disposed/);
    await expect(picker.pick({ x: 100, y: 100 })).resolves.toEqual([]);
    expect(renderer.render).not.toHaveBeenCalled();
  });
});

describe('GpuPicker.pick', () => {
  it('skips the GPU when nothing is registered, the cursor is outside, or the context is lost', async () => {
    const { renderer, setLost } = fakeRenderer();
    const scene = new Scene();
    const picker = createGpuPicker(renderer, view());
    await expect(picker.pick({ x: 100, y: 100 })).resolves.toEqual([]);
    const mesh = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    scene.add(mesh);
    picker.register(mesh);
    await expect(picker.pick({ x: 10, y: 10 })).resolves.toEqual([]); // outside the area
    setLost(true);
    await expect(picker.pick({ x: 100, y: 100 })).resolves.toEqual([]);
    expect(renderer.render).not.toHaveBeenCalled();
  });

  it('renders the window with a narrowed camera, decodes ids, and sorts hits', async () => {
    const box = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    const surface = new Mesh(new PlaneGeometry(1, 1, 4, 4), new MeshBasicMaterial());
    const m = markers(10);
    const v = view();
    const { renderer, renders } = fakeRenderer({
      dpr: 2,
      paint: (i, j, n, drawn) => {
        const h = (n - 1) / 2;
        if (i === h && j === h) return drawnFor(drawn, m.object).base + 7; // under the cursor
        if (i === h + 3 && j === h) return drawnFor(drawn, surface).base + 11; // 1.5 CSS px right
        if (i === h - 5 && j === h) return drawnFor(drawn, box).base; // 2.5 CSS px left
        if (i === 0 && j === 0) return drawnFor(drawn, box).base; // outside the radius circle
        return -1;
      },
    });
    const picker = createGpuPicker(renderer, v);
    picker.register(m, { traceIndex: 0 });
    picker.register(surface, { traceIndex: 1, element: 'vertex' });
    picker.register(box, { traceIndex: 2 });

    const all = await picker.pick({ x: 200.2, y: 150.2, radius: 3, mode: 'all' });
    expect(all.map((h) => [h.traceIndex, h.pointIndex, h.kind, h.object])).toEqual([
      [0, 7, 'point', m.object],
      [1, 11, 'vertex', surface],
      [2, -1, 'object', box],
    ]);
    expect(all[0]!.distance).toBe(0);
    expect(all[1]!.distance).toBeCloseTo(
      Math.hypot((400 + 3 + 0.5) / 2 - 200.2, 300.5 / 2 - 150.2),
      9,
    );
    expect(all[2]!.distance).toBeLessThan(3);

    const closest = await picker.pick({ x: 200.2, y: 150.2, radius: 3 });
    expect(closest).toHaveLength(1);
    expect(closest[0]!.pointIndex).toBe(7);

    // The camera handed to three.js is the view camera narrowed onto the window.
    const win = createPickWindow();
    computePickWindow(
      win,
      200.2,
      150.2,
      3,
      { width: CSS_W, height: CSS_H, pixelRatio: 2 },
      v.renderArea,
      v.scissor,
    );
    const expected = pickProjection(new Matrix4(), v.camera.projectionMatrix, win);
    const cam = renders[0]!.camera;
    cam.projectionMatrix.elements.forEach((e, k) =>
      expect(e).toBeCloseTo(expected.elements[k]!, 9),
    );
    expect(cam.matrixWorldInverse.equals(v.camera.matrixWorldInverse)).toBe(true);
    // Proxies share geometry; id ranges are contiguous: markers (10) + surface vertices (25) + box.
    const drawn = renders[0]!.drawn;
    expect(drawn.map((d) => d.base).sort((a, b) => a - b)).toEqual([0, 10, 35]);
    expect(drawnFor(drawn, surface).material.defines).toHaveProperty('PICK_VERTEX');
    expect(renders[0]!.target?.width).toBeGreaterThanOrEqual(win.size);
  });

  it('restores renderer state and keeps frame statistics untouched', async () => {
    const { renderer } = fakeRenderer({ paint: () => -1 });
    const picker = createGpuPicker(renderer, view());
    picker.register(new Mesh(new BoxGeometry(), new MeshBasicMaterial()));
    await picker.pick({ x: 200, y: 150, radius: 2 });
    expect(renderer.autoClear).toBe(true);
    expect(renderer.getRenderTarget()).toBeNull();
    expect(renderer.info.render).toEqual({
      calls: 7,
      triangles: 70,
      points: 0,
      lines: 0,
      frame: 3,
    });
    const lastClear = renderer.setClearColor.mock.calls.at(-1)!;
    expect((lastClear[0] as Color).toArray()).toEqual([1, 0.5, 0.25]);
    expect(lastClear[1]).toBe(0.75);
  });

  it('only draws pickables that are visible and attached to the view scene', async () => {
    const scene = new Scene();
    const shown = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    const hiddenParent = new Group();
    hiddenParent.visible = false;
    const hidden = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    hiddenParent.add(hidden);
    const detached = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    const invisibleMaterial = new Mesh(
      new BoxGeometry(),
      new MeshBasicMaterial({ visible: false }),
    );
    scene.add(shown, hiddenParent, invisibleMaterial);
    const { renderer, renders } = fakeRenderer();
    const picker = createGpuPicker(renderer, view(scene));
    for (const o of [shown, hidden, detached, invisibleMaterial]) picker.register(o);
    await picker.pick({ x: 200, y: 150 });
    const drawn = renders[0]!.drawn;
    expect(drawn.map((d) => d.mesh.geometry)).toEqual(
      expect.arrayContaining([shown.geometry, invisibleMaterial.geometry]),
    );
    expect(drawn).toHaveLength(2);
    // The material's own visibility is mirrored, so three.js skips it like the visible pass does.
    expect(drawnFor(drawn, invisibleMaterial).material.visible).toBe(false);
  });

  it('picks the meshes of a group and prunes proxies of removed children', async () => {
    const group = new Group();
    const a = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    const b = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    group.add(a, b);
    let target: Mesh = b;
    const { renderer, renders } = fakeRenderer({
      paint: (i, j, n, drawn) => (i === 0 && j === 0 ? drawnFor(drawn, target).base : -1),
    });
    const picker = createGpuPicker(renderer, view());
    picker.register(group, { traceIndex: 4 });
    const [hit] = await picker.pick({ x: 200, y: 150, radius: 0 });
    expect(hit).toMatchObject({ traceIndex: 4, pointIndex: -1, object: b });
    group.remove(b);
    target = a;
    await picker.pick({ x: 200, y: 150 });
    expect(renders[1]!.drawn).toHaveLength(1);
    // Two proxies were created for the group, one survives.
    const pickScene = renderer.render.mock.calls[1]![0];
    expect(pickScene.children).toHaveLength(1);
  });

  it('draws occluders depth-only and never reports them', async () => {
    const wall = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    const { renderer, renders } = fakeRenderer({ paint: () => 0 });
    const picker = createGpuPicker(renderer, view());
    picker.register(wall, { occludeOnly: true });
    // Only an occluder: nothing can be reported, so no GPU work either.
    await expect(picker.pick({ x: 200, y: 150 })).resolves.toEqual([]);
    expect(renders).toHaveLength(0);
    const m = markers(3);
    picker.register(m);
    await picker.pick({ x: 200, y: 150 });
    const occluder = drawnFor(renders[0]!.drawn, wall).material;
    expect(occluder.colorWrite).toBe(false);
    expect(occluder.defines).toHaveProperty('PICK_OCCLUDER');
  });

  it('mirrors InstancedMesh instances and reports instance ids', async () => {
    const im = new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial(), 5);
    im.count = 4;
    const { renderer, renders } = fakeRenderer({
      paint: (i, j, n, drawn) => (i === 0 && j === 0 ? drawnFor(drawn, im).base + 3 : -1),
    });
    const picker = createGpuPicker(renderer, view());
    picker.register(im, { traceIndex: 9 });
    const [hit] = await picker.pick({ x: 200, y: 150 });
    expect(hit).toMatchObject({ traceIndex: 9, pointIndex: 3, kind: 'instance' });
    const proxy = renders[0]!.drawn[0]!.mesh as InstancedMesh;
    expect(proxy.isInstancedMesh).toBe(true);
    expect(proxy.instanceMatrix).toBe(im.instanceMatrix);
    expect(proxy.count).toBe(4);
    expect(proxy.material).not.toBe(im.material);
  });

  it('falls back to vertex ids for triangle picking on indexed geometry', async () => {
    const indexed = new Mesh(new PlaneGeometry(1, 1, 2, 2), new MeshBasicMaterial());
    const flat = new Mesh(new PlaneGeometry(1, 1, 2, 2).toNonIndexed(), new MeshBasicMaterial());
    const { renderer, renders } = fakeRenderer();
    const picker = createGpuPicker(renderer, view());
    picker.register(indexed, { element: 'triangle' });
    picker.register(flat, { element: 'triangle' });
    await picker.pick({ x: 200, y: 150 });
    const drawn = renders[0]!.drawn;
    expect(drawnFor(drawn, indexed).material.defines).toHaveProperty('PICK_VERTEX');
    expect(drawnFor(drawn, flat).material.defines).toHaveProperty('PICK_TRIANGLE');
    // 9 vertices for the indexed plane, 8 triangles for the flat one.
    expect(drawn.map((d) => d.base).sort((a, b) => a - b)).toEqual([0, 9]);
  });

  it('keeps concurrent picks apart (one readback slot each)', async () => {
    const m = markers(4);
    const { renderer } = fakeRenderer({
      paint: (i, j, n, drawn) =>
        i === (n - 1) / 2 && j === i ? drawnFor(drawn, m.object).base + n : -1,
    });
    const picker = createGpuPicker(renderer, view());
    picker.register(m);
    const [a, b] = await Promise.all([
      picker.pick({ x: 200, y: 150, radius: 0 }),
      picker.pick({ x: 200, y: 150, radius: 1 }),
    ]);
    expect(a[0]?.pointIndex).toBe(1); // n = 1
    expect(b[0]?.pointIndex).toBe(3); // n = 3
  });

  it('ignores hits of pickables unregistered while the readback was in flight', async () => {
    const m = markers(4);
    const { renderer } = fakeRenderer({
      paint: (i, j, n, drawn) => (i === 0 && j === 0 ? drawnFor(drawn, m.object).base : -1),
    });
    const picker = createGpuPicker(renderer, view());
    picker.register(m);
    const pending = picker.pick({ x: 200, y: 150 });
    picker.unregister(m);
    await expect(pending).resolves.toEqual([]);
  });

  it('resolves [] when the readback fails', async () => {
    const { renderer } = fakeRenderer();
    renderer.readRenderTargetPixelsAsync.mockRejectedValueOnce(new Error('context lost'));
    const picker = createGpuPicker(renderer, view());
    picker.register(markers(2));
    await expect(picker.pick({ x: 200, y: 150 })).resolves.toEqual([]);
  });
});
