// @vitest-environment jsdom
/**
 * Transitions and frames (E7.3, E7.4) with the real scatter and bar modules, through the whole
 * pipeline on a WebGL-free renderer: in-between frames update the traces' existing primitives,
 * and each ends exactly on the new figure.
 */
import type { FrameScheduler } from '@mk7s/holochart-render';
import {
  createChart,
  createChartRegistry,
  type Chart,
  type ChartOptions,
} from '@mk7s/holochart-runtime';
import type { WebGLRenderer } from 'three';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bar } from './bar/index.ts';
import { scatter } from './scatter/index.ts';

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

/** Animation frames of 16 ms that run only when stepped. */
function manualScheduler(): FrameScheduler & { step(): void } {
  let time = 0;
  let next = 1;
  const queue = new Map<number, (t: number) => void>();
  return {
    request(cb) {
      queue.set(next, cb);
      return next++;
    },
    cancel(handle) {
      queue.delete(handle);
    },
    now: () => time,
    step() {
      time += 16;
      const cbs = [...queue.values()];
      queue.clear();
      for (const cb of cbs) cb(time);
    },
  };
}

let container: HTMLElement;
let options: ChartOptions;
let scheduler: ReturnType<typeof manualScheduler>;
let chart: Chart | undefined;

beforeAll(async () => {
  // Warm the lazily imported animation code (see the runtime's animate tests).
  const c = createChart(
    document.createElement('div'),
    {},
    { registry: createChartRegistry(), renderRoot: { createRenderer: fakeRenderer } },
  );
  await c.addFrames([]);
  c.destroy();
});

beforeEach(() => {
  container = document.createElement('div');
  Object.defineProperty(container, 'clientWidth', { value: 640 });
  Object.defineProperty(container, 'clientHeight', { value: 400 });
  document.body.appendChild(container);
  scheduler = manualScheduler();
  options = {
    registry: createChartRegistry().register(scatter, bar),
    renderRoot: { scheduler, createRenderer: fakeRenderer },
  };
});

afterEach(() => {
  chart?.destroy();
  chart = undefined;
  container.remove();
});

async function steps(n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    scheduler.step();
    for (let k = 0; k < 5; k++) await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }
}

const transition = { duration: 160, easing: 'linear' };

/** The same three.js objects (the primitives were updated in place, not rebuilt). */
function expectSame(a: readonly object[], b: readonly object[]): void {
  expect(a.length).toBe(b.length);
  a.forEach((o, i) => expect(o).toBe(b[i]));
}

describe('scatter transitions', () => {
  const bubbles = (ids: string[], x: number[], size: number[], color: string) => ({
    data: [{ type: 'scatter', mode: 'markers', ids, x, y: x, marker: { size, color } }],
    layout: { transition, xaxis: { range: [0, 50] }, yaxis: { range: [0, 50] } },
  });

  it('moves, recolors, fades and grows markers on the same primitives', async () => {
    chart = createChart(container, bubbles(['a', 'b'], [10, 20], [10, 20], 'red'), options);
    await chart.ready;
    const objects = chart.getTraceObjects(0);
    const done = chart.react(bubbles(['b', 'c'], [40, 30], [30, 10], 'blue'));
    await steps(6); // halfway
    const mid = chart.fullData[0]!;
    // b moves 20 → 40; c enters at 30; a exits at 10 (appended).
    expect(Array.from(mid['x'] as ArrayLike<number>)).toEqual([30, 30, 10]);
    const marker = mid['marker'] as Record<string, unknown>;
    expect(Array.from(marker['size'] as ArrayLike<number>)).toEqual([25, 5, 5]);
    // Bubbles default to opacity 0.7 (Plotly).
    expect(Array.from(marker['opacity'] as ArrayLike<number>)).toEqual([0.7, 0.35, 0.35]);
    expect(marker['color']).not.toBe('rgb(255, 0, 0)');
    expectSame(chart.getTraceObjects(0), objects);
    await steps(8);
    await done;
    expect(chart.fullData[0]!['x']).toEqual([40, 30]);
    expect(chart.fullData[0]!['marker']).toMatchObject({ size: [30, 10], color: 'rgb(0, 0, 255)' });
    expectSame(chart.getTraceObjects(0), objects);
  });

  it('plays frames with animate', async () => {
    chart = createChart(
      container,
      {
        ...bubbles(['a'], [0], [10], 'red'),
        frames: [
          { name: 'one', data: [{ x: [10], y: [10] }] },
          { name: 'two', data: [{ x: [20], y: [20] }] },
        ],
      },
      options,
    );
    await chart.ready;
    const frames: unknown[] = [];
    chart.on('animatingframe', (e) => frames.push(e.name));
    const played = chart.animate(null, { frame: { duration: 64 }, transition });
    await steps(20);
    await played;
    expect(frames).toEqual(['one', 'two']);
    expect(chart.fullData[0]!['x']).toEqual([20]);
  });
});

describe('bar transitions', () => {
  const ranking = (values: number[]) => {
    const order = values.map((_, i) => i).sort((a, b) => values[b]! - values[a]!);
    const rank: number[] = [];
    order.forEach((i, r) => (rank[i] = r + 1));
    return {
      data: [
        {
          type: 'bar',
          orientation: 'h',
          ids: ['p', 'q', 'r'],
          x: values,
          y: rank,
          marker: { color: ['red', 'green', 'blue'] },
        },
      ],
      layout: { transition, yaxis: { range: [3.5, 0.5] } },
    };
  };

  it('bars matched by ids slide to their new rank and resize', async () => {
    chart = createChart(container, ranking([30, 20, 10]), options);
    await chart.ready;
    const objects = chart.getTraceObjects(0);
    const done = chart.react(ranking([10, 20, 30]));
    await steps(6);
    const mid = chart.fullData[0]!;
    expect(Array.from(mid['x'] as ArrayLike<number>)).toEqual([20, 20, 20]);
    expect(Array.from(mid['y'] as ArrayLike<number>)).toEqual([2, 2, 2]);
    expectSame(chart.getTraceObjects(0), objects);
    await steps(8);
    await done;
    expect(chart.fullData[0]!['y']).toEqual([3, 2, 1]);
  });

  it('category positions snap; values animate', async () => {
    const figure = (x: string[], y: number[]) => ({
      data: [{ type: 'bar', x, y }],
      layout: { transition, yaxis: { range: [0, 10] } },
    });
    chart = createChart(container, figure(['a', 'b'], [2, 4]), options);
    await chart.ready;
    void chart.react(figure(['b', 'a'], [8, 6]));
    await steps(6);
    const mid = chart.fullData[0]!;
    expect(mid['x']).toEqual(['b', 'a']);
    expect(Array.from(mid['y'] as ArrayLike<number>)).toEqual([5, 5]);
    await steps(8);
  });
});
