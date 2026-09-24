// @vitest-environment jsdom
/**
 * Scatter's cross-trace changed report (E7.2 / E16.3) through the whole pipeline: `createChart`
 * with the real scatter module on a WebGL-free renderer, its views wrapped to record the update
 * plans they get. Only the traces whose stacking or fill link moved are redrawn; the others keep
 * their plans (streaming appends keep `plan.append`).
 */
import type { FrameScheduler } from '@mk7s/holochart-render';
import {
  createChart,
  createChartRegistry,
  type Chart,
  type ChartOptions,
  type TraceModule,
  type TraceUpdatePlan,
} from '@mk7s/holochart-runtime';
import type { WebGLRenderer } from 'three';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ScatterCalc } from './calc.ts';
import { scatter } from './index.ts';

function fakeRenderer(): WebGLRenderer {
  const noop = (): void => {};
  return {
    domElement: document.createElement('canvas'),
    autoClear: true,
    info: { autoReset: true, reset: noop },
    renderLists: { dispose: noop },
    setPixelRatio: noop,
    setSize: noop,
    setRenderTarget: noop,
    setClearColor: noop,
    clear: noop,
    setScissor: noop,
    setScissorTest: noop,
    setViewport: noop,
    render: noop,
    dispose: noop,
    forceContextLoss: noop,
  } as unknown as WebGLRenderer;
}

const scheduler: FrameScheduler = {
  request(cb) {
    queueMicrotask(() => cb(0));
    return 1;
  },
  cancel() {},
  now: () => 0,
};

/** Update plans the scatter views received, in order. */
let updates: { index: number; plan: TraceUpdatePlan }[] = [];

/** The scatter module with views that record their update plans. */
const recorded: TraceModule<ScatterCalc> = {
  ...(scatter as TraceModule<ScatterCalc>),
  plot: {
    create(ctx) {
      const view = scatter.plot!.create(ctx as never);
      const update = view.update.bind(view);
      view.update = (c, plan) => {
        updates.push({ index: c.index, plan: { ...plan } });
        update(c, plan);
      };
      return view as never;
    },
  },
};

let container: HTMLElement;
let options: ChartOptions;
let charts: Chart[] = [];

function chart(figure: Parameters<typeof createChart>[1]): Chart {
  const c = createChart(container, figure, options);
  charts.push(c);
  return c;
}

beforeEach(() => {
  container = document.createElement('div');
  Object.defineProperty(container, 'clientWidth', { value: 640 });
  Object.defineProperty(container, 'clientHeight', { value: 400 });
  document.body.appendChild(container);
  options = {
    registry: createChartRegistry().register(recorded as TraceModule),
    renderRoot: { scheduler, createRenderer: fakeRenderer },
  };
  updates = [];
});

afterEach(() => {
  for (const c of charts) c.destroy();
  charts = [];
  container.remove();
});

/** Trace indices whose views were redrawn (a calc or plot plan) since the last reset. */
function redrawn(): number[] {
  const out = new Set<number>();
  for (const u of updates) if (u.plan.calc || u.plan.plot) out.add(u.index);
  return [...out].sort((a, b) => a - b);
}

const calcOf = (c: Chart, i: number): ScatterCalc => c.getCalcdata(i) as ScatterCalc;

const X = [0, 1, 2];

describe('scatter crossTraceCalc changed report', () => {
  it('restyling a stack member redraws it and the members above, not those below nor others', async () => {
    const c = chart({
      data: [
        { x: X, y: [1, 1, 1], stackgroup: 'a' },
        { x: X, y: [2, 2, 2], stackgroup: 'a' },
        { x: X, y: [3, 3, 3], stackgroup: 'a' },
        { x: X, y: [5, 6, 7], mode: 'lines' },
      ],
    });
    await c.ready;
    const first = calcOf(c, 0);
    const firstY = first.y;
    const lineY = calcOf(c, 3).y;
    updates = [];
    await c.restyle({ y: [[4, 4, 4]] }, [1]);
    expect(redrawn()).toEqual([1, 2]);
    expect(Array.from(calcOf(c, 1).y)).toEqual([5, 5, 5]);
    expect(Array.from(calcOf(c, 2).y)).toEqual([8, 8, 8]);
    // The unchanged members keep their calc arrays.
    expect(calcOf(c, 0)).toBe(first);
    expect(calcOf(c, 0).y).toBe(firstY);
    expect(calcOf(c, 3).y).toBe(lineY);
  });

  it('streaming a line next to a stacked area keeps the append path and leaves the stack alone', async () => {
    const x = Array.from({ length: 20 }, (_, i) => i);
    const c = chart({
      data: [
        { x, y: x.map(() => 1), stackgroup: 'a' },
        { x, y: x.map(() => 2), stackgroup: 'a' },
        { x, y: x.map((v) => Math.sin(v)), mode: 'lines' },
      ],
    });
    await c.ready;
    const stacked = calcOf(c, 1);
    const stackedY = stacked.y;
    const path = stacked.stack!.path;
    for (const v of [20, 21]) {
      updates = [];
      await c.extendTraces({ x: [[v]], y: [[0]] }, [2]);
      const own = updates.filter((u) => u.index === 2);
      expect(own.at(-1)?.plan.append).toMatchObject({ at: 'end', count: 1 });
      expect(redrawn()).toEqual([2]);
    }
    expect(calcOf(c, 2).length).toBe(22);
    expect(calcOf(c, 1)).toBe(stacked);
    expect(calcOf(c, 1).y).toBe(stackedY);
    expect(calcOf(c, 1).stack!.path).toBe(path);
  });

  it('a groupnorm change redraws every member of the group', async () => {
    const c = chart({
      data: [
        { x: X, y: [1, 1, 1], stackgroup: 'a' },
        { x: X, y: [1, 3, 1], stackgroup: 'a' },
        { x: X, y: [2, 2, 2], stackgroup: 'a' },
        { x: X, y: [5, 6, 7], mode: 'lines' },
      ],
    });
    await c.ready;
    updates = [];
    // The group's first trace decides its groupnorm.
    await c.restyle({ groupnorm: 'percent' }, [0]);
    expect(redrawn()).toEqual([0, 1, 2]);
    expect(Array.from(calcOf(c, 2).y)).toEqual([100, 100, 100]);
    const bottom = Array.from(calcOf(c, 0).y);
    [25, 100 / 6, 25].forEach((v, i) => expect(bottom[i]).toBeCloseTo(v, 9));
  });

  it('redraws a tonexty fill after its previous trace changes, and only that', async () => {
    const c = chart({
      data: [
        { x: X, y: [0, 0, 0] },
        { x: X, y: [1, 1, 1] },
        { x: X, y: [3, 3, 3], fill: 'tonexty' },
        { x: X, y: [9, 9, 9] },
      ],
    });
    await c.ready;
    updates = [];
    await c.restyle({ y: [[2, 2, 2]] }, [1]);
    expect(redrawn()).toEqual([1, 2]);
    expect(calcOf(c, 2).link?.previous?.calc).toBe(calcOf(c, 1));
    // A path edit of the previous trace (no recalc) reaches the fill too.
    updates = [];
    await c.restyle({ 'line.shape': 'hv' }, [1]);
    expect(redrawn()).toEqual([1, 2]);
    // A style edit does not rerun cross-trace calc.
    updates = [];
    await c.restyle({ 'line.width': 4 }, [1]);
    expect(redrawn()).toEqual([]);
  });

  it('a stacked trace above a restyled member redraws its tonexty fill; hiding relinks', async () => {
    const c = chart({
      data: [
        { x: X, y: [1, 1, 1], stackgroup: 'a' },
        { x: X, y: [2, 2, 2], stackgroup: 'a' },
        { x: X, y: [5, 6, 7], mode: 'lines' },
        { x: X, y: [8, 8, 8], fill: 'tonexty' },
      ],
    });
    await c.ready;
    updates = [];
    await c.restyle({ y: [[3, 3, 3]] }, [0]);
    expect(redrawn()).toEqual([0, 1]);
    // Hiding the line links the unstacked fill to nothing: that fill redraws, the stack does not.
    updates = [];
    await c.restyle({ visible: false }, [2]);
    expect(redrawn()).toEqual([3]);
    expect(calcOf(c, 3).link?.previous).toBeUndefined();
    expect(calcOf(c, 3).link?.first).toBe(true);
  });
});
