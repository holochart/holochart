import type { FullLayout } from '@mk7s/holochart-core';
import { Viewport, type ViewportRect } from '@mk7s/holochart-render';
import type { ComponentDrawContext, SubplotViewportOptions } from '@mk7s/holochart-runtime';
import { describe, expect, it, vi } from 'vitest';
import { defaults } from './__testing__/points.ts';
import { autorotateCamera, cameraTween } from './camera-animation.ts';
import { SceneMotion } from './camera-motion.ts';
import { cameraOf, type SceneCamera } from './camera.ts';
import { acquireScene, type Scene3D } from './scene.ts';

const AREA: ViewportRect = { x: 0, y: 0, width: 600, height: 400 };
const linear = (t: number): number => t;

/** A chart double: a render loop driven by hand and a `relayout` that re-runs the scene pass. */
function setup(layout: Record<string, unknown> = {}) {
  const frames = new Set<(info: { time: number }) => void>();
  let held = 0;
  const listeners = new Map<string, Set<() => void>>();
  const viewports = new Map<string, Viewport>();
  const host = { invalidate: () => {}, canvasWidth: 600, canvasHeight: 400, pixelRatio: 1 };
  let fullLayout: FullLayout;
  let input: Record<string, unknown> = { template: 'none', ...layout };
  const relayouts: Record<string, unknown>[] = [];
  const chart = {
    destroyed: false,
    element: { ownerDocument: { defaultView: null } },
    three: {
      renderer: { domElement: {} },
      root: {
        requestAnimation: () => {
          held++;
          return () => void held--;
        },
        on: (_type: string, fn: (info: { time: number }) => void) => {
          frames.add(fn);
          return () => void frames.delete(fn);
        },
        invalidate: () => {},
      },
    },
    on: (type: string, fn: () => void) => {
      let set = listeners.get(type);
      if (!set) listeners.set(type, (set = new Set()));
      set.add(fn);
      return () => set.delete(fn);
    },
    relayout: vi.fn((update: Record<string, unknown>) => {
      relayouts.push(update);
      for (const [path, value] of Object.entries(update)) {
        const [id, key] = path.split('.') as [string, string];
        input = { ...input, [id]: { ...(input[id] as object), [key]: value } };
      }
      pass();
      return Promise.resolve(chart);
    }),
  };
  const motion = new SceneMotion((scene) => busy.has(scene));
  const busy = new Set<Scene3D>();
  let scene!: Scene3D;
  function pass(): void {
    fullLayout = defaults([{ x: [0, 1], y: [0, 1], z: [0, 1] }], input).fullLayout;
    const ctx = {
      fullLayout,
      fullData: [],
      plotArea: AREA,
      chart,
      invalidate: () => {},
      subplotViewport(key: string, o: SubplotViewportOptions): Viewport {
        let vp = viewports.get(key);
        if (!vp) viewports.set(key, (vp = new Viewport(host, { kind: '3d', rect: o.rect })));
        return vp;
      },
    };
    scene = acquireScene(ctx, 'scene')!;
    motion.sync(ctx as unknown as ComponentDrawContext, [scene]);
  }
  pass();
  return {
    motion,
    busy,
    relayouts,
    get scene() {
      return scene;
    },
    get held() {
      return held;
    },
    frame(time: number) {
      for (const fn of [...frames]) fn({ time });
    },
    relayout: (update: Record<string, unknown>) => chart.relayout(update),
    emit(type: string) {
      for (const fn of listeners.get(type) ?? []) fn();
    },
    setInput(next: Record<string, unknown>) {
      input = { template: 'none', ...next };
      pass();
    },
    get fullLayout() {
      return fullLayout;
    },
  };
}

const EYE0 = [1.25, 1.25, 1.25];

describe('animateCamera flights', () => {
  it('orbits to the target over the duration, then commits it and resolves', async () => {
    const t = setup();
    const from = t.scene.camera;
    const done = t.motion.animateCamera(
      { eye: { x: 2, y: 0, z: 0.5 } },
      {
        duration: 1000,
        ease: linear,
      },
    )!;
    expect(t.held).toBe(1);
    const to: SceneCamera = { eye: [2, 0, 0.5], center: [0, 0, 0], up: [0, 0, 1] };
    t.frame(100); // first frame: starts the clock
    expect(t.scene.camera.eye).toEqual(from.eye);
    t.frame(600);
    const expected = cameraTween(from, to)(0.5);
    t.scene.camera.eye.forEach((v, i) => expect(v).toBeCloseTo(expected.eye[i]!, 9));
    expect(t.relayouts).toHaveLength(0);
    t.frame(1100);
    await done;
    expect(t.scene.camera).toEqual(to);
    expect(t.relayouts).toEqual([
      {
        'scene.camera': {
          up: { x: 0, y: 0, z: 1 },
          center: { x: 0, y: 0, z: 0 },
          eye: { x: 2, y: 0, z: 0.5 },
          projection: { type: 'perspective' },
        },
      },
    ]);
    // The committed layout camera doesn't move the live one.
    expect(t.scene.camera).toEqual(to);
    expect(t.held).toBe(0);
  });

  it('is interrupted by a drag, a new flight or a camera change from the app', async () => {
    const t = setup();
    const a = t.motion.animateCamera({ eye: { x: 3 } }, { duration: 1000, ease: linear })!;
    t.frame(0);
    t.frame(300);
    t.motion.interact(t.scene);
    await expect(a).rejects.toMatchObject({ name: 'AnimationInterrupted' });
    const b = t.motion.animateCamera({ eye: { x: 3 } }, { duration: 1000, ease: linear })!;
    const c = t.motion.animateCamera({ eye: { y: 3 } }, { duration: 1000, ease: linear })!;
    await expect(b).rejects.toMatchObject({ name: 'AnimationInterrupted' });
    t.frame(1000);
    await t.relayout({ 'scene.camera': { eye: { x: 0, y: -2, z: 0 } } });
    await expect(c).rejects.toMatchObject({ name: 'AnimationInterrupted' });
    expect(t.scene.camera.eye).toEqual([0, -2, 0]);
  });

  it('jumps (and commits) with reduced motion or no duration; no scene: undefined', async () => {
    const t = setup();
    (t.fullLayout as Record<string, unknown>)['_reducedMotion'] = true;
    await t.motion.animateCamera({ eye: { x: 3, y: 0, z: 0 } }, { duration: 500, ease: linear });
    expect(t.scene.camera.eye).toEqual([3, 0, 0]);
    expect(t.relayouts).toHaveLength(1);
    expect(t.held).toBe(0);
    expect(
      t.motion.animateCamera({}, { duration: 500, ease: linear, subplot: 'scene2' }),
    ).toBeUndefined();
  });
});

describe('auto-rotation', () => {
  it('turns the camera at speed degrees per second, without relayouts', () => {
    const t = setup({ scene: { autorotate: { speed: 90 } } });
    expect(t.held).toBe(1);
    const start = t.scene.camera;
    t.frame(1000);
    t.frame(1050);
    t.frame(1100);
    const expected = autorotateCamera(start, 'z', 9);
    t.scene.camera.eye.forEach((v, i) => expect(v).toBeCloseTo(expected.eye[i]!, 9));
    expect(t.relayouts).toHaveLength(0);
    // A stall doesn't make it jump.
    t.frame(5000);
    const after = autorotateCamera(expected, 'z', 9);
    t.scene.camera.eye.forEach((v, i) => expect(v).toBeCloseTo(after.eye[i]!, 9));
  });

  it('pauses while the controls move the camera and carries on from there', () => {
    const t = setup({ scene: { autorotate: { speed: 90, axis: 'z' } } });
    t.frame(0);
    t.busy.add(t.scene);
    const held = t.scene.camera;
    t.frame(100);
    expect(t.scene.camera).toEqual(held);
    t.busy.delete(t.scene);
    t.frame(200);
    const expected = autorotateCamera(held, 'z', 9);
    t.scene.camera.eye.forEach((v, i) => expect(v).toBeCloseTo(expected.eye[i]!, 9));
  });

  it('stops (committing the view) when turned off or under reduced motion', async () => {
    const t = setup({ scene: { autorotate: {} } });
    t.frame(0);
    t.frame(100);
    const shown = t.scene.camera;
    t.setInput({ scene: { autorotate: { speed: 0 } } });
    await Promise.resolve();
    expect(t.held).toBe(0);
    expect(t.relayouts).toHaveLength(1);
    expect(t.scene.camera).toEqual(shown);
    expect(cameraOf(t.relayouts[0]!['scene.camera']).eye).toEqual(shown.eye);

    const r = setup({ scene: { autorotate: { speed: 30 } } });
    expect(r.held).toBe(1);
    (r.fullLayout as Record<string, unknown>)['_reducedMotion'] = true;
    r.frame(0);
    r.frame(100);
    expect(r.held).toBe(0);
    const still = r.scene.camera;
    r.frame(200);
    expect(r.scene.camera).toEqual(still);
  });

  it('freezes at `time`: the layout camera turned by speed × time', () => {
    const t = setup({ scene: { autorotate: { speed: 20, time: 3 } } });
    expect(t.held).toBe(0);
    const expected = autorotateCamera(
      { eye: EYE0 as SceneCamera['eye'], center: [0, 0, 0], up: [0, 0, 1] },
      'z',
      60,
    );
    t.scene.camera.eye.forEach((v, i) => expect(v).toBeCloseTo(expected.eye[i]!, 9));
  });
});

describe('camera transitions', () => {
  it('tween from the live camera to a changed layout camera, and stop on a drag', async () => {
    const t = setup();
    const from = t.fullLayout;
    const to = defaults([{ x: [0, 1], y: [0, 1], z: [0, 1] }], {
      template: 'none',
      scene: { camera: { eye: { x: -2, y: 0, z: 0 } } },
    }).fullLayout;
    const [tween, ...rest] = t.motion.layoutTweens(from, to);
    expect(rest).toHaveLength(0);
    expect(tween!.path).toBe('scene.camera');
    expect(tween!.tween(1)).toMatchObject({
      eye: { x: -2, y: 0, z: 0 },
      projection: { type: 'perspective' },
    });
    // Unchanged layout cameras don't animate (a user's orbit stays).
    expect(t.motion.layoutTweens(from, from)).toEqual([]);
    // A drag during the transition commits the live camera (the transition drops its camera).
    t.motion.interact(t.scene);
    await Promise.resolve();
    expect(t.relayouts).toHaveLength(1);
    t.emit('transitioned');
  });
});
