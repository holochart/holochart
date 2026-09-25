// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { createChart, type Chart } from './chart.ts';
import type {
  ComponentModule,
  SubplotMirror,
  SubplotMirrorOptions,
  TraceModule,
  TracePlotContext,
  TraceUpdatePlan,
} from './contracts.ts';
import { createDotsModule, createLog, setup, type TestSetup } from './__testing__/fakes.ts';

/**
 * Subplot mirrors (E5.9) and layout selections (E5.12) in the chart runtime, with a fake renderer:
 * a test component mirrors `xy`, and a trace type records which viewport each view draws into.
 */

const XY = { type: 'dots', x: [0, 10], y: [0, 100] };

interface ViewCall {
  index: number;
  viewport: string;
  plan?: TraceUpdatePlan;
  transform: TracePlotContext['transform'];
  selected: readonly number[] | null | undefined;
}

/** The dots module, plus a record of which viewport every create / update used. */
function recordingDots(calls: ViewCall[], disposed: string[]): TraceModule {
  const base = createDotsModule(createLog()) as TraceModule;
  return {
    ...base,
    plot: {
      create(ctx) {
        const viewport = ctx.viewport.name;
        calls.push({
          index: ctx.index,
          viewport,
          transform: { ...ctx.transform },
          selected: ctx.selectedPoints,
        });
        return {
          update(c, plan) {
            calls.push({
              index: c.index,
              viewport: c.viewport.name,
              plan: { ...plan },
              transform: { ...c.transform },
              selected: c.selectedPoints,
            });
          },
          dispose() {
            disposed.push(viewport);
          },
        };
      },
    },
  };
}

/** A component that mirrors `xy` into `options()`; `mirror` is its handle. */
function mirrorComponent(options: () => SubplotMirrorOptions): {
  module: ComponentModule;
  mirror: () => SubplotMirror | undefined;
  autorange: (id: string) => readonly [number, number] | undefined;
} {
  let mirror: SubplotMirror | undefined;
  let autorange: (id: string) => readonly [number, number] | undefined = () => undefined;
  const module: ComponentModule = {
    name: 'test-mirror',
    draw: {
      create(ctx) {
        mirror = ctx.mirrorSubplot?.('xy', options());
        autorange = (id) => ctx.autorange?.(id);
        return {
          update(c) {
            autorange = (id) => c.autorange?.(id);
          },
          dispose() {
            mirror?.dispose();
          },
        };
      },
    },
  };
  return { module, mirror: () => mirror, autorange: (id) => autorange(id) };
}

let charts: Chart[] = [];

function chart(s: TestSetup, figure: Parameters<typeof createChart>[1]): Chart {
  const c = createChart(s.container, figure, s.options);
  charts.push(c);
  return c;
}

afterEach(() => {
  for (const c of charts) c.destroy();
  charts = [];
});

const RECT = { x: 40, y: 300, width: 200, height: 40 };

function mirrored(): {
  s: TestSetup;
  calls: ViewCall[];
  disposed: string[];
  handle: ReturnType<typeof mirrorComponent>;
} {
  const calls: ViewCall[] = [];
  const disposed: string[] = [];
  const handle = mirrorComponent(() => ({ rect: RECT, x: [0, 20], y: [0, 200] }));
  const s = setup({ width: 640, height: 400, components: [handle.module] });
  s.registry.register(recordingDots(calls, disposed));
  return { s, calls, disposed, handle };
}

describe('subplot mirrors (E5.9)', () => {
  it("draws every trace of the subplot a second time in the mirror's viewport", async () => {
    const { s, calls } = mirrored();
    const c = chart(s, { data: [XY, { ...XY, y: [5, 6] }] });
    await c.ready;
    const creates = calls.filter((k) => k.plan === undefined);
    expect(creates.map((k) => `${k.viewport}:${k.index}`)).toEqual([
      'subplot-xy:0',
      'subplot-xy:1',
      'mirror-xy:0',
      'mirror-xy:1',
    ]);
    // Linear x 0..20 across 200 px, y 0..200 across 40 px (world origin at the rect's bottom).
    const t = creates[2]?.transform;
    expect(t?.scaleX).toBeCloseTo(10);
    expect(t?.offsetX).toBeCloseTo(0);
    expect(t?.scaleY).toBeCloseTo(0.2);
    const vp = c.three.viewports.find((v) => v.name === 'mirror-xy');
    expect(vp?.rect).toEqual(RECT);
    // After every subplot, before the overlay.
    const names = c.three.viewports.map((v) => v.name);
    expect(names.indexOf('mirror-xy')).toBe(names.length - 2);
  });

  it('keeps mirror views in step with the main ones (style, data)', async () => {
    const { s, calls } = mirrored();
    const c = chart(s, { data: [XY] });
    await c.ready;
    calls.length = 0;
    await c.restyle({ color: 'red' });
    expect(calls.map((k) => [k.viewport, k.plan?.style, k.plan?.calc])).toEqual([
      ['subplot-xy', true, false],
      ['mirror-xy', true, false],
    ]);
    calls.length = 0;
    await c.restyle({ y: [[1, 2]] });
    expect(calls.map((k) => [k.viewport, k.plan?.calc])).toEqual([
      ['subplot-xy', true],
      ['mirror-xy', true],
    ]);
  });

  it('moves and re-ranges with transform-only updates', async () => {
    const { s, calls, handle } = mirrored();
    const c = chart(s, { data: [XY] });
    await c.ready;
    calls.length = 0;
    handle.mirror()?.set({ rect: { ...RECT, width: 400 }, x: [0, 10], y: [0, 200] });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.viewport).toBe('mirror-xy');
    expect(calls[0]?.plan).toEqual({ calc: false, plot: false, style: false, transform: true });
    expect(calls[0]?.transform.scaleX).toBeCloseTo(40);
    // A zoom of the main axes does not move the mirror.
    calls.length = 0;
    await c.relayout({ 'xaxis.range': [2, 4] });
    expect(calls.map((k) => k.viewport)).toEqual(['subplot-xy']);
  });

  it('follows traces added, hidden and removed, and disposes with its component', async () => {
    const { s, calls, disposed } = mirrored();
    const c = chart(s, { data: [XY] });
    await c.ready;
    calls.length = 0;
    await c.addTraces({ ...XY, y: [3, 4] });
    expect(calls.filter((k) => k.viewport === 'mirror-xy' && !k.plan).map((k) => k.index)).toEqual([
      0, 1,
    ]);
    disposed.length = 0;
    await c.restyle({ visible: false }, [1]);
    expect(disposed).toEqual(['subplot-xy', 'mirror-xy']);
    c.destroy();
    expect(disposed.filter((d) => d === 'mirror-xy')).toHaveLength(2);
  });

  it('gives components the full-data autorange of an axis, whatever its range', async () => {
    const { s, handle } = mirrored();
    const c = chart(s, { data: [XY], layout: { xaxis: { range: [2, 3] } } });
    await c.ready;
    const r = handle.autorange('x');
    expect(r?.[0]).toBeLessThan(0);
    expect(r?.[1]).toBeGreaterThan(10);
    expect(c.axes.get('x')?.scale.range).toEqual([2, 3]);
    expect(handle.autorange('nope')).toBeUndefined();
  });
});

describe('previewRanges / commitRanges', () => {
  it('previews transforms only and commits one relayout with range[i] keys', async () => {
    const { s, calls } = mirrored();
    const c = chart(s, { data: [XY] });
    await c.ready;
    const relayouting: unknown[] = [];
    const relayout: unknown[] = [];
    c.on('relayouting', (e) => relayouting.push(e));
    c.on('relayout', (e) => relayout.push(e));
    calls.length = 0;
    c.previewRanges({ x: [2, 6] });
    expect(c.axes.get('x')?.scale.range).toEqual([2, 6]);
    expect(calls.map((k) => [k.viewport, k.plan?.transform, k.plan?.calc])).toEqual([
      ['subplot-xy', true, false],
    ]);
    expect(relayouting).toEqual([{ 'xaxis.range[0]': 2, 'xaxis.range[1]': 6 }]);
    expect(c.layout['xaxis']).toBeUndefined();
    await c.commitRanges({ x: [2, 6] });
    expect(relayout).toEqual([{ 'xaxis.range[0]': 2, 'xaxis.range[1]': 6 }]);
    expect(c.layout['xaxis']).toEqual({ range: [2, 6], autorange: false });
  });
});

describe('layout selections (E5.12)', () => {
  const POINTS = { type: 'dots', x: [0, 1, 2, 3, 4], y: [0, 1, 2, 3, 4] };

  function selections(): { s: TestSetup; calls: ViewCall[] } {
    const calls: ViewCall[] = [];
    const s = setup({ width: 640, height: 400 });
    s.registry.register(recordingDots(calls, []));
    return { s, calls };
  }

  it('select the points inside them on load, and selectedpoints follows', async () => {
    const { s, calls } = selections();
    const c = chart(s, {
      data: [POINTS, { ...POINTS, y: [4, 3, 2, 1, 0] }],
      layout: {
        selections: [
          { type: 'rect', x0: 0.5, x1: 2.5, y0: 0.5, y1: 2.5 },
          { type: 'path', path: 'M3.5,3.5L4.5,3.5L4.5,4.5L3.5,4.5Z' },
        ],
      },
    });
    await c.ready;
    expect(c.fullData[0]?.['selectedpoints']).toEqual([1, 2, 4]);
    expect(c.fullData[1]?.['selectedpoints']).toEqual([2]);
    expect(calls.find((k) => k.index === 0)?.selected).toEqual([1, 2, 4]);
    // The input traces are left as given.
    expect((c.data[0] as Record<string, unknown>)['selectedpoints']).toBeUndefined();
  });

  it('clear when the selections go, and reselect when they change', async () => {
    const { s } = selections();
    const c = chart(s, {
      data: [POINTS],
      layout: { selections: [{ x0: 0.5, x1: 2.5, y0: 0.5, y1: 2.5 }] },
    });
    await c.ready;
    await c.relayout({ 'selections[0].x1': 3.5, 'selections[0].y1': 3.5 });
    expect(c.fullData[0]?.['selectedpoints']).toEqual([1, 2, 3]);
    await c.relayout({ selections: [] });
    expect(c.fullData[0]?.['selectedpoints']).toBeUndefined();
  });

  it('emit selected after a GUI edit of a selection', async () => {
    const { s } = selections();
    const c = chart(s, {
      data: [POINTS],
      layout: { selections: [{ x0: 0.5, x1: 2.5, y0: 0.5, y1: 2.5 }] },
    });
    await c.ready;
    const events: { points: { pointNumber: number }[]; selections?: unknown }[] = [];
    c.on('selected', (e) => events.push(e as never));
    await c.relayout({ 'selections[0].x0': -0.5 }, { gui: true });
    expect(events).toHaveLength(1);
    expect(events[0]?.points.map((p) => p.pointNumber)).toEqual([1, 2]);
    expect(events[0]?.selections).toEqual([{ x0: -0.5, x1: 2.5, y0: 0.5, y1: 2.5 }]);
    // A programmatic edit selects again silently (Plotly emits on user edits).
    await c.relayout({ 'selections[0].x0': 1.5 });
    expect(events).toHaveLength(1);
    expect(c.fullData[0]?.['selectedpoints']).toEqual([2]);
  });

  it('an input selectedpoints edit wins for its trace', async () => {
    const { s } = selections();
    const c = chart(s, {
      data: [POINTS],
      layout: { selections: [{ x0: 0.5, x1: 2.5, y0: 0.5, y1: 2.5 }] },
    });
    await c.ready;
    await c.restyle({ selectedpoints: [[4]] });
    expect(c.fullData[0]?.['selectedpoints']).toEqual([4]);
  });

  it('clearSelection removes them and emits deselect', async () => {
    const { s } = selections();
    const c = chart(s, {
      data: [POINTS],
      layout: { selections: [{ x0: 0.5, x1: 2.5, y0: 0.5, y1: 2.5 }] },
    });
    await c.ready;
    let deselected = 0;
    c.on('deselect', () => deselected++);
    await c.clearSelection();
    await c.ready;
    await Promise.resolve();
    await c.resize();
    expect(deselected).toBe(1);
    expect(c.layout['selections']).toEqual([]);
    expect(c.fullData[0]?.['selectedpoints']).toBeUndefined();
  });

  it('ignore incomplete selections and ones on missing subplots', async () => {
    const { s } = selections();
    const c = chart(s, {
      data: [POINTS],
      layout: {
        selections: [
          { x0: 0.5, x1: 2.5, y0: 0.5 },
          { x0: 0, x1: 9, y0: 0, y1: 9, xref: 'x2', yref: 'y2' },
        ],
      },
    });
    await c.ready;
    expect(c.fullData[0]?.['selectedpoints']).toBeUndefined();
  });
});
