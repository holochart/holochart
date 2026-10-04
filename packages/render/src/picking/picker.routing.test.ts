import { BoxGeometry, Mesh, MeshBasicMaterial, type WebGLRenderer } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { Viewport, type ViewportHost } from '../core/viewport.ts';
import { createMarkers } from '../markers/markers.ts';
import { createResourceManager } from '../resources.ts';
import { arrayPointSource } from './cpu-picking.ts';
import { GpuPicker, type GpuPickHost, type GpuPickView } from './gpu-picking.ts';
import { createPicker, type GpuPickerLike, type PickerHost } from './picker.ts';
import { DEFAULT_PICK_RADIUS, type PickResult } from './types.ts';

const host: ViewportHost = { canvasWidth: 400, canvasHeight: 300, pixelRatio: 1, invalidate() {} };

function fakeGpu() {
  return {
    register: vi.fn(() => 1),
    unregister: vi.fn(() => true),
    pick: vi.fn(async (): Promise<PickResult[]> => [
      { traceIndex: 7, pointIndex: 3, distance: 0, kind: 'point' },
    ]),
    dispose: vi.fn(),
  } satisfies GpuPickerLike;
}

function setup(extra: Partial<PickerHost> = {}) {
  const vp2d = new Viewport(host, { kind: '2d', rect: { x: 0, y: 0, width: 200, height: 300 } });
  const vp3d = new Viewport(host, { kind: '3d', rect: { x: 200, y: 0, width: 200, height: 300 } });
  const gpu = fakeGpu();
  const created: { view: GpuPickView; host: GpuPickHost | undefined }[] = [];
  const renderer = {} as WebGLRenderer;
  const picker = createPicker(
    {
      renderer,
      viewportAt: (x, y) => [vp2d, vp3d].find((v) => v.contains(x, y)) ?? null,
      ...extra,
    },
    {
      createGpuPicker: (_renderer, view, gpuHost) => {
        created.push({ view, host: gpuHost });
        return gpu;
      },
    },
  );
  return { vp2d, vp3d, gpu, created, picker, renderer };
}

function box() {
  return new Mesh(new BoxGeometry(), new MeshBasicMaterial());
}

describe('Picker in 2D viewports', () => {
  it('picks a plain point source in the viewport’s pixel space', () => {
    const { vp2d, picker } = setup();
    // World px, bottom-left origin: (20, 40) is container (20, 300 − 40).
    picker.add(vp2d, arrayPointSource([20, 120], [40, 140]), { traceIndex: 3 });
    expect(picker.pickSync(21, 260)).toEqual([
      { traceIndex: 3, pointIndex: 0, distance: 1, kind: 'point', viewport: vp2d },
    ]);
    expect(picker.pickSync(120, 160)?.[0]).toMatchObject({ pointIndex: 1, distance: 0 });
  });

  it('answers nothing in a disposed viewport', () => {
    const { vp2d, picker } = setup();
    picker.add(vp2d, arrayPointSource([20], [40]));
    expect(picker.pickSync(20, 260)).toHaveLength(1);
    vp2d.dispose();
    expect(picker.pickSync(20, 260)).toEqual([]);
  });
});

describe('Picker in 3D viewports', () => {
  it('asks the GPU picker for the closest hit within the default radius unless told otherwise', async () => {
    const { vp3d, gpu, picker } = setup();
    picker.add(vp3d, box());
    await picker.pick(300, 100);
    expect(gpu.pick).toHaveBeenLastCalledWith({
      x: 300,
      y: 100,
      radius: DEFAULT_PICK_RADIUS,
      mode: 'closest',
    });
    await picker.pick(300, 100, { radius: 12 });
    expect(gpu.pick).toHaveBeenLastCalledWith({ x: 300, y: 100, radius: 12, mode: 'closest' });
  });

  it('has a GPU picker only for 3D viewports with pickables', () => {
    const { vp2d, vp3d, gpu, picker } = setup();
    expect(picker.gpuPickerFor(vp3d)).toBeNull();
    picker.add(vp2d, arrayPointSource([0], [0]));
    expect(picker.gpuPickerFor(vp2d)).toBeNull();
    picker.add(vp3d, box());
    expect(picker.gpuPickerFor(vp3d)).toBe(gpu);
  });

  it('hands the GPU picker the figure’s own size and activation when the host has them', () => {
    const size = { width: 400, height: 300, pixelRatio: 2 };
    const activate = vi.fn();
    const { vp3d, created, picker } = setup({ size, activate });
    picker.add(vp3d, box());
    expect(created).toHaveLength(1);
    expect(created[0]!.view).toBe(vp3d);
    // The live size object, so later resizes are seen.
    expect(created[0]!.host?.size).toBe(size);
    created[0]!.host!.activate!();
    expect(activate).toHaveBeenCalledTimes(1);
  });

  it('gives the GPU picker no host when the renderer is the figure’s own', () => {
    const { vp3d, created, picker } = setup();
    picker.add(vp3d, box());
    expect(created[0]!.host).toBeUndefined();
  });

  it('creates a real GpuPicker for the viewport by default', () => {
    const vp3d = new Viewport(host, { kind: '3d', rect: { x: 0, y: 0, width: 400, height: 300 } });
    const renderer = {} as WebGLRenderer;
    const picker = createPicker({ renderer, viewportAt: () => vp3d });
    const mesh = box();
    picker.add(vp3d, mesh, { traceIndex: 2 });
    const gpu = picker.gpuPickerFor(vp3d);
    expect(gpu).toBeInstanceOf(GpuPicker);
    expect((gpu as GpuPicker).renderer).toBe(renderer);
    expect((gpu as GpuPicker).view).toBe(vp3d);
    expect((gpu as GpuPicker).has(mesh)).toBe(true);
    picker.dispose();
    expect((gpu as GpuPicker).disposed).toBe(true);
  });
});

describe('Picker lifecycle', () => {
  it('clearViewport leaves other viewports alone and ignores one without pickables', () => {
    const { vp2d, vp3d, gpu, picker } = setup();
    const m = createMarkers(
      { resources: createResourceManager(), invalidate: () => {} },
      { x: [10], y: [10] },
    );
    const id = picker.add(vp2d, m);
    picker.clearViewport(vp3d);
    expect(gpu.dispose).not.toHaveBeenCalled();
    expect(picker.size).toBe(1);
    expect(picker.pickSync(10, 290)).toHaveLength(1);

    picker.clearViewport(vp2d);
    expect(picker.size).toBe(0);
    expect(picker.pickSync(10, 290)).toEqual([]);
    // Its handles went with it.
    expect(picker.remove(id)).toBe(false);
  });

  it('disposes each GPU picker once', async () => {
    const { vp3d, gpu, picker } = setup();
    picker.add(vp3d, box());
    picker.dispose();
    picker.dispose();
    expect(gpu.dispose).toHaveBeenCalledTimes(1);
    expect(picker.gpuPickerFor(vp3d)).toBeNull();
    await expect(picker.pickIn(vp3d, 300, 100)).resolves.toEqual([]);
    expect(gpu.pick).not.toHaveBeenCalled();
  });
});
