import type { FullLayout } from '@mk7s/holochart-core';
import { Viewport, type ViewportRect } from '@mk7s/holochart-render';
import type { DomainTraceEntry, SubplotViewportOptions } from '@mk7s/holochart-runtime';
import { describe, expect, it } from 'vitest';
import { defaults, points3d, type PointsCalc } from './__testing__/points.ts';
import { laidOutScene } from './layout.ts';
import { acquireScene, sceneFor } from './scene.ts';

const AREA: ViewportRect = { x: 0, y: 0, width: 600, height: 400 };

/** Defaults, calc and the shared cross-trace layout, as the runtime runs them. */
function build(data: unknown[], layout: Record<string, unknown> = {}) {
  const { fullData, fullLayout } = defaults(data, layout);
  const entries: DomainTraceEntry<PointsCalc>[] = fullData.map((trace, index) => ({
    trace,
    index,
    calc: points3d.calc!(trace, { fullLayout, index, xaxis: undefined, yaxis: undefined }),
    domain: { x: [0, 1], y: [0, 1], rect: AREA },
  }));
  points3d.crossTraceLayout!(entries, { fullLayout, width: 600, height: 400, plotArea: AREA });
  return { fullLayout, entries };
}

/** A context whose `subplotViewport` hands out real (GL-free) viewports, one per key. */
function context(fullLayout: FullLayout, viewports = new Map<string, Viewport>()) {
  const host = { invalidate: () => {}, canvasWidth: 600, canvasHeight: 400, pixelRatio: 1 };
  return {
    fullLayout,
    plotArea: AREA,
    viewports,
    subplotViewport(key: string, o: SubplotViewportOptions): Viewport {
      let vp = viewports.get(key);
      if (!vp) {
        vp = new Viewport(host, {
          kind: '3d',
          rect: o.rect,
          projection: o.projection ?? 'perspective',
        });
        viewports.set(key, vp);
      }
      vp.setRect(o.rect);
      vp.setProjection(o.projection ?? 'perspective');
      return vp;
    },
  };
}

describe('scene layout (per pass)', () => {
  it('autoranges each axis over its traces and writes the ratio in use back', () => {
    const { fullLayout, entries } = build([
      { x: [0, 32], y: [0, 1], z: [0, 4] },
      { x: [16, 16], y: [-1, 0], z: [2, 2] },
    ]);
    const scene = entries[0]!.calc.scene!;
    expect(entries[1]!.calc.scene).toBe(scene);
    expect(laidOutScene(fullLayout, 'scene')).toBe(scene);
    expect(scene.axes.map((a) => a.range)).toEqual([
      [-1, 33],
      [-1 - 2 / 32, 1 + 2 / 32],
      [-4 / 32, 4 + 4 / 32],
    ]);
    // auto → data (spans 32, 2, 4: 16 : 1 is over 4) → cube.
    expect(scene.aspect).toEqual([1, 1, 1]);
    expect((fullLayout['scene'] as Record<string, unknown>)['aspectratio']).toEqual({
      x: 1,
      y: 1,
      z: 1,
    });
    // The whole range maps onto [-1/2, 1/2].
    const t = scene.transform;
    expect(-1 * t.scaleX + t.offsetX).toBeCloseTo(-0.5, 12);
    expect(33 * t.scaleX + t.offsetX).toBeCloseTo(0.5, 12);
    expect(scene.rect).toEqual(AREA);
  });
});

describe('live scene', () => {
  it('puts the layout camera on the viewport and projects the box center to the rect center', () => {
    const { fullLayout, entries } = build([{ x: [0, 1], y: [0, 1], z: [0, 1] }]);
    const ctx = context(fullLayout);
    const scene = acquireScene(ctx, 'scene', entries[0]!.calc.scene)!;
    expect(sceneFor(fullLayout, { scene: 'scene' })).toBe(scene);
    expect(scene.viewport.camera.position.toArray()).toEqual([1.25, 1.25, 1.25]);
    const p = scene.project(0, 0, 0);
    expect(p.x).toBeCloseTo(300, 9);
    expect(p.y).toBeCloseTo(200, 9);
    const [x, y, z] = scene.layout.axes.map((a) => a.range[1]);
    expect(scene.toWorld(x!, y!, z!)).toEqual([0.5, 0.5, 0.5].map((v) => expect.closeTo(v, 12)));
  });

  it('keeps a moved camera until the layout’s camera changes; switches projection in place', () => {
    const first = build([{ x: [0, 1], y: [0, 1], z: [0, 1] }]);
    const viewports = new Map<string, Viewport>();
    const scene = acquireScene(context(first.fullLayout, viewports), 'scene')!;
    const moved = {
      eye: [0, 3, 0] as [number, number, number],
      center: [0, 0, 0] as [number, number, number],
      up: [0, 0, 1] as [number, number, number],
    };
    scene.setCamera(moved);
    // A later pass with the same layout camera keeps the moved one.
    const second = build([{ x: [0, 1], y: [0, 1], z: [0, 1] }]);
    expect(acquireScene(context(second.fullLayout, viewports), 'scene')).toBe(scene);
    expect(scene.camera.eye).toEqual([0, 3, 0]);
    // A new layout camera (relayout) and projection replace it.
    const third = build([{ x: [0, 1], y: [0, 1], z: [0, 1] }], {
      scene: { camera: { eye: { x: 2, y: 0, z: 0 }, projection: { type: 'orthographic' } } },
    });
    acquireScene(context(third.fullLayout, viewports), 'scene', third.entries[0]!.calc.scene);
    expect(scene.camera.eye).toEqual([2, 0, 0]);
    expect(scene.projection).toBe('orthographic');
    expect(scene.viewport.camera.type).toBe('OrthographicCamera');
    expect(scene.cameraPayload()).toMatchObject({
      eye: { x: 2, y: 0, z: 0 },
      projection: { type: 'orthographic' },
    });
    // The initial view is kept for double-click and "reset to last save".
    expect(scene.initial.camera.eye).toEqual([1.25, 1.25, 1.25]);
  });

  it('commits an orthographic zoom as an aspect ratio, and drops it once laid out', () => {
    const first = build([{ x: [0, 1], y: [0, 1], z: [0, 1] }], {
      scene: { camera: { projection: { type: 'orthographic' } } },
    });
    const viewports = new Map<string, Viewport>();
    const scene = acquireScene(
      context(first.fullLayout, viewports),
      'scene',
      first.entries[0]!.calc.scene,
    )!;
    scene.orthoZoom = 2;
    scene.sync();
    expect(scene.viewport.camera.zoom).toBe(2);
    expect(scene.commitZoom()).toEqual({ x: 2, y: 2, z: 2 });
    const next = build([{ x: [0, 1], y: [0, 1], z: [0, 1] }], {
      scene: {
        aspectratio: { x: 2, y: 2, z: 2 },
        camera: { projection: { type: 'orthographic' } },
      },
    });
    acquireScene(context(next.fullLayout, viewports), 'scene', next.entries[0]!.calc.scene);
    expect(scene.orthoZoom).toBe(1);
    expect(scene.layout.aspect).toEqual([2, 2, 2]);
    expect(scene.viewport.camera.zoom).toBe(1);
  });

  it('keeps the live camera through its own commit, not through anyone else’s', () => {
    const first = build([{ x: [0, 1], y: [0, 1], z: [0, 1] }]);
    const viewports = new Map<string, Viewport>();
    const scene = acquireScene(context(first.fullLayout, viewports), 'scene')!;
    const at = (
      x: number,
    ): {
      eye: [number, number, number];
      center: [number, number, number];
      up: [number, number, number];
    } => ({
      eye: [x, 2, 1],
      center: [0, 0, 0],
      up: [0, 0, 1],
    });
    scene.setCamera(at(1));
    const payload = scene.cameraPayload(true);
    // The user moves on before the commit's pass runs.
    scene.setCamera(at(2));
    const committed = build([{ x: [0, 1], y: [0, 1], z: [0, 1] }], { scene: { camera: payload } });
    acquireScene(context(committed.fullLayout, viewports), 'scene');
    expect(scene.camera.eye).toEqual([2, 2, 1]);
    const app = build([{ x: [0, 1], y: [0, 1], z: [0, 1] }], {
      scene: { camera: { eye: { x: 3, y: 2, z: 1 } } },
    });
    acquireScene(context(app.fullLayout, viewports), 'scene');
    expect(scene.camera.eye).toEqual([3, 2, 1]);
  });

  it('needs the runtime hook', () => {
    const { fullLayout } = build([{ x: [0], y: [0], z: [0] }]);
    expect(acquireScene({ fullLayout }, 'scene')).toBeUndefined();
    expect(acquireScene(context(fullLayout), 'scene2')).toBeUndefined();
  });
});
