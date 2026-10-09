// @vitest-environment jsdom
/**
 * Drags on the axis strips beside a subplot (an end scales that end, the middle pans the axis),
 * drags that must move nothing (fixed axes, `dragmode: false`), a cancelled pan, and overlaid axes.
 * Same figure as `interaction.test.ts`: 640×400, margins l 40, r 20, t 30, b 50, so the plot area
 * is x 40–620, y 30–350 (580 × 320 px); with x in [0, 10] and y in [0, 100], data (x, y) sits at
 * container (40 + 58·x, 350 − 3.2·y). The x axis strip is the 30 px below the plot, the y axis strip
 * the 30 px left of it, and the outer 15 % of a strip is an "end".
 */
import type { FigureInput } from '@mk7s/holochart-core';
import * as fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChart, type Chart } from '../chart.ts';
import type { ChartEventName } from '../events.ts';
import { setup, type TestSetup } from '../__testing__/fakes.ts';

const MARGIN = { l: 40, r: 20, t: 30, b: 50 };
const RANGES = { xaxis: { range: [0, 10] }, yaxis: { range: [0, 100] } };
const DOTS = { type: 'dots', x: [0, 5, 10], y: [0, 50, 100] };

const cx = (x: number): number => 40 + 58 * x;
const cy = (y: number): number => 350 - 3.2 * y;
/** A y inside the x axis strip, and an x inside the y axis strip. */
const X_STRIP = 365;
const Y_STRIP = 25;

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

function frame(): void {
  t.scheduler.step();
}

async function drag(c: Chart, from: [number, number], to: [number, number]): Promise<void> {
  fire(c, 'pointerdown', from[0], from[1]);
  fire(c, 'pointermove', (from[0] + to[0]) / 2, (from[1] + to[1]) / 2);
  frame();
  fire(c, 'pointermove', to[0], to[1]);
  frame();
  fire(c, 'pointerup', to[0], to[1]);
  await c.relayout({});
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

/** The linear value drawn at `px` from the `range[0]` end of an axis `length` px long. */
function valueAt(r: readonly [number, number], px: number, length: number): number {
  return r[0] + (px / length) * (r[1] - r[0]);
}

describe('axis-end drags', () => {
  it('at the range[0] end of x: range[1] stays and the grabbed value follows the pointer', async () => {
    const c = await chart([DOTS]);
    // Grab the value 1 (in the left 15 % of the strip) and drag it to where 2 was.
    await drag(c, [cx(1), X_STRIP], [cx(2), X_STRIP]);
    const x = range(c, 'x');
    expect(x[1]).toBeCloseTo(10);
    expect(valueAt(x, cx(2) - 40, 580)).toBeCloseTo(1);
    // The range grew at the dragged end: 9 units now span 464 px instead of 522.
    expect(x[0]).toBeCloseTo(-1.25);
    expect(range(c, 'y')).toEqual([0, 100]);
  });

  it('at the range[1] end of y: range[0] stays and the grabbed value follows the pointer', async () => {
    const c = await chart([DOTS]);
    // Grab 90 (top 15 % of the strip) and drag it up to the top of the plot, where 100 was.
    await drag(c, [Y_STRIP, cy(90)], [Y_STRIP, cy(100)]);
    const y = range(c, 'y');
    expect(y[0]).toBeCloseTo(0);
    expect(y[1]).toBeCloseTo(90);
    expect(range(c, 'x')).toEqual([0, 10]);
  });

  it('at the range[0] end of y: range[1] stays and the grabbed value follows the pointer', async () => {
    const c = await chart([DOTS]);
    await drag(c, [Y_STRIP, cy(10)], [Y_STRIP, cy(20)]);
    const y = range(c, 'y');
    expect(y[1]).toBeCloseTo(100);
    expect(valueAt(y, 350 - cy(20), 320)).toBeCloseTo(10);
    expect(range(c, 'x')).toEqual([0, 10]);
  });

  it('keep the other end and put the grabbed value under the pointer, wherever it goes (property)', async () => {
    const c = await chart([DOTS]);
    const end = fc.constantFrom('start' as const, 'end' as const);
    fc.assert(
      fc.property(
        end,
        fc.integer({ min: 0, max: 86 }),
        fc.integer({ min: -100, max: 740 }),
        (which, inset, to) => {
          // A press inside the end zone (87 px wide), `inset` px from the plot edge.
          const from = which === 'start' ? 40 + inset : 620 - inset;
          fc.pre(Math.abs(to - from) > 3); // within 3 px it is a click
          fire(c, 'pointerdown', from, X_STRIP);
          fire(c, 'pointermove', to, X_STRIP);
          frame();
          const r = range(c, 'x');
          const grabbed = (from - 40) / 58;
          // Distance (px) of the pointer from the end that stays put.
          const reach = which === 'start' ? 620 - to : to - 40;
          expect(which === 'start' ? r[1] : r[0]).toBe(which === 'start' ? 10 : 0);
          // The axis never collapses or flips, even with the pointer dragged past the kept end.
          expect(r[1]).toBeGreaterThan(r[0]);
          expect(Number.isFinite(r[0]) && Number.isFinite(r[1])).toBe(true);
          if (reach >= 5) expect(valueAt(r, to - 40, 580)).toBeCloseTo(grabbed, 6);
          // A cancelled drag puts the previewed range back.
          fire(c, 'pointercancel', to, X_STRIP);
          expect(range(c, 'x')).toEqual([0, 10]);
        },
      ),
    );
  });
});

describe('axis-middle drags', () => {
  it('pan the x axis alone, whatever the pointer does vertically', async () => {
    const c = await chart([DOTS]);
    const log = record(c, 'relayout');
    // One x unit to the right, and well up into the plot area.
    await drag(c, [cx(5), X_STRIP], [cx(6), cy(50)]);
    const x = range(c, 'x');
    expect(x[0]).toBeCloseTo(-1);
    expect(x[1]).toBeCloseTo(9);
    expect(range(c, 'y')).toEqual([0, 100]);
    expect(log).toEqual(['relayout']);
  });
});

describe('drags that must move nothing', () => {
  it('leave a fixedrange axis alone on its strip, middle and ends', async () => {
    const c = await chart([DOTS], { xaxis: { range: [0, 10], fixedrange: true } });
    const log = record(c, 'relayout', 'relayouting');
    await drag(c, [cx(5), X_STRIP], [cx(7), X_STRIP]);
    await drag(c, [cx(9.5), X_STRIP], [cx(7), X_STRIP]);
    expect(range(c, 'x')).toEqual([0, 10]);
    expect(log).toEqual([]);
    // The other axis still drags.
    await drag(c, [Y_STRIP, cy(50)], [Y_STRIP, cy(60)]);
    expect(range(c, 'y')[0]).toBeCloseTo(-10);
  });

  it('pan nothing when both axes of the subplot are fixed', async () => {
    const c = await chart([DOTS], {
      dragmode: 'pan',
      xaxis: { range: [0, 10], fixedrange: true },
      yaxis: { range: [0, 100], fixedrange: true },
    });
    const log = record(c, 'relayout', 'relayouting');
    await drag(c, [cx(5), cy(50)], [cx(7), cy(70)]);
    expect(log).toEqual([]);
    expect(range(c, 'x')).toEqual([0, 10]);
    expect(range(c, 'y')).toEqual([0, 100]);
  });

  it('neither zoom nor drag axes with dragmode false', async () => {
    const c = await chart([DOTS], { dragmode: false });
    const log = record(c, 'relayout', 'relayouting');
    fire(c, 'pointerdown', cx(2), cy(80));
    fire(c, 'pointermove', cx(4), cy(20));
    frame();
    // No zoom box either.
    const overlay = c.element.querySelector<SVGElement>('.holochart-dragoverlay');
    expect(overlay === null || overlay.style.display === 'none').toBe(true);
    fire(c, 'pointerup', cx(4), cy(20));
    await drag(c, [cx(5), X_STRIP], [cx(7), X_STRIP]);
    await drag(c, [Y_STRIP, cy(90)], [Y_STRIP, cy(100)]);
    expect(log).toEqual([]);
    expect(range(c, 'x')).toEqual([0, 10]);
    expect(range(c, 'y')).toEqual([0, 100]);
  });
});

describe('a cancelled pan', () => {
  it('puts the previewed ranges back and commits nothing', async () => {
    const c = await chart([DOTS], { dragmode: 'pan' });
    const log = record(c, 'relayout');
    fire(c, 'pointerdown', cx(5), cy(50));
    // (5, 50) dragged to where (6, 60) was: both ranges start one step lower.
    fire(c, 'pointermove', cx(6), cy(60));
    frame();
    expect(range(c, 'x')[0]).toBeCloseTo(-1);
    expect(range(c, 'y')[0]).toBeCloseTo(-10);
    fire(c, 'pointercancel', cx(6), cy(60));
    expect(range(c, 'x')).toEqual([0, 10]);
    expect(range(c, 'y')).toEqual([0, 100]);
    await c.relayout({});
    expect(log).toEqual([]);
    expect(c.layout['xaxis']).toEqual({ range: [0, 10] });
  });
});

describe('overlaid axes', () => {
  const OVERLAID = [
    { type: 'dots', x: [0, 10], y: [0, 100] },
    { type: 'dots', x: [0, 10], y: [0, 1], yaxis: 'y2' },
  ];
  const Y2 = { yaxis2: { overlaying: 'y', side: 'right', range: [0, 1] } };

  it('pan together from the plot area, each by its own scale', async () => {
    const c = await chart(OVERLAID, { ...Y2, dragmode: 'pan' });
    // Down by a tenth of the plot height: both y axes show a tenth of their span more at the top.
    await drag(c, [cx(5), cy(50)], [cx(5), cy(50) + 32]);
    const y = range(c, 'y');
    const y2 = range(c, 'y2');
    expect(y[0]).toBeCloseTo(10);
    expect(y[1]).toBeCloseTo(110);
    expect(y2[0]).toBeCloseTo(0.1);
    expect(y2[1]).toBeCloseTo(1.1);
  });

  it('move alone from an axis strip: the overlay stays', async () => {
    const c = await chart(OVERLAID, Y2);
    await drag(c, [Y_STRIP, cy(50)], [Y_STRIP, cy(50) + 32]);
    expect(range(c, 'y')[0]).toBeCloseTo(10);
    expect(range(c, 'y2')).toEqual([0, 1]);
  });

  it('leave a fixed overlay out of a plot-area pan', async () => {
    const c = await chart(OVERLAID, {
      yaxis2: { ...Y2.yaxis2, fixedrange: true },
      dragmode: 'pan',
    });
    await drag(c, [cx(5), cy(50)], [cx(5), cy(50) + 32]);
    expect(range(c, 'y')[0]).toBeCloseTo(10);
    expect(range(c, 'y2')).toEqual([0, 1]);
  });
});
