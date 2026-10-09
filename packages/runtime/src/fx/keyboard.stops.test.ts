// @vitest-environment jsdom
/**
 * Keyboard navigation of traces that list their own stops (`keyboardPoints`): a plain list walked
 * with the arrows, Home and End; traces without stops; moving between such a trace and a cartesian
 * one; Enter on a stop; stops built on demand, and where the cursor is among them after an update
 * (`KeyboardStops.locate`); and view keys on traces that handle them (`keyboardView`). Through a
 * real chart with a fake renderer; the figure is 640×400 with margins l 40, r 20, t 30, b 50, x in
 * [0, 10] and y in [0, 100], so data x sits at container x = 40 + 58·x.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FigureInput, FullTrace } from '@mk7s/holochart-core';
import { createChart, type Chart } from '../chart.ts';
import type {
  ComponentPointerEvent,
  KeyboardPoint,
  KeyboardStops,
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

/** The texts of the hover labels showing now. */
function labels(c: Chart): string[] {
  return [...c.element.querySelectorAll<HTMLElement>('.holochart-hoverlabel')]
    .filter((el) => el.style.display !== 'none')
    .map((el) => el.textContent ?? '');
}

/** What each stop of a `net` trace stands for: the first letter of its word. */
const IDS = new WeakMap<KeyboardPoint, string>();

/**
 * A trace type on cartesian axes whose stops are built on demand, like a graph's nodes: one per
 * word of the trace's `label`, 58 px apart from the left of the plot area and 160 px above its
 * bottom, so stop `i` sits at container (98 + 58·i, 190). A stop stands for the first letter of
 * its word and shows the word; a word that ends in `!` asks for the click of Enter
 * (`KeyboardPoint.click`). With `locate`, the stops find the cursor again by that letter.
 */
function netModule(parts: Partial<TraceModule> = {}, locate = true): TraceModule {
  return {
    ...(createDotsModule(createLog()) as TraceModule),
    type: 'net',
    categories: ['cartesian'],
    keyboardPoints(_calc, trace): KeyboardStops {
      const words = String(trace['label']).split(' ');
      const stops: KeyboardStops = {
        length: words.length,
        at(i) {
          const word = words[i];
          if (word === undefined) return undefined;
          const point: KeyboardPoint = {
            pointIndex: i,
            distance: 0,
            px: 58 * (i + 1),
            py: 160,
            hoverText: word.replace('!', ''),
            showName: false,
            ...(word.endsWith('!') ? { click: true } : {}),
          };
          IDS.set(point, word[0] as string);
          return point;
        },
      };
      if (!locate) return stops;
      return { ...stops, locate: (point) => words.findIndex((w) => w[0] === IDS.get(point)) };
    },
    ...parts,
  };
}

const NET = { type: 'net', name: 'N', x: [1], y: [1], label: 'a b c' };

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

  it('goes to the view of a trace on cartesian axes only for a stop that asks for it', async () => {
    let handles = false;
    const seen: Partial<ComponentPointerEvent>[] = [];
    const plot: TraceModule['plot'] = {
      create: () => ({
        update: () => undefined,
        handlePointer(e) {
          seen.push({ type: e.type, x: e.x, y: e.y, native: e.native });
          return handles;
        },
      }),
    };
    t.registry.register(netModule({ plot }), {
      ...(createDotsModule(createLog()) as TraceModule),
      type: 'linked',
      plot,
    });
    const c = await chart([
      { ...NET, label: 'a b!' },
      { ...A, type: 'linked' },
    ]);
    const log = record(c, 'click');
    await focus(c);
    press(c, 'ArrowRight');
    expect(said(c)).toBe('N: a, point 1 of 2.');
    press(c, 'Enter');
    // A stop that does not ask: the chart's click only, as for a data point.
    expect(seen).toHaveLength(0);
    expect(log).toHaveLength(1);
    press(c, 'ArrowRight');
    const enter = press(c, 'Enter');
    // The click lands on the stop's anchor (a tree node of a graph folds); it is the chart's too.
    expect(seen).toEqual([{ type: 'click', x: 40 + 116, y: 350 - 160, native: enter }]);
    expect(log).toHaveLength(2);
    expect((log[1]?.payload as { event: Event }).event).toBe(enter);
    // A click the view takes is not emitted.
    handles = true;
    press(c, 'Enter');
    expect(seen).toHaveLength(2);
    expect(log).toHaveLength(2);
    // The data points of a trace whose view takes clicks (a link in a text label) are not offered.
    handles = false;
    press(c, 'PageDown');
    expect(said(c)).toMatch(/^A: /);
    press(c, 'Enter');
    expect(seen).toHaveLength(2);
    expect(log).toHaveLength(3);
  });

  it('announces the stop again when the click changed what it says', async () => {
    let next: string | undefined;
    const made: { chart?: Chart } = {};
    t.registry.register(
      netModule({
        plot: {
          create: () => ({
            update: () => undefined,
            // A click that changes the figure, as a fold does, and is left to the chart.
            handlePointer(e) {
              if (e.type === 'click' && next !== undefined)
                void made.chart?.restyle({ label: next });
              return false;
            },
          }),
        },
      }),
    );
    const c = await chart([{ ...NET, label: 'a b! c' }]);
    made.chart = c;
    const live = (): string => target(c).querySelector('.holochart-live')?.textContent ?? '';
    await focus(c);
    press(c, 'ArrowRight');
    press(c, 'ArrowRight');
    expect(said(c)).toBe('N: b, point 2 of 3.');
    next = 'a c b-folded!';
    press(c, 'Enter');
    await c.relayout({});
    // The stop is found again among the new ones, and says what it is now.
    expect(said(c)).toBe('N: b-folded, point 3 of 3.');
    expect(labels(c)).toEqual(['b-folded']);
    // A click that changes nothing the stop says is not announced again.
    const once = live();
    next = 'a c-more b-folded!';
    press(c, 'Enter');
    await c.relayout({});
    expect(live()).toBe(once);
    // Neither is an update that no click started, though the stop says something else after it,
    next = undefined;
    await c.restyle({ label: 'a c-more b-folded! d' });
    expect(live()).toBe(once);
    press(c, 'ArrowRight');
    expect(said(c)).toBe('N: d, point 4 of 4.');
    press(c, 'ArrowLeft');
    expect(said(c)).toBe('N: b-folded, point 3 of 4.');
    // nor one that comes after another key.
    press(c, 'Enter');
    press(c, 'ArrowLeft');
    expect(said(c)).toBe('N: c-more, point 2 of 4.');
    await c.restyle({ label: 'a c-most b-folded! d' });
    expect(said(c)).toBe('N: c-more, point 2 of 4.');
    expect(labels(c)).toEqual(['c-most']);
  });
});

describe('stops built on demand', () => {
  it('keep the cursor on its stop through an update when they say where it is', async () => {
    t.registry.register(netModule());
    const c = await chart([NET]);
    await focus(c);
    press(c, 'End');
    expect(said(c)).toBe('N: c, point 3 of 3.');
    // The stops are numbered again: c is the second of them now.
    await c.restyle({ label: 'x c a' });
    expect(labels(c)).toEqual(['c']);
    press(c, 'ArrowLeft');
    expect(said(c)).toBe('N: x, point 1 of 3.');
    press(c, 'End');
    expect(said(c)).toBe('N: a, point 3 of 3.');
    // Its stop is gone and the stops name no other (-1): the first stop.
    await c.restyle({ label: 'x c' });
    expect(labels(c)).toEqual(['x']);
    press(c, 'ArrowRight');
    expect(said(c)).toBe('N: c, point 2 of 2.');
  });

  it('follow the cursor while focus is elsewhere, without showing its label', async () => {
    t.registry.register(netModule());
    const c = await chart([NET]);
    await focus(c);
    press(c, 'End');
    target(c).blur();
    // As after a legend item hid the cursor's stop and showed it again.
    await c.restyle({ label: 'a b' });
    await c.restyle({ label: 'c a b' });
    expect(labels(c)).toEqual([]);
    target(c).focus();
    press(c, 'ArrowRight');
    expect(said(c)).toBe('N: a, point 2 of 3.');
  });

  it('keep the index of the cursor when they do not say where it is', async () => {
    t.registry.register(netModule({}, false));
    const c = await chart([NET]);
    await focus(c);
    press(c, 'End');
    await c.restyle({ label: 'c a b' });
    expect(labels(c)).toEqual(['b']);
    // No stop at that index any more: the cursor is dropped, and the next key starts over.
    await c.restyle({ label: 'c a' });
    expect(labels(c)).toEqual([]);
    press(c, 'ArrowRight');
    expect(said(c)).toBe('N: c, point 1 of 2.');
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

  it('announce what the traces say of their new view, each sentence once', async () => {
    // A map: every trace of a subplot moves the same view and says the same of it.
    const says = vi.fn(
      (trace: FullTrace, action: string, update: Readonly<Record<string, unknown>>) =>
        action === 'reset' || trace['quiet'] === true
          ? undefined
          : ([
              '{what} now at {at}.',
              { what: String(trace['label']), at: String(Object.values(update)[0]) },
            ] as const),
    );
    const MAPS: TraceA11yParts = {
      map: {
        keyboardView: (trace, _ctx, action) => ({ [String(trace['label'])]: action }),
        keyboardViewSay: (trace, _ctx, action, update) => says(trace, action, update),
      },
    };
    t.registry.register(domainModule('map', { a11y: () => Promise.resolve(MAPS) }));
    const c = await chart([
      { type: 'map', name: 'M1', label: 'title.text', x: [1], y: [1] },
      { type: 'map', name: 'M2', label: 'title.text', x: [1], y: [1] },
      { type: 'map', name: 'M3', label: 'meta', x: [1], y: [1] },
      { type: 'map', name: 'M4', label: 'meta', quiet: true, x: [1], y: [1] },
    ]);
    const log = record(c, 'relayout');
    await focus(c);
    press(c, 'ArrowLeft', { shiftKey: true });
    await vi.waitFor(() => expect(log).toHaveLength(1));
    expect(log[0]?.payload).toEqual({ 'title.text': 'panLeft', meta: 'panLeft' });
    expect(said(c)).toBe('title.text now at panLeft. meta now at panLeft.');
    // Each trace is asked with the update it gave itself, before the relayout is applied.
    expect(says.mock.calls[0]?.[2]).toEqual({ 'title.text': 'panLeft' });
    expect(says.mock.calls[2]?.[2]).toEqual({ meta: 'panLeft' });
    // Without a sentence of the traces' own, the runtime's.
    press(c, '0');
    await vi.waitFor(() => expect(log).toHaveLength(2));
    expect(said(c)).toBe('View reset.');
  });
});
