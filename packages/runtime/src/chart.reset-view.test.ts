// @vitest-environment jsdom
/**
 * Getting back to a view: `resetAxes` (each axis' state at the first draw), `autoscale`, the
 * plot-area double-click (`config.doubleClick: 'reset+autosize'`), and what `fixedrange` axes are
 * spared from. Also `previewRanges` / `commitRanges` given axes or ranges they cannot use.
 * The container is 640×400 with margins l 40, r 20, t 30, b 50: plot area x 40–620, y 30–350.
 */
import type { FigureInput } from '@mk7s/holochart-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createChart, type Chart } from './chart.ts';
import { setup, type TestSetup } from './__testing__/fakes.ts';

const MARGIN = { l: 40, r: 20, t: 30, b: 50 };
const DOTS = { type: 'dots', x: [0, 10], y: [0, 100], size: 0 };

let t: TestSetup;
let charts: Chart[] = [];

beforeEach(() => {
  t = setup({ width: 640, height: 400 });
});

afterEach(() => {
  for (const c of charts) c.destroy();
  charts = [];
  t.container.remove();
});

async function chart(
  layout: Record<string, unknown> = {},
  config?: Record<string, unknown>,
): Promise<Chart> {
  const figure = {
    data: [DOTS],
    layout: { margin: MARGIN, ...layout },
    ...(config ? { config } : {}),
  } as FigureInput;
  const c = createChart(t.container, figure, t.options);
  charts.push(c);
  await c.ready;
  return c;
}

function range(c: Chart, id: string): number[] {
  return [...(c.axes.get(id)?.scale.range ?? [])];
}

function relayouts(c: Chart): Record<string, unknown>[] {
  const seen: Record<string, unknown>[] = [];
  c.on('relayout', (e) => void seen.push(e as Record<string, unknown>));
  return seen;
}

let clock = 1000;

/** A press and release at one point; `at` is the events' timestamp (ms). */
function click(c: Chart, x: number, y: number, at: number): void {
  for (const type of ['pointerdown', 'pointerup']) {
    const event = new PointerEvent(type, {
      clientX: x,
      clientY: y,
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      bubbles: true,
    });
    Object.defineProperty(event, 'timeStamp', { value: at });
    c.three.root.canvas.dispatchEvent(event);
  }
}

/** Two clicks 50 ms apart in the middle of the plot area, then the update they caused. */
async function doubleClick(c: Chart): Promise<void> {
  clock += 10_000;
  click(c, 330, 190, clock);
  click(c, 330, 190, clock + 50);
  await c.relayout({});
}

describe('resetAxes', () => {
  it('returns an axis that started with a range to it, and an autoranged one to autorange', async () => {
    const c = await chart({ xaxis: { range: [2, 8] } });
    const initialY = range(c, 'y');
    await c.relayout({ 'xaxis.range': [3, 4], 'yaxis.range': [40, 60] });
    const seen = relayouts(c);
    await c.resetAxes();
    expect(range(c, 'x')).toEqual([2, 8]);
    expect(range(c, 'y')).toEqual(initialY);
    expect(seen).toEqual([
      {
        'xaxis.range': [2, 8],
        'xaxis.autorange': false,
        'yaxis.range': null,
        'yaxis.autorange': true,
      },
    ]);
    expect(c.layout['xaxis']).toEqual({ range: [2, 8], autorange: false });
  });

  it("restores the autorange mode the axis started with ('reversed')", async () => {
    const c = await chart({ yaxis: { autorange: 'reversed' } });
    const initial = range(c, 'y') as [number, number];
    // Reversed: the range runs from the top value down.
    expect(initial[0]).toBeGreaterThan(initial[1]);
    await c.relayout({ 'yaxis.range': [20, 30] });
    expect(range(c, 'y')).toEqual([20, 30]);
    await c.resetAxes();
    expect(c.fullLayout?.['yaxis']).toMatchObject({ autorange: 'reversed' });
    expect(range(c, 'y')).toEqual(initial);
  });
});

describe('autoscale', () => {
  it('autoranges every axis, including one that started with a range', async () => {
    const c = await chart({ xaxis: { range: [2, 8] } });
    await c.autoscale();
    const [x0, x1] = range(c, 'x') as [number, number];
    expect(x0).toBeLessThanOrEqual(0);
    expect(x1).toBeGreaterThanOrEqual(10);
    expect(c.fullLayout?.['xaxis']).toMatchObject({ autorange: true });
    // resetAxes still knows where the axis started.
    await c.resetAxes();
    expect(range(c, 'x')).toEqual([2, 8]);
  });
});

describe('fixedrange axes', () => {
  it('are left alone by zoom, autoscale and resetAxes, while the other axis follows', async () => {
    const c = await chart({
      xaxis: { range: [2, 8], fixedrange: true },
      yaxis: { range: [0, 100] },
    });
    const seen = relayouts(c);
    await c.zoom(0.5);
    expect(range(c, 'x')).toEqual([2, 8]);
    expect(range(c, 'y')).toEqual([25, 75]);
    await c.autoscale();
    expect(range(c, 'x')).toEqual([2, 8]);
    await c.resetAxes();
    expect(range(c, 'x')).toEqual([2, 8]);
    expect(range(c, 'y')).toEqual([0, 100]);
    // None of the three updates named the fixed axis.
    expect(seen).toHaveLength(3);
    expect(seen.flatMap((e) => Object.keys(e)).filter((k) => k.startsWith('xaxis'))).toEqual([]);
  });
});

describe("double-click on the plot area (doubleClick: 'reset+autosize')", () => {
  it('resets a changed view, and autoranges when the view is already the initial one', async () => {
    const c = await chart({ xaxis: { range: [2, 8] } });
    const doubles: unknown[] = [];
    c.on('doubleclick', (e) => void doubles.push(e));
    await c.relayout({ 'xaxis.range': [3, 4] });

    // Away from the initial view: back to it.
    await doubleClick(c);
    expect(range(c, 'x')).toEqual([2, 8]);
    expect(c.fullLayout?.['xaxis']).toMatchObject({ autorange: false });

    // At the initial view: autorange instead.
    await doubleClick(c);
    const [x0, x1] = range(c, 'x') as [number, number];
    expect(x0).toBeLessThanOrEqual(0);
    expect(x1).toBeGreaterThanOrEqual(10);
    expect(c.fullLayout?.['xaxis']).toMatchObject({ autorange: true });

    // And from there (no longer the initial view) back to the initial range.
    await doubleClick(c);
    expect(range(c, 'x')).toEqual([2, 8]);
    expect(doubles).toHaveLength(3);
  });

  it("only autoranges with doubleClick: 'autosize'", async () => {
    const c = await chart({ xaxis: { range: [2, 8] } }, { doubleClick: 'autosize' });
    await c.relayout({ 'xaxis.range': [3, 4] });
    await doubleClick(c);
    const [x0, x1] = range(c, 'x') as [number, number];
    expect(x0).toBeLessThanOrEqual(0);
    expect(x1).toBeGreaterThanOrEqual(10);
  });

  it("only resets with doubleClick: 'reset', even at the initial view", async () => {
    const c = await chart({ xaxis: { range: [2, 8] } }, { doubleClick: 'reset' });
    await doubleClick(c);
    expect(range(c, 'x')).toEqual([2, 8]);
    expect(c.fullLayout?.['xaxis']).toMatchObject({ autorange: false });
  });

  it('does nothing with doubleClick: false, apart from the event', async () => {
    const c = await chart({ xaxis: { range: [2, 8] } }, { doubleClick: false });
    await c.relayout({ 'xaxis.range': [3, 4] });
    const seen = relayouts(c);
    const doubles: unknown[] = [];
    c.on('doubleclick', (e) => void doubles.push(e));
    await doubleClick(c);
    expect(range(c, 'x')).toEqual([3, 4]);
    expect(seen).toEqual([]);
    expect(doubles).toHaveLength(1);
  });
});

describe('previewRanges / commitRanges with unusable input', () => {
  it('previews only the axes that exist and have finite ranges', async () => {
    const c = await chart({ xaxis: { range: [0, 10] }, yaxis: { range: [0, 100] } });
    const relayouting: unknown[] = [];
    c.on('relayouting', (e) => void relayouting.push(e));
    t.log.updates.length = 0;

    c.previewRanges({ x9: [0, 1], x: [Number.NaN, 5], y: [0, Number.POSITIVE_INFINITY] });
    expect(relayouting).toEqual([]);
    expect(t.log.updates).toEqual([]);
    expect(range(c, 'x')).toEqual([0, 10]);
    expect(range(c, 'y')).toEqual([0, 100]);

    c.previewRanges({ x9: [0, 1], x: [Number.NaN, 5], y: [20, 40] });
    expect(relayouting).toEqual([{ 'yaxis.range[0]': 20, 'yaxis.range[1]': 40 }]);
    expect(range(c, 'x')).toEqual([0, 10]);
    expect(range(c, 'y')).toEqual([20, 40]);
  });

  it('commits nothing, and emits no relayout, when no range is usable', async () => {
    const c = await chart({ xaxis: { range: [0, 10] } });
    const seen = relayouts(c);
    const before = c.layout;
    await expect(c.commitRanges({ x9: [0, 1], x: [0, Number.NaN] })).resolves.toBe(c);
    expect(seen).toEqual([]);
    expect(c.layout).toBe(before);
    expect(range(c, 'x')).toEqual([0, 10]);
  });
});
