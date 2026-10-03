// @vitest-environment jsdom
/**
 * What a mouse press turns into: nothing for other buttons, a click within the click tolerance
 * (3 px), a zoom only once the drag is long enough along an axis (8 px), with the pointer captured
 * for the gesture and other pointers ignored meanwhile. Same figure as `interaction.test.ts`:
 * 640×400, margins l 40, r 20, t 30, b 50, so the plot area is x 40–620, y 30–350; with x in
 * [0, 10] and y in [0, 100], data (x, y) sits at container (40 + 58·x, 350 − 3.2·y).
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

/** The zoom box outline while it shows (`null` when hidden or never drawn). */
function zoomBox(c: Chart): string | null {
  const svg = c.element.querySelector<SVGElement>('.holochart-dragoverlay');
  if (!svg || svg.style.display === 'none') return null;
  return svg.querySelector('path')?.getAttribute('d') ?? null;
}

describe('buttons', () => {
  it('only the primary button clicks or drags', async () => {
    const c = await chart([DOTS]);
    const log = record(c, 'click', 'relayout');
    const right = { button: 2 };
    // On a point: no click.
    fire(c, 'pointerdown', cx(5), cy(50), right);
    fire(c, 'pointerup', cx(5), cy(50), right);
    // Across the plot: no zoom box, no zoom.
    fire(c, 'pointerdown', cx(2), cy(80), right);
    fire(c, 'pointermove', cx(4), cy(20), right);
    frame();
    expect(zoomBox(c)).toBeNull();
    fire(c, 'pointerup', cx(4), cy(20), right);
    await c.relayout({});
    expect(log).toEqual([]);
    expect(range(c, 'x')).toEqual([0, 10]);
    // The same press with the primary button does click.
    fire(c, 'pointerdown', cx(5), cy(50));
    fire(c, 'pointerup', cx(5), cy(50));
    expect(log).toEqual(['click']);
  });
});

describe('click or drag', () => {
  it('a press that wobbles within the click tolerance is still a click', async () => {
    const c = await chart([DOTS]);
    const log = record(c, 'click', 'relayout', 'unhover');
    fire(c, 'pointermove', cx(5), cy(50));
    frame();
    fire(c, 'pointerdown', cx(5), cy(50));
    fire(c, 'pointermove', cx(5) + 2, cy(50) - 2);
    frame();
    // Not a drag: the hover stays and no zoom box shows.
    expect(zoomBox(c)).toBeNull();
    fire(c, 'pointerup', cx(5) + 2, cy(50) - 2);
    await c.relayout({});
    expect(log).toEqual(['click']);
  });

  it('a drag too short to zoom either axis is neither a click nor a zoom', async () => {
    const c = await chart([DOTS]);
    const log = record(c, 'click', 'relayout');
    // 5 px each way from a point: past the click tolerance, under the 8 px a zoom needs.
    fire(c, 'pointerdown', cx(5), cy(50));
    fire(c, 'pointermove', cx(5) + 5, cy(50) + 5);
    frame();
    expect(zoomBox(c)).toBeNull();
    fire(c, 'pointerup', cx(5) + 5, cy(50) + 5);
    await c.relayout({});
    expect(log).toEqual([]);
    expect(range(c, 'x')).toEqual([0, 10]);
    expect(range(c, 'y')).toEqual([0, 100]);
  });

  it('hides the zoom box again when the pointer comes back near the start', async () => {
    const c = await chart([DOTS]);
    fire(c, 'pointerdown', cx(2), cy(80));
    fire(c, 'pointermove', cx(4), cy(20));
    frame();
    expect(zoomBox(c)).not.toBeNull();
    fire(c, 'pointermove', cx(2) + 4, cy(80) + 4);
    frame();
    expect(zoomBox(c)).toBeNull();
    fire(c, 'pointerup', cx(2) + 4, cy(80) + 4);
    await c.relayout({});
    expect(range(c, 'x')).toEqual([0, 10]);
  });

  it('a thin vertical drag zooms y only, with a band across the whole plot width', async () => {
    const c = await chart([DOTS]);
    fire(c, 'pointerdown', 300, 110);
    fire(c, 'pointermove', 303, 270);
    frame();
    expect(zoomBox(c)).toBe('M40,110H620V270H40Z');
    fire(c, 'pointerup', 303, 270);
    await c.relayout({});
    expect(range(c, 'x')).toEqual([0, 10]);
    const [y0, y1] = range(c, 'y');
    // 270 px and 110 px from the top are 80 px and 240 px above the bottom of 320.
    expect(y0).toBeCloseTo(25);
    expect(y1).toBeCloseTo(75);
  });
});

describe('pointer capture', () => {
  it('holds the pointer for the gesture and releases it when the gesture ends', async () => {
    const c = await chart([DOTS]);
    const el = c.three.root.canvas;
    const held = new Set<number>();
    el.setPointerCapture = (id: number) => void held.add(id);
    el.hasPointerCapture = (id: number) => held.has(id);
    el.releasePointerCapture = (id: number) => void held.delete(id);
    // A drag: moves outside the canvas must keep coming.
    fire(c, 'pointerdown', cx(2), cy(80), { pointerId: 7 });
    expect([...held]).toEqual([7]);
    fire(c, 'pointermove', cx(4), cy(20), { pointerId: 7 });
    frame();
    expect([...held]).toEqual([7]);
    fire(c, 'pointerup', cx(4), cy(20), { pointerId: 7 });
    expect([...held]).toEqual([]);
    // A click releases it too.
    fire(c, 'pointerdown', cx(5), cy(50), { pointerId: 8 });
    expect([...held]).toEqual([8]);
    fire(c, 'pointerup', cx(5), cy(50), { pointerId: 8 });
    expect([...held]).toEqual([]);
  });
});

describe('a second pointer during a drag', () => {
  it('neither moves nor ends the drag: it belongs to the pointer that started it', async () => {
    const c = await chart([DOTS]);
    const log = record(c, 'click', 'relayout');
    fire(c, 'pointerdown', cx(2), cy(80));
    fire(c, 'pointermove', cx(3), cy(50));
    frame();
    // A pen lands on a point, wanders off and lifts while the mouse drag is in progress.
    const pen = { pointerId: 2, pointerType: 'pen' };
    fire(c, 'pointerdown', cx(5), cy(50), pen);
    fire(c, 'pointermove', cx(9), cy(10), pen);
    frame();
    fire(c, 'pointerup', cx(9), cy(10), pen);
    // The mouse finishes its box.
    fire(c, 'pointermove', cx(4), cy(20));
    frame();
    fire(c, 'pointerup', cx(4), cy(20));
    await c.relayout({});
    expect(log).toEqual(['relayout']);
    const [x0, x1] = range(c, 'x');
    const [y0, y1] = range(c, 'y');
    expect(x0).toBeCloseTo(2);
    expect(x1).toBeCloseTo(4);
    expect(y0).toBeCloseTo(20);
    expect(y1).toBeCloseTo(80);
  });
});
