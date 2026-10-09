// @vitest-environment jsdom
/**
 * Box and lasso selection details (E6.3): `selectdirection`, shift with nothing selected yet, lasso
 * outlines too short to enclose anything, lasso vertex thinning, and traces without selection
 * support. Same figure as `interaction.test.ts`: 640×400, margins l 40, r 20, t 30, b 50, so the
 * plot area is x 40–620, y 30–350; with x in [0, 10] and y in [0, 100], data (x, y) sits at
 * container (40 + 58·x, 350 − 3.2·y).
 */
import type { FigureInput } from '@mk7s/holochart-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChart, type Chart } from '../chart.ts';
import type { TraceModule } from '../contracts.ts';
import type { ChartEventName } from '../events.ts';
import { createDotsModule, createLog, setup, type TestSetup } from '../__testing__/fakes.ts';

const MARGIN = { l: 40, r: 20, t: 30, b: 50 };
const RANGES = { xaxis: { range: [0, 10] }, yaxis: { range: [0, 100] } };
/** Five points on the diagonal, at x = 1, 3, 5, 7, 9. */
const FIVE = { type: 'dots', x: [1, 3, 5, 7, 9], y: [10, 30, 50, 70, 90] };

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

/** Press at the first position, move through the others (a frame after each), release at the last. */
async function stroke(
  c: Chart,
  path: readonly (readonly [number, number])[],
  init: Partial<PointerEventInit> = {},
): Promise<void> {
  const [first, ...rest] = path as [readonly [number, number], ...(readonly [number, number])[]];
  fire(c, 'pointerdown', first[0], first[1], init);
  for (const [x, y] of rest) {
    fire(c, 'pointermove', x, y, init);
    frame();
  }
  const last = rest.at(-1) ?? first;
  fire(c, 'pointerup', last[0], last[1], init);
  await c.relayout({});
}

interface Selected {
  points: { curveNumber: number; pointNumber: number }[];
  range?: Record<string, [number, number]>;
  lassoPoints?: Record<string, number[]>;
}

function record(c: Chart, ...names: ChartEventName[]): { name: string; payload: Selected }[] {
  const log: { name: string; payload: Selected }[] = [];
  for (const name of names) {
    c.on(name, (payload: unknown) => void log.push({ name, payload: payload as Selected }));
  }
  return log;
}

const numbers = (e: Selected | undefined): number[] => (e?.points ?? []).map((p) => p.pointNumber);

/** The drag outline as drawn, while the gesture is in progress. */
function outline(c: Chart): string | null | undefined {
  return c.element.querySelector('.holochart-dragoverlay path')?.getAttribute('d');
}

describe('selectdirection', () => {
  it("'h' selects a full-height band: only the drag's x extent counts", async () => {
    const c = await chart([FIVE], { dragmode: 'select', selectdirection: 'h' });
    const log = record(c, 'selected');
    // A low, wide drag: the point (5, 50) is far above it, inside its x extent.
    fire(c, 'pointerdown', cx(4), cy(20));
    fire(c, 'pointermove', cx(6), cy(10));
    frame();
    expect(outline(c)).toBe(`M${cx(4)},30H${cx(6)}V350H${cx(4)}Z`);
    fire(c, 'pointerup', cx(6), cy(10));
    await c.relayout({});
    const e = log[0]?.payload;
    expect(numbers(e)).toEqual([2]);
    // Only the selected axis is reported.
    expect(Object.keys(e?.range ?? {})).toEqual(['x']);
    expect(e?.range?.['x']?.[0]).toBeCloseTo(4);
    expect(e?.range?.['x']?.[1]).toBeCloseTo(6);
  });

  it("'v' selects a full-width band: only the drag's y extent counts", async () => {
    const c = await chart([FIVE], { dragmode: 'select', selectdirection: 'v' });
    const log = record(c, 'selected');
    // Right of every point but (9, 90); y from 37.5 to 62.5.
    fire(c, 'pointerdown', 500, 150);
    fire(c, 'pointermove', 600, 230);
    frame();
    expect(outline(c)).toBe('M40,150H620V230H40Z');
    fire(c, 'pointerup', 600, 230);
    await c.relayout({});
    const e = log[0]?.payload;
    expect(numbers(e)).toEqual([2]);
    expect(Object.keys(e?.range ?? {})).toEqual(['y']);
    expect(e?.range?.['y']?.[0]).toBeCloseTo(37.5);
    expect(e?.range?.['y']?.[1]).toBeCloseTo(62.5);
  });

  it("'d' picks the band along the longer side of the drag", async () => {
    const c = await chart([FIVE], { dragmode: 'select', selectdirection: 'd' });
    const log = record(c, 'selected');
    // Wider than tall: a vertical band over x 4–6, like 'h'.
    await stroke(c, [
      [cx(4), cy(20)],
      [cx(6), cy(15)],
    ]);
    expect(numbers(log[0]?.payload)).toEqual([2]);
    expect(Object.keys(log[0]?.payload.range ?? {})).toEqual(['x']);
    // Taller than wide: a horizontal band over y 62.5–100, like 'v'.
    await stroke(c, [
      [500, 150],
      [520, 30],
    ]);
    expect(numbers(log[1]?.payload)).toEqual([3, 4]);
    expect(Object.keys(log[1]?.payload.range ?? {})).toEqual(['y']);
  });
});

describe('shift-drag', () => {
  it('selects like a plain drag when nothing is selected yet', async () => {
    const c = await chart([FIVE], { dragmode: 'select' });
    const log = record(c, 'selected');
    await stroke(
      c,
      [
        [cx(4), cy(60)],
        [cx(6), cy(40)],
      ],
      { shiftKey: true },
    );
    expect(numbers(log[0]?.payload)).toEqual([2]);
    expect(t.log.updates.at(-1)?.selected).toEqual([2]);
  });
});

describe('lasso', () => {
  const SQUARE = [
    [cx(4), cy(40)],
    [cx(6), cy(40)],
    [cx(6), cy(60)],
    [cx(4), cy(60)],
  ] as const;

  it('selects nothing new from an outline of two vertices, and keeps the selection', async () => {
    const c = await chart([FIVE], { dragmode: 'lasso' });
    const log = record(c, 'selecting', 'selected');
    await stroke(c, SQUARE);
    expect(numbers(log.at(-1)?.payload)).toEqual([2]);
    log.length = 0;
    // A straight stroke through the point (1, 10): no area, so no selection of its own.
    await stroke(c, [
      [cx(0.5), cy(10)],
      [cx(1.5), cy(10)],
    ]);
    expect(log).toEqual([]);
    expect(t.log.updates.at(-1)?.selected).toEqual([2]);
  });

  it('adds a vertex only once the pointer has moved 2 px from the last one', async () => {
    const c = await chart([FIVE], { dragmode: 'lasso' });
    const log = record(c, 'selected');
    await stroke(c, [
      SQUARE[0],
      SQUARE[1],
      // A 1 px wobble: not a vertex.
      [cx(6) + 1, cy(40)],
      SQUARE[2],
      SQUARE[3],
    ]);
    const e = log[0]?.payload;
    const xs = e?.lassoPoints?.['x'] ?? [];
    const ys = e?.lassoPoints?.['y'] ?? [];
    expect(xs).toHaveLength(4);
    [4, 6, 6, 4].forEach((x, i) => expect(xs[i]).toBeCloseTo(x));
    [40, 40, 60, 60].forEach((y, i) => expect(ys[i]).toBeCloseTo(y));
    expect(numbers(e)).toEqual([2]);
  });
});

describe('a trace without selectPoints on the subplot', () => {
  it('is left out of box selections: no points reported, no selection drawn', async () => {
    // Hoverable like dots, but with no selection support.
    const marksLog = createLog();
    const marks = { ...createDotsModule(marksLog), type: 'marks' } as TraceModule;
    delete marks.selectPoints;
    t.registry.register(marks);
    const c = await chart([FIVE, { type: 'marks', x: [5], y: [55] }], { dragmode: 'select' });
    const log = record(c, 'selected');
    expect(marksLog.create).toEqual([1]);
    marksLog.updates.length = 0;
    // The box holds (5, 50) of the dots and (5, 55) of the marks.
    await stroke(c, [
      [cx(4), cy(60)],
      [cx(6), cy(40)],
    ]);
    expect(log[0]?.payload.points.map((p) => [p.curveNumber, p.pointNumber])).toEqual([[0, 2]]);
    expect(t.log.updates.at(-1)).toMatchObject({ index: 0, selected: [2] });
    expect(marksLog.updates.some((u) => Array.isArray(u.selected))).toBe(false);
  });
});
