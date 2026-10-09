// @vitest-environment jsdom
/**
 * Keyboard navigation (plan E6.5): the key map, the cursor rules and announcements (pure parts),
 * then through a real chart with a fake renderer: the focus target, moving between points and
 * traces, `click` on Enter and the relayouts of zoom, pan and reset. The container is 640×400 with
 * margins l 40, r 20, t 30, b 50 (plot area x 40–620, y 30–350), x in [0, 10] and y in [0, 100].
 */
import fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FigureInput } from '@mk7s/holochart-core';
import { createChart, type Chart } from '../chart.ts';
import type { ChartEventName } from '../events.ts';
import { a11yParts } from '../a11y/lazy.ts';
import type { HoverPoint, KeyboardPoint, TraceA11yParts, TraceModule } from '../contracts.ts';
import { createDotsModule, createLog, setup, type TestSetup } from '../__testing__/fakes.ts';
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
    { data, layout: { margin: MARGIN, ...RANGES, ...layout }, config } as FigureInput,
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

// ---- stops of trace modules (backlog S2.14) -------------------------------------------------------

/** A hover point anchored at container `(x, y)` of the 640×400 figure, labelled `text`. */
function stop(i: number, x: number, y: number, text: string): HoverPoint {
  return { pointIndex: i, distance: 0, px: x, py: 400 - y, hoverText: text, showName: false };
}

/**
 * A domain-like trace type whose accessibility parts load on first use: a root with two children,
 * linked along the tree, announced with its own template; its view keys relayout the title.
 */
function treeModule(load: () => Promise<TraceA11yParts>): TraceModule {
  return {
    ...(createDotsModule(createLog()) as TraceModule),
    type: 'tree',
    categories: [],
    hoverPoints: () => [],
    subplotDomain: () => ({ x: [0, 1], y: [0, 1] }),
    a11y: load,
  };
}

const TREE: TraceA11yParts = {
  tree: {
    keyboardPoints: (): KeyboardPoint[] => [
      { ...stop(0, 320, 200, 'root<br>10'), nav: [0, 0, 0, 1, 0, 0], extra: 'all' },
      {
        ...stop(1, 100, 100, 'left'),
        nav: [1, 2, 0, 1, 1, 2],
        say: [
          '{name}: {text}, {n} of {count} below {parent}.',
          { n: '1', count: '2', parent: 'root' },
        ],
      },
      { ...stop(2, 500, 100, 'right'), nav: [1, 2, 0, 2, 1, 2], more: [stop(2, 500, 300, 'more')] },
    ],
    keyboardView: (_trace, _ctx, action) =>
      action === 'reset' ? undefined : { 'title.text': action },
  },
};

describe('stops of a trace module', () => {
  it('waits for accessibility parts that load on first use, then follows nav', async () => {
    let resolve!: (parts: TraceA11yParts) => void;
    const load = vi.fn(() => new Promise<TraceA11yParts>((r) => (resolve = r)));
    t.registry.register(treeModule(load));
    const c = await chart([{ type: 'tree', name: 'T', x: [1], y: [1] }]);
    const log = record(c, 'hover');
    await focus(c);
    press(c, 'ArrowRight');
    press(c, 'ArrowDown');
    // The keys wait for the stops (nothing is skipped or announced as empty).
    expect(load).toHaveBeenCalledTimes(1);
    expect(said(c)).toBe('');
    resolve(TREE);
    await vi.waitFor(() => expect(log).toHaveLength(2));
    expect(load).toHaveBeenCalledTimes(1);
    // The stop's own sentence, in the chart language's template mechanism.
    expect(said(c)).toBe('T: left, 1 of 2 below root.');
    press(c, 'ArrowRight');
    // Every label of the stop is shown and read; the default sentence counts the stops.
    expect((log[2]?.payload as { points: unknown[] }).points).toHaveLength(2);
    expect(said(c)).toBe('T: right, more, point 3 of 3.');
    press(c, 'ArrowRight'); // nav says: stay
    expect(said(c)).toBe('T: right, more, point 3 of 3.');
    press(c, 'ArrowUp');
    // The lines of a label are read as a list, with the secondary box the trace filled.
    expect(said(c)).toBe('T: root, 10, all, point 1 of 3.');
    press(c, 'End');
    expect(said(c)).toBe('T: root, 10, all, point 1 of 3.');
  });

  it('gives view keys to a trace that handles them, as a GUI relayout', async () => {
    t.registry.register(treeModule(() => Promise.resolve(TREE)));
    const c = await chart([{ type: 'tree', name: 'T', x: [1], y: [1] }]);
    const log = record(c, 'relayout');
    await focus(c);
    press(c, 'ArrowRight', { shiftKey: true });
    await vi.waitFor(() => expect(log).toHaveLength(1));
    expect(log[0]?.payload).toEqual({ 'title.text': 'panRight' });
    expect(said(c)).toBe('View rotated.');
    press(c, '+');
    await vi.waitFor(() => expect(log).toHaveLength(2));
    expect(log[1]?.payload).toEqual({ 'title.text': 'zoomIn' });
    expect(said(c)).toBe('Zoomed in.');
    // A key the trace does not take falls through to the cartesian view (none here).
    press(c, '0');
    expect(said(c)).toBe('Zoomed in.');
  });

  it('keeps the cursor on its stop when the list is rebuilt', async () => {
    let order = [0, 1, 2];
    const points = TREE['tree']!.keyboardPoints!(undefined as never, {} as never, {} as never);
    const parts: TraceA11yParts = {
      tree: {
        keyboardPoints: () =>
          order.map((i) => ({ ...(points!.at(i) as KeyboardPoint), nav: undefined })),
      },
    };
    t.registry.register(treeModule(() => Promise.resolve(parts)));
    const c = await chart([{ type: 'tree', name: 'T', x: [1], y: [1] }]);
    await focus(c);
    press(c, 'ArrowRight');
    await vi.waitFor(() => expect(said(c)).toMatch(/^T: root/));
    press(c, 'ArrowRight');
    expect(said(c)).toMatch(/^T: left/);
    // The stops come back in another order (a drill-down): the cursor follows its point.
    order = [1, 2, 0];
    await c.relayout({ 'title.text': 'again' });
    press(c, 'ArrowRight');
    expect(said(c)).toMatch(/^T: right, more, point 2 of 3\.$/);
  });

  it("visits a cartesian module's own stops along the position axis, and skips it without", async () => {
    const dots = createDotsModule(createLog()) as TraceModule;
    // Aggregating traces are navigated through their stops only: here two "bins", given right to left.
    t.registry.register({
      ...dots,
      type: 'bins',
      categories: ['cartesian', 'histogram'],
      // Anchored at x = 8 and x = 2, wherever the axis puts them now.
      keyboardPoints: (_calc, _trace, ctx): KeyboardPoint[] => [
        { pointIndex: 0, distance: 0, px: ctx.xaxis!.scale.l2p(8), py: 160, hoverText: 'high' },
        {
          pointIndex: 1,
          distance: 0,
          px: ctx.xaxis!.scale.l2p(2),
          py: 80,
          hoverText: 'low',
          say: ['{name}: {text}, bin {n} of {count}.'],
        },
      ],
    });
    t.registry.register({ ...dots, type: 'nobins', categories: ['cartesian', 'histogram'] });
    const c = await chart([
      { type: 'nobins', name: 'N', x: [1, 2], y: [1, 2] },
      { type: 'bins', name: 'H', x: [1, 2], y: [1, 2] },
      A,
    ]);
    await focus(c);
    press(c, 'ArrowRight');
    expect(said(c)).toBe('H: low, bin 1 of 2.');
    press(c, 'ArrowRight');
    expect(said(c)).toBe('H: high, point 2 of 2.');
    // Page Down keeps the position: A's point nearest x = 8 (px 464 of 580).
    press(c, 'PageDown');
    expect(said(c)).toBe('A: (8, 80), point 4 of 4.');
    // Up and down move between the traces at this position, stops included.
    press(c, 'ArrowDown');
    expect(said(c)).toBe('H: high, point 2 of 2.');
    // After a zoom only stops in view are visited.
    await c.relayout({ 'xaxis.range': [5, 10] });
    press(c, 'Home');
    expect(said(c)).toBe('H: high, point 2 of 2.');
  });
});

describe('lazily loaded accessibility parts', () => {
  it("loads once per loader, serves parts by type or the chunk's default", async () => {
    const parts: TraceA11yParts = { a: { keyboardView: () => ({}) }, '*': {} };
    const load = vi.fn(() => Promise.resolve(parts));
    const first = a11yParts({ type: 'a', a11y: load });
    expect(first).toBeInstanceOf(Promise);
    expect(a11yParts({ type: 'b', a11y: load })).toBe(first);
    await first;
    expect(load).toHaveBeenCalledTimes(1);
    expect(a11yParts({ type: 'a', a11y: load })).toBe(parts['a']);
    expect(a11yParts({ type: 'b', a11y: load })).toBe(parts['*']);
    expect(a11yParts({ type: 'a' })).toBeUndefined();
    expect(a11yParts(undefined)).toBeUndefined();
  });

  it('leaves a module without parts when its chunk fails to load', async () => {
    const load = vi.fn(() => Promise.reject(new Error('offline')));
    await a11yParts({ type: 'a', a11y: load });
    expect(a11yParts({ type: 'a', a11y: load })).toBeUndefined();
    expect(load).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalled();
  });

  it('describes a trace with the generic line until its describe has loaded', async () => {
    let resolve!: (parts: TraceA11yParts) => void;
    const load = (): Promise<TraceA11yParts> => new Promise((r) => (resolve = r));
    const lazy: TraceA11yParts = { tree: { describe: () => ({ summary: 'A tree of 3 nodes.' }) } };
    t.registry.register(treeModule(load));
    const c = await chart([{ type: 'tree', name: 'T', x: [1], y: [1] }]);
    expect(c.description?.traces).toEqual(['Tree trace "T".']);
    const described = c.describe();
    resolve(lazy);
    expect((await described)?.traces).toEqual(['A tree of 3 nodes.']);
    // The hidden description follows.
    await vi.waitFor(() =>
      expect(c.element.querySelector('.holochart-a11y')?.textContent).toContain(
        'A tree of 3 nodes.',
      ),
    );
  });
});
