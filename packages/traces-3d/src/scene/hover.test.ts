import type { FullLayout, FullTrace } from '@mk7s/holochart-core';
import { Viewport, type PickResult, type ViewportRect } from '@mk7s/holochart-render';
import type { Chart, DomainTraceEntry, SubplotViewportOptions } from '@mk7s/holochart-runtime';
import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { defaults, points3d, type PointsCalc } from './__testing__/points.ts';
import {
  sceneAnnotationAnchor,
  sceneAnnotationGeometry,
  supplySceneAnnotations,
  type FullSceneAnnotation,
} from './annotations.ts';
import {
  sceneAxisHoverText,
  sceneHoveredPosition,
  sceneHoverPoint,
  sceneHoverText,
  scenePicks,
} from './hover.ts';
import { scenePicking, SCENE_PICK_RADIUS } from './pick.ts';
import { acquireScene, type Scene3D } from './scene.ts';
import { farWalls, spikeAxes, spikeLines } from './spikes.ts';

const AREA: ViewportRect = { x: 0, y: 0, width: 600, height: 400 };

function build(data: unknown[], layout: Record<string, unknown> = {}) {
  const { fullData, fullLayout } = defaults(data, layout);
  const entries: DomainTraceEntry<PointsCalc>[] = fullData.map((trace, index) => ({
    trace,
    index,
    calc: points3d.calc!(trace, { fullLayout, index, xaxis: undefined, yaxis: undefined }),
    domain: { x: [0, 1], y: [0, 1], rect: AREA },
  }));
  points3d.crossTraceLayout!(entries, { fullLayout, width: 600, height: 400, plotArea: AREA });
  const host = { invalidate: () => {}, canvasWidth: 600, canvasHeight: 400, pixelRatio: 1 };
  const ctx = {
    fullLayout,
    plotArea: AREA,
    subplotViewport: (_key: string, o: SubplotViewportOptions) =>
      new Viewport(host, { kind: '3d', rect: o.rect, projection: o.projection ?? 'perspective' }),
  };
  const scene = acquireScene(ctx, 'scene', entries[0]!.calc.scene)!;
  return { fullLayout, fullData, entries, scene };
}

/** A fake picker for the scene: answers `pickIn` with `hits` (resolved when told). */
function fakePicker(hits: PickResult[]) {
  const pending: (() => void)[] = [];
  const picker = {
    added: [] as unknown[],
    add: vi.fn((_vp: unknown, target: unknown) => {
      picker.added.push(target);
      return picker.added.length;
    }),
    remove: vi.fn(),
    pickIn: vi.fn(
      () =>
        new Promise<PickResult[]>((resolve) => {
          pending.push(() => resolve(hits));
        }),
    ),
    dispose: vi.fn(),
  };
  const chart = { refreshHover: vi.fn() };
  return {
    picker,
    chart,
    async resolveAll() {
      while (pending.length > 0) pending.shift()!();
      // Let the queue settle and deliver (microtasks only: works with fake timers too).
      for (let i = 0; i < 10; i++) await Promise.resolve();
    },
  };
}

function attach(scene: Scene3D, hits: PickResult[]) {
  const fake = fakePicker(hits);
  scenePicking(scene).attach(
    fake.chart as unknown as Chart,
    fake.picker as unknown as Parameters<ReturnType<typeof scenePicking>['attach']>[1],
  );
  return fake;
}

describe('3D hover text', () => {
  const labels = { x: '1', y: '2', z: '3' };
  it("builds Plotly's gl3d label", () => {
    const all = new Set(['x', 'y', 'z', 'text', 'name']);
    expect(sceneHoverText(labels, all, 'hi')).toBe('x: 1<br>y: 2<br>z: 3<br>hi');
    expect(sceneHoverText(labels, new Set(['z']), undefined)).toBe('3');
    expect(sceneHoverText(labels, new Set(['x', 'y']), '')).toBe('(1, 2)');
    expect(sceneHoverText(labels, new Set(['y', 'text']), 't', 'u: 4')).toBe('2<br>t<br>u: 4');
  });

  it('formats values per scene axis: dates, categories, logs, hoverformat', () => {
    const { scene } = build([{ x: ['2025-03-01', '2025-03-05'], y: ['a', 'b'], z: [10, 100] }], {
      scene: { zaxis: { type: 'log' }, xaxis: { hoverformat: '%b %d' } },
    });
    const [ax, ay, az] = scene.layout.axes;
    expect(sceneAxisHoverText(ax, Date.UTC(2025, 2, 2))).toBe('Mar 02');
    expect(sceneAxisHoverText(ay, 1)).toBe('b');
    expect(sceneAxisHoverText(az, 2)).toBe('100');
    expect(sceneAxisHoverText(az, 2, '.3f')).toBe('100.000');
    expect(sceneAxisHoverText(ax, NaN)).toBe('');
  });
});

describe('3D picking for hover', () => {
  it('starts a pick, answers when it resolves, and refreshes hover', async () => {
    const { scene } = build([{ x: [0, 1], y: [0, 1], z: [0, 1] }]);
    const hit: PickResult = { traceIndex: 0, pointIndex: 1, distance: 2, kind: 'point' };
    const fake = attach(scene, [hit]);
    const state = scenePicking(scene);
    expect(state.hits(100, 100)).toEqual([]);
    expect(fake.picker.pickIn).toHaveBeenCalledTimes(1);
    // The same position asks once.
    state.hits(100, 100);
    expect(fake.picker.pickIn).toHaveBeenCalledTimes(1);
    await fake.resolveAll();
    expect(fake.chart.refreshHover).toHaveBeenCalledTimes(1);
    expect(state.hits(100, 100)).toEqual([hit]);
    // Nearby: the last result while the next pick runs; far away: nothing.
    expect(state.hits(100 + SCENE_PICK_RADIUS / 2, 100)).toEqual([hit]);
    expect(state.hits(300, 100)).toEqual([]);
  });

  it('drops results for an older view', async () => {
    const { scene } = build([{ x: [0, 1], y: [0, 1], z: [0, 1] }]);
    const fake = attach(scene, [{ traceIndex: 0, pointIndex: 0, distance: 0, kind: 'point' }]);
    const state = scenePicking(scene);
    state.hits(50, 60);
    state.invalidate();
    await fake.resolveAll();
    expect(fake.chart.refreshHover).not.toHaveBeenCalled();
    expect(state.hits(50, 60)).toEqual([]);
    await fake.resolveAll();
    expect(state.hits(50, 60)).toHaveLength(1);
  });

  it('a camera move hides a shown label and brings it back once the camera rests', async () => {
    vi.useFakeTimers();
    try {
      const { scene } = build([{ x: [0, 1], y: [0, 1], z: [0, 1] }]);
      const fake = attach(scene, [{ traceIndex: 0, pointIndex: 0, distance: 0, kind: 'point' }]);
      const state = scenePicking(scene);
      state.hits(10, 10);
      await fake.resolveAll();
      expect(state.hits(10, 10)).toHaveLength(1);
      fake.chart.refreshHover.mockClear();
      scene.setCamera({ ...scene.camera, eye: [2, 1, 1] });
      expect(fake.chart.refreshHover).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(400);
      expect(fake.chart.refreshHover).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("gives each trace its own hits and builds the label at the point's projection", async () => {
    const { scene, fullData, fullLayout } = build([
      { x: [0, 1], y: [0, 1], z: [0, 1], text: ['p', 'q'], hovertext: ['', 'hq'] },
      { x: [2], y: [2], z: [2] },
    ]);
    const hits: PickResult[] = [
      { traceIndex: 1, pointIndex: 0, distance: 1, kind: 'point' },
      { traceIndex: 0, pointIndex: 1, distance: 3, kind: 'point' },
    ];
    const fake = attach(scene, hits);
    const query = {
      px: 100,
      py: 300,
      xl: 100,
      yl: 300,
      mode: 'closest' as const,
      distance: 20,
      cx: 100,
      cy: 100,
    };
    const ctx = { fullLayout };
    scenePicks(fullData[0]!, query, ctx);
    await fake.resolveAll();
    const pick = scenePicks(fullData[0]!, query, ctx)!;
    expect(pick.hits.map((h) => h.pointIndex)).toEqual([1]);
    const p = sceneHoverPoint(pick, fullData[0]!, { pointIndex: 1, x: 1, y: 1, z: 1 });
    const w = scene.toWorld(1, 1, 1);
    const s = scene.project(w[0], w[1], w[2]);
    expect(p.px).toBeCloseTo(s.x);
    expect(p.py).toBeCloseTo(400 - s.y);
    expect(p).toMatchObject({ pointIndex: 1, distance: 3, x: 1, y: 1, text: 'hq' });
    expect(p.fields).toMatchObject({ z: 1 });
    expect(p.hoverText).toBe('x: 1<br>y: 1<br>z: 1<br>hq');
    expect(
      sceneHoveredPosition(fullLayout as FullLayout, fullData[0] as FullTrace, 1)?.world,
    ).toEqual(w);
    // `hovermode: false` on the scene: no hover.
    (fullLayout['scene'] as Record<string, unknown>)['hovermode'] = false;
    expect(scenePicks(fullData[0]!, query, ctx)).toBeUndefined();
  });
});

describe('3D spikes', () => {
  it('run from the point to the far walls, and along the other walls with spikesides', () => {
    const axes = spikeAxes({
      xaxis: { showspikes: true, spikesides: false, spikecolor: 'red', spikethickness: 3 },
      yaxis: { showspikes: false },
      zaxis: { showspikes: true, spikesides: true, spikecolor: 'blue' },
    });
    const s = spikeLines([0.1, 0.2, 0.3], [0.5, 0.5, 0.5], [1, 0, 1], axes);
    // x: one segment; z: one plus two on the side walls (with NaN gaps between segments).
    expect(s.x.filter((v) => Number.isNaN(v))).toHaveLength(3);
    expect([s.x[1], s.y[1], s.z[1]]).toEqual([0.5, 0.2, 0.3]);
    expect([s.x[4], s.y[4], s.z[4]]).toEqual([0.1, 0.2, 0.5]);
    expect(s.width[0]).toBe(3);
    expect(s.color.slice(0, 4)).toEqual([1, 0, 0, 1]);
  });

  it('end on a wall (property)', () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.double({ min: -1, max: 1, noNaN: true }),
          fc.double({ min: -1, max: 1, noNaN: true }),
          fc.double({ min: -1, max: 1, noNaN: true }),
        ),
        fc.tuple(
          fc.constantFrom<0 | 1>(0, 1),
          fc.constantFrom<0 | 1>(0, 1),
          fc.constantFrom<0 | 1>(0, 1),
        ),
        (p, walls) => {
          const axes = spikeAxes({});
          const s = spikeLines(p, [1, 1, 1], walls, axes);
          for (let i = 0; i < s.x.length; i++) {
            const v = [s.x[i]!, s.y[i]!, s.z[i]!];
            if (Number.isNaN(v[0])) continue;
            // Every vertex is the point or lies on at least one far wall.
            const onWall = v.some((c, d) => c === (walls[d] ? 1 : -1));
            const isPoint = v.every((c, d) => c === p[d]);
            expect(onWall || isPoint).toBe(true);
          }
        },
      ),
    );
  });

  it('face the camera: the far walls are opposite the eye', () => {
    const { scene } = build([{ x: [0, 1], y: [0, 1], z: [0, 1] }]);
    expect(farWalls(scene)).toEqual([0, 0, 0]);
    scene.setCamera({ ...scene.camera, eye: [-1.25, 1.25, -1] });
    expect(farWalls(scene)).toEqual([1, 0, 1]);
  });
});

describe('3D annotations', () => {
  it('default like 2D annotations, with pixel tails', () => {
    const out: Record<string, unknown> = {};
    supplySceneAnnotations(
      { annotations: [{ x: 1, y: 2, z: 3, text: 'hi', bordercolor: 'red', borderwidth: 2 }, {}] },
      undefined,
      { annotationdefaults: { bgcolor: 'white' } },
      out,
      { font: { family: 'Arial', size: 12, color: '#444' } } as unknown as FullLayout,
    );
    const [a, b] = out['annotations'] as FullSceneAnnotation[];
    expect(a).toMatchObject({ ax: -10, ay: -30, arrowwidth: 4, captureevents: false, _index: 0 });
    expect(a!.arrowcolor).toBe('rgb(255, 0, 0)');
    expect(a!.font).toMatchObject({ family: 'Arial', size: 12 });
    expect(b!.bgcolor).toBe('rgb(255, 255, 255)');
    expect(b!.arrowcolor).toBe('#444');
  });

  it('anchor at the projected point, hidden outside the ranges', () => {
    const { scene } = build([{ x: [0, 10], y: [0, 10], z: [0, 10] }]);
    const w = scene.toWorld(5, 5, 5);
    const s = scene.project(w[0], w[1], w[2]);
    const head = sceneAnnotationAnchor(scene, { x: 5, y: 5, z: 5 })!;
    expect(head.x).toBeCloseTo(s.x);
    expect(head.y).toBeCloseTo(s.y);
    expect(sceneAnnotationAnchor(scene, { x: 50, y: 5, z: 5 })).toBeUndefined();
    expect(sceneAnnotationAnchor(scene, { x: 'a', y: 5, z: 5 })).toBeUndefined();
  });

  it('put the text ax / ay px from the head, the arrow between them', () => {
    const a = {
      _index: 0,
      visible: true,
      text: 'label',
      textangle: 0,
      font: { family: 'sans-serif', size: 12, color: '#444' },
      opacity: 1,
      align: 'center',
      valign: 'middle',
      bgcolor: 'rgba(0,0,0,0)',
      bordercolor: 'rgba(0,0,0,0)',
      borderpad: 1,
      borderwidth: 1,
      showarrow: true,
      arrowcolor: '#444',
      arrowhead: 1,
      startarrowhead: 1,
      arrowside: 'end',
      arrowsize: 1,
      startarrowsize: 1,
      arrowwidth: 2,
      standoff: 0,
      startstandoff: 0,
      ax: 40,
      ay: -30,
      xanchor: 'auto',
      yanchor: 'auto',
      xshift: 0,
      yshift: 0,
      captureevents: false,
    } as FullSceneAnnotation;
    const g = sceneAnnotationGeometry(a, { x: 100, y: 200 });
    expect(g.box.cx).toBe(140);
    expect(g.box.cy).toBe(170);
    expect(g.label?.text).toBe('label');
    expect(g.arrow?.heads).toHaveLength(1);
    const end = g.arrow!.line![1];
    expect(Math.hypot(end.x - 100, end.y - 200)).toBeLessThan(10);
    const plain = sceneAnnotationGeometry(
      { ...a, showarrow: false, xanchor: 'left' },
      { x: 100, y: 200 },
    );
    expect(plain.arrow).toBeUndefined();
    expect(plain.box.cx - plain.box.hw).toBeCloseTo(100);
  });
});
