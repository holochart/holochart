import { BoxGeometry, Mesh, MeshBasicMaterial, type WebGLRenderer } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { Viewport, type ViewportHost } from '../core/viewport.ts';
import { createMarkers } from '../markers/markers.ts';
import { createResourceManager } from '../resources.ts';
import { arrayPointSource } from './cpu-picking.ts';
import type { GpuPickView } from './gpu-picking.ts';
import { Picker, createPicker, pickRouteFor, type GpuPickerLike } from './picker.ts';
import { DEFAULT_PICK_RADIUS, type PickResult } from './types.ts';

const host: ViewportHost = { canvasWidth: 400, canvasHeight: 300, pixelRatio: 1, invalidate() {} };

function setup() {
  const vp2d = new Viewport(host, { kind: '2d', rect: { x: 0, y: 0, width: 200, height: 300 } });
  const vp3d = new Viewport(host, { kind: '3d', rect: { x: 200, y: 0, width: 200, height: 300 } });
  const gpu = {
    register: vi.fn(() => 1),
    unregister: vi.fn(() => true),
    pick: vi.fn(async (): Promise<PickResult[]> => [
      { traceIndex: 7, pointIndex: 3, distance: 0, kind: 'point' },
    ]),
    dispose: vi.fn(),
  } satisfies GpuPickerLike;
  const views: GpuPickView[] = [];
  const renderer = {} as WebGLRenderer;
  const picker = createPicker(
    {
      renderer,
      viewportAt: (x, y) => [vp2d, vp3d].find((v) => v.contains(x, y)) ?? null,
    },
    {
      createGpuPicker: (r, view) => {
        expect(r).toBe(renderer);
        views.push(view);
        return gpu;
      },
    },
  );
  return { vp2d, vp3d, gpu, views, picker };
}

function markers() {
  return createMarkers(
    { resources: createResourceManager(), invalidate: () => {} },
    {
      x: [10, 50],
      y: [10, 50],
    },
  );
}

describe('pickRouteFor', () => {
  it('routes 2D viewports to the CPU and 3D viewports to the GPU (ADR-010)', () => {
    expect(pickRouteFor({ kind: '2d' })).toBe('cpu');
    expect(pickRouteFor({ kind: '3d' })).toBe('gpu');
  });
});

describe('Picker', () => {
  it('answers 2D picks from the CPU index, in container px, synchronously too', async () => {
    const { vp2d, picker } = setup();
    expect(picker).toBeInstanceOf(Picker);
    const m = markers();
    picker.add(vp2d, m, { traceIndex: 1 });
    // World (50, 50) is container (50, 300 - 50) in a bottom-left-origin 2D viewport.
    const hits = await picker.pick(52, 250);
    expect(hits).toEqual([
      { traceIndex: 1, pointIndex: 1, distance: 2, kind: 'point', viewport: vp2d },
    ]);
    expect(picker.pickSync(52, 250)).toEqual(hits);
    expect(picker.pickSync(52 + DEFAULT_PICK_RADIUS + 1, 250)).toEqual([]);
    expect(await picker.pick(40, 250, { radius: 100, mode: 'all' })).toHaveLength(2);
  });

  it('routes 3D picks to the per-viewport GPU picker with defaults', async () => {
    const { vp3d, gpu, views, picker } = setup();
    const mesh = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    picker.add(vp3d, mesh, { traceIndex: 7, element: 'vertex' });
    expect(views).toEqual([vp3d]);
    expect(gpu.register).toHaveBeenCalledWith(mesh, { traceIndex: 7, element: 'vertex' });
    expect(picker.pickSync(300, 100)).toBeNull();
    const hits = await picker.pick(300, 100, { mode: 'all' });
    expect(gpu.pick).toHaveBeenCalledWith({
      x: 300,
      y: 100,
      radius: DEFAULT_PICK_RADIUS,
      mode: 'all',
    });
    expect(hits[0]?.viewport).toBe(vp3d);
    // One GPU picker per viewport.
    picker.add(vp3d, markers());
    expect(views).toHaveLength(1);
    expect(picker.gpuPickerFor(vp3d)).toBe(gpu);
  });

  it('rejects targets that do not fit the route', () => {
    const { vp2d, vp3d, picker } = setup();
    expect(() => picker.add(vp2d, new Mesh())).toThrow(TypeError);
    expect(() => picker.add(vp3d, arrayPointSource([0], [0]))).toThrow(TypeError);
  });

  it('returns [] outside every viewport and in viewports without pickables', async () => {
    const { picker } = setup();
    await expect(picker.pick(-5, 10)).resolves.toEqual([]);
    await expect(picker.pick(50, 50)).resolves.toEqual([]);
    await expect(picker.pick(300, 50)).resolves.toEqual([]);
    expect(picker.pickSync(-5, 10)).toEqual([]);
  });

  it('adds idempotently and removes by handle', async () => {
    const { vp2d, vp3d, gpu, picker } = setup();
    const m = markers();
    const id = picker.add(vp2d, m, { traceIndex: 1 });
    expect(picker.add(vp2d, m, { traceIndex: 2 })).toBe(id);
    expect(picker.size).toBe(1);
    expect((await picker.pick(10, 290))[0]?.traceIndex).toBe(2);
    expect(picker.remove(id)).toBe(true);
    expect(picker.remove(id)).toBe(false);
    expect(await picker.pick(10, 290)).toEqual([]);

    const mesh = new Mesh();
    const id3 = picker.add(vp3d, mesh);
    picker.remove(id3);
    expect(gpu.unregister).toHaveBeenCalledWith(mesh);
  });

  it('clearViewport and dispose release the per-viewport pickers', async () => {
    const { vp2d, vp3d, gpu, picker } = setup();
    picker.add(vp2d, markers());
    picker.add(vp3d, new Mesh());
    picker.clearViewport(vp3d);
    expect(gpu.dispose).toHaveBeenCalledTimes(1);
    expect(picker.size).toBe(1);
    picker.dispose();
    expect(picker.size).toBe(0);
    await expect(picker.pick(10, 290)).resolves.toEqual([]);
    expect(picker.pickSync(10, 290)).toEqual([]);
    expect(() => picker.add(vp2d, markers())).toThrow(/disposed/);
  });
});
