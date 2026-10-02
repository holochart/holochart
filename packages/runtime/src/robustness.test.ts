// @vitest-environment jsdom
/**
 * Robustness (S1.7, S1.8): a throwing event listener doesn't stop the other listeners or the
 * chart; without WebGL2 the container shows a note and creation fails with a typed error; one
 * failing dispose doesn't stop the teardown.
 */
import { HolochartError, type FigureInput } from '@mk7s/holochart-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newPlot, purge } from './api.ts';
import { createChart, getChart, type Chart } from './chart.ts';
import type { ComponentModule, TraceModule } from './contracts.ts';
import type { ChartEventName } from './events.ts';
import { WebGLUnavailableError } from './fallback.ts';
import { createDotsModule, setup, type TestSetup } from './__testing__/fakes.ts';

const MARGIN = { l: 40, r: 20, t: 30, b: 50 };
const RANGES = { xaxis: { range: [0, 10] }, yaxis: { range: [0, 100] } };
const DOTS = { type: 'dots', x: [0, 5, 10], y: [0, 50, 100] };

const cx = (x: number): number => 40 + 58 * x;
const cy = (y: number): number => 350 - 3.2 * y;

let t: TestSetup;
let charts: Chart[] = [];
let reported: unknown[];

beforeEach(() => {
  t = setup({ width: 640, height: 400 });
  reported = [];
  vi.stubGlobal('reportError', (error: unknown) => void reported.push(error));
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  for (const c of charts) c.destroy();
  charts = [];
  t.container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function chart(data: unknown[] = [DOTS], s: TestSetup = t): Promise<Chart> {
  const c = createChart(
    s.container,
    { data, layout: { margin: MARGIN, ...RANGES } } as FigureInput,
    s.options,
  );
  charts.push(c);
  await c.ready;
  return c;
}

function fire(c: Chart, type: string, x: number, y: number): void {
  c.three.root.canvas.dispatchEvent(
    new PointerEvent(type, {
      clientX: x,
      clientY: y,
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      bubbles: true,
    }),
  );
}

function labels(c: Chart): string[] {
  return [...c.element.querySelectorAll<HTMLElement>('.holochart-hoverlabel')]
    .filter((el) => el.style.display !== 'none')
    .map((el) => el.textContent ?? '');
}

/** Three listeners of `name`; the middle one throws. Returns the calls of the other two. */
function sandwich(c: Chart, name: ChartEventName): { calls: string[]; error: Error } {
  const calls: string[] = [];
  const error = new Error(`${name} listener failed`);
  c.on(name, () => void calls.push('first'));
  c.on(name, () => {
    calls.push('second');
    throw error;
  });
  c.on(name, () => void calls.push('third'));
  return { calls, error };
}

describe('a throwing event listener (S1.7)', () => {
  it('hover: the other listeners run, the error is reported, labels show and unhover works', async () => {
    const c = await chart();
    const { calls, error } = sandwich(c, 'hover');
    const unhovers: unknown[] = [];
    c.on('unhover', (e) => void unhovers.push(e));
    fire(c, 'pointermove', cx(5), cy(50));
    t.scheduler.step();
    expect(calls).toEqual(['first', 'second', 'third']);
    expect(reported).toEqual([error]);
    expect(labels(c)).toEqual(['(5, 50)']);
    // The next hover still works, and so does unhover.
    fire(c, 'pointermove', cx(10), cy(100));
    t.scheduler.step();
    expect(calls).toHaveLength(6);
    expect(labels(c)).toEqual(['(10, 100)']);
    c.unhover();
    expect(unhovers).toHaveLength(1);
    expect(labels(c)).toEqual([]);
  });

  it('click: the other listeners run and the next click is delivered', async () => {
    const c = await chart();
    const { calls, error } = sandwich(c, 'click');
    fire(c, 'pointerdown', cx(5), cy(50));
    fire(c, 'pointerup', cx(5), cy(50));
    expect(calls).toEqual(['first', 'second', 'third']);
    expect(reported).toEqual([error]);
    fire(c, 'pointerdown', cx(10), cy(100));
    fire(c, 'pointerup', cx(10), cy(100));
    expect(calls).toHaveLength(6);
  });

  it('relayout: the update resolves, afterplot follows and the layout is applied', async () => {
    const c = await chart();
    const { calls, error } = sandwich(c, 'relayout');
    const afterplot = vi.fn();
    c.on('afterplot', afterplot);
    await expect(c.relayout({ 'xaxis.range': [2, 8] })).resolves.toBe(c);
    expect(calls).toEqual(['first', 'second', 'third']);
    expect(reported).toEqual([error]);
    expect(afterplot).toHaveBeenCalledTimes(1);
    expect((c.fullLayout?.['xaxis'] as { range: number[] }).range).toEqual([2, 8]);
  });

  it('afterplot: every listener runs and later updates still draw', async () => {
    const c = await chart();
    const { calls, error } = sandwich(c, 'afterplot');
    await c.relayout({ 'xaxis.range': [1, 9] });
    expect(calls).toEqual(['first', 'second', 'third']);
    expect(reported).toEqual([error]);
    const frames = t.frames();
    await c.relayout({ 'xaxis.range': [0, 5] });
    expect(calls).toHaveLength(6);
    expect(t.frames()).toBeGreaterThan(frames);
  });

  it('keeps cancel semantics: `false` from another listener still cancels', async () => {
    const c = await chart();
    c.on('legendclick', () => {
      throw new Error('boom');
    });
    c.on('legendclick', () => false);
    expect(c.emit('legendclick', { curveNumber: 0 })).toBe(false);
    expect(reported).toHaveLength(1);
  });

  it('render-loop listeners (beforerender / afterrender) are guarded too', async () => {
    const c = await chart();
    const after = vi.fn();
    c.on('beforerender', () => {
      throw new Error('before');
    });
    c.on('afterrender', after);
    await c.relayout({ 'xaxis.range': [1, 9] });
    expect(after).toHaveBeenCalled();
    expect(reported.length).toBeGreaterThan(0);
  });

  it('config.renderHover: a throwing renderer is reported and the built-in labels show', async () => {
    const error = new Error('renderHover failed');
    const c = createChart(
      t.container,
      {
        data: [DOTS],
        layout: { margin: MARGIN, ...RANGES },
        config: {
          renderHover: () => {
            throw error;
          },
        },
      },
      t.options,
    );
    charts.push(c);
    await c.ready;
    const hovers = vi.fn();
    c.on('hover', hovers);
    fire(c, 'pointermove', cx(5), cy(50));
    t.scheduler.step();
    expect(reported).toEqual([error]);
    expect(labels(c)).toEqual(['(5, 50)']);
    expect(hovers).toHaveBeenCalledTimes(1);
  });

  it('falls back to a microtask rethrow without reportError', async () => {
    vi.stubGlobal('reportError', undefined);
    const queued: (() => void)[] = [];
    vi.stubGlobal('queueMicrotask', (fn: () => void) => void queued.push(fn));
    const { reportUserError } = await import('@mk7s/holochart-render');
    const error = new Error('late');
    reportUserError(error);
    expect(queued).toHaveLength(1);
    expect(() => queued[0]!()).toThrow(error);
  });
});

describe('without WebGL2 (S1.8)', () => {
  function failing(s: TestSetup = t): TestSetup {
    return {
      ...s,
      options: {
        ...s.options,
        renderRoot: {
          ...s.options.renderRoot,
          createRenderer: () => {
            throw new Error('Error creating WebGL context.');
          },
        },
      },
    };
  }

  it('throws WebGLUnavailableError, shows the note and description, and is not registered', () => {
    const f = failing();
    let thrown: unknown;
    try {
      createChart(
        f.container,
        { data: [{ ...DOTS, name: 'Sales' }], layout: { title: { text: 'Revenue' } } },
        f.options,
      );
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(WebGLUnavailableError);
    expect(thrown).toBeInstanceOf(HolochartError);
    expect((thrown as Error).name).toBe('WebGLUnavailableError');
    expect((thrown as Error).cause).toBeInstanceOf(Error);
    expect(getChart(f.container)).toBeUndefined();
    const note = f.container.querySelector('.holochart-fallback');
    expect(note?.getAttribute('role')).toBe('note');
    expect(note?.textContent).toContain('WebGL2');
    expect(note?.textContent).toContain('Revenue');
    expect(note?.textContent).toContain('Sales');
    // Nothing else is left in the container (canvas, a11y mirror, hover layer).
    expect(f.container.children).toHaveLength(1);
  });

  it('newPlot rejects with it, and purge removes the note', async () => {
    const f = failing();
    await expect(newPlot(f.container, [DOTS], {}, {}, f.options)).rejects.toBeInstanceOf(
      WebGLUnavailableError,
    );
    expect(f.container.querySelector('.holochart-fallback')).not.toBeNull();
    purge(f.container);
    expect(f.container.querySelector('.holochart-fallback')).toBeNull();
    expect(f.container.children).toHaveLength(0);
  });

  it('a later successful chart in the same element replaces the note', async () => {
    const f = failing();
    expect(() => createChart(f.container, { data: [DOTS] }, f.options)).toThrow(
      WebGLUnavailableError,
    );
    const c = await chart();
    expect(t.container.querySelector('.holochart-fallback')).toBeNull();
    expect(getChart(t.container)).toBe(c);
  });

  it('the chart already in the element is destroyed, not left registered', async () => {
    const c = await chart();
    const f = failing();
    expect(() => createChart(f.container, { data: [DOTS] }, f.options)).toThrow(
      WebGLUnavailableError,
    );
    expect(c.destroyed).toBe(true);
    expect(getChart(t.container)).toBeUndefined();
  });
});

describe('teardown (S1.8)', () => {
  it('a trace view whose dispose throws: teardown completes and the root is destroyed', async () => {
    const dots = createDotsModule(t.log);
    t.registry.register({
      ...dots,
      type: 'brokendots',
      plot: {
        create: (ctx: Parameters<NonNullable<typeof dots.plot>['create']>[0]) => ({
          ...dots.plot!.create(ctx),
          dispose: () => {
            throw new Error('dispose failed');
          },
        }),
      },
    } as TraceModule);
    const c = await chart([{ ...DOTS, type: 'brokendots' }, DOTS]);
    const root = c.three.root;
    const destroy = vi.spyOn(root, 'destroy');
    const onDestroy = vi.fn();
    c.on('destroy', onDestroy);
    expect(() => c.destroy()).not.toThrow();
    // The trace after the broken one was disposed too.
    expect(t.log.disposed).toEqual([1]);
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(root.destroyed).toBe(true);
    expect(t.renderers[0]?.renderer['forceContextLoss']).toHaveBeenCalled();
    expect(onDestroy).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('[holochart] disposing the brokendots trace failed'),
      expect.any(Error),
    );
    expect(t.container.querySelector('canvas')).toBeNull();
  });

  it('a component view whose dispose throws: teardown completes', async () => {
    const broken: ComponentModule = {
      name: 'broken',
      draw: {
        create: () => ({
          update: () => undefined,
          dispose: () => {
            throw new Error('component dispose failed');
          },
        }),
      },
    } as unknown as ComponentModule;
    const s = setup({ width: 640, height: 400, components: [broken] });
    const c = await chart([DOTS], s);
    const root = c.three.root;
    expect(() => c.destroy()).not.toThrow();
    expect(root.destroyed).toBe(true);
    expect(s.renderers[0]?.renderer['forceContextLoss']).toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('[holochart] disposing the broken component failed'),
      expect.any(Error),
    );
    s.container.remove();
  });
});
