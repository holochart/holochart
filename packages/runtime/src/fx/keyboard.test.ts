// @vitest-environment jsdom
/**
 * Keyboard navigation (plan E6.5): the key map, the cursor rules and announcements (pure parts),
 * then through a real chart with a fake renderer: the focus target, moving between points and
 * traces, `click` on Enter and the relayouts of zoom, pan and reset. The container is 640×400 with
 * margins l 40, r 20, t 30, b 50 (plot area x 40–620, y 30–350), x in [0, 10] and y in [0, 100].
 */
import fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChart, type Chart } from '../chart.ts';
import type { ChartEventName } from '../events.ts';
import { setup, type TestSetup } from '../__testing__/fakes.ts';
import {
  announce,
  directions,
  keyAction,
  nearestIndex,
  sortedOrder,
  stepIndex,
} from './keyboard.ts';

describe('key map', () => {
  it('maps keys to actions, Shift + arrows to pans', () => {
    expect(keyAction({ key: 'ArrowRight' })).toBe('right');
    expect(keyAction({ key: 'ArrowUp' })).toBe('up');
    expect(keyAction({ key: 'ArrowLeft', shiftKey: true })).toBe('panLeft');
    expect(keyAction({ key: 'ArrowDown', shiftKey: true })).toBe('panDown');
    expect(keyAction({ key: 'PageDown' })).toBe('nextTrace');
    expect(keyAction({ key: 'PageUp' })).toBe('prevTrace');
    expect(keyAction({ key: 'Home' })).toBe('first');
    expect(keyAction({ key: 'End' })).toBe('last');
    expect(keyAction({ key: 'Enter' })).toBe('click');
    expect(keyAction({ key: ' ', shiftKey: true })).toBe('click');
    expect(keyAction({ key: 'Escape' })).toBe('clear');
    expect(keyAction({ key: '+', shiftKey: true })).toBe('zoomIn');
    expect(keyAction({ key: '=' })).toBe('zoomIn');
    expect(keyAction({ key: '-' })).toBe('zoomOut');
    expect(keyAction({ key: '0' })).toBe('reset');
  });

  it('leaves Tab, letters and browser shortcuts alone', () => {
    expect(keyAction({ key: 'Tab' })).toBeUndefined();
    expect(keyAction({ key: 'a' })).toBeUndefined();
    expect(keyAction({ key: '+', ctrlKey: true })).toBeUndefined();
    expect(keyAction({ key: 'ArrowLeft', altKey: true })).toBeUndefined();
    expect(keyAction({ key: '0', metaKey: true })).toBeUndefined();
  });

  it('steps along the position axis and across traces the other way', () => {
    expect(directions('x', 'right')).toEqual({ along: 1, across: 0 });
    expect(directions('x', 'left')).toEqual({ along: -1, across: 0 });
    expect(directions('x', 'up')).toEqual({ along: 0, across: 1 });
    expect(directions('x', 'down')).toEqual({ along: 0, across: -1 });
    // Horizontal traces: ↑ / ↓ along y, ← / → across.
    expect(directions('y', 'up')).toEqual({ along: 1, across: 0 });
    expect(directions('y', 'left')).toEqual({ along: 0, across: -1 });
    // Domain traces: a list.
    expect(directions(undefined, 'down')).toEqual({ along: 1, across: 0 });
    expect(directions(undefined, 'up')).toEqual({ along: -1, across: 0 });
  });
});

describe('cursor rules', () => {
  it('orders finite positions ascending, ties by index', () => {
    expect(sortedOrder([3, NaN, 1, 3, -Infinity, 2])).toEqual([2, 5, 0, 3]);
  });

  it('property: the order is a sorted permutation of the finite indices', () => {
    fc.assert(
      fc.property(fc.array(fc.oneof(fc.double(), fc.constant(NaN)), { maxLength: 40 }), (v) => {
        const order = sortedOrder(v);
        const finite = v.flatMap((x, i) => (Number.isFinite(x) ? [i] : []));
        expect([...order].sort((a, b) => a - b)).toEqual(finite);
        for (let k = 1; k < order.length; k++) {
          const a = v[order[k - 1] as number] as number;
          const b = v[order[k] as number] as number;
          expect(a < b || (a === b && (order[k - 1] as number) < (order[k] as number))).toBe(true);
        }
      }),
    );
  });

  it('property: a step moves one allowed item in its direction, or stays at the ends', () => {
    fc.assert(
      fc.property(
        fc.array(fc.boolean(), { minLength: 1, maxLength: 30 }),
        fc.nat(),
        fc.constantFrom<1 | -1>(1, -1),
        (allowed, start, dir) => {
          const order = allowed.map((_, i) => i);
          const at = start % order.length;
          const next = stepIndex(order, at, dir, (i) => allowed[i] === true);
          if (next === at) {
            // Nothing allowed further in that direction.
            for (let k = at + dir; k >= 0 && k < order.length; k += dir)
              expect(allowed[k]).toBe(false);
          } else {
            expect(Math.sign(next - at)).toBe(dir);
            expect(allowed[next]).toBe(true);
            for (let k = at + dir; k !== next; k += dir) expect(allowed[k]).toBe(false);
          }
        },
      ),
    );
  });

  it('finds the nearest allowed item', () => {
    const values = [0, 10, 20, 30];
    expect(nearestIndex([0, 1, 2, 3], values, 12, () => true)).toBe(1);
    expect(nearestIndex([0, 1, 2, 3], values, 12, (i) => i !== 1)).toBe(2);
    expect(nearestIndex([0, 1, 2, 3], values, 12, () => false)).toBe(-1);
  });

  it('announces in the chart language', () => {
    const values = { name: 'A', text: '(1, 2)', n: '1', count: '3' };
    expect(announce(undefined, 'point', values)).toBe('A: (1, 2), point 1 of 3.');
  });
});

// ---- through a chart ------------------------------------------------------------------------------

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

async function chart(
  data: unknown[],
  layout: Record<string, unknown> = {},
  config: Record<string, unknown> = {},
): Promise<Chart> {
  const c = createChart(
    t.container,
    { data, layout: { margin: MARGIN, ...RANGES, ...layout }, config },
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

function lastPoint(log: { name: string; payload: unknown }[]): Record<string, unknown> {
  const p = log[log.length - 1]?.payload as { points: Record<string, unknown>[] };
  return p.points[0] as Record<string, unknown>;
}

const A = { type: 'dots', name: 'A', x: [4, 0, 8, 2], y: [40, 10, 80, 20] };
const B = { type: 'dots', name: 'B', x: [0, 4, 8], y: [50, 50, 50] };

describe('focus target', () => {
  it('is the first tab stop after the canvas, an application over the plot area', async () => {
    const c = await chart([A]);
    const el = target(c);
    expect(el.tabIndex).toBe(0);
    expect(el.getAttribute('role')).toBe('application');
    expect(el.getAttribute('aria-label')).toMatch(/^Chart data: arrow keys/);
    expect(el.previousElementSibling).toBe(c.three.root.canvas);
    expect(el.style.transform).toBe('translate(40px,30px)');
    expect(el.style.width).toBe('580px');
    expect(el.style.height).toBe('320px');
    // The focus ring shows while focused only.
    expect(el.style.outlineWidth).toBe('0px');
    await focus(c);
    expect(el.style.outlineWidth).toBe('2px');
    el.blur();
    expect(el.style.outlineWidth).toBe('0px');
  });

  it('is left out with config.a11y.keyboard false and on static charts', async () => {
    expect(target(await chart([A], {}, { a11y: { keyboard: false } }))).toBeNull();
    for (const c of charts) c.destroy();
    charts = [];
    expect(target(await chart([A], {}, { staticPlot: true }))).toBeNull();
  });
});

describe('moving between points', () => {
  it('walks a trace in x order, announcing and hovering each point', async () => {
    const c = await chart([A]);
    const log = record(c, 'hover', 'unhover');
    await focus(c);
    const e = press(c, 'ArrowRight');
    expect(e.defaultPrevented).toBe(true);
    // The first key starts at the first point in x order (x = 0: data index 1).
    expect(lastPoint(log)).toMatchObject({ curveNumber: 0, pointNumber: 1, x: 0, y: 10 });
    expect(said(c)).toBe('A: (0, 10), point 1 of 4.');
    press(c, 'ArrowRight');
    expect(lastPoint(log)).toMatchObject({ pointNumber: 3, x: 2 });
    expect(said(c)).toBe('A: (2, 20), point 2 of 4.');
    press(c, 'End');
    expect(lastPoint(log)).toMatchObject({ pointNumber: 2, x: 8 });
    // At the end the cursor stays.
    press(c, 'ArrowRight');
    expect(lastPoint(log)).toMatchObject({ pointNumber: 2 });
    press(c, 'Home');
    expect(lastPoint(log)).toMatchObject({ pointNumber: 1 });
    press(c, 'ArrowLeft');
    expect(lastPoint(log)).toMatchObject({ pointNumber: 1 });
    expect(c.element.querySelector('.holochart-hoverlabel')?.textContent).toBe('(0, 10)');
    press(c, 'Escape');
    expect(log[log.length - 1]?.name).toBe('unhover');
  });

  it('switches traces in legend order with PgUp / PgDn, keeping the position', async () => {
    const c = await chart([A, B]);
    const log = record(c, 'hover');
    await focus(c);
    press(c, 'ArrowRight');
    press(c, 'ArrowRight');
    press(c, 'ArrowRight'); // A at x = 4
    press(c, 'PageDown');
    expect(lastPoint(log)).toMatchObject({ curveNumber: 1, pointNumber: 1, x: 4 });
    expect(said(c)).toMatch(/^B: \(4, 50\), point 2 of 3\.$/);
    press(c, 'PageDown'); // the last trace: stays
    expect(lastPoint(log)).toMatchObject({ curveNumber: 1 });
    press(c, 'PageUp');
    expect(lastPoint(log)).toMatchObject({ curveNumber: 0, x: 4 });
  });

  it('follows legendrank', async () => {
    const c = await chart([A, { ...B, legendrank: 1 }]);
    const log = record(c, 'hover');
    await focus(c);
    press(c, 'Home');
    expect(lastPoint(log)).toMatchObject({ curveNumber: 1 });
  });

  it('moves up and down to the trace next above / below at the same position', async () => {
    const c = await chart([A, B]);
    const log = record(c, 'hover');
    await focus(c);
    press(c, 'End'); // A at x = 8, y = 80
    press(c, 'ArrowDown');
    expect(lastPoint(log)).toMatchObject({ curveNumber: 1, x: 8, y: 50 });
    press(c, 'ArrowDown'); // nothing below
    expect(lastPoint(log)).toMatchObject({ curveNumber: 1 });
    press(c, 'ArrowUp');
    expect(lastPoint(log)).toMatchObject({ curveNumber: 0, x: 8, y: 80 });
  });

  it('visits only points in view after a zoom', async () => {
    const c = await chart([A], { xaxis: { range: [1, 5] } });
    const log = record(c, 'hover');
    await focus(c);
    press(c, 'Home');
    expect(lastPoint(log)).toMatchObject({ x: 2 });
    press(c, 'End');
    expect(lastPoint(log)).toMatchObject({ x: 4 });
    expect(said(c)).toBe('A: (4, 40), point 3 of 4.');
  });

  it('skips hidden and hoverinfo skip traces, and says when nothing is left', async () => {
    const c = await chart([
      { ...A, visible: 'legendonly' },
      { ...B, hoverinfo: 'skip' },
    ]);
    await focus(c);
    press(c, 'ArrowRight');
    expect(said(c)).toBe('No data points to explore.');
  });

  it('keeps the cursor on its trace across updates and re-shows it', async () => {
    const c = await chart([A, B]);
    const log = record(c, 'hover');
    await focus(c);
    press(c, 'PageDown');
    press(c, 'PageDown');
    expect(lastPoint(log)).toMatchObject({ curveNumber: 1 });
    await c.restyle({ legendrank: [2000, 1] });
    press(c, 'ArrowRight');
    expect(lastPoint(log)).toMatchObject({ curveNumber: 1, pointNumber: 1 });
  });

  it('queues keys pressed before its code has loaded', async () => {
    const c = await chart([A]);
    const log = record(c, 'hover');
    target(c).focus();
    press(c, 'ArrowRight');
    press(c, 'ArrowRight');
    await vi.waitFor(() => expect(log).toHaveLength(2));
    expect(lastPoint(log)).toMatchObject({ x: 2 });
  });
});

describe('actions', () => {
  it('emits click with the Plotly-shaped point on Enter and Space', async () => {
    const c = await chart([{ ...A, customdata: ['a', 'b', 'c', 'd'] }]);
    const log = record(c, 'click');
    await focus(c);
    press(c, 'Enter'); // no cursor yet
    expect(log).toHaveLength(0);
    press(c, 'ArrowRight');
    const e = press(c, 'Enter');
    expect(log).toHaveLength(1);
    const payload = log[0]?.payload as { points: Record<string, unknown>[]; event: Event };
    expect(payload.event).toBe(e);
    expect(payload.points[0]).toMatchObject({
      curveNumber: 0,
      pointNumber: 1,
      x: 0,
      y: 10,
      customdata: 'b',
      bbox: { x0: 40, y0: 318 },
    });
    expect(payload.points[0]?.['data']).toBe(c.data[0]);
    press(c, ' ');
    expect(log).toHaveLength(2);
  });

  it('click-selects with clickmode select (Shift toggles)', async () => {
    const c = await chart([A], { clickmode: 'event+select' });
    const log = record(c, 'selected');
    await focus(c);
    press(c, 'ArrowRight');
    press(c, 'Enter');
    await c.relayout({});
    expect(t.log.updates.at(-1)).toMatchObject({ plan: { selection: true }, selected: [1] });
    press(c, 'ArrowRight');
    press(c, 'Enter', { shiftKey: true });
    await c.relayout({});
    expect(t.log.updates.at(-1)).toMatchObject({ selected: [1, 3] });
    press(c, 'Enter', { shiftKey: true });
    await c.relayout({});
    expect(t.log.updates.at(-1)).toMatchObject({ selected: [1] });
    expect(log).toHaveLength(3);
    const last = log[2]?.payload as { points: Record<string, unknown>[] };
    expect(last.points.map((p) => p['pointNumber'])).toEqual([1]);
  });

  it('zooms around the cursor with + and - through a GUI relayout', async () => {
    const c = await chart([A]);
    const log = record(c, 'relayout');
    await focus(c);
    press(c, '+'); // no cursor: the plot center
    await c.relayout({});
    expect(log[0]?.payload).toEqual({
      'xaxis.range[0]': 1,
      'xaxis.range[1]': 9,
      'yaxis.range[0]': 10,
      'yaxis.range[1]': 90,
    });
    expect(said(c)).toBe('Zoomed in.');
    press(c, 'End'); // x = 8, y = 80
    press(c, '-');
    await c.relayout({});
    const r = log[log.length - 1]?.payload as Record<string, number>;
    expect(r['xaxis.range[0]']).toBeCloseTo(8 + (1 - 8) * 1.25);
    expect(r['xaxis.range[1]']).toBeCloseTo(8 + (9 - 8) * 1.25);
    expect(said(c)).toBe('Zoomed out.');
  });

  it('pans with Shift + arrows by a tenth of the range, respecting fixedrange', async () => {
    const c = await chart([A], { yaxis: { range: [0, 100], fixedrange: true } });
    const log = record(c, 'relayout');
    await focus(c);
    press(c, 'ArrowRight', { shiftKey: true });
    await c.relayout({});
    expect(log[0]?.payload).toEqual({ 'xaxis.range[0]': 1, 'xaxis.range[1]': 11 });
    press(c, 'ArrowUp', { shiftKey: true }); // y is fixed: nothing
    await c.relayout({});
    expect(log.filter((l) => Object.keys(l.payload as object).length > 0)).toHaveLength(1);
    expect(said(c)).toBe('Panned.');
  });

  it('resets like a double-click with 0', async () => {
    const c = await chart([A], { xaxis: { range: [0, 10] } });
    await focus(c);
    press(c, 'ArrowRight', { shiftKey: true });
    await c.relayout({});
    expect(c.layout['xaxis']).toMatchObject({ range: [1, 11] });
    const log = record(c, 'relayout');
    press(c, '0');
    await c.relayout({});
    expect(log[0]?.payload).toMatchObject({ 'xaxis.range': [0, 10] });
    expect(said(c)).toBe('View reset.');
  });
});
