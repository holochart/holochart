// @vitest-environment jsdom
/**
 * Indicator transitions (E12.7, E7.3) through the whole pipeline on a WebGL-free renderer: `react`
 * with a `layout.transition` writes the in-between `value` on every frame, so the drawn number
 * counts up (formatted each frame), the delta follows, the gauge bar sweeps on the same
 * primitives, and the last frame is exactly the new figure.
 */
import {
  createFallbackTextMeasurer,
  createFontMetricsOracle,
  registerFont,
  setDefaultFontMetricsOracle,
  type FrameScheduler,
  type TextData,
} from '@mk7s/holochart-render';
import {
  createChart,
  createChartRegistry,
  type Chart,
  type ChartOptions,
} from '@mk7s/holochart-runtime';
import { Object3D, type WebGLRenderer } from 'three';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { indicator } from './index.ts';

/** Texts of every text-primitive update, in order. */
const drawn: string[][] = [];
/** Font sizes of every text-primitive update, in order. */
const sizes: number[][] = [];

// The text engine (troika) needs WebGL: record the labels with a stand-in primitive instead.
vi.mock('@mk7s/holochart-render', async (importOriginal) => {
  const render = await importOriginal<typeof import('@mk7s/holochart-render')>();
  return {
    ...render,
    createTextPrimitive: (_ctx: unknown, data: Partial<TextData> = {}) => {
      const primitive = {
        object: new Object3D(),
        update(patch: Partial<TextData>) {
          if (patch.labels) {
            drawn.push(patch.labels.map((l) => l.text));
            sizes.push(patch.labels.map((l) => l.font?.size ?? 0));
          }
        },
        setTransform() {},
        setViewport() {},
        dispose() {},
      };
      primitive.update(data);
      return primitive;
    },
  };
});

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
    registry: createChartRegistry().register(indicator),
    renderRoot: { scheduler, createRenderer: fakeRenderer },
  };
  drawn.length = 0;
  sizes.length = 0;
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

const figure = (value: number, duration = 160) => ({
  data: [
    {
      type: 'indicator',
      mode: 'gauge+number+delta',
      value,
      delta: { reference: 300 },
      gauge: { axis: { range: [0, 500] } },
    },
  ],
  layout: { transition: { duration, easing: 'linear' } },
});

/** The number and delta of the last drawn frame (the first two texts). */
const shown = (): [string, string] => {
  const last = drawn.at(-1)!;
  return [last[0]!, last[1]!];
};

describe('indicator transitions', () => {
  it('counts the number up on the same primitives and settles on the new value', async () => {
    chart = createChart(container, figure(120), options);
    await chart.ready;
    expect(shown()).toEqual(['120', '▼−180']);
    const objects = chart.getTraceObjects(0);
    const done = chart.react(figure(380));
    await steps(6); // halfway through 160 ms
    const mid = chart.fullData[0]!['value'] as number;
    expect(mid).toBeGreaterThan(120);
    expect(mid).toBeLessThan(380);
    const [number] = shown();
    expect(Number(number)).toBeCloseTo(mid, 0);
    await steps(8);
    await done;
    expect(chart.fullData[0]!['value']).toBe(380);
    expect(shown()).toEqual(['380', '▲80']);
    // The numbers went up frame by frame, never down.
    const numbers = drawn.map((d) => Number(d[0]));
    for (let i = 1; i < numbers.length; i++) {
      expect(numbers[i]).toBeGreaterThanOrEqual(numbers[i - 1]!);
    }
    expect(new Set(numbers).size).toBeGreaterThan(4);
    const now = chart.getTraceObjects(0);
    expect(now.length).toBe(objects.length);
    now.forEach((o, i) => expect(o).toBe(objects[i]));
  });

  it('moves the delta reference too', async () => {
    const withRef = (value: number, reference: number) => {
      const f = figure(value);
      (f.data[0]!.delta as { reference: number }).reference = reference;
      return f;
    };
    chart = createChart(container, withRef(200, 100), options);
    await chart.ready;
    const done = chart.react(withRef(200, 300));
    await steps(6);
    const ref = (chart.fullData[0]!['delta'] as { reference: number }).reference;
    expect(ref).toBeGreaterThan(100);
    expect(ref).toBeLessThan(300);
    await steps(8);
    await done;
    expect(shown()).toEqual(['200', '▼−100']);
  });

  it('snaps with prefers-reduced-motion', async () => {
    const matchMedia = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query.includes('reduce'),
      media: query,
      addEventListener() {},
      removeEventListener() {},
    })) as unknown as typeof window.matchMedia;
    try {
      chart = createChart(container, figure(120), options);
      await chart.ready;
      const before = drawn.length;
      await chart.react(figure(380));
      expect(chart.fullData[0]!['value']).toBe(380);
      expect(drawn.slice(before).map((d) => d[0])).toEqual(['380']);
    } finally {
      window.matchMedia = matchMedia;
    }
  });

  it('snaps without a transition', async () => {
    chart = createChart(container, figure(120, 0), options);
    await chart.ready;
    const before = drawn.length;
    await chart.react(figure(380, 0));
    expect(shown()[0]).toBe('380');
    expect(drawn.length).toBe(before + 1);
  });
});

describe('indicator fonts', () => {
  afterEach(() => setDefaultFontMetricsOracle(null));

  /** An oracle measuring `k` times as wide as the deterministic fallback table. */
  const oracle = (k: number) => {
    const table = createFallbackTextMeasurer();
    return createFontMetricsOracle({
      resolveFace: null,
      measurer: {
        kind: `fallback×${k}`,
        width: (text, face) => k * table.width(text, face),
        vertical: (face) => table.vertical(face),
      },
    });
  };
  const number = { data: [{ type: 'indicator', mode: 'number', value: 123456789 }] };

  it('drops the kept number scale when a font finishes loading', async () => {
    // Before the web font loads, text is measured with a wider fallback: the number shrinks to fit.
    setDefaultFontMetricsOracle(oracle(4));
    chart = createChart(container, number, options);
    await chart.ready;
    const fallback = sizes.at(-1)![0]!;

    // The font arrives (any font change notifies), measurements get narrower: the chart re-runs
    // layout and the number grows to the size a fresh layout gives, instead of keeping the
    // smaller scale measured with the fallback.
    setDefaultFontMetricsOracle(oracle(1));
    const unregister = registerFont({ family: 'Test Face', url: 'data:,' }, { cssFontFace: false });
    try {
      await steps(3);
      await chart.ready;
      const loaded = sizes.at(-1)![0]!;
      expect(loaded).toBeGreaterThan(fallback);

      chart.destroy();
      chart = createChart(container, number, options);
      await chart.ready;
      expect(sizes.at(-1)![0]).toBeCloseTo(loaded, 6);
    } finally {
      unregister();
    }
  });
});
