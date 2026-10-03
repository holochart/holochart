// @vitest-environment jsdom
/**
 * Scroll zoom (`config.scrollZoom`): which axes the wheel zooms depending on where the cursor is,
 * wheel units, and the single commit once the wheel rests. Same figure as `interaction.test.ts`:
 * 640×400, margins l 40, r 20, t 30, b 50, so the plot area is x 40–620, y 30–350; with x in
 * [0, 10] and y in [0, 100], data (x, y) sits at container (40 + 58·x, 350 − 3.2·y). The x axis
 * strip is the 30 px below the plot, the y axis strip the 30 px left of it.
 *
 * A wheel step zooms by `exp(delta / 200)` with `delta` in px, limited to ±20 px per event: a mouse
 * notch (≈100 px) zooms by e^±0.1, as in Plotly.
 */
import type { FigureInput } from '@mk7s/holochart-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChart, type Chart } from '../chart.ts';
import type { ChartEventName } from '../events.ts';
import { setup, type TestSetup } from '../__testing__/fakes.ts';

const MARGIN = { l: 40, r: 20, t: 30, b: 50 };
const RANGES = { xaxis: { range: [0, 10] }, yaxis: { range: [0, 100] } };
const DOTS = { type: 'dots', x: [0, 5, 10], y: [0, 50, 100] };

const cx = (x: number): number => 40 + 58 * x;
const cy = (y: number): number => 350 - 3.2 * y;
const X_STRIP = 365;
const Y_STRIP = 25;
/** Zoom factor of one notch in. */
const NOTCH = Math.exp(-0.1);

let t: TestSetup;
let charts: Chart[] = [];

beforeEach(() => {
  t = setup({ width: 640, height: 400 });
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});

afterEach(() => {
  for (const c of charts) c.destroy();
  charts = [];
  vi.restoreAllMocks();
  vi.useRealTimers();
});

async function chart(data: unknown[], layout: Record<string, unknown> = {}): Promise<Chart> {
  const c = createChart(
    t.container,
    {
      data,
      layout: { margin: MARGIN, ...RANGES, ...layout },
      config: { scrollZoom: true },
    } as FigureInput,
    t.options,
  );
  charts.push(c);
  await c.ready;
  return c;
}

function wheel(c: Chart, x: number, y: number, init: WheelEventInit = {}): WheelEvent {
  const e = new WheelEvent('wheel', {
    clientX: x,
    clientY: y,
    deltaY: -20,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  c.three.root.canvas.dispatchEvent(e);
  return e;
}

function record(c: Chart, ...names: ChartEventName[]): { name: string; payload: unknown }[] {
  const log: { name: string; payload: unknown }[] = [];
  for (const name of names) c.on(name, (payload: unknown) => void log.push({ name, payload }));
  return log;
}

function range(c: Chart, id: string): [number, number] {
  const r = c.axes.get(id)?.scale.range;
  if (!r) throw new Error(`no axis ${id}`);
  return [r[0], r[1]];
}

describe('where the wheel zooms', () => {
  it('zooms only x on the x axis strip, around the value under the cursor', async () => {
    const c = await chart([DOTS]);
    const e = wheel(c, cx(2), X_STRIP);
    expect(e.defaultPrevented).toBe(true);
    const x = range(c, 'x');
    // 2 stays under the cursor; the spans on either side shrink by the notch factor.
    expect(x[0]).toBeCloseTo(2 - 2 * NOTCH);
    expect(x[1]).toBeCloseTo(2 + 8 * NOTCH);
    expect(range(c, 'y')).toEqual([0, 100]);
  });

  it('zooms only y on the y axis strip, around the value under the cursor', async () => {
    const c = await chart([DOTS]);
    wheel(c, Y_STRIP, cy(25));
    const y = range(c, 'y');
    expect(y[0]).toBeCloseTo(25 - 25 * NOTCH);
    expect(y[1]).toBeCloseTo(25 + 75 * NOTCH);
    expect(range(c, 'x')).toEqual([0, 10]);
  });

  it('leaves the wheel to the page outside the plot and the axis strips', async () => {
    const c = await chart([DOTS]);
    const log = record(c, 'relayouting');
    // The right margin.
    const e = wheel(c, 632, cy(50));
    expect(e.defaultPrevented).toBe(false);
    expect(log).toEqual([]);
    expect(range(c, 'x')).toEqual([0, 10]);
    expect(range(c, 'y')).toEqual([0, 100]);
  });

  it('skips fixedrange axes: over the plot only the free axis zooms', async () => {
    const c = await chart([DOTS], { xaxis: { range: [0, 10], fixedrange: true } });
    const log = record(c, 'relayouting');
    wheel(c, cx(5), cy(50));
    expect(range(c, 'x')).toEqual([0, 10]);
    expect(range(c, 'y')[0]).toBeCloseTo(50 - 50 * NOTCH);
    expect(Object.keys(log[0]?.payload as object).sort()).toEqual([
      'yaxis.range[0]',
      'yaxis.range[1]',
    ]);
  });

  it('reports and commits nothing when every axis under the cursor is fixed', async () => {
    const c = await chart([DOTS], {
      xaxis: { range: [0, 10], fixedrange: true },
      yaxis: { range: [0, 100], fixedrange: true },
    });
    const log = record(c, 'relayouting', 'relayout');
    wheel(c, cx(5), cy(50));
    vi.advanceTimersByTime(400);
    await c.relayout({});
    expect(log).toEqual([]);
    expect(range(c, 'x')).toEqual([0, 10]);
    expect(range(c, 'y')).toEqual([0, 100]);
  });

  it('zooms the axes overlaid on the plot with it', async () => {
    const c = await chart(
      [
        { type: 'dots', x: [0, 10], y: [0, 100] },
        { type: 'dots', x: [0, 10], y: [0, 1], yaxis: 'y2' },
      ],
      { yaxis2: { overlaying: 'y', side: 'right', range: [0, 1] } },
    );
    wheel(c, cx(5), cy(50));
    expect(range(c, 'y')[0]).toBeCloseTo(50 - 50 * NOTCH);
    // The same pixel is 0.5 on the overlay.
    expect(range(c, 'y2')[0]).toBeCloseTo(0.5 - 0.5 * NOTCH);
    expect(range(c, 'y2')[1]).toBeCloseTo(0.5 + 0.5 * NOTCH);
  });
});

describe('wheel units', () => {
  /** The zoom factor a wheel event applied: the new x span over the old one. */
  async function factorOf(init: WheelEventInit): Promise<number> {
    const c = await chart([DOTS]);
    wheel(c, cx(5), cy(50), init);
    const [x0, x1] = range(c, 'x');
    c.destroy();
    return (x1 - x0) / 10;
  }

  it('counts a line as 40 px and a page as 800 px', async () => {
    // Pixels: 10 px is half the per-event limit.
    expect(await factorOf({ deltaY: 10, deltaMode: 0 })).toBeCloseTo(Math.exp(10 / 200));
    // A quarter of a line is those same 10 px.
    expect(await factorOf({ deltaY: 0.25, deltaMode: 1 })).toBeCloseTo(Math.exp(10 / 200));
    // A hundredth of a page is 8 px.
    expect(await factorOf({ deltaY: 0.01, deltaMode: 2 })).toBeCloseTo(Math.exp(8 / 200));
  });

  it('limits one event to a notch, in either direction', async () => {
    expect(await factorOf({ deltaY: -500 })).toBeCloseTo(NOTCH);
    expect(await factorOf({ deltaY: 3, deltaMode: 1 })).toBeCloseTo(1 / NOTCH);
  });
});

describe('committing after the wheel rests', () => {
  it('previews every step, and relayouts once with the accumulated zoom', async () => {
    const c = await chart([DOTS]);
    const log = record(c, 'relayouting', 'relayout');
    wheel(c, cx(5), cy(50));
    vi.advanceTimersByTime(200);
    wheel(c, cx(5), cy(50));
    // 200 ms after the second step the first one's 300 ms are over, but the wheel only just rested.
    vi.advanceTimersByTime(200);
    await c.relayout({});
    expect(log.map((l) => l.name)).toEqual(['relayouting', 'relayouting']);
    vi.advanceTimersByTime(100);
    await c.relayout({});
    expect(log.map((l) => l.name)).toEqual(['relayouting', 'relayouting', 'relayout']);
    const e = log[2]?.payload as Record<string, number>;
    expect(e['xaxis.range[0]']).toBeCloseTo(5 - 5 * NOTCH * NOTCH);
    expect(e['xaxis.range[1]']).toBeCloseTo(5 + 5 * NOTCH * NOTCH);
    expect(e['yaxis.range[0]']).toBeCloseTo(50 - 50 * NOTCH * NOTCH);
    // The committed layout holds the zoomed range.
    const committed = (c.layout['xaxis'] as { range: number[] }).range;
    expect(committed[0]).toBeCloseTo(5 - 5 * NOTCH * NOTCH);
  });

  it('ends the hover under the cursor: the point moves away from it', async () => {
    const c = await chart([DOTS]);
    const log = record(c, 'hover', 'unhover');
    c.three.root.canvas.dispatchEvent(
      new PointerEvent('pointermove', { clientX: cx(5), clientY: cy(50), pointerType: 'mouse' }),
    );
    t.scheduler.step();
    expect(log.map((l) => l.name)).toEqual(['hover']);
    wheel(c, cx(5) + 10, cy(50));
    expect(log.map((l) => l.name)).toEqual(['hover', 'unhover']);
    expect(c.element.querySelector<HTMLElement>('.holochart-hoverlabel')?.style.display).toBe(
      'none',
    );
  });
});
