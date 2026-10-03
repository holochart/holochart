// @vitest-environment jsdom
/**
 * Keyboard navigation of traces that list their own stops (`keyboardPoints`): a plain list walked
 * with the arrows, Home and End; traces without stops; moving between such a trace and a cartesian
 * one; Enter on a stop; and view keys on traces that handle them (`keyboardView`). Through a real
 * chart with a fake renderer; the figure is 640×400 with margins l 40, r 20, t 30, b 50, x in
 * [0, 10] and y in [0, 100], so data x sits at container x = 40 + 58·x.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FigureInput } from '@mk7s/holochart-core';
import { createChart, type Chart } from '../chart.ts';
import type {
  ComponentPointerEvent,
  KeyboardPoint,
  TraceA11yParts,
  TraceModule,
} from '../contracts.ts';
import type { ChartEventName } from '../events.ts';
import { createDotsModule, createLog, setup, type TestSetup } from '../__testing__/fakes.ts';

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

/** A stop anchored at container `(x, y)` of the 640×400 figure, labelled `text`. */
function stop(i: number, x: number, y: number, text: string): KeyboardPoint {
  return { pointIndex: i, distance: 0, px: x, py: 400 - y, hoverText: text, showName: false };
}

/** A trace type placed on the figure without axes (like pie), with the given parts on top. */
function domainModule(type: string, parts: Partial<TraceModule>): TraceModule {
  return {
    ...(createDotsModule(createLog()) as TraceModule),
    type,
    categories: [],
    hoverPoints: () => [],
    subplotDomain: () => ({ x: [0, 1], y: [0, 1] }),
    ...parts,
  };
}

/** Three stops in reading order, none saying where its arrows lead; the first sits over x = 4. */
const STOPS: KeyboardPoint[] = [
  stop(0, 272, 200, 'one'),
  stop(1, 330, 200, 'two'),
  stop(2, 388, 200, 'three'),
];

const A = { type: 'dots', name: 'A', x: [4, 0, 8, 2], y: [40, 10, 80, 20] };
const LIST = { type: 'list', name: 'L', x: [1], y: [1] };

describe('a list of stops', () => {
  it('starts at its last stop with End', async () => {
    t.registry.register(domainModule('list', { keyboardPoints: () => STOPS }));
    const c = await chart([LIST]);
    await focus(c);
    press(c, 'End');
    expect(said(c)).toBe('L: three, point 3 of 3.');
  });

  it('goes back with ← / ↑ and on with → / ↓, to the ends with Home / End, and stops there', async () => {
    t.registry.register(domainModule('list', { keyboardPoints: () => STOPS }));
    const c = await chart([LIST]);
    await focus(c);
    press(c, 'ArrowDown');
    expect(said(c)).toBe('L: one, point 1 of 3.');
    press(c, 'ArrowDown');
    expect(said(c)).toBe('L: two, point 2 of 3.');
    press(c, 'End');
    expect(said(c)).toBe('L: three, point 3 of 3.');
    press(c, 'ArrowRight'); // the last stop: stays
    expect(said(c)).toBe('L: three, point 3 of 3.');
    press(c, 'ArrowUp');
    expect(said(c)).toBe('L: two, point 2 of 3.');
    press(c, 'ArrowLeft');
    expect(said(c)).toBe('L: one, point 1 of 3.');
    press(c, 'ArrowLeft'); // the first stop: stays
    expect(said(c)).toBe('L: one, point 1 of 3.');
    press(c, 'End');
    press(c, 'Home');
    expect(said(c)).toBe('L: one, point 1 of 3.');
  });

  it('is skipped when the trace lists no stops, or its module has none to list', async () => {
    t.registry.register(
      domainModule('nostops', {}),
      domainModule('empty', { keyboardPoints: () => [] }),
      domainModule('list', { keyboardPoints: () => STOPS }),
    );
    const c = await chart([
      { type: 'nostops', name: 'N', x: [1], y: [1] },
      { type: 'empty', name: 'E', x: [1], y: [1] },
      LIST,
    ]);
    await focus(c);
    press(c, 'ArrowRight');
    expect(said(c)).toBe('L: one, point 1 of 3.');
    // There is no trace before it to go to.
    press(c, 'PageUp');
    expect(said(c)).toBe('L: one, point 1 of 3.');
  });
});

describe('Page Up / Page Down between a cartesian trace and a list of stops', () => {
  it('enters the list at its first stop, and comes back to the point nearest to the stop', async () => {
    t.registry.register(domainModule('list', { keyboardPoints: () => STOPS }));
    const c = await chart([A, LIST]);
    await focus(c);
    press(c, 'End');
    expect(said(c)).toBe('A: (8, 80), point 4 of 4.');
    press(c, 'PageDown');
    expect(said(c)).toBe('L: one, point 1 of 3.');
    // That stop is drawn over x = 4.
    press(c, 'PageUp');
    expect(said(c)).toBe('A: (4, 40), point 3 of 4.');
  });
});

describe('Enter on a stop', () => {
  it('goes to the view of a trace without axes first; a click it handles is not emitted', async () => {
    let handles = true;
    const seen: Partial<ComponentPointerEvent>[] = [];
    t.registry.register(
      domainModule('list', {
        keyboardPoints: () => STOPS,
        plot: {
          create: () => ({
            update: () => undefined,
            handlePointer(e) {
              seen.push({ type: e.type, x: e.x, y: e.y, shiftKey: e.shiftKey, native: e.native });
              return handles;
            },
          }),
        },
      }),
    );
    const c = await chart([LIST]);
    const log = record(c, 'click');
    await focus(c);
    press(c, 'ArrowRight');
    press(c, 'ArrowRight');
    const first = press(c, 'Enter');
    // The click lands on the stop's anchor (a drill-down, in a hierarchy).
    expect(seen).toEqual([{ type: 'click', x: 330, y: 200, shiftKey: false, native: first }]);
    expect(log).toHaveLength(0);
    handles = false;
    const second = press(c, 'Enter');
    expect(seen).toHaveLength(2);
    expect(log).toHaveLength(1);
    const payload = log[0]?.payload as { points: Record<string, unknown>[]; event: Event };
    expect(payload.event).toBe(second);
    expect(payload.points).toHaveLength(1);
    expect(payload.points[0]).toMatchObject({
      curveNumber: 0,
      pointNumber: 1,
      bbox: { x0: 330, x1: 330, y0: 200, y1: 200 },
    });
  });

  it('clicks a cartesian module’s own stop without selecting it (clickmode select)', async () => {
    const dots = createDotsModule(createLog()) as TraceModule;
    // Two "bins" at x = 2 and x = 8: stops, not data points.
    t.registry.register({
      ...dots,
      type: 'bins',
      categories: ['cartesian', 'histogram'],
      keyboardPoints: (_calc, _trace, ctx): KeyboardPoint[] => [
        { pointIndex: 0, distance: 0, px: ctx.xaxis!.scale.l2p(2), py: 80, hoverText: 'low' },
        { pointIndex: 1, distance: 0, px: ctx.xaxis!.scale.l2p(8), py: 160, hoverText: 'high' },
      ],
    });
    const c = await chart([{ type: 'bins', name: 'H', x: [1, 2], y: [1, 2] }], {
      clickmode: 'event+select',
    });
    const log = record(c, 'click', 'selected');
    await focus(c);
    press(c, 'End');
    expect(said(c)).toBe('H: high, point 2 of 2.');
    press(c, 'Enter');
    await c.relayout({});
    expect(log.map((l) => l.name)).toEqual(['click']);
    const payload = log[0]?.payload as { points: Record<string, unknown>[] };
    expect(payload.points[0]).toMatchObject({ curveNumber: 0, pointNumber: 1 });
  });
});

describe('view keys on traces that handle them', () => {
  /** Each trace's view keys relayout the attribute its `label` names (a scene's camera, really). */
  const VIEWS: TraceA11yParts = {
    scene: {
      keyboardPoints: (_calc, trace) => [stop(0, 320, 200, String(trace['name']))],
      keyboardView: (trace, _ctx, action) => ({ [String(trace['label'])]: action }),
    },
  };

  it('go to every such trace without a cursor, and to the cursor’s trace only with one', async () => {
    t.registry.register(domainModule('scene', { a11y: () => Promise.resolve(VIEWS) }));
    const c = await chart([
      { type: 'scene', name: 'S1', label: 'title.text', x: [1], y: [1] },
      { type: 'scene', name: 'S2', label: 'meta', x: [1], y: [1] },
    ]);
    const log = record(c, 'relayout');
    await focus(c);
    press(c, '+');
    await vi.waitFor(() => expect(log).toHaveLength(1));
    expect(log[0]?.payload).toEqual({ 'title.text': 'zoomIn', meta: 'zoomIn' });
    expect(said(c)).toBe('Zoomed in.');
    press(c, 'PageDown');
    press(c, 'PageDown');
    expect(said(c)).toBe('S2: S2, point 1 of 1.');
    press(c, '-');
    await vi.waitFor(() => expect(log).toHaveLength(2));
    expect(log[1]?.payload).toEqual({ meta: 'zoomOut' });
    expect(said(c)).toBe('Zoomed out.');
  });
});
