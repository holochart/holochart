// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attr } from '@mk7s/holochart-core';
import { createMarkers } from '@mk7s/holochart-render';
import { createChart, getChart, type Chart } from './chart.ts';
import type { ComponentModule, TraceModule } from './contracts.ts';
import { FakeResizeObserver, setup, type TestSetup } from './__testing__/fakes.ts';

const XY = { type: 'dots', x: [0, 10], y: [0, 100] };

let t: TestSetup;
let charts: Chart[] = [];

function chart(figure: Parameters<typeof createChart>[1], s: TestSetup = t): Chart {
  const c = createChart(s.container, figure, s.options);
  charts.push(c);
  return c;
}

beforeEach(() => {
  t = setup({ width: 640, height: 400 });
});

afterEach(() => {
  for (const c of charts) c.destroy();
  charts = [];
  vi.unstubAllGlobals();
});

describe('first draw', () => {
  it('runs the pipeline once and draws one frame after ready', async () => {
    const c = chart({ data: [XY, { ...XY, y: [5, 6] }] });
    expect(t.log.calc).toEqual([]);
    await c.ready;
    expect(t.log.calc).toEqual([0, 1]);
    expect(t.log.create).toEqual([0, 1]);
    expect(t.frames()).toBe(1);
    expect(c.fullData).toHaveLength(2);
  });

  it('sizes the figure from the container and lays out one viewport per subplot', async () => {
    const c = chart({ data: [XY], layout: { margin: { l: 40, r: 20, t: 30, b: 50 } } });
    await c.ready;
    expect(c.size).toEqual({ width: 640, height: 400 });
    const xy = c.subplots.get('xy');
    expect(xy?.rect).toEqual({ x: 40, y: 30, width: 580, height: 320 });
    expect(c.three.subplot('xy')).toBe(xy?.viewport);
    expect(xy?.viewport.rect).toEqual(xy?.rect);
    expect(t.renderers[0]?.calls).toContain('size 640x400');
  });

  it('gives each trace the transform of its axes (data → viewport px)', async () => {
    const c = chart({
      data: [XY],
      layout: { xaxis: { range: [0, 10] }, yaxis: { range: [0, 100] } },
    });
    await c.ready;
    const xy = c.subplots.get('xy');
    const tr = xy?.transform;
    expect(tr).toBeDefined();
    // range ends land on the viewport edges (origin bottom-left).
    expect(10 * tr!.scaleX + tr!.offsetX).toBeCloseTo(xy!.rect.width);
    expect(0 * tr!.scaleY + tr!.offsetY).toBeCloseTo(0);
    expect(100 * tr!.scaleY + tr!.offsetY).toBeCloseTo(xy!.rect.height);
    expect(c.fullLayout?.['xaxis']).toMatchObject({ range: [0, 10], autorange: false });
  });

  it('autoranges from trace extremes and writes the range in use to fullLayout', async () => {
    const c = chart({ data: [XY] });
    await c.ready;
    const range = (c.fullLayout?.['yaxis'] as { range: [number, number] }).range;
    expect(range[0]).toBeLessThanOrEqual(0);
    expect(range[1]).toBeGreaterThanOrEqual(100);
  });

  it('places cartesian subplots by axis domains (x2y2 below xy)', async () => {
    const c = chart({
      data: [XY, { ...XY, xaxis: 'x2', yaxis: 'y2' }],
      layout: {
        width: 500,
        height: 500,
        margin: { l: 0, r: 0, t: 0, b: 0 },
        yaxis: { domain: [0.55, 1] },
        xaxis2: { anchor: 'y2' },
        yaxis2: { domain: [0, 0.45], anchor: 'x2' },
      },
    });
    await c.ready;
    expect(c.subplots.get('xy')?.rect).toEqual({ x: 0, y: 0, width: 500, height: 225 });
    expect(c.subplots.get('x2y2')?.rect).toEqual({ x: 0, y: 275, width: 500, height: 225 });
    expect(c.three.viewports.map((v) => v.name)).toEqual(['subplot-xy', 'subplot-x2y2', 'overlay']);
  });

  it('falls back to layout defaults without a sized container', async () => {
    const s = setup();
    const c = chart({ data: [XY] }, s);
    await c.ready;
    expect(c.size).toEqual({ width: 700, height: 450 });
  });

  it('applies paper and plot backgrounds (transparent composites over the page)', async () => {
    const c = chart({
      data: [XY],
      layout: { paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: '#ff0000' },
    });
    await c.ready;
    expect(c.subplots.get('xy')?.viewport.background).toEqual([1, 0, 0, 1]);
    const clear = t.renderers[0]!.renderer.setClearColor.mock.calls[0];
    expect(clear?.[1]).toBe(0);
  });
});

describe('update API', () => {
  it('runs a color restyle as a style-only update (no calc, no transform)', async () => {
    const c = chart({ data: [XY, XY] });
    await c.ready;
    t.log.calc.length = 0;
    await c.restyle({ color: 'red' }, [1]);
    expect(t.log.calc).toEqual([]);
    expect(t.log.updates).toEqual([
      expect.objectContaining({
        index: 1,
        plan: { calc: false, plot: false, style: true, transform: false },
      }),
    ]);
    expect(c.fullData[1]?.['color']).toBe('rgb(255, 0, 0)');
  });

  it('recalcs only the restyled trace for data edits, and moves every trace', async () => {
    const c = chart({ data: [XY, XY] });
    await c.ready;
    t.log.calc.length = 0;
    await c.restyle({ y: [[0, 1000]] }, 0);
    expect(t.log.calc).toEqual([0]);
    const plans = t.log.updates.map((u) => [u.index, u.plan.calc, u.plan.transform]);
    expect(plans).toEqual([
      [0, true, true],
      [1, false, true],
    ]);
    // The autorange grew: trace 1 got the new transform too.
    const yr = (c.fullLayout?.['yaxis'] as { range: number[] }).range;
    expect(yr[1]).toBeGreaterThanOrEqual(1000);
  });

  it('runs an axis range relayout as transforms only', async () => {
    const c = chart({ data: [XY] });
    await c.ready;
    t.log.calc.length = 0;
    await c.relayout({ 'xaxis.range': [2, 4] });
    expect(t.log.calc).toEqual([]);
    expect(t.log.updates.at(-1)?.plan).toEqual({
      calc: false,
      plot: false,
      style: false,
      transform: true,
    });
    const tr = t.log.updates.at(-1)!.transform;
    expect(2 * tr.scaleX + tr.offsetX).toBeCloseTo(0);
    expect(c.layout).toMatchObject({ xaxis: { range: [2, 4], autorange: false } });
  });

  it('supports single-ended range edits', async () => {
    const c = chart({ data: [XY], layout: { xaxis: { range: [0, 10] } } });
    await c.ready;
    await c.relayout({ 'xaxis.range[1]': 20 });
    expect(c.fullLayout?.['xaxis']).toMatchObject({ range: [0, 20] });
  });

  it('coalesces calls in the same tick into one pipeline run and one frame', async () => {
    const c = chart({ data: [XY, XY] });
    await c.ready;
    const frames = t.frames();
    t.log.calc.length = 0;
    const done = await Promise.all([
      c.restyle({ color: 'red' }, 0),
      c.restyle({ x: [[1, 2]] }, 1),
      c.relayout({ 'yaxis.range': [0, 5] }),
    ]);
    expect(done.every((d) => d === c)).toBe(true);
    expect(t.frames()).toBe(frames + 1);
    expect(t.log.calc).toEqual([1]);
    expect(t.log.updates.map((u) => u.index)).toEqual([0, 1]);
  });

  it('does not mutate the caller’s figure; null resets and undefined is ignored', async () => {
    const trace = { ...XY, color: 'blue', label: 'a' };
    const layout = { title: { text: 'T' } };
    const c = chart({ data: [trace], layout });
    await c.ready;
    await c.restyle({ color: null, label: undefined });
    await c.relayout({ 'title.text': 'U' });
    expect(trace.color).toBe('blue');
    expect(layout.title.text).toBe('T');
    expect(c.data[0]).toEqual({ ...XY, label: 'a' });
    expect(c.fullData[0]?.['color']).toBe('rgb(31, 119, 180)'); // colorway default
    expect(c.layout).toEqual({ title: { text: 'U' } });
  });

  it('deep-merges partial figures with update()', async () => {
    const c = chart({ data: [XY, XY], layout: { margin: { l: 10 } } });
    await c.ready;
    t.log.updates.length = 0;
    await c.update({ data: [{ color: 'green' }], layout: { margin: { r: 5 } } }, { traces: [1] });
    expect(c.data[1]).toMatchObject({ color: 'green', x: XY.x });
    expect(c.layout).toEqual({ margin: { l: 10, r: 5 } });
    expect(t.log.updates.find((u) => u.index === 1)?.plan.style).toBe(true);
  });

  it('adds, deletes and moves traces, keeping views of surviving traces', async () => {
    const c = chart({ data: [XY, { ...XY, label: 'b' }] });
    await c.ready;
    await c.addTraces({ ...XY, label: 'c' }, 0);
    expect(c.data.map((d) => (d as { label?: string }).label)).toEqual(['c', undefined, 'b']);
    expect(t.log.create).toEqual([0, 1, 0]);
    await c.moveTraces(0);
    expect(c.data.map((d) => (d as { label?: string }).label)).toEqual([undefined, 'b', 'c']);
    await c.deleteTraces(-1);
    expect(t.log.disposed).toEqual([2]);
    expect(c.data).toHaveLength(2);
    // Every view was reused: only one extra create (the added trace).
    expect(t.log.create).toHaveLength(3);
  });

  it('rejects out-of-range trace indices without touching the figure', async () => {
    const c = chart({ data: [XY] });
    await c.ready;
    await expect(c.restyle({ color: 'red' }, 3)).rejects.toThrow(RangeError);
    await expect(c.deleteTraces(5)).rejects.toThrow(RangeError);
    expect(c.data).toHaveLength(1);
  });

  it('reacts to a new figure: data by reference, matched traces keep their views', async () => {
    const x = [0, 10];
    const c = chart({
      data: [
        { ...XY, x, uid: 'a' },
        { ...XY, x, uid: 'b' },
      ],
    });
    await c.ready;
    t.log.calc.length = 0;
    t.log.updates.length = 0;
    // Swap order, restyle one, same data arrays: no calc, no new views.
    await c.react({
      data: [
        { ...XY, x, uid: 'b', color: 'red' },
        { ...XY, x, uid: 'a' },
      ],
    });
    expect(t.log.calc).toEqual([]);
    expect(t.log.create).toEqual([0, 1]);
    expect(t.log.updates.map((u) => [u.index, u.plan.style, u.plan.calc])).toEqual([
      [0, true, false],
      [1, true, false],
    ]);
    // New data array for trace 0 → calc for it only.
    t.log.calc.length = 0;
    await c.react({
      data: [
        { ...XY, x: [1, 2], uid: 'b', color: 'red' },
        { ...XY, x, uid: 'a' },
      ],
    });
    expect(t.log.calc).toEqual([0]);
  });

  it('resolves immediately when react finds nothing to do', async () => {
    const c = chart({ data: [XY] });
    await c.ready;
    const frames = t.frames();
    await c.react({ data: [{ ...XY }] });
    expect(t.frames()).toBe(frames);
  });

  it('re-creates the renderer when config changes', async () => {
    const c = chart({ data: [XY] });
    await c.ready;
    await c.react({ data: [XY], config: { pixelRatio: 2 } });
    expect(t.renderers).toHaveLength(2);
    expect(t.renderers[0]?.renderer.dispose).toHaveBeenCalled();
    expect(t.log.create).toEqual([0, 0]);
  });

  it('rejects the ready promise on strict validation errors', async () => {
    const c = chart({ data: [{ ...XY, color: 12 }], config: { strict: true } });
    await expect(c.ready).rejects.toThrow();
  });

  it('hides a trace when visible is false and rebuilds it when shown again', async () => {
    const c = chart({ data: [XY] });
    await c.ready;
    await c.restyle({ visible: false });
    expect(t.log.disposed).toEqual([0]);
    await c.restyle({ visible: true });
    expect(t.log.create).toEqual([0, 0]);
  });

  it('keeps style edits style-only while another trace is hidden', async () => {
    const c = chart({ data: [XY, { ...XY, visible: false }] });
    await c.ready;
    t.log.updates.length = 0;
    await c.restyle({ color: 'red' }, 0);
    expect(t.log.updates.map((u) => u.plan)).toEqual([
      { calc: false, plot: false, style: true, transform: false },
    ]);
  });
});

describe('events', () => {
  it('emits restyle/relayout/afterplot after the frame, with plotly_ aliases', async () => {
    const c = chart({ data: [XY] });
    await c.ready;
    const seen: string[] = [];
    c.on('restyle', (e) => seen.push(`restyle ${e.traces.join()}`));
    c.on('plotly_relayout', (e) => seen.push(`relayout ${Object.keys(e).join()}`));
    const off = c.on('afterplot', () => seen.push(`afterplot ${t.frames()}`));
    await c.updateAttributes({ color: 'red' }, { 'xaxis.range': [0, 1] });
    expect(seen).toEqual(['restyle 0', 'relayout xaxis.range,xaxis.autorange', 'afterplot 2']);
    off();
    c.off('restyle');
    await c.restyle({ color: 'blue' });
    expect(seen).toHaveLength(3);
  });

  it('forwards render loop events', async () => {
    const c = chart({ data: [XY] });
    const after = vi.fn();
    c.once('afterrender', after);
    await c.ready;
    await c.restyle({ color: 'red' });
    expect(after).toHaveBeenCalledTimes(1);
  });
});

describe('lifecycle', () => {
  it('destroys everything and rejects later calls', async () => {
    const c = chart({ data: [XY] });
    await c.ready;
    const onDestroy = vi.fn();
    c.on('destroy', onDestroy);
    c.destroy();
    c.destroy();
    expect(onDestroy).toHaveBeenCalledTimes(1);
    expect(t.log.disposed).toEqual([0]);
    expect(t.renderers[0]?.renderer.dispose).toHaveBeenCalled();
    expect(t.container.querySelector('canvas')).toBeNull();
    expect(getChart(t.container)).toBeUndefined();
    await expect(c.restyle({ color: 'red' })).rejects.toThrow(/destroyed/);
  });

  it('replaces a chart already in the element', async () => {
    const a = chart({ data: [XY] });
    const b = chart({ data: [XY] });
    await b.ready;
    expect(a.destroyed).toBe(true);
    expect(getChart(t.container)).toBe(b);
  });

  it('follows the container with config.responsive', async () => {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    FakeResizeObserver.instances = [];
    const c = chart({ data: [XY], config: { responsive: true } });
    await c.ready;
    const resized = vi.fn();
    c.on('resize', resized);
    Object.defineProperty(t.container, 'clientWidth', { value: 320, configurable: true });
    FakeResizeObserver.instances[0]?.fire(320, 400);
    await vi.waitFor(() => expect(resized).toHaveBeenCalledWith({ width: 320, height: 400 }));
    expect(c.size.width).toBe(320);
    c.destroy();
    expect(FakeResizeObserver.instances[0]?.disconnected).toBe(true);
  });

  it('exposes the three.js objects of a trace', async () => {
    const markerTrace: TraceModule<null> = {
      type: 'm',
      categories: ['cartesian'],
      schema: attr.object({}),
      meta: { description: 'markers' },
      supplyDefaults() {},
      calc: () => null,
      plot: {
        create(ctx) {
          ctx.add(createMarkers(ctx.primitives, { x: [0], y: [0] }));
          return { update() {} };
        },
      },
    };
    t.registry.register(markerTrace);
    const c = chart({ data: [{ type: 'm' }] });
    await c.ready;
    const objects = c.getTraceObjects(0);
    expect(objects).toHaveLength(1);
    expect(c.three.subplot('xy')?.scene.children).toContain(objects[0]);
    await c.deleteTraces(0);
    expect(c.three.subplot('xy')?.scene.children ?? []).not.toContain(objects[0]);
  });
});

describe('components', () => {
  it('lets components push margins and draw with the solved layout', async () => {
    const draws: string[] = [];
    const axes: ComponentModule = {
      name: 'axes',
      pushMargin: ({ axes }) => (axes.has('y') ? { l: 150 } : undefined),
      draw: {
        create(ctx) {
          draws.push(`create ${ctx.plotArea.x} ${[...ctx.subplots.keys()].join()}`);
          return {
            update(c, plan) {
              draws.push(
                `update ${c.axes.get('x')?.l2c(c.axes.get('x')!.scale.range[0])} ${plan.layout}`,
              );
            },
          };
        },
      },
    };
    const s = setup({ width: 640, height: 400, components: [axes] });
    const c = chart({ data: [XY], layout: { xaxis: { range: [0, 10] } } }, s);
    await c.ready;
    await c.restyle({ color: 'red' });
    await c.relayout({ 'xaxis.range': [1, 2] });
    expect(draws).toEqual(['create 150 xy', 'update 150 false', 'update 150 true']);
  });
});
