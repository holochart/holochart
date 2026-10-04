// @vitest-environment jsdom
/**
 * Keyboard navigation between traces: the legend order they are visited in, which trace the first
 * key starts on, and how Page Up / Page Down and ↑ / ↓ treat traces with no point in view or with
 * points at the same place. Through a real chart with a fake renderer; the container is 640×400
 * with margins l 40, r 20, t 30, b 50, x in [0, 10] and y in [0, 100] unless a test says otherwise.
 */
import { attr, type FigureInput } from '@mk7s/holochart-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChart, type Chart } from '../chart.ts';
import type { ComponentModule } from '../contracts.ts';
import { setup, type TestSetup } from '../__testing__/fakes.ts';

const MARGIN = { l: 40, r: 20, t: 30, b: 50 };
const RANGES = { xaxis: { range: [0, 10] }, yaxis: { range: [0, 100] } };

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

const A = { type: 'dots', name: 'A', x: [4, 0, 8, 2], y: [40, 10, 80, 20] };
const B = { type: 'dots', name: 'B', x: [0, 4, 8], y: [50, 50, 50] };
/** A trace whose points are all right of the x range [0, 10]. */
const FAR = { type: 'dots', name: 'Far', x: [20, 25, 28], y: [50, 50, 50] };

describe('legend order', () => {
  /** Declares `legend.traceorder`, as the legend component does. */
  const legend: ComponentModule = {
    name: 'legend',
    layoutSchema: {
      legend: attr.object({
        traceorder: attr.flaglist({ flags: ['reversed', 'grouped'], extras: ['normal'] }),
      }),
    },
  };

  it('visits traces last to first with a reversed legend.traceorder', async () => {
    t = setup({ width: 640, height: 400, components: [legend] });
    const c = await chart([A, B], { legend: { traceorder: 'reversed' } });
    await focus(c);
    press(c, 'Home');
    expect(said(c)).toBe('B: (0, 50), point 1 of 3.');
    press(c, 'PageDown');
    expect(said(c)).toBe('A: (0, 10), point 1 of 4.');
    press(c, 'PageDown'); // A is the last one now
    expect(said(c)).toBe('A: (0, 10), point 1 of 4.');
  });

  it('keeps trace order with a grouped legend.traceorder', async () => {
    t = setup({ width: 640, height: 400, components: [legend] });
    const c = await chart([A, B], { legend: { traceorder: 'grouped' } });
    await focus(c);
    press(c, 'Home');
    expect(said(c)).toBe('A: (0, 10), point 1 of 4.');
  });
});

describe('traces with no point in view', () => {
  it('starts on the first trace that has a point in view', async () => {
    const c = await chart([A, FAR], { xaxis: { range: [15, 30] } });
    await focus(c);
    press(c, 'ArrowRight');
    expect(said(c)).toBe('Far: (20, 50), point 1 of 3.');
  });

  it('starts on its last point with End', async () => {
    const c = await chart([A, FAR], { xaxis: { range: [15, 30] } });
    await focus(c);
    press(c, 'End');
    expect(said(c)).toBe('Far: (28, 50), point 3 of 3.');
  });

  it('says there is nothing to explore when no trace has a point in view', async () => {
    const c = await chart([A, B], { xaxis: { range: [15, 30] } });
    await focus(c);
    press(c, 'ArrowRight');
    expect(said(c)).toBe('No data points to explore.');
    expect(c.element.querySelector('.holochart-hoverlabel')).toBeNull();
  });

  it('skips them with Page Down and Page Up', async () => {
    const c = await chart([A, FAR, { ...B, name: 'C' }]);
    await focus(c);
    press(c, 'End'); // A at x = 8
    press(c, 'PageDown');
    expect(said(c)).toBe('C: (8, 50), point 3 of 3.');
    press(c, 'PageUp');
    expect(said(c)).toBe('A: (8, 80), point 4 of 4.');
  });

  it('skips them with ↑ and ↓', async () => {
    const c = await chart([A, FAR]);
    await focus(c);
    press(c, 'End'); // A at (8, 80); Far's points are at y = 50, but out of view
    press(c, 'ArrowDown');
    expect(said(c)).toBe('A: (8, 80), point 4 of 4.');
  });
});

describe('traces with points at the same place', () => {
  it('reaches each of them with ↑ and ↓, in legend order', async () => {
    const c = await chart([A, { ...A, name: 'A2' }, B]);
    await focus(c);
    press(c, 'End');
    expect(said(c)).toBe('A: (8, 80), point 4 of 4.');
    press(c, 'ArrowUp');
    expect(said(c)).toBe('A2: (8, 80), point 4 of 4.');
    press(c, 'ArrowUp'); // nothing above
    expect(said(c)).toBe('A2: (8, 80), point 4 of 4.');
    press(c, 'ArrowDown');
    expect(said(c)).toBe('A: (8, 80), point 4 of 4.');
    press(c, 'ArrowDown');
    expect(said(c)).toBe('B: (8, 50), point 3 of 3.');
  });
});
