// @vitest-environment jsdom
/**
 * The canvas cursor (it tells what a drag would do where the pointer is) and what a component that
 * takes a pointer move does to the chart's own hover. Same figure as `interaction.test.ts`: 640×400,
 * margins l 40, r 20, t 30, b 50, so the plot area is x 40–620, y 30–350, the x axis strip is the
 * 30 px below it and the y axis strip the 30 px left of it; the outer 15 % of a strip is an "end".
 */
import type { FigureInput } from '@mk7s/holochart-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChart, type Chart } from '../chart.ts';
import type { ComponentModule } from '../contracts.ts';
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

async function chart(
  data: unknown[],
  layout: Record<string, unknown> = {},
  s: TestSetup = t,
): Promise<Chart> {
  const c = createChart(
    s.container,
    { data, layout: { margin: MARGIN, ...RANGES, ...layout } } as FigureInput,
    s.options,
  );
  charts.push(c);
  await c.ready;
  return c;
}

function move(c: Chart, x: number, y: number): void {
  c.three.root.canvas.dispatchEvent(
    new PointerEvent('pointermove', {
      clientX: x,
      clientY: y,
      pointerId: 1,
      pointerType: 'mouse',
      bubbles: true,
    }),
  );
}

function cursorAt(c: Chart, x: number, y: number): string {
  move(c, x, y);
  return c.three.root.canvas.style.cursor;
}

function record(c: Chart, ...names: ChartEventName[]): string[] {
  const log: string[] = [];
  for (const name of names) c.on(name, () => void log.push(name));
  return log;
}

function labels(c: Chart): string[] {
  return [...c.element.querySelectorAll<HTMLElement>('.holochart-hoverlabel')]
    .filter((el) => el.style.display !== 'none')
    .map((el) => el.textContent ?? '');
}

describe('cursor over the plot area', () => {
  it('is a crosshair for the box tools, a move cursor for pan, and the default without a drag', async () => {
    const c = await chart([DOTS]);
    expect(cursorAt(c, cx(3), cy(30))).toBe('crosshair'); // zoom, the default
    for (const mode of ['select', 'lasso'] as const) {
      await c.relayout({ dragmode: mode });
      expect(cursorAt(c, cx(3), cy(31))).toBe('crosshair');
    }
    await c.relayout({ dragmode: 'pan' });
    expect(cursorAt(c, cx(3), cy(32))).toBe('move');
    // 3D modes drag nothing on a 2D plot.
    await c.relayout({ dragmode: 'orbit' });
    expect(cursorAt(c, cx(3), cy(33))).toBe('');
  });

  it('goes back to the default outside every drag zone and when the pointer leaves', async () => {
    const c = await chart([DOTS]);
    expect(cursorAt(c, cx(3), cy(30))).toBe('crosshair');
    // The right margin is neither plot nor axis strip.
    expect(cursorAt(c, 632, cy(30))).toBe('');
    expect(cursorAt(c, cx(3), cy(30))).toBe('crosshair');
    c.three.root.canvas.dispatchEvent(
      new PointerEvent('pointerleave', { clientX: 700, clientY: 500, pointerType: 'mouse' }),
    );
    expect(c.three.root.canvas.style.cursor).toBe('');
  });
});

describe('cursor over the axis strips', () => {
  it('resizes along the axis at its ends and moves in the middle', async () => {
    const c = await chart([DOTS]);
    // x axis strip: 15 % of 580 px is 87 px, so the ends are x < 127 and x > 533.
    expect(cursorAt(c, cx(1), X_STRIP)).toBe('ew-resize');
    expect(cursorAt(c, cx(5), X_STRIP)).toBe('move');
    expect(cursorAt(c, cx(9.5), X_STRIP)).toBe('ew-resize');
    // y axis strip: the ends are the bottom and top 48 px.
    expect(cursorAt(c, Y_STRIP, cy(5))).toBe('ns-resize');
    expect(cursorAt(c, Y_STRIP, cy(50))).toBe('move');
    expect(cursorAt(c, Y_STRIP, cy(95))).toBe('ns-resize');
  });

  it('keeps axis cursors in every dragmode but false', async () => {
    const c = await chart([DOTS], { dragmode: 'select' });
    expect(cursorAt(c, cx(5), X_STRIP)).toBe('move');
    await c.relayout({ dragmode: false });
    expect(cursorAt(c, cx(5), X_STRIP + 1)).toBe('');
    expect(cursorAt(c, cx(3), cy(30))).toBe('');
  });
});

describe('a component that takes the pointer move', () => {
  /** A component over the top-right corner (x > 560, y < 60) that sets `cursor` when given one. */
  function corner(cursor: string | undefined): ComponentModule {
    return {
      name: 'corner-test',
      draw: {
        create: () => ({
          update: () => undefined,
          handlePointer(e) {
            const inside = e.x > 560 && e.y < 60;
            if (inside && e.type === 'move' && cursor !== undefined) e.cursor = cursor;
            return inside;
          },
        }),
      },
    };
  }

  it('decides the cursor: its own, or the default when it sets none', async () => {
    const s = setup({ width: 640, height: 400, components: [corner(undefined)] });
    t = s;
    const c = await chart([DOTS], {}, s);
    expect(cursorAt(c, cx(3), cy(30))).toBe('crosshair');
    // Over the component the plot's crosshair would promise a zoom the press won't start.
    expect(cursorAt(c, 600, 40)).toBe('');
    expect(cursorAt(c, cx(3), cy(30))).toBe('crosshair');

    const s2 = setup({ width: 640, height: 400, components: [corner('grab')] });
    const d = await chart([DOTS], {}, s2);
    expect(cursorAt(d, 600, 40)).toBe('grab');
  });

  it('ends the hover of the point the pointer came from', async () => {
    const s = setup({ width: 640, height: 400, components: [corner('pointer')] });
    t = s;
    const c = await chart([DOTS], {}, s);
    const log = record(c, 'hover', 'unhover');
    move(c, cx(5), cy(50));
    t.scheduler.step();
    expect(log).toEqual(['hover']);
    expect(labels(c)).toEqual(['(5, 50)']);
    move(c, 600, 40);
    expect(log).toEqual(['hover', 'unhover']);
    expect(labels(c)).toEqual([]);
    // Moving on inside the component says nothing more.
    move(c, 605, 45);
    t.scheduler.step();
    expect(log).toEqual(['hover', 'unhover']);
  });
});
