// @vitest-environment jsdom
/**
 * Keyboard navigation: what becomes of the cursor when focus leaves, when the figure changes under
 * it and when the view moves away from it, through a real chart with a fake renderer. The container
 * is 640×400 with margins l 40, r 20, t 30, b 50 (plot area x 40–620, y 30–350), x in [0, 10] and
 * y in [0, 100], so data (x, y) sits at container (40 + 58·x, 350 − 3.2·y).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FigureInput } from '@mk7s/holochart-core';
import { createChart, type Chart } from '../chart.ts';
import type { ChartEventName } from '../events.ts';
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

function press(c: Chart, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  target(c).dispatchEvent(e);
  return e;
}

function said(c: Chart): string {
  return (target(c).querySelector('.holochart-live')?.textContent ?? '').trimEnd();
}

function record(c: Chart, ...names: ChartEventName[]): { name: string; payload: unknown }[] {
  const log: { name: string; payload: unknown }[] = [];
  for (const name of names) c.on(name, (payload: unknown) => void log.push({ name, payload }));
  return log;
}

/** The texts of the hover labels showing now. */
function labels(c: Chart): string[] {
  return [...c.element.querySelectorAll<HTMLElement>('.holochart-hoverlabel')]
    .filter((el) => el.style.display !== 'none')
    .map((el) => el.textContent ?? '');
}

const A = { type: 'dots', name: 'A', x: [4, 0, 8, 2], y: [40, 10, 80, 20] };

describe('keys navigation leaves alone', () => {
  it('does not prevent or act on letters, Tab and browser shortcuts', async () => {
    const c = await chart([A]);
    const log = record(c, 'hover', 'relayout', 'click');
    await focus(c);
    expect(press(c, 'a').defaultPrevented).toBe(false);
    expect(press(c, 'Tab').defaultPrevented).toBe(false);
    // Ctrl + `+` is the browser's page zoom.
    expect(press(c, '+', { ctrlKey: true }).defaultPrevented).toBe(false);
    await c.relayout({});
    expect(log).toHaveLength(0);
    expect(said(c)).toBe('');
    expect(c.axes.get('x')?.scale.range).toEqual([0, 10]);
  });
});

describe('focus leaving the chart', () => {
  it('hides the label and keeps the cursor for when focus returns', async () => {
    const c = await chart([A]);
    const log = record(c, 'hover', 'unhover');
    await focus(c);
    press(c, 'ArrowRight');
    press(c, 'ArrowRight');
    expect(labels(c)).toEqual(['(2, 20)']);
    target(c).blur();
    expect(log.map((l) => l.name)).toEqual(['hover', 'hover', 'unhover']);
    expect(labels(c)).toEqual([]);
    target(c).focus();
    // The next key goes on from the second point.
    press(c, 'ArrowRight');
    expect(said(c)).toBe('A: (4, 40), point 3 of 4.');
    expect(labels(c)).toEqual(['(4, 40)']);
  });

  it('leaves a pointer hover alone when there is no cursor', async () => {
    const c = await chart([A]);
    const log = record(c, 'hover', 'unhover');
    await focus(c);
    c.three.root.canvas.dispatchEvent(
      new PointerEvent('pointermove', {
        clientX: 40 + 58 * 8,
        clientY: 350 - 3.2 * 80,
        pointerId: 1,
        pointerType: 'mouse',
        bubbles: true,
      }),
    );
    t.scheduler.step();
    expect(labels(c)).toEqual(['(8, 80)']);
    target(c).blur();
    expect(labels(c)).toEqual(['(8, 80)']);
    expect(log.map((l) => l.name)).toEqual(['hover']);
  });

  it('does not show the label again after an update while focus is elsewhere', async () => {
    const c = await chart([A]);
    await focus(c);
    press(c, 'ArrowRight');
    target(c).blur();
    const log = record(c, 'hover');
    await c.relayout({ 'yaxis.range': [0, 200] });
    expect(log).toHaveLength(0);
    expect(labels(c)).toEqual([]);
    // With focus back, an update shows the cursor's label again.
    target(c).focus();
    await c.relayout({ 'yaxis.range': [0, 100] });
    expect(labels(c)).toEqual(['(0, 10)']);
  });
});

describe('the figure changing under the cursor', () => {
  it('drops the cursor when its point no longer exists', async () => {
    const c = await chart([A]);
    await focus(c);
    press(c, 'End');
    expect(said(c)).toBe('A: (8, 80), point 4 of 4.');
    await c.restyle({ x: [[0, 1]], y: [[5, 6]] });
    // No cursor: the next key starts at the first point again.
    press(c, 'ArrowRight');
    expect(said(c)).toBe('A: (0, 5), point 1 of 2.');
  });
});

describe('the view moving away from the cursor', () => {
  it('goes to the nearest point in view first, whichever arrow is pressed', async () => {
    const c = await chart([A]);
    await focus(c);
    press(c, 'End'); // x = 8
    await c.relayout({ 'xaxis.range': [0, 5] });
    // → would have nowhere to go from the last point: it comes back into view instead.
    press(c, 'ArrowRight');
    expect(said(c)).toBe('A: (4, 40), point 3 of 4.');
    press(c, 'Home'); // x = 0
    await c.relayout({ 'xaxis.range': [3, 10] });
    press(c, 'ArrowLeft');
    expect(said(c)).toBe('A: (4, 40), point 3 of 4.');
  });
});

describe('announcing a point without a label', () => {
  it('reads the data values when hoverinfo leaves the label empty', async () => {
    const c = await chart([{ ...A, hoverinfo: 'none' }]);
    await focus(c);
    press(c, 'ArrowRight');
    expect(labels(c)).toEqual([]);
    expect(said(c)).toBe('A: 0, 10, point 1 of 4.');
  });
});
