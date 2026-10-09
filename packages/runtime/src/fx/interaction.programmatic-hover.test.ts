// @vitest-environment jsdom
/**
 * The app's hover (`chart.hover`, `chart.unhover`, `chart.refreshHover`): how targets resolve, what
 * survives the pointer leaving and a pipeline run, and when the pointer's hover takes over. Same
 * figure as `interaction.test.ts`: 640×400, margins l 40, r 20, t 30, b 50, so the plot area is
 * x 40–620, y 30–350; with x in [0, 10] and y in [0, 100], data (x, y) sits at container
 * (40 + 58·x, 350 − 3.2·y).
 */
import type { FigureInput } from '@mk7s/holochart-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChart, type Chart } from '../chart.ts';
import type { TraceModule } from '../contracts.ts';
import type { ChartEventName } from '../events.ts';
import { createDotsModule, createLog, setup, type TestSetup } from '../__testing__/fakes.ts';

const MARGIN = { l: 40, r: 20, t: 30, b: 50 };
const RANGES = { xaxis: { range: [0, 10] }, yaxis: { range: [0, 100] } };
const DOTS = { type: 'dots', x: [0, 5, 10], y: [0, 50, 100] };

const cx = (x: number): number => 40 + 58 * x;
const cy = (y: number): number => 350 - 3.2 * y;

let t: TestSetup;
let charts: Chart[] = [];

beforeEach(() => {
  t = setup({ width: 640, height: 400 });
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  for (const c of charts) c.destroy();
  charts = [];
  vi.restoreAllMocks();
});

async function chart(data: unknown[], layout: Record<string, unknown> = {}): Promise<Chart> {
  const c = createChart(
    t.container,
    { data, layout: { margin: MARGIN, ...RANGES, ...layout } } as FigureInput,
    t.options,
  );
  charts.push(c);
  await c.ready;
  return c;
}

function fire(
  c: Chart,
  type: string,
  x: number,
  y: number,
  init: Partial<PointerEventInit> = {},
): void {
  c.three.root.canvas.dispatchEvent(
    new PointerEvent(type, {
      clientX: x,
      clientY: y,
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      bubbles: true,
      ...init,
    }),
  );
}

function frame(): void {
  t.scheduler.step();
}

interface HoverPayload {
  points: { curveNumber: number; pointNumber: number }[];
  xvals?: number[];
  yvals?: number[];
}

function record(c: Chart, ...names: ChartEventName[]): { name: string; payload: HoverPayload }[] {
  const log: { name: string; payload: HoverPayload }[] = [];
  for (const name of names) {
    c.on(name, (payload: unknown) => void log.push({ name, payload: payload as HoverPayload }));
  }
  return log;
}

const numbers = (e: HoverPayload | undefined): number[] =>
  (e?.points ?? []).map((p) => p.pointNumber);

function shown(c: Chart): HTMLElement[] {
  return [...c.element.querySelectorAll<HTMLElement>('.holochart-hoverlabel')].filter(
    (el) => el.style.display !== 'none',
  );
}

function labels(c: Chart): string[] {
  return shown(c).map((el) => el.textContent ?? '');
}

describe('a position in data units', () => {
  it('with only xval resolves at mid-height of the subplot', async () => {
    const c = await chart([DOTS], { hovermode: 'x' });
    const log = record(c, 'hover');
    c.hover({ xval: 10 });
    expect(numbers(log[0]?.payload)).toEqual([2]);
    expect(log[0]?.payload.xvals?.[0]).toBeCloseTo(10);
    expect(log[0]?.payload.yvals?.[0]).toBeCloseTo(50);
  });

  it('with only yval resolves at mid-width of the subplot', async () => {
    const c = await chart([DOTS], { hovermode: 'y' });
    const log = record(c, 'hover');
    c.hover({ yval: 0 });
    expect(numbers(log[0]?.payload)).toEqual([0]);
    expect(log[0]?.payload.xvals?.[0]).toBeCloseTo(5);
    expect(log[0]?.payload.yvals?.[0]).toBeCloseTo(0);
  });

  it('is not limited by hoverdistance: the nearest point wins however far', async () => {
    const c = await chart([DOTS], { hoverdistance: 5 });
    const log = record(c, 'hover');
    // (2, 20) is over 100 px from every point; (0, 0) is the nearest.
    c.hover({ xval: 2, yval: 20 });
    expect(numbers(log[0]?.payload)).toEqual([0]);
  });

  it('uses the first subplot when the figure has no `xy`', async () => {
    const c = await chart([{ ...DOTS, xaxis: 'x2', yaxis: 'y2' }], {
      xaxis2: { range: [0, 10] },
      yaxis2: { range: [0, 100], anchor: 'x2' },
    });
    expect([...c.subplots.keys()]).toEqual(['x2y2']);
    const log = record(c, 'hover');
    c.hover({ xval: 5, yval: 50 });
    expect(numbers(log[0]?.payload)).toEqual([1]);
  });
});

describe('points by trace and index', () => {
  it('skips traces and points that do not exist', async () => {
    const c = await chart([DOTS]);
    const log = record(c, 'hover');
    c.hover([
      { curveNumber: 3, pointNumber: 0 },
      { curveNumber: 0, pointNumber: 7 },
      { curveNumber: 0, pointNumber: 1 },
    ]);
    expect(numbers(log[0]?.payload)).toEqual([1]);
    expect(labels(c)).toEqual(['(5, 50)']);
  });

  it('shows the point even with hovermode false, as in closest mode', async () => {
    const c = await chart([DOTS], { hovermode: false });
    const log = record(c, 'hover');
    c.hover([{ curveNumber: 0, pointNumber: 1 }]);
    expect(numbers(log[0]?.payload)).toEqual([1]);
    expect(labels(c)).toEqual(['(5, 50)']);
  });

  it('an empty list ends the hover', async () => {
    const c = await chart([DOTS]);
    const log = record(c, 'hover', 'unhover');
    c.hover([{ curveNumber: 0, pointNumber: 1 }]);
    c.hover([]);
    expect(log.map((l) => l.name)).toEqual(['hover', 'unhover']);
    expect(labels(c)).toEqual([]);
  });
});

describe("the app's hover and the pointer", () => {
  it('stays when the pointer leaves, and gives way to a pointer hover', async () => {
    const c = await chart([DOTS]);
    const log = record(c, 'hover', 'unhover');
    c.hover([{ curveNumber: 0, pointNumber: 2 }]);
    fire(c, 'pointerleave', 700, 500);
    expect(log.map((l) => l.name)).toEqual(['hover']);
    expect(labels(c)).toEqual(['(10, 100)']);
    // The pointer over another point replaces it.
    fire(c, 'pointermove', cx(0) + 3, cy(0) - 3);
    frame();
    expect(log.map((l) => l.name)).toEqual(['hover', 'hover']);
    expect(labels(c)).toEqual(['(0, 0)']);
    // Now it is the pointer's hover: leaving ends it.
    fire(c, 'pointerleave', 700, 500);
    expect(log.map((l) => l.name)).toEqual(['hover', 'hover', 'unhover']);
    expect(labels(c)).toEqual([]);
  });

  it('survives a press elsewhere on the page after a tap', async () => {
    const c = await chart([DOTS]);
    const touch = { pointerType: 'touch' };
    // A tap hovers its point and starts watching for presses off the chart.
    fire(c, 'pointerdown', cx(5), cy(50), touch);
    fire(c, 'pointerup', cx(5), cy(50), touch);
    expect(labels(c)).toEqual(['(5, 50)']);
    c.hover([{ curveNumber: 0, pointNumber: 2 }]);
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(labels(c)).toEqual(['(10, 100)']);
  });
});

describe("the app's hover across pipeline runs", () => {
  it('is redrawn at the point’s new position, without a second hover event', async () => {
    const c = await chart([DOTS]);
    const log = record(c, 'hover', 'unhover');
    c.hover([{ curveNumber: 0, pointNumber: 1 }]);
    const before = Number.parseFloat(shown(c)[0]?.style.left ?? '');
    // x = 5 moves from the middle of the axis to its first quarter: 145 px to the left.
    await c.relayout({ 'xaxis.range': [0, 20] });
    const after = Number.parseFloat(shown(c)[0]?.style.left ?? '');
    expect(after - before).toBe(-145);
    expect(labels(c)).toEqual(['(5, 50)']);
    expect(log.map((l) => l.name)).toEqual(['hover']);
  });

  it('ends with unhover when its point is gone from the new data', async () => {
    const c = await chart([DOTS]);
    const log = record(c, 'hover', 'unhover');
    c.hover([{ curveNumber: 0, pointNumber: 2 }]);
    await c.restyle({ x: [[0, 5]], y: [[0, 50]] });
    expect(log.map((l) => l.name)).toEqual(['hover', 'unhover']);
    expect(labels(c)).toEqual([]);
  });

  it('gives way to the pointer when the pointer is over the chart', async () => {
    const c = await chart([DOTS]);
    const log = record(c, 'hover');
    fire(c, 'pointermove', cx(0) + 3, cy(0) - 3);
    frame();
    c.hover([{ curveNumber: 0, pointNumber: 2 }]);
    expect(labels(c)).toEqual(['(10, 100)']);
    await c.relayout({ 'xaxis.range': [0, 20] });
    // Dropped at once; the pointer's point is hovered again on the next frame.
    expect(labels(c)).toEqual([]);
    frame();
    expect(labels(c)).toEqual(['(0, 0)']);
    expect(log.map((l) => numbers(l.payload))).toEqual([[0], [2], [0]]);
  });
});

describe('refreshHover', () => {
  /**
   * A dots-like trace whose hover answers arrive late, like a GPU pick: nothing until `ready`, then
   * the point with `text` as its label.
   */
  function lazy(state: { ready: boolean; text: string }): TraceModule {
    const dots = createDotsModule(createLog());
    return {
      ...dots,
      type: 'lazy',
      hoverPoints(calc, trace, q, ctx) {
        if (!state.ready) return [];
        type Calc = Parameters<NonNullable<typeof dots.hoverPoints>>[0];
        return (dots.hoverPoints?.(calc as Calc, trace, q, ctx) ?? []).map((p) => ({
          ...p,
          hoverText: state.text,
        }));
      },
    } as TraceModule;
  }
  const LAZY = { ...DOTS, type: 'lazy' };

  it('hovers again where the pointer is on the next frame, once the answer is there', async () => {
    const state = { ready: false, text: 'first' };
    t.registry.register(lazy(state));
    const c = await chart([LAZY]);
    const log = record(c, 'hover');
    fire(c, 'pointermove', cx(5), cy(50));
    frame();
    expect(log).toEqual([]);
    state.ready = true;
    // The pointer has not moved: nothing asks again by itself.
    frame();
    expect(log).toEqual([]);
    c.refreshHover();
    expect(log).toEqual([]);
    frame();
    expect(numbers(log[0]?.payload)).toEqual([1]);
    expect(labels(c)).toEqual(['first']);
  });

  it('redraws the label of the same point without a new hover event', async () => {
    const state = { ready: true, text: 'first' };
    t.registry.register(lazy(state));
    const c = await chart([LAZY]);
    const log = record(c, 'hover', 'unhover');
    fire(c, 'pointermove', cx(5), cy(50));
    frame();
    expect(labels(c)).toEqual(['first']);
    state.text = 'second';
    c.refreshHover();
    frame();
    expect(labels(c)).toEqual(['second']);
    expect(log.map((l) => l.name)).toEqual(['hover']);
  });

  it('does nothing while the pointer is away', async () => {
    const state = { ready: false, text: 'first' };
    t.registry.register(lazy(state));
    const c = await chart([LAZY]);
    const log = record(c, 'hover');
    fire(c, 'pointermove', cx(5), cy(50));
    frame();
    fire(c, 'pointerleave', 700, 500);
    state.ready = true;
    c.refreshHover();
    frame();
    expect(log).toEqual([]);
    expect(labels(c)).toEqual([]);
  });

  it('does nothing during a drag', async () => {
    const state = { ready: false, text: 'first' };
    t.registry.register(lazy(state));
    const c = await chart([LAZY]);
    const log = record(c, 'hover');
    fire(c, 'pointerdown', cx(4), cy(40));
    fire(c, 'pointermove', cx(5), cy(50));
    frame();
    state.ready = true;
    c.refreshHover();
    frame();
    expect(log).toEqual([]);
    expect(labels(c)).toEqual([]);
  });

  it("does not replace the app's hover", async () => {
    const state = { ready: true, text: 'first' };
    t.registry.register(lazy(state));
    const c = await chart([LAZY]);
    const log = record(c, 'hover');
    fire(c, 'pointermove', cx(5), cy(50));
    frame();
    c.hover([{ curveNumber: 0, pointNumber: 2 }]);
    c.refreshHover();
    frame();
    expect(log.map((l) => numbers(l.payload))).toEqual([[1], [2]]);
  });
});
