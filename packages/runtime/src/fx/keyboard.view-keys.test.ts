// @vitest-environment jsdom
/**
 * Keyboard zoom and pan on cartesian subplots: the direction of each Shift + arrow, which subplots
 * and axes a key moves (the cursor's subplot, else all; overlaying axes with the axis they
 * overlay), and Enter with `clickmode: 'select'`. Through a real chart with a fake renderer; the
 * container is 640×400 with margins l 40, r 20, t 30, b 50, x in [0, 10] and y in [0, 100].
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

/** Press a view key and return the `relayout` it committed. */
async function view(c: Chart, key: string, shiftKey = false): Promise<Record<string, number>> {
  const log = record(c, 'relayout');
  press(c, key, { shiftKey });
  await c.relayout({});
  return (log[0]?.payload ?? {}) as Record<string, number>;
}

const A = { type: 'dots', name: 'A', x: [4, 0, 8, 2], y: [40, 10, 80, 20] };
const B = { type: 'dots', name: 'B', x: [0, 4, 8], y: [50, 50, 50] };

describe('Shift + arrows', () => {
  it('pan a tenth of the range toward the arrow', async () => {
    const c = await chart([A]);
    await focus(c);
    expect(await view(c, 'ArrowLeft', true)).toEqual({
      'xaxis.range[0]': -1,
      'xaxis.range[1]': 9,
    });
    expect(await view(c, 'ArrowDown', true)).toEqual({
      'yaxis.range[0]': -10,
      'yaxis.range[1]': 90,
    });
    expect(await view(c, 'ArrowUp', true)).toEqual({
      'yaxis.range[0]': 0,
      'yaxis.range[1]': 100,
    });
    expect(said(c)).toBe('Panned.');
  });
});

describe('the axes a view key moves', () => {
  it('moves an overlaying axis with the axis it overlays', async () => {
    const c = await chart([A, { ...B, yaxis: 'y2' }], {
      yaxis2: { overlaying: 'y', side: 'right', range: [0, 1000] },
    });
    await focus(c);
    // The cursor is on A (subplot xy): its y axis and the one drawn over it pan together.
    press(c, 'Home');
    expect(await view(c, 'ArrowUp', true)).toEqual({
      'yaxis.range[0]': 10,
      'yaxis.range[1]': 110,
      'yaxis2.range[0]': 100,
      'yaxis2.range[1]': 1100,
    });
  });

  it('zooms every subplot without a cursor, and only the cursor’s subplot with one', async () => {
    const c = await chart([A, { ...B, xaxis: 'x2', yaxis: 'y2' }], {
      xaxis: { range: [0, 10], domain: [0, 0.45] },
      xaxis2: { range: [0, 20], domain: [0.55, 1], anchor: 'y2' },
      yaxis2: { range: [0, 200], anchor: 'x2' },
    });
    await focus(c);
    // Around each plot center: every range shrinks to 0.8 of its span.
    expect(await view(c, '+')).toEqual({
      'xaxis.range[0]': 1,
      'xaxis.range[1]': 9,
      'yaxis.range[0]': 10,
      'yaxis.range[1]': 90,
      'xaxis2.range[0]': 2,
      'xaxis2.range[1]': 18,
      'yaxis2.range[0]': 20,
      'yaxis2.range[1]': 180,
    });
    press(c, 'PageDown');
    press(c, 'PageDown');
    expect(said(c)).toMatch(/^B: /);
    const r = await view(c, 'ArrowRight', true);
    expect(Object.keys(r)).toEqual(['xaxis2.range[0]', 'xaxis2.range[1]']);
    expect(r['xaxis2.range[0]']).toBeCloseTo(3.6);
    expect(r['xaxis2.range[1]']).toBeCloseTo(19.6);
  });
});

describe('Enter with clickmode select', () => {
  it('selects the point without emitting click when clickmode has no event flag', async () => {
    const c = await chart([A, B], { clickmode: 'select' });
    const log = record(c, 'click', 'selected');
    await focus(c);
    press(c, 'ArrowRight');
    const e = press(c, 'Enter');
    await c.relayout({});
    expect(log.map((l) => l.name)).toEqual(['selected']);
    const payload = log[0]?.payload as { points: Record<string, unknown>[]; event: Event };
    expect(payload.event).toBe(e);
    expect(payload.points).toHaveLength(1);
    expect(payload.points[0]).toMatchObject({ curveNumber: 0, pointNumber: 1, x: 0, y: 10 });
    // The other trace on the subplot is dimmed: selected, with nothing in it.
    const last = new Map(t.log.updates.map((u) => [u.index, u.selected]));
    expect(last.get(0)).toEqual([1]);
    expect(last.get(1)).toEqual([]);
  });
});
