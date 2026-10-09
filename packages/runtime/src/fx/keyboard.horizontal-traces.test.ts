// @vitest-environment jsdom
/**
 * Keyboard navigation of horizontal traces (`orientation: 'h'`): their points are ordered along y,
 * so ↑ / ↓ step through them and ← / → move between traces. Through a real chart with a fake
 * renderer; the container is 640×400 with margins l 40, r 20, t 30, b 50, x in [0, 10] and y in
 * [0, 100].
 */
import { attr, type FigureInput } from '@mk7s/holochart-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChart, type Chart } from '../chart.ts';
import type { TraceModule } from '../contracts.ts';
import { createDotsModule, createLog, setup, type TestSetup } from '../__testing__/fakes.ts';

const MARGIN = { l: 40, r: 20, t: 30, b: 50 };
const RANGES = { xaxis: { range: [0, 10] }, yaxis: { range: [0, 100] } };

/** The dots test trace with an `orientation` attribute, like bar. */
function orientedDots(): TraceModule {
  return {
    ...(createDotsModule(createLog()) as TraceModule),
    type: 'odots',
    schema: attr.object({
      x: attr.dataArray({ editType: 'calc' }),
      y: attr.dataArray({ editType: 'calc' }),
      orientation: attr.enumerated({ values: ['v', 'h'], dflt: 'v', editType: 'calc' }),
    }),
    supplyDefaults(_in, _out, ctx) {
      ctx.coerce('x');
      ctx.coerce('y');
      ctx.coerce('orientation');
    },
  };
}

let t: TestSetup;
let charts: Chart[] = [];

beforeEach(() => {
  t = setup({ width: 640, height: 400 });
  t.registry.register(orientedDots());
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

function target(c: Chart): HTMLElement {
  return c.element.querySelector<HTMLElement>('.holochart-focus') as HTMLElement;
}

/** Focus the chart and wait for the navigation code. */
async function focus(c: Chart): Promise<void> {
  const el = target(c);
  el.focus();
  await vi.waitFor(() => expect(el.querySelector('.holochart-live')).not.toBeNull());
}

function press(c: Chart, key: string): void {
  target(c).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

function said(c: Chart): string {
  return (target(c).querySelector('.holochart-live')?.textContent ?? '').trimEnd();
}

// Positions along y, values along x.
const H1 = { type: 'odots', orientation: 'h', name: 'H1', x: [4, 0, 8, 2], y: [40, 10, 80, 20] };
const H2 = { type: 'odots', orientation: 'h', name: 'H2', x: [5, 5, 5], y: [10, 40, 80] };

describe('horizontal traces', () => {
  it('steps through the points in y order with ↑ and ↓', async () => {
    const c = await chart([H1]);
    await focus(c);
    press(c, 'ArrowUp');
    expect(said(c)).toBe('H1: (0, 10), point 1 of 4.');
    press(c, 'ArrowUp');
    expect(said(c)).toBe('H1: (2, 20), point 2 of 4.');
    press(c, 'ArrowDown');
    expect(said(c)).toBe('H1: (0, 10), point 1 of 4.');
    press(c, 'ArrowDown'); // the lowest point: stays
    expect(said(c)).toBe('H1: (0, 10), point 1 of 4.');
    press(c, 'End');
    expect(said(c)).toBe('H1: (8, 80), point 4 of 4.');
  });

  it('moves with ← and → to the trace next to the cursor at the same y', async () => {
    const c = await chart([H1, H2]);
    await focus(c);
    press(c, 'End'); // H1 at x = 8, y = 80
    press(c, 'ArrowLeft');
    expect(said(c)).toBe('H2: (5, 80), point 3 of 3.');
    press(c, 'ArrowLeft'); // nothing further left
    expect(said(c)).toBe('H2: (5, 80), point 3 of 3.');
    press(c, 'ArrowRight');
    expect(said(c)).toBe('H1: (8, 80), point 4 of 4.');
  });

  it('keeps the y position with Page Down', async () => {
    const c = await chart([H1, H2]);
    await focus(c);
    press(c, 'ArrowUp');
    press(c, 'ArrowUp');
    press(c, 'ArrowUp');
    expect(said(c)).toBe('H1: (4, 40), point 3 of 4.');
    press(c, 'PageDown');
    expect(said(c)).toBe('H2: (5, 40), point 2 of 3.');
  });

  it('visits only the points whose y is in view', async () => {
    const c = await chart([H1], { yaxis: { range: [15, 50] } });
    await focus(c);
    press(c, 'Home');
    expect(said(c)).toBe('H1: (2, 20), point 2 of 4.');
    press(c, 'End');
    expect(said(c)).toBe('H1: (4, 40), point 3 of 4.');
  });
});
