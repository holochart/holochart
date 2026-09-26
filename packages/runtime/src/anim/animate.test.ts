// @vitest-environment jsdom
import { attr, toRGBA, type FullTrace } from '@mk7s/holochart-core';
import { mixColors } from '@mk7s/holochart-render';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { linearExtremes } from '../axes.ts';
import { addFrames, animate, deleteFrames } from '../api.ts';
import { createChart, type Chart } from '../chart.ts';
import type { TraceModule } from '../contracts.ts';
import { setup, type TestSetup } from '../__testing__/fakes.ts';
import { easing } from './easing.ts';

/**
 * Animation tests run on a `blobs` test trace (markers with per-point color, size and opacity,
 * declared `animatable` like scatter) whose view records the traces it draws, so each frame of a
 * transition can be checked. Frames advance with the manual scheduler (16 ms per step).
 */
const blobsSchema = attr.object({
  x: attr.dataArray({ editType: 'calc' }),
  y: attr.dataArray({ editType: 'calc' }),
  ids: attr.dataArray({ editType: 'calc' }),
  text: attr.dataArray({ editType: 'calc' }),
  symbol: attr.string({ dflt: 'circle', editType: 'style' }),
  marker: attr.object({
    color: attr.color({ arrayOk: true, editType: 'style' }),
    size: attr.number({ min: 0, dflt: 6, arrayOk: true, editType: 'calc' }),
    opacity: attr.number({ min: 0, max: 1, dflt: 1, arrayOk: true, editType: 'style' }),
  }),
  line: attr.object({ width: attr.number({ min: 0, dflt: 2, editType: 'style' }) }),
});

interface Drawn {
  readonly x: unknown;
  readonly y: unknown;
  readonly color: unknown;
  readonly size: unknown;
  readonly opacity: unknown;
  readonly width: unknown;
  readonly ids: unknown;
  readonly symbol: unknown;
}

function blobsModule(drawn: Drawn[][]): TraceModule<{ x: Float64Array; y: Float64Array }> {
  const record = (index: number, trace: FullTrace): void => {
    const marker = trace['marker'] as Record<string, unknown>;
    (drawn[index] ??= []).push({
      x: trace['x'],
      y: trace['y'],
      color: marker['color'],
      size: marker['size'],
      opacity: marker['opacity'],
      width: (trace['line'] as Record<string, unknown>)['width'],
      ids: trace['ids'],
      symbol: trace['symbol'],
    });
  };
  return {
    type: 'blobs',
    categories: ['cartesian'],
    schema: blobsSchema,
    meta: { description: 'Test blobs.' },
    animatable: ['x', 'y', 'marker.color', 'marker.size', 'marker.opacity', 'line.width'],
    supplyDefaults(_in, out: FullTrace, ctx) {
      ctx.coerce('x');
      ctx.coerce('y');
      ctx.coerce('ids');
      ctx.coerce('text');
      ctx.coerce('symbol');
      ctx.coerce('marker.color', ctx.defaultColor);
      ctx.coerce('marker.size');
      ctx.coerce('marker.opacity');
      ctx.coerce('line.width');
      const x = out['x'] as ArrayLike<unknown> | undefined;
      out['_length'] = x?.length ?? 0;
    },
    calc(trace, ctx) {
      return {
        x: ctx.xaxis!.scale.d2lArray((trace['x'] as ArrayLike<unknown>) ?? []),
        y: ctx.yaxis!.scale.d2lArray((trace['y'] as ArrayLike<unknown>) ?? []),
      };
    },
    extremes(calc) {
      return { x: linearExtremes(calc.x, 0), y: linearExtremes(calc.y, 0) };
    },
    plot: {
      create(ctx) {
        record(ctx.index, ctx.trace);
        return { update: (c) => record(c.index, c.trace) };
      },
    },
  };
}

let t: TestSetup;
let chart: Chart | undefined;
let drawn: Drawn[][];

// The chart loads the animation code with a dynamic import(): have it in the module cache, so a
// step of the manual scheduler is all an animation waits for.
beforeAll(async () => {
  await import('./animation.ts');
});

beforeEach(() => {
  t = setup({ width: 640, height: 400 });
  drawn = [];
  t.registry.register(blobsModule(drawn));
});

afterEach(() => {
  chart?.destroy();
  chart = undefined;
  t.container.remove();
  vi.restoreAllMocks();
});

async function make(figure: Parameters<typeof createChart>[1]): Promise<Chart> {
  chart = createChart(t.container, figure, t.options);
  await chart.ready;
  return chart;
}

/** Let promises and microtasks settle. */
async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
}

/** Advance `n` animation frames of 16 ms, letting each frame's pipeline run. */
async function steps(n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    t.scheduler.step();
    await flush();
  }
}

function last(trace = 0): Drawn {
  const list = drawn[trace] ?? [];
  return list[list.length - 1] as Drawn;
}

function events(c: Chart, names: readonly string[]): string[] {
  const out: string[] = [];
  for (const name of names) {
    c.on(name as 'animated', (payload: unknown) => {
      const p = payload as { name?: unknown } | undefined;
      out.push(name === 'animatingframe' ? `${name}:${String(p?.name)}` : name);
    });
  }
  return out;
}

const ANIMATION_EVENTS = [
  'animating',
  'animatingframe',
  'animated',
  'animationinterrupted',
  'transitioning',
  'transitioned',
  'transitioninterrupted',
] as const;

describe('react with layout.transition (E7.3)', () => {
  const base = (y: number[], extra: Record<string, unknown> = {}) => ({
    data: [{ type: 'blobs', x: [0, 1, 2], y, ...extra }],
    layout: {
      transition: { duration: 160, easing: 'linear' },
      yaxis: { range: [0, 10] },
    },
  });

  it('interpolates numbers frame by frame and ends exactly on the new figure', async () => {
    const c = await make(base([1, 2, 3]));
    const log = events(c, ANIMATION_EVENTS);
    let settled = false;
    const done = c.react(base([5, 6, 7])).then(() => (settled = true));
    await flush();
    expect(log).toEqual(['transitioning']);
    // Progress 0 is drawn first: the old values.
    expect(Array.from(last().y as ArrayLike<number>)).toEqual([1, 2, 3]);
    await steps(5); // 80 ms of 160: halfway
    expect(Array.from(last().y as ArrayLike<number>)).toEqual([3, 4, 5]);
    expect(settled).toBe(false);
    await steps(6);
    await done;
    expect(last().y).toEqual([5, 6, 7]);
    expect(c.data[0]).toEqual(base([5, 6, 7]).data[0]);
    expect(log).toEqual(['transitioning', 'transitioned']);
  });

  it('interpolates attributes flagged animatable in the schema (trace opacity)', async () => {
    const c = await make(base([1, 2, 3], { opacity: 1 }));
    void c.react(base([1, 2, 3], { opacity: 0.5 }));
    await flush();
    await steps(5);
    expect(c.fullData[0]!['opacity']).toBeCloseTo(0.75, 10);
    await steps(10);
    expect(c.fullData[0]!['opacity']).toBe(0.5);
  });

  it('eases with the easing given', async () => {
    const c = await make(base([0, 0, 0]));
    const next = base([8, 8, 8]);
    next.layout.transition = { duration: 160, easing: 'quad-in' };
    void c.react(next);
    await flush();
    await steps(5);
    expect((last().y as Float64Array)[0]).toBeCloseTo(8 * easing('quad-in')(0.5), 10);
  });

  it('mixes colors in OKLab and snaps what cannot animate at the start', async () => {
    const c = await make(base([1, 2, 3], { marker: { color: 'red' }, symbol: 'circle' }));
    void c.react(base([1, 2, 3], { marker: { color: 'blue' }, symbol: 'square' }));
    await flush();
    expect(last().symbol).toBe('square');
    expect(toRGBA(last().color as string)).toEqual(toRGBA('red'));
    await steps(5);
    const mid = mixColors(toRGBA('red')!, toRGBA('blue')!, 0.5, 'oklab');
    const rgb = (last().color as string).match(/[\d.]+/g)!.map(Number);
    expect(rgb.slice(0, 3)).toEqual(mid.slice(0, 3).map((v) => Math.round(v * 255)));
    await steps(10);
    expect(c.data[0]).toMatchObject({ marker: { color: 'blue' } });
    expect(c.fullData[0]!['marker']).toMatchObject({ color: 'rgb(0, 0, 255)' });
  });

  it('matches points by ids: entering points fade and grow in, exiting ones fade out', async () => {
    const figure = (ids: string[], x: number[]) => ({
      data: [{ type: 'blobs', ids, x, y: x, text: ids }],
      layout: { transition: { duration: 160, easing: 'linear' } },
    });
    const c = await make(figure(['a', 'b', 'c'], [1, 2, 3]));
    void c.react(figure(['c', 'd', 'a'], [30, 40, 10]));
    await flush();
    // New points first (c, d, a), then the exiting b.
    expect(last().ids).toEqual(['c', 'd', 'a', 'b']);
    expect(Array.from(last().x as ArrayLike<number>)).toEqual([3, 40, 1, 2]);
    expect(Array.from(last().opacity as ArrayLike<number>)).toEqual([1, 0, 1, 1]);
    expect(Array.from(last().size as ArrayLike<number>)).toEqual([6, 0, 6, 6]);
    await steps(5);
    expect(Array.from(last().x as ArrayLike<number>)).toEqual([16.5, 40, 5.5, 2]);
    expect(Array.from(last().opacity as ArrayLike<number>)).toEqual([1, 0.5, 1, 0.5]);
    expect(Array.from(last().size as ArrayLike<number>)).toEqual([6, 3, 6, 3]);
    await steps(10);
    expect(last().ids).toEqual(['c', 'd', 'a']);
    expect(last().x).toEqual([30, 40, 10]);
    expect(last().opacity).toBe(1);
  });

  it("animates axis ranges; 'layout first' holds the traces until the end", async () => {
    const figure = (y: number[], range: number[], ordering?: string) => ({
      data: [{ type: 'blobs', x: [0, 1], y }],
      layout: {
        transition: { duration: 160, easing: 'linear', ...(ordering ? { ordering } : {}) },
        yaxis: { range },
      },
    });
    const c = await make(figure([1, 2], [0, 10]));
    void c.react(figure([5, 6], [0, 20]));
    await flush();
    await steps(5);
    expect(c.fullLayout!['yaxis']).toMatchObject({ range: [0, 15] });
    expect(Array.from(last().y as ArrayLike<number>)).toEqual([1, 2]);
    await steps(10);
    expect(last().y).toEqual([5, 6]);
    expect(c.fullLayout!['yaxis']).toMatchObject({ range: [0, 20] });
    // The input ends as given (no `autorange: false` left behind by the in-between ranges).
    expect(c.layout).toEqual(figure([5, 6], [0, 20]).layout);

    void c.react(figure([1, 2], [0, 10], 'traces first'));
    await flush();
    await steps(5);
    expect(Array.from(last().y as ArrayLike<number>)).toEqual([3, 4]);
    expect(c.fullLayout!['yaxis']).toMatchObject({ range: [0, 20] });
    await steps(10);
    expect(c.fullLayout!['yaxis']).toMatchObject({ range: [0, 10] });
  });

  it('snaps with prefers-reduced-motion, and without animatable changes emits nothing', async () => {
    const c = await make(base([1, 2, 3]));
    const log = events(c, ANIMATION_EVENTS);
    await c.react(base([1, 2, 3], { symbol: 'square' }));
    expect(log).toEqual([]);
    const matchMedia = vi.fn(() => ({ matches: true }));
    vi.stubGlobal('matchMedia', matchMedia);
    Object.defineProperty(window, 'matchMedia', { value: matchMedia, configurable: true });
    await c.react(base([4, 5, 6]));
    expect(last().y).toEqual([4, 5, 6]);
    expect(log).toEqual(['transitioning', 'transitioned']);
    Reflect.deleteProperty(window, 'matchMedia');
    vi.unstubAllGlobals();
  });

  it('lets another update of an animating attribute win', async () => {
    const c = await make(base([1, 2, 3]));
    const done = c.react(base([5, 6, 7]));
    await flush();
    await steps(3);
    await c.restyle({ y: [[9, 9, 9]] });
    await steps(10);
    await done;
    expect(last().y).toEqual([9, 9, 9]);
    expect(c.data[0]).toMatchObject({ y: [9, 9, 9] });
  });

  it('follows its traces when traces are added or moved meanwhile', async () => {
    const c = await make(base([1, 2, 3]));
    const done = c.react(base([5, 6, 7]));
    await flush();
    await steps(3);
    await c.addTraces({ type: 'blobs', x: [0], y: [0] }, 0);
    await steps(12);
    await done;
    expect(c.data[1]).toMatchObject({ y: [5, 6, 7] });
    expect(c.data[0]).toMatchObject({ y: [0] });
  });

  it('a new transition interrupts the running one and starts from what is drawn', async () => {
    const c = await make(base([0, 0, 0]));
    const log = events(c, ANIMATION_EVENTS);
    const first = c.react(base([10, 10, 10]));
    await flush();
    await steps(5);
    const drawnY = (last().y as Float64Array)[0]!;
    expect(drawnY).toBeCloseTo(5, 10);
    const second = c.react(base([0, 0, 0]));
    await flush();
    expect(log).toEqual(['transitioning', 'transitioninterrupted', 'transitioning']);
    expect((last().y as Float64Array)[0]).toBeCloseTo(drawnY, 10);
    await steps(12);
    await Promise.all([first, second]);
    expect(last().y).toEqual([0, 0, 0]);
  });
});

describe('frames and animate (E7.4)', () => {
  const frames = [
    { name: 'a', group: 'g', data: [{ y: [1, 1] }] },
    { name: 'b', group: 'g', data: [{ y: [2, 2] }], layout: { title: { text: 'B' } } },
    { name: 'c', data: [{ y: [3, 3] }] },
  ];
  const figure = () => ({
    data: [{ type: 'blobs', x: [0, 1], y: [0, 0] }],
    layout: { yaxis: { range: [0, 5] } },
    frames,
  });
  const fast = { frame: { duration: 64 }, transition: { duration: 32, easing: 'linear' } };

  it('plays every frame in order, with Plotly’s events, and resolves at the end', async () => {
    const c = await make(figure());
    const log = events(c, ANIMATION_EVENTS);
    let settled = false;
    const done = c.animate(null, fast).then(() => (settled = true));
    await flush();
    expect(log).toEqual(['animating', 'animatingframe:a', 'transitioning']);
    await steps(3);
    expect(last().y).toEqual([1, 1]);
    expect(log.at(-1)).toBe('transitioned');
    await steps(2); // 80 ms > 64: the next frame
    expect(log.slice(3)).toEqual(['transitioned', 'animatingframe:b', 'transitioning']);
    await steps(10);
    await done;
    expect(settled).toBe(true);
    expect(last().y).toEqual([3, 3]);
    expect(c.layout).toMatchObject({ title: { text: 'B' } });
    expect(log.filter((e) => e.startsWith('animatingframe'))).toEqual([
      'animatingframe:a',
      'animatingframe:b',
      'animatingframe:c',
    ]);
    expect(log.at(-1)).toBe('animated');
    expect(c.fullLayout!['_currentFrame']).toBe('c');
  });

  it('emits animated only once the last frame’s transition has drawn its final state', async () => {
    const c = await make(figure());
    const log = events(c, ['animated', 'transitioned']);
    const done = c.animate(['c'], {
      frame: { duration: 160 },
      transition: { duration: 160, easing: 'linear' },
    });
    await flush();
    await steps(9);
    // A slow machine: the transition's last pass is still running when the frame's time is up.
    t.scheduler.step();
    t.scheduler.step();
    expect(log).toEqual([]);
    await flush();
    await done;
    expect(log).toEqual(['transitioned', 'animated']);
    expect(last().y).toEqual([3, 3]);
  });

  it('names a group with a string, frames with a list; reverse; unknown names reject', async () => {
    const c = await make(figure());
    const log = events(c, ['animatingframe']);
    await Promise.all([c.animate('g', { ...fast, direction: 'reverse' }), steps(20)]);
    expect(log).toEqual(['animatingframe:b', 'animatingframe:a']);
    log.length = 0;
    await Promise.all([c.animate(['c'], fast), steps(10)]);
    expect(log).toEqual(['animatingframe:c']);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(c.animate(['nope'])).rejects.toThrow('frame not found: "nope"');
    expect(warn).toHaveBeenCalled();
  });

  it("'immediate' drops the queue: the earlier call rejects; [null] pauses", async () => {
    const c = await make(figure());
    const log = events(c, ANIMATION_EVENTS);
    const play = c.animate(null, fast);
    const rejected = play.catch((e: Error) => e.name);
    await flush();
    await steps(5); // frame b starts
    await expect(c.animate([null], { mode: 'immediate' })).resolves.toBe(c);
    expect(await rejected).toBe('AnimationInterrupted');
    expect(log).toContain('animationinterrupted');
    await steps(10);
    // Frame b finished its transition; c never played.
    expect(last().y).toEqual([2, 2]);
    expect(log.filter((e) => e.startsWith('animatingframe'))).toEqual([
      'animatingframe:a',
      'animatingframe:b',
    ]);
    // Resume: fromcurrent skips the frames up to the current one.
    await Promise.all([c.animate(null, { ...fast, fromcurrent: true }), steps(20)]);
    expect(log.filter((e) => e.startsWith('animatingframe'))).toEqual([
      'animatingframe:a',
      'animatingframe:b',
      'animatingframe:c',
    ]);
  });

  it("'afterall' queues after the running call; 'next' waits for the current frame", async () => {
    const c = await make(figure());
    const log = events(c, ['animatingframe']);
    const first = c.animate(['a', 'b'], fast);
    const second = c.animate(['c'], fast);
    await Promise.all([first, second, steps(20)]);
    expect(log).toEqual(['animatingframe:a', 'animatingframe:b', 'animatingframe:c']);
    log.length = 0;
    const dropped = c.animate(['a', 'b'], fast).catch(() => 'rejected');
    await flush();
    const next = c.animate(['c'], { ...fast, mode: 'next' });
    await steps(2);
    expect(log).toEqual(['animatingframe:a']);
    await Promise.all([next, steps(10)]);
    expect(log).toEqual(['animatingframe:a', 'animatingframe:c']);
    expect(await dropped).toBe('rejected');
  });

  it('applies baseframe chains and frame.traces', async () => {
    const c = await make({
      data: [
        { type: 'blobs', x: [0, 1], y: [0, 0] },
        { type: 'blobs', x: [0, 1], y: [0, 0] },
      ],
      frames: [
        { name: 'base', data: [{ marker: { size: 12 } }], traces: [1] },
        { name: 'top', baseframe: 'base', data: [{ y: [4, 4] }], traces: [1] },
      ],
    });
    await Promise.all([c.animate(['top'], fast), steps(10)]);
    expect(c.data[0]).toMatchObject({ y: [0, 0] });
    expect(c.data[1]).toMatchObject({ y: [4, 4], marker: { size: 12 } });
  });

  it('addFrames / deleteFrames edit chart.frames (and toJSON)', async () => {
    const c = await make({ data: [{ type: 'blobs', x: [0], y: [0] }] });
    await c.addFrames([{ name: 'x', data: [{ y: [1] }] }, { data: [{ y: [2] }] }]);
    expect((c.frames as { name: string }[]).map((f) => f.name)).toEqual(['x', 'frame 0']);
    await addFrames(t.container, [{ name: 'x', data: [{ y: [5] }] }, { name: 7 }], [null, 0]);
    expect((c.frames as { name: string }[]).map((f) => f.name)).toEqual(['7', 'x', 'frame 0']);
    expect(c.toJSON().frames).toHaveLength(3);
    await deleteFrames(t.container, [0]);
    expect((c.frames as { name: string }[]).map((f) => f.name)).toEqual(['x', 'frame 0']);
    await expect(c.deleteFrames([5])).rejects.toThrow(RangeError);
    await c.deleteFrames();
    expect(c.frames).toEqual([]);
    await Promise.all([animate(t.container, null), steps(2)]);
  });

  it('keeps frames across react unless the figure brings its own', async () => {
    const c = await make(figure());
    await c.react({ data: [{ type: 'blobs', x: [0, 1], y: [1, 1] }] });
    expect(c.frames).toBe(frames);
    await c.react({ data: [{ type: 'blobs', x: [0, 1], y: [1, 1] }], frames: [] });
    expect(c.frames).toEqual([]);
  });

  it('destroying the chart rejects pending animations', async () => {
    const c = await make(figure());
    const done = c.animate(null, fast).catch((e: Error) => e.name);
    await flush();
    c.destroy();
    chart = undefined;
    await steps(1);
    expect(await done).toBe('AnimationInterrupted');
  });
});
