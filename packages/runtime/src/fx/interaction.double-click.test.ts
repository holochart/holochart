// @vitest-environment jsdom
/**
 * Double clicks: `config.doubleClick` and `config.doubleClickDelay`, where on the chart a double
 * click counts, and component views that take the click or the double click before the chart.
 * Same figure as `interaction.test.ts`: 640×400, margins l 40, r 20, t 30, b 50, so the plot area
 * is x 40–620, y 30–350; with x in [0, 10] and y in [0, 100], data (x, y) sits at container
 * (40 + 58·x, 350 − 3.2·y).
 */
import type { FigureInput } from '@mk7s/holochart-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChart, type Chart } from '../chart.ts';
import type { ComponentModule, ComponentPointerEvent } from '../contracts.ts';
import type { ChartEventName } from '../events.ts';
import { setup, type TestSetup } from '../__testing__/fakes.ts';

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

async function chart(
  data: unknown[],
  config: Record<string, unknown> = {},
  s: TestSetup = t,
): Promise<Chart> {
  const c = createChart(
    s.container,
    { data, layout: { margin: MARGIN, ...RANGES }, config } as FigureInput,
    s.options,
  );
  charts.push(c);
  await c.ready;
  return c;
}

/**
 * A press and release at one place. `time` (ms) is the release's `timeStamp`, which the chart
 * pairs clicks by; without it the events carry the time they were created at.
 */
function click(c: Chart, x: number, y: number, time?: number): void {
  for (const type of ['pointerdown', 'pointerup']) {
    const e = new PointerEvent(type, {
      clientX: x,
      clientY: y,
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      bubbles: true,
    });
    if (time !== undefined) Object.defineProperty(e, 'timeStamp', { value: time });
    c.three.root.canvas.dispatchEvent(e);
  }
}

function record(c: Chart, ...names: ChartEventName[]): string[] {
  const log: string[] = [];
  for (const name of names) c.on(name, () => void log.push(name));
  return log;
}

function range(c: Chart, id: string): [number, number] {
  const r = c.axes.get(id)?.scale.range;
  if (!r) throw new Error(`no axis ${id}`);
  return [r[0], r[1]];
}

/** A component whose view handles the events `takes` says, recording the types it handled. */
function component(
  takes: (e: ComponentPointerEvent) => boolean,
  seen: string[] = [],
): ComponentModule {
  return {
    name: 'taker-test',
    draw: {
      create: () => ({
        update: () => undefined,
        handlePointer(e) {
          const mine = takes(e);
          if (mine) seen.push(e.type);
          return mine;
        },
      }),
    },
  };
}

describe('config.doubleClick', () => {
  it('false keeps the view: doubleclick is still emitted for the app to act on', async () => {
    const c = await chart([DOTS], { doubleClick: false });
    await c.relayout({ 'xaxis.range': [2, 3] });
    const log = record(c, 'doubleclick', 'relayout');
    click(c, cx(1), cy(1));
    click(c, cx(1), cy(1));
    await c.relayout({});
    expect(log).toEqual(['doubleclick']);
    expect(range(c, 'x')).toEqual([2, 3]);
  });
});

describe('config.doubleClickDelay', () => {
  it('pairs two clicks only when the second comes within the delay', async () => {
    const c = await chart([DOTS]);
    const log = record(c, 'doubleclick');
    // The default delay is 300 ms.
    click(c, cx(1), cy(1), 1000);
    click(c, cx(1), cy(1), 1400);
    expect(log).toEqual([]);
    // The late click starts a new pair.
    click(c, cx(1), cy(1), 1600);
    expect(log).toEqual(['doubleclick']);
    // A double click is used up: a third click does not pair with its second one.
    click(c, cx(1), cy(1), 1700);
    expect(log).toEqual(['doubleclick']);
  });

  it('follows the configured delay', async () => {
    const c = await chart([DOTS], { doubleClickDelay: 500 });
    const log = record(c, 'doubleclick');
    click(c, cx(1), cy(1), 1000);
    click(c, cx(1), cy(1), 1400);
    expect(log).toEqual(['doubleclick']);
  });
});

describe('where a double click counts', () => {
  it('not in the margins, outside the plot area and the axis strips', async () => {
    const c = await chart([DOTS]);
    await c.relayout({ 'xaxis.range': [2, 3] });
    const log = record(c, 'doubleclick', 'relayout');
    // The top-right corner of the figure.
    click(c, 632, 10);
    click(c, 632, 10);
    await c.relayout({});
    expect(log).toEqual([]);
    expect(range(c, 'x')).toEqual([2, 3]);
  });
});

describe('components before the chart', () => {
  it('a view that takes the click keeps the chart from reporting the point under it', async () => {
    // Takes clicks over the left half only; presses and moves stay the chart's.
    const s = setup({
      width: 640,
      height: 400,
      components: [component((e) => e.type === 'click' && e.x < 330)],
    });
    t = s;
    const c = await chart([{ ...DOTS, x: [2, 5, 8] }], {}, s);
    const log = record(c, 'click');
    click(c, cx(2), cy(0));
    expect(log).toEqual([]);
    click(c, cx(8), cy(100));
    expect(log).toEqual(['click']);
  });

  it('a view that takes the double click keeps the chart from resetting the view', async () => {
    const seen: string[] = [];
    const s = setup({
      width: 640,
      height: 400,
      components: [component((e) => e.type === 'dblclick', seen)],
    });
    t = s;
    const c = await chart([DOTS], {}, s);
    await c.relayout({ 'xaxis.range': [2, 3] });
    const log = record(c, 'doubleclick', 'relayout');
    click(c, cx(1), cy(1));
    click(c, cx(1), cy(1));
    await c.relayout({});
    expect(seen).toEqual(['dblclick']);
    expect(log).toEqual([]);
    expect(range(c, 'x')).toEqual([2, 3]);
  });

  it('a view that owns the press gets click, then dblclick on the second one', async () => {
    const seen: string[] = [];
    // Owns everything in the top-right corner, as a legend would.
    const s = setup({
      width: 640,
      height: 400,
      components: [component((e) => e.x > 560 && e.y < 60, seen)],
    });
    t = s;
    const c = await chart([DOTS], {}, s);
    await c.relayout({ 'xaxis.range': [2, 3] });
    const log = record(c, 'click', 'doubleclick', 'relayout');
    click(c, 600, 40);
    expect(seen).toEqual(['down', 'up', 'click']);
    click(c, 600, 40);
    await c.relayout({});
    expect(seen).toEqual(['down', 'up', 'click', 'down', 'up', 'click', 'dblclick']);
    // The chart itself does nothing with it.
    expect(log).toEqual([]);
    expect(range(c, 'x')).toEqual([2, 3]);
  });
});
