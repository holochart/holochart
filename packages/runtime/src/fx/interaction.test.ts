// @vitest-environment jsdom
/**
 * Interaction dispatch through a real chart with a fake renderer (no WebGL): hover, click,
 * zoom / pan, selection, wheel and component pointer hooks. The container is 640×400 with margins
 * l 40, r 20, t 30, b 50, so the `xy` plot area is x 40–620, y 30–350; with x in [0, 10] and y in
 * [0, 100], data (x, y) sits at container (40 + 58·x, 350 − 3.2·y).
 */
import { attr, type FigureInput } from '@mk7s/holochart-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChart, type Chart } from '../chart.ts';
import type { ComponentModule, TraceModule } from '../contracts.ts';
import type { ChartEventName } from '../events.ts';
import { createDotsModule, createLog, setup, type TestSetup } from '../__testing__/fakes.ts';
import { selectionContains } from './geometry.ts';

const MARGIN = { l: 40, r: 20, t: 30, b: 50 };
const RANGES = { xaxis: { range: [0, 10] }, yaxis: { range: [0, 100] } };
const DOTS = { type: 'dots', x: [0, 5, 10], y: [0, 50, 100] };

const cx = (x: number): number => 40 + 58 * x;
const cy = (y: number): number => 350 - 3.2 * y;

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
  vi.useRealTimers();
});

async function chart(
  data: unknown[],
  layout: Record<string, unknown> = {},
  config: Record<string, unknown> = {},
  s: TestSetup = t,
): Promise<Chart> {
  const c = createChart(
    s.container,
    { data, layout: { margin: MARGIN, ...RANGES, ...layout }, config } as FigureInput,
    s.options,
  );
  charts.push(c);
  await c.ready;
  return c;
}

function canvas(c: Chart): HTMLCanvasElement {
  return c.three.root.canvas;
}

function fire(
  c: Chart,
  type: string,
  x: number,
  y: number,
  init: Partial<PointerEventInit> = {},
): void {
  canvas(c).dispatchEvent(
    new PointerEvent(type, {
      clientX: x,
      clientY: y,
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      bubbles: true,
      ...init,
    }),
  );
}

/** Deliver pending animation frames (hover and drag work runs once per frame). */
function frame(): void {
  t.scheduler.step();
}

function record(c: Chart, ...names: ChartEventName[]): { name: string; payload: unknown }[] {
  const log: { name: string; payload: unknown }[] = [];
  for (const name of names) c.on(name, (payload: unknown) => void log.push({ name, payload }));
  return log;
}

async function drag(
  c: Chart,
  from: [number, number],
  to: [number, number],
  init: Partial<PointerEventInit> = {},
): Promise<void> {
  fire(c, 'pointerdown', from[0], from[1], init);
  fire(c, 'pointermove', (from[0] + to[0]) / 2, (from[1] + to[1]) / 2, init);
  frame();
  fire(c, 'pointermove', to[0], to[1], init);
  frame();
  fire(c, 'pointerup', to[0], to[1], init);
  await c.relayout({});
}

function labels(c: Chart): string[] {
  return [...c.element.querySelectorAll<HTMLElement>('.holochart-hoverlabel')]
    .filter((el) => el.style.display !== 'none')
    .map((el) => el.textContent ?? '');
}

describe('hover', () => {
  it('emits hover with Plotly-shaped points once per change, then unhover', async () => {
    const c = await chart([{ ...DOTS, customdata: ['a', 'b', 'c'] }]);
    const log = record(c, 'hover', 'unhover');
    fire(c, 'pointermove', cx(5) + 3, cy(50) - 2);
    expect(log).toHaveLength(0); // throttled to the next frame
    frame();
    expect(log).toHaveLength(1);
    const e = log[0]?.payload as { points: Record<string, unknown>[]; xvals: unknown[] };
    expect(e.points).toHaveLength(1);
    expect(e.points[0]).toMatchObject({
      curveNumber: 0,
      pointNumber: 1,
      pointIndex: 1,
      x: 5,
      y: 50,
      customdata: 'b',
      bbox: { x0: cx(5), y0: cy(50) },
    });
    expect(e.points[0]?.['data']).toBe(c.data[0]);
    expect(e.points[0]?.['fullData']).toBe(c.fullData[0]);
    expect(Number(e.xvals[0])).toBeCloseTo(5 + 3 / 58);
    expect(labels(c)).toEqual(['(5, 50)']);

    // Same point: no new event, no DOM churn.
    fire(c, 'pointermove', cx(5) + 1, cy(50));
    frame();
    expect(log).toHaveLength(1);

    // Beyond hoverdistance (20 px): unhover.
    fire(c, 'pointermove', cx(2.5), cy(50));
    frame();
    expect(log.map((l) => l.name)).toEqual(['hover', 'unhover']);
    expect(labels(c)).toEqual([]);
  });

  it('only resolves the latest pointer position of a frame', async () => {
    const c = await chart([DOTS]);
    const log = record(c, 'hover');
    fire(c, 'pointermove', cx(0), cy(0));
    fire(c, 'pointermove', cx(5), cy(50));
    fire(c, 'pointermove', cx(10), cy(100));
    frame();
    expect(log).toHaveLength(1);
    expect((log[0]?.payload as { points: { pointNumber: number }[] }).points[0]?.pointNumber).toBe(
      2,
    );
  });

  it('respects hovermode false and hoverinfo skip', async () => {
    const c = await chart([DOTS], { hovermode: false });
    const log = record(c, 'hover');
    fire(c, 'pointermove', cx(5), cy(50));
    frame();
    expect(log).toHaveLength(0);
    await c.relayout({ hovermode: 'closest' });
    await c.restyle({ hoverinfo: 'skip' });
    fire(c, 'pointermove', cx(5), cy(50) + 1);
    frame();
    expect(log).toHaveLength(0);
  });

  it("'x' mode labels each trace and shows the x value on the axis", async () => {
    const c = await chart(
      [
        { ...DOTS, name: 'A' },
        { ...DOTS, y: [10, 20, 30], name: 'B' },
      ],
      { hovermode: 'x' },
    );
    const log = record(c, 'hover');
    fire(c, 'pointermove', cx(5) + 4, cy(90));
    frame();
    const points = (log[0]?.payload as { points: { curveNumber: number }[] }).points;
    expect(points.map((p) => p.curveNumber).sort()).toEqual([0, 1]);
    // Two traces: the name shows in the secondary box.
    expect(labels(c).sort()).toEqual(['20B', '50A']);
    const axisLabel = c.element.querySelector<HTMLElement>('.holochart-hoverlabel-axis');
    expect(axisLabel?.textContent).toBe('5');
  });

  it("'x unified' draws one box with a title and a row per trace", async () => {
    const c = await chart(
      [
        { ...DOTS, name: 'A' },
        { ...DOTS, y: [10, 20, 30], name: 'B' },
      ],
      { hovermode: 'x unified' },
    );
    fire(c, 'pointermove', cx(10) - 2, cy(50));
    frame();
    const box = c.element.querySelector<HTMLElement>('.holochart-hoverlabel-unified');
    expect(box?.style.display).toBe('block');
    const rows = [...(box?.querySelectorAll('.holochart-hoverlabel-row') ?? [])];
    expect(rows.map((r) => r.textContent)).toEqual(['A : 100', 'B : 30']);
    expect(box?.firstElementChild?.textContent).toBe('10');
  });

  it('formats hovertemplate with axis labels, formats, customdata and <extra>', async () => {
    const c = await chart([
      {
        ...DOTS,
        name: 'dots',
        customdata: [['p'], ['q'], ['r']],
        hovertemplate: '<b>%{customdata[0]}</b>: %{y:.1f}<extra>%{fullData.name}!</extra>',
      },
    ]);
    fire(c, 'pointermove', cx(5), cy(50));
    frame();
    const label = c.element.querySelector<HTMLElement>('.holochart-hoverlabel');
    expect(label?.querySelector('b')?.textContent).toBe('q');
    expect(labels(c)).toEqual(['q: 50.0dots!']);
  });

  it('applies hoverlabel styles from the trace over the layout', async () => {
    const c = await chart([{ ...DOTS, hoverlabel: { bgcolor: 'rgb(0, 0, 0)' } }], {
      hoverlabel: { bordercolor: 'rgb(255, 0, 0)', font: { size: 17 } },
    });
    fire(c, 'pointermove', cx(5), cy(50));
    frame();
    const body = c.element.querySelector<HTMLElement>('.holochart-hoverlabel-text');
    expect(body?.style.background).toBe('rgb(0, 0, 0)');
    expect(body?.style.borderColor).toBe('rgb(255, 0, 0)');
    expect(body?.style.color).toBe('rgb(255, 255, 255)'); // contrast with the dark background
    expect(body?.style.fontSize).toBe('17px');
  });

  it('supports programmatic hover and unhover', async () => {
    const c = await chart([DOTS]);
    const log = record(c, 'hover', 'unhover');
    c.hover([{ curveNumber: 0, pointNumber: 2 }]);
    expect(log[0]?.name).toBe('hover');
    expect((log[0]?.payload as { points: { x: unknown }[] }).points[0]?.x).toBe(10);
    expect(labels(c)).toEqual(['(10, 100)']);
    c.unhover();
    expect(log.map((l) => l.name)).toEqual(['hover', 'unhover']);
    c.hover({ xval: 5, yval: 50 });
    expect((log[2]?.payload as { points: { pointNumber: number }[] }).points[0]?.pointNumber).toBe(
      1,
    );
  });

  it('unhovers when the pointer leaves the chart', async () => {
    const c = await chart([DOTS]);
    const log = record(c, 'unhover');
    fire(c, 'pointermove', cx(5), cy(50));
    frame();
    fire(c, 'pointerleave', cx(5), cy(50));
    expect(log).toHaveLength(1);
    expect(labels(c)).toEqual([]);
  });
});

describe('click and double-click', () => {
  it('emits click with the points under the pointer, and nothing on empty space', async () => {
    const c = await chart([DOTS]);
    const log = record(c, 'click');
    fire(c, 'pointerdown', cx(5), cy(50));
    fire(c, 'pointerup', cx(5) + 1, cy(50));
    expect(log).toHaveLength(1);
    expect((log[0]?.payload as { points: { pointNumber: number }[] }).points[0]?.pointNumber).toBe(
      1,
    );
    fire(c, 'pointerdown', cx(2.5), cy(25), { timeStamp: 10_000 } as PointerEventInit);
    fire(c, 'pointerup', cx(2.5), cy(25));
    expect(log).toHaveLength(1);
  });

  it('double-click resets a zoom and emits doubleclick', async () => {
    const c = await chart([DOTS]);
    await c.relayout({ 'xaxis.range': [2, 3] });
    const log = record(c, 'doubleclick', 'relayout');
    fire(c, 'pointerdown', cx(1), cy(1));
    fire(c, 'pointerup', cx(1), cy(1));
    fire(c, 'pointerdown', cx(1), cy(1));
    fire(c, 'pointerup', cx(1), cy(1));
    await c.relayout({});
    expect(log.map((l) => l.name)).toContain('doubleclick');
    expect(c.axes.get('x')?.scale.range).toEqual([0, 10]);
  });

  it('clickmode select selects the clicked point and clears on empty space', async () => {
    const c = await chart([DOTS], { clickmode: 'event+select' });
    const log = record(c, 'selected', 'deselect');
    fire(c, 'pointerdown', cx(5), cy(50));
    fire(c, 'pointerup', cx(5), cy(50));
    await c.relayout({});
    expect(log[0]?.name).toBe('selected');
    expect(t.log.updates.at(-1)).toMatchObject({ plan: { selection: true }, selected: [1] });
    fire(c, 'pointerdown', cx(3), cy(10), { timeStamp: 5_000 } as PointerEventInit);
    fire(c, 'pointerup', cx(3), cy(10));
    await c.relayout({});
    expect(log.map((l) => l.name)).toEqual(['selected', 'deselect']);
    expect(t.log.updates.at(-1)?.selected).toBeNull();
  });
});

describe('zoom and pan', () => {
  it('box zoom commits both ranges with one relayout (Plotly range[i] keys)', async () => {
    const c = await chart([DOTS]);
    const log = record(c, 'relayout', 'relayouting');
    await drag(c, [cx(2), cy(80)], [cx(4), cy(20)]);
    const relayout = log.filter((l) => l.name === 'relayout');
    expect(relayout).toHaveLength(1);
    const e = relayout[0]?.payload as Record<string, number>;
    expect(e['xaxis.range[0]']).toBeCloseTo(2);
    expect(e['xaxis.range[1]']).toBeCloseTo(4);
    expect(e['yaxis.range[0]']).toBeCloseTo(20);
    expect(e['yaxis.range[1]']).toBeCloseTo(80);
    expect(log.some((l) => l.name === 'relayouting')).toBe(false);
    expect(c.layout['xaxis']).toMatchObject({ autorange: false });
    // The zoom box is gone.
    const overlay = c.element.querySelector<SVGElement>('.holochart-dragoverlay');
    expect(overlay?.style.display).toBe('none');
  });

  it('a thin drag zooms one axis only', async () => {
    const c = await chart([DOTS]);
    await drag(c, [cx(2), cy(50)], [cx(6), cy(50) + 3]);
    const [x0, x1] = c.axes.get('x')?.scale.range ?? [];
    expect(x0).toBeCloseTo(2);
    expect(x1).toBeCloseTo(6);
    expect(c.axes.get('y')?.scale.range).toEqual([0, 100]);
  });

  it('pan previews transform-only updates with relayouting, then relayouts once', async () => {
    const c = await chart([DOTS], { dragmode: 'pan' });
    const log = record(c, 'relayout', 'relayouting');
    const calcs = t.log.calc.length;
    fire(c, 'pointerdown', cx(5), cy(50));
    fire(c, 'pointermove', cx(5) + 58, cy(50));
    frame();
    const preview = t.log.updates.at(-1)?.plan;
    expect(preview).toEqual({ calc: false, plot: false, style: false, transform: true });
    expect(log.map((l) => l.name)).toEqual(['relayouting']);
    const during = log[0]?.payload as Record<string, number>;
    expect(during['xaxis.range[0]']).toBeCloseTo(-1);
    fire(c, 'pointerup', cx(5) + 58, cy(50) - 32);
    await c.relayout({});
    expect(log.map((l) => l.name)).toEqual(['relayouting', 'relayouting', 'relayout']);
    const [x0, x1] = c.axes.get('x')?.scale.range ?? [];
    const [y0] = c.axes.get('y')?.scale.range ?? [];
    expect(x0).toBeCloseTo(-1);
    expect(x1).toBeCloseTo(9);
    expect(y0).toBeCloseTo(-10);
    expect(t.log.calc.length).toBe(calcs); // never recalculated
  });

  it('honors fixedrange and minallowed / maxallowed', async () => {
    const c = await chart([DOTS], {
      dragmode: 'pan',
      xaxis: { range: [0, 10], fixedrange: true },
      yaxis: { range: [0, 100], minallowed: -5 },
    });
    // Dragging up by half the height would show y in [-50, 50]; minallowed stops at -5.
    await drag(c, [cx(5), cy(50)], [cx(7), cy(100)]);
    expect(c.axes.get('x')?.scale.range).toEqual([0, 10]);
    const [y0, y1] = c.axes.get('y')?.scale.range ?? [];
    expect(y0).toBeCloseTo(-5);
    expect(y1).toBeCloseTo(95);
  });

  it('axis-end drags scale one end; axis-middle drags pan that axis', async () => {
    const c = await chart([DOTS]);
    // x axis strip, right end: drag the value 9 to where 10 was.
    await drag(c, [cx(9), 360], [cx(10), 360]);
    const [x0, x1] = c.axes.get('x')?.scale.range ?? [];
    expect(x0).toBeCloseTo(0);
    expect(x1).toBeCloseTo(9);
    // y axis strip, middle: pan y.
    await drag(c, [30, cy(50)], [30, cy(60)]);
    const [y0] = c.axes.get('y')?.scale.range ?? [];
    expect(y0).toBeCloseTo(-10);
  });

  it('scroll zoom (config.scrollZoom) zooms at the cursor and commits after the wheel rests', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const c = await chart([DOTS], {}, { scrollZoom: true });
    const log = record(c, 'relayout', 'relayouting');
    const wheel = new WheelEvent('wheel', {
      clientX: cx(5),
      clientY: cy(50),
      deltaY: -20,
      bubbles: true,
      cancelable: true,
    });
    canvas(c).dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(true);
    const [x0, x1] = c.axes.get('x')?.scale.range ?? [];
    const factor = Math.exp(-0.1);
    expect(x0).toBeCloseTo(5 - 5 * factor);
    expect(x1).toBeCloseTo(5 + 5 * factor);
    expect(log.map((l) => l.name)).toEqual(['relayouting']);
    vi.advanceTimersByTime(400);
    await c.relayout({});
    expect(log.map((l) => l.name)).toEqual(['relayouting', 'relayout']);
  });

  it('ignores the wheel without scrollZoom', async () => {
    const c = await chart([DOTS]);
    const wheel = new WheelEvent('wheel', { clientX: cx(5), clientY: cy(50), deltaY: -20 });
    canvas(c).dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(false);
    expect(c.axes.get('x')?.scale.range).toEqual([0, 10]);
  });

  it('exposes zoom / autoscale / resetAxes / setDragmode for the modebar', async () => {
    const c = await chart([DOTS]);
    await c.zoom(0.5);
    expect(c.axes.get('x')?.scale.range).toEqual([2.5, 7.5]);
    await c.resetAxes();
    expect(c.axes.get('x')?.scale.range).toEqual([0, 10]);
    await c.setDragmode('pan');
    expect(c.interaction.dragmode).toBe('pan');
    await c.autoscale();
    expect(c.layout['xaxis']).toMatchObject({ autorange: true });
  });
});

describe('selection', () => {
  it('box select emits selecting / selected and restyles with selectedPoints', async () => {
    const c = await chart([DOTS, { ...DOTS, y: [90, 90, 90] }], { dragmode: 'select' });
    const log = record(c, 'selecting', 'selected');
    await drag(c, [cx(4), cy(60)], [cx(11), cy(40)]);
    expect(log.map((l) => l.name)).toEqual(['selecting', 'selecting', 'selected']);
    const e = log.at(-1)?.payload as {
      points: { curveNumber: number; pointNumber: number }[];
      range: Record<string, number[]>;
    };
    expect(e.points.map((p) => [p.curveNumber, p.pointNumber])).toEqual([[0, 1]]);
    expect(e.range['x']?.[0]).toBeCloseTo(4);
    expect(e.range['y']?.[1]).toBeCloseTo(60);
    const last = new Map(t.log.updates.map((u) => [u.index, u]));
    expect(last.get(0)).toMatchObject({ plan: { selection: true }, selected: [1] });
    // Other traces on the subplot are dimmed: selected, but nothing in them.
    expect(last.get(1)?.selected).toEqual([]);
  });

  it('shift adds to the selection; double-click deselects', async () => {
    const c = await chart([DOTS], { dragmode: 'select' });
    const log = record(c, 'deselect');
    await drag(c, [cx(0), cy(10)], [cx(1), cy(0)]);
    await drag(c, [cx(9), cy(100)], [cx(10), cy(90)], { shiftKey: true });
    expect(t.log.updates.at(-1)?.selected).toEqual([0, 2]);
    fire(c, 'pointerdown', cx(3), cy(30));
    fire(c, 'pointerup', cx(3), cy(30));
    fire(c, 'pointerdown', cx(3), cy(30));
    fire(c, 'pointerup', cx(3), cy(30));
    await c.relayout({});
    expect(log).toHaveLength(1);
    expect(t.log.updates.at(-1)?.selected).toBeNull();
  });

  it('lasso selects the points inside the polygon and reports lassoPoints', async () => {
    const c = await chart([DOTS], { dragmode: 'lasso' });
    const log = record(c, 'selected');
    fire(c, 'pointerdown', cx(4), cy(40));
    for (const [x, y] of [
      [6, 40],
      [6, 60],
      [4, 60],
    ] as const) {
      fire(c, 'pointermove', cx(x), cy(y));
      frame();
    }
    fire(c, 'pointerup', cx(4), cy(60));
    await c.relayout({});
    const e = log[0]?.payload as {
      points: { pointNumber: number }[];
      lassoPoints: Record<string, unknown[]>;
    };
    expect(e.points.map((p) => p.pointNumber)).toEqual([1]);
    expect(e.lassoPoints['x']).toHaveLength(4);
  });

  it('input selectedpoints seed ctx.selectedPoints', async () => {
    const c = await chart([{ ...DOTS, selectedpoints: [2] }]);
    await c.restyle({ selectedpoints: [[0, 1]] });
    expect(t.log.updates.at(-1)).toMatchObject({ plan: { selection: true }, selected: [0, 1] });
  });
});

describe('selection on a component select area (polar, E6.3)', () => {
  const AREA = { x: 100, y: 50, width: 200, height: 200 };
  /** A non-cartesian trace whose points sit at container px `(x, y)` on subplot `subplot`. */
  const rings: TraceModule<{ x: number[]; y: number[] }> = {
    type: 'rings',
    categories: ['showLegend'],
    schema: attr.object({
      x: attr.dataArray({ editType: 'calc' }),
      y: attr.dataArray({ editType: 'calc' }),
      subplot: attr.string({ dflt: 'polar', editType: 'calc' }),
    }),
    meta: { description: 'Test rings.' },
    supplyDefaults(_in, _out, ctx) {
      ctx.coerce('x');
      ctx.coerce('y');
      ctx.coerce('subplot');
    },
    subplotDomain: () => ({ x: [0, 1], y: [0, 1] }),
    calc: (trace) => ({ x: trace['x'] as number[], y: trace['y'] as number[] }),
    hoverPoints: () => [],
    selectPoints(calc, _trace, query) {
      return calc.x.flatMap((x, i) => (selectionContains(query, x, calc.y[i]!) ? [i] : []));
    },
    eventData: (calc, _trace, i) => ({ r: calc.x[i] }),
  };
  const polar: ComponentModule = {
    name: 'area-test',
    draw: {
      create: () => ({
        update: () => undefined,
        selectArea: (x, y) =>
          x >= AREA.x && x <= AREA.x + AREA.width && y >= AREA.y && y <= AREA.y + AREA.height
            ? { id: 'polar', rect: AREA }
            : undefined,
      }),
    },
  };

  async function areaChart(dragmode: string): Promise<Chart> {
    const s = setup({ width: 640, height: 400, components: [polar] });
    s.registry.register(rings);
    t = s;
    return chart(
      [
        { type: 'rings', x: [150, 200, 290], y: [100, 150, 240] },
        { type: 'rings', x: [150], y: [100], subplot: 'polar2' },
      ],
      { dragmode },
      {},
      s,
    );
  }

  it('box selects in container px, with eventData fields and no layout selection', async () => {
    const c = await areaChart('select');
    const log = record(c, 'selecting', 'selected');
    // The box is clamped to the area: past its right edge still ends at x = 300.
    await drag(c, [140, 90], [400, 160]);
    const e = log.at(-1)?.payload as Record<string, unknown> & {
      points: { curveNumber: number; pointNumber: number; r: unknown }[];
    };
    expect(log.at(-1)?.name).toBe('selected');
    expect(e.points.map((p) => [p.curveNumber, p.pointNumber, p.r])).toEqual([
      [0, 0, 150],
      [0, 1, 200],
    ]);
    expect(e['range']).toBeUndefined();
    expect(e['selections']).toBeUndefined();
    expect(c.layout['selections']).toBeUndefined();
    // Shift adds a box around the third point.
    await drag(c, [280, 230], [300, 250], { shiftKey: true });
    const e2 = log.at(-1)?.payload as { points: { pointNumber: number }[] };
    expect(e2.points.map((p) => p.pointNumber)).toEqual([0, 1, 2]);
  });

  it('ignores drags outside the area and deselects on double-click inside', async () => {
    const c = await areaChart('lasso');
    const log = record(c, 'selected', 'deselect', 'doubleclick');
    await drag(c, [20, 20], [90, 90]);
    expect(log).toHaveLength(0);
    fire(c, 'pointerdown', 140, 90);
    for (const [x, y] of [
      [260, 90],
      [260, 160],
      [140, 160],
    ] as const) {
      fire(c, 'pointermove', x, y);
      frame();
    }
    fire(c, 'pointerup', 140, 160);
    await c.relayout({});
    expect(log.map((l) => l.name)).toEqual(['selected']);
    for (let k = 0; k < 2; k++) {
      fire(c, 'pointerdown', 200, 200);
      fire(c, 'pointerup', 200, 200);
    }
    await c.relayout({});
    expect(log.map((l) => l.name)).toEqual(['selected', 'deselect', 'doubleclick']);
  });

  it('takes every touch swipe while selecting', async () => {
    const c = await areaChart('lasso');
    expect(canvas(c).style.touchAction).toBe('none');
    await c.relayout({ dragmode: 'zoom' });
    expect(canvas(c).style.touchAction).toBe('manipulation');
  });
});

describe('component pointer hook', () => {
  it('lets a component handle clicks in its region before the chart', async () => {
    const seen: string[] = [];
    const legend: ComponentModule = {
      name: 'legend-test',
      draw: {
        create: () => ({
          update: () => undefined,
          handlePointer(e) {
            const inside = e.x > 560 && e.y < 60;
            if (inside) {
              seen.push(e.type);
              if (e.type === 'move') e.cursor = 'pointer';
            }
            return inside;
          },
        }),
      },
    };
    const s = setup({ width: 640, height: 400, components: [legend] });
    t = s;
    const c = await chart([{ ...DOTS, x: [9.8], y: [96] }], {}, {}, s);
    const log = record(c, 'click', 'hover');
    fire(c, 'pointermove', cx(9.8), cy(96));
    frame();
    fire(c, 'pointerdown', cx(9.8), cy(96));
    fire(c, 'pointerup', cx(9.8), cy(96));
    expect(seen).toEqual(['move', 'down', 'up', 'click']);
    expect(log).toHaveLength(0);
    expect(canvas(c).style.cursor).toBe('pointer');
  });

  it('captures the pointer for component drags and ends them on pointercancel', async () => {
    const seen: string[] = [];
    const handle: ComponentModule = {
      name: 'handle-test',
      draw: {
        create: () => ({
          update: () => undefined,
          handlePointer(e) {
            seen.push(e.type);
            return e.type !== 'leave';
          },
        }),
      },
    };
    const s = setup({ width: 640, height: 400, components: [handle] });
    t = s;
    const c = await chart([DOTS], {}, {}, s);
    const el = canvas(c);
    const captured: number[] = [];
    el.setPointerCapture = (id: number) => void captured.push(id);
    fire(c, 'pointerdown', cx(5), cy(50));
    // Without capture, a release outside the chart would never reach the component.
    expect(captured).toEqual([1]);
    fire(c, 'pointermove', cx(6), cy(50));
    fire(c, 'pointercancel', cx(6), cy(50));
    expect(seen).toEqual(['down', 'move', 'leave']);
    // The gesture is over: the next down starts a new one.
    fire(c, 'pointerdown', cx(5), cy(50));
    expect(seen.at(-1)).toBe('down');
  });
});

describe('draw dragmodes (E5.5)', () => {
  function drawer() {
    const gestures: { mode: string; phase: string; points: number[]; subplot: string }[] = [];
    const module: ComponentModule = {
      name: 'draw-test',
      draw: {
        create: () => ({
          update: () => undefined,
          drawShape(g) {
            gestures.push({
              mode: g.mode,
              phase: g.phase,
              points: [...g.points],
              subplot: g.subplot.id,
            });
            return true;
          },
        }),
      },
    };
    return { gestures, module };
  }

  it('hands line / rect / circle drags to drawShape: start and pointer, clamped to the plot', async () => {
    const d = drawer();
    const s = setup({ width: 640, height: 400, components: [d.module] });
    t = s;
    const c = await chart([DOTS], { dragmode: 'drawrect' }, {}, s);
    const log = record(c, 'relayout', 'click');
    expect(canvas(c).style.touchAction).toBe('none');
    await drag(c, [cx(2), cy(20)], [700, 10]);
    expect(d.gestures.map((g) => g.phase)).toEqual(['move', 'move', 'end']);
    expect(d.gestures.at(-1)).toEqual({
      mode: 'drawrect',
      phase: 'end',
      points: [cx(2), cy(20), 620, 30],
      subplot: 'xy',
    });
    // No zoom: the runtime itself commits nothing.
    expect(log).toHaveLength(0);
    expect(c.layout['xaxis']).toEqual({ range: [0, 10] });
  });

  it('collects the vertices of freeform draws; a press without a drag stays a click', async () => {
    const d = drawer();
    const s = setup({ width: 640, height: 400, components: [d.module] });
    t = s;
    const c = await chart([DOTS], { dragmode: 'drawclosedpath' }, {}, s);
    const log = record(c, 'click');
    fire(c, 'pointerdown', cx(1), cy(10));
    fire(c, 'pointermove', cx(3), cy(10));
    fire(c, 'pointermove', cx(3), cy(40));
    frame();
    fire(c, 'pointerup', cx(1), cy(40));
    const end = d.gestures.at(-1);
    expect(end?.phase).toBe('end');
    expect(end?.points).toEqual([cx(1), cy(10), cx(3), cy(10), cx(3), cy(40), cx(1), cy(40)]);
    // Click on a point.
    fire(c, 'pointerdown', cx(5), cy(50));
    fire(c, 'pointerup', cx(5), cy(50));
    expect(log.map((l) => l.name)).toEqual(['click']);
    expect(d.gestures).toHaveLength(2);
  });

  it('cancels the preview on pointercancel and shows a crosshair over the plot', async () => {
    const d = drawer();
    const s = setup({ width: 640, height: 400, components: [d.module] });
    t = s;
    const c = await chart([DOTS], { dragmode: 'drawline' }, {}, s);
    fire(c, 'pointermove', cx(5), cy(20));
    expect(canvas(c).style.cursor).toBe('crosshair');
    fire(c, 'pointerdown', cx(1), cy(10));
    fire(c, 'pointermove', cx(4), cy(30));
    frame();
    fire(c, 'pointercancel', cx(4), cy(30));
    expect(d.gestures.map((g) => g.phase)).toEqual(['move', 'cancel']);
  });

  it('does nothing on the plot without a component that draws', async () => {
    const c = await chart([DOTS], { dragmode: 'drawcircle' });
    const log = record(c, 'relayout');
    await drag(c, [cx(2), cy(20)], [cx(6), cy(60)]);
    expect(log).toHaveLength(0);
  });
});

describe('static plots', () => {
  it('attach no interaction with config.staticPlot', async () => {
    const c = await chart([DOTS], {}, { staticPlot: true });
    const log = record(c, 'hover');
    fire(c, 'pointermove', cx(5), cy(50));
    frame();
    expect(log).toHaveLength(0);
    expect(c.element.querySelector('.holochart-fx')).toBeNull();
  });
});

describe('trace view pointer hook', () => {
  /** A dots-like trace type whose view consumes wheel events and records what it saw. */
  function scroller(type: string, seen: string[], consume: boolean): TraceModule {
    const dots = createDotsModule(createLog(), { cross: false });
    return {
      ...dots,
      type,
      plot: {
        create: () => ({
          update: () => undefined,
          handlePointer(e) {
            seen.push(`${type}:${e.type}`);
            return consume && e.type === 'wheel';
          },
        }),
      },
    } as TraceModule;
  }

  it('offers events after components, last trace first, and a consumed wheel skips scroll zoom', async () => {
    const seen: string[] = [];
    const s = setup({ width: 640, height: 400 });
    s.registry.register(scroller('lower', seen, true), scroller('upper', seen, false));
    t = s;
    const c = await chart(
      [
        { ...DOTS, type: 'lower' },
        { ...DOTS, type: 'upper' },
      ],
      {},
      { scrollZoom: true },
      s,
    );
    const wheel = new WheelEvent('wheel', {
      clientX: cx(5),
      clientY: cy(50),
      deltaY: -20,
      bubbles: true,
      cancelable: true,
    });
    canvas(c).dispatchEvent(wheel);
    // The upper (later) trace sees it first and passes; the lower one consumes it.
    expect(seen.slice(-2)).toEqual(['upper:wheel', 'lower:wheel']);
    expect(c.axes.get('x')?.scale.range).toEqual([0, 10]);
  });
});

describe('touch (E6.6)', () => {
  const touch = (id = 1): Partial<PointerEventInit> => ({ pointerType: 'touch', pointerId: id });

  function tap(c: Chart, x: number, y: number): void {
    fire(c, 'pointerdown', x, y, touch());
    fire(c, 'pointerup', x + 4, y - 4, touch());
    // A lifted finger leaves the element.
    fire(c, 'pointerleave', x + 4, y - 4, touch());
  }

  /** Two fingers from `from` to `to` (container px pairs), one frame, then both lift. */
  async function pinch(
    c: Chart,
    from: [number, number, number, number],
    to: [number, number, number, number],
  ): Promise<void> {
    fire(c, 'pointerdown', from[0], from[1], touch(1));
    fire(c, 'pointerdown', from[2], from[3], touch(2));
    fire(c, 'pointermove', to[0], to[1], touch(1));
    fire(c, 'pointermove', to[2], to[3], touch(2));
    frame();
    fire(c, 'pointerup', to[0], to[1], touch(1));
    fire(c, 'pointerup', to[2], to[3], touch(2));
    await c.relayout({});
  }

  it('sets touch-action from the dragmode, fixed axes and the traces', async () => {
    const c = await chart([DOTS]);
    // Default zoom: a vertical swipe scrolls the page.
    expect(canvas(c).style.touchAction).toBe('pan-y');
    await c.relayout({ dragmode: false });
    expect(canvas(c).style.touchAction).toBe('manipulation');
    await c.relayout({ dragmode: 'select' });
    expect(canvas(c).style.touchAction).toBe('none');
    await c.relayout({ dragmode: 'pan', 'yaxis.fixedrange': true });
    expect(canvas(c).style.touchAction).toBe('pan-y');
    await c.relayout({ dragmode: 'zoom', 'xaxis.fixedrange': true });
    expect(canvas(c).style.touchAction).toBe('manipulation');

    const s = setup({ width: 640, height: 400 });
    const dots = createDotsModule(createLog(), { cross: false });
    s.registry.register({ ...dots, type: 'scroller', touchAction: 'none' } as TraceModule);
    t = s;
    const d = await chart([DOTS, { ...DOTS, type: 'scroller' }], { dragmode: false }, {}, s);
    expect(canvas(d).style.touchAction).toBe('none');
    await d.restyle({ visible: false }, 1);
    expect(canvas(d).style.touchAction).toBe('manipulation');
  });

  it('a tap hovers and clicks; the hover stays until a tap elsewhere', async () => {
    const c = await chart([DOTS]);
    const log = record(c, 'hover', 'unhover', 'click');
    tap(c, cx(5), cy(50));
    expect(log.map((l) => l.name)).toEqual(['hover', 'click']);
    expect(labels(c)).toEqual(['(5, 50)']);
    // Moving fingers don't hover.
    fire(c, 'pointermove', cx(10), cy(100), touch());
    frame();
    expect(labels(c)).toEqual(['(5, 50)']);
    tap(c, cx(2.5), cy(10));
    expect(log.map((l) => l.name)).toEqual(['hover', 'click', 'unhover']);
    expect(labels(c)).toEqual([]);
    tap(c, cx(10) - 8, cy(100) + 8);
    expect(labels(c)).toEqual(['(10, 100)']);
    // A press elsewhere on the page hides it too.
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(labels(c)).toEqual([]);
    expect(log.at(-1)?.name).toBe('unhover');
  });

  it('a double tap resets the view; taps farther apart do not', async () => {
    const c = await chart([DOTS]);
    await c.relayout({ 'xaxis.range': [2, 3] });
    const log = record(c, 'doubleclick');
    tap(c, cx(1), cy(1));
    tap(c, cx(1) + 45, cy(1));
    expect(log).toHaveLength(0);
    // Within the double-tap distance (fingers land less precisely than a mouse).
    tap(c, cx(1) + 45 + 20, cy(1) + 15);
    await c.relayout({});
    expect(log).toHaveLength(1);
    expect(c.axes.get('x')?.scale.range).toEqual([0, 10]);
  });

  it('pinch zooms around the midpoint, previewing then committing one relayout', async () => {
    const c = await chart([DOTS]);
    const log = record(c, 'relayout', 'relayouting');
    // Fingers 116 px apart around (5, 50), spread to 232 px.
    await pinch(c, [cx(4), cy(50), cx(6), cy(50)], [cx(3), cy(50), cx(7), cy(50)]);
    expect(log.map((l) => l.name)).toEqual(['relayouting', 'relayout']);
    const e = log[1]?.payload as Record<string, number>;
    expect(e['xaxis.range[0]']).toBeCloseTo(2.5);
    expect(e['xaxis.range[1]']).toBeCloseTo(7.5);
    // Isotropic: y zooms by the same factor around the midpoint's y.
    expect(e['yaxis.range[0]']).toBeCloseTo(25);
    expect(e['yaxis.range[1]']).toBeCloseTo(75);
  });

  it('two fingers moving together pan; fixed axes stay', async () => {
    const c = await chart([DOTS], { yaxis: { range: [0, 100], fixedrange: true } });
    await pinch(c, [cx(4), cy(40), cx(6), cy(60)], [cx(5), cy(30), cx(7), cy(50)]);
    const [x0, x1] = c.axes.get('x')?.scale.range ?? [];
    expect(x0).toBeCloseTo(-1);
    expect(x1).toBeCloseTo(9);
    expect(c.axes.get('y')?.scale.range).toEqual([0, 100]);
  });

  it('a second finger cancels a zoom box; lifting one finger ends the pinch', async () => {
    const c = await chart([DOTS]);
    const log = record(c, 'relayout', 'click', 'hover');
    fire(c, 'pointerdown', cx(2), cy(80), touch(1));
    fire(c, 'pointermove', cx(4), cy(80), touch(1));
    frame();
    fire(c, 'pointerdown', cx(4), cy(20), touch(2));
    const overlay = c.element.querySelector<SVGElement>('.holochart-dragoverlay');
    expect(overlay?.style.display).toBe('none');
    fire(c, 'pointerup', cx(4), cy(20), touch(2));
    // The remaining finger neither drags nor taps.
    fire(c, 'pointermove', cx(8), cy(20), touch(1));
    frame();
    fire(c, 'pointerup', cx(8), cy(20), touch(1));
    await c.relayout({});
    expect(log).toHaveLength(0);
    expect(c.axes.get('x')?.scale.range).toEqual([0, 10]);
    // Fingers lifted: the next tap is a tap again.
    tap(c, cx(5), cy(50));
    expect(log.map((l) => l.name)).toEqual(['hover', 'click']);
  });

  it('pointercancel during a pinch restores the ranges', async () => {
    const c = await chart([DOTS]);
    const log = record(c, 'relayout');
    fire(c, 'pointerdown', cx(4), cy(50), touch(1));
    fire(c, 'pointerdown', cx(6), cy(50), touch(2));
    fire(c, 'pointermove', cx(2), cy(50), touch(1));
    frame();
    expect(c.axes.get('x')?.scale.range[0]).not.toBeCloseTo(0);
    fire(c, 'pointercancel', cx(2), cy(50), touch(1));
    fire(c, 'pointercancel', cx(6), cy(50), touch(2));
    await c.relayout({});
    expect(log).toHaveLength(0);
    expect(c.axes.get('x')?.scale.range).toEqual([0, 10]);
  });

  it('under pan-y a vertical-first swipe is the page’s; a sideways one zooms', async () => {
    const c = await chart([DOTS]);
    const log = record(c, 'relayout', 'unhover');
    tap(c, cx(5), cy(50));
    fire(c, 'pointerdown', cx(2), cy(80), touch());
    fire(c, 'pointermove', cx(2) + 5, cy(80) + 30, touch());
    frame();
    fire(c, 'pointermove', cx(6), cy(20), touch());
    frame();
    fire(c, 'pointerup', cx(6), cy(20), touch());
    await c.relayout({});
    // No zoom, and the tap's hover stays.
    expect(log).toHaveLength(0);
    expect(labels(c)).toEqual(['(5, 50)']);
    fire(c, 'pointerdown', cx(2), cy(80), touch());
    fire(c, 'pointermove', cx(2) + 30, cy(80) + 5, touch());
    frame();
    fire(c, 'pointermove', cx(6), cy(20), touch());
    frame();
    fire(c, 'pointerup', cx(6), cy(20), touch());
    await c.relayout({});
    expect(log.map((l) => l.name)).toEqual(['unhover', 'relayout']);
    const [x0, x1] = c.axes.get('x')?.scale.range ?? [];
    expect(x0).toBeCloseTo(2);
    expect(x1).toBeCloseTo(6);
  });

  it('a view that owns a touch drag keeps it when a second finger lands', async () => {
    const seen: string[] = [];
    const handle: ComponentModule = {
      name: 'handle-test',
      draw: {
        create: () => ({
          update: () => undefined,
          handlePointer(e) {
            if (e.type !== 'move' || seen.at(-1) !== 'move') seen.push(e.type);
            return e.type !== 'leave' && e.x < 300;
          },
        }),
      },
    };
    const s = setup({ width: 640, height: 400, components: [handle] });
    t = s;
    const c = await chart([DOTS], {}, {}, s);
    const log = record(c, 'relayout', 'relayouting');
    fire(c, 'pointerdown', cx(2), cy(50), touch(1));
    fire(c, 'pointermove', cx(3), cy(50), touch(1));
    fire(c, 'pointerdown', cx(6), cy(50), touch(2));
    fire(c, 'pointermove', cx(9), cy(50), touch(2));
    fire(c, 'pointermove', cx(3), cy(60), touch(1));
    frame();
    fire(c, 'pointerup', cx(9), cy(50), touch(2));
    fire(c, 'pointerup', cx(3), cy(60), touch(1));
    expect(seen).toEqual(['down', 'move', 'up']);
    expect(log).toHaveLength(0);
  });
});

describe('2.5D view: a viewport projector (E8.9)', () => {
  /** A stand-in for the 2.5D view: the plot drawn 100 px to the right of the flat view. */
  function shift(c: Chart): void {
    const vp = c.subplots.get('xy')!.viewport;
    vp.projector = {
      camera: vp.camera,
      layout: () => undefined,
      project: (x, y) => [x + 100, y],
      unproject: (x, y) => [x - 100, y],
    };
  }

  it('hovers and clicks the plot plane under the pointer, and draws labels there', async () => {
    const c = await chart([DOTS], { hovermode: 'closest' });
    shift(c);
    const log = record(c, 'hover', 'click');
    // Where the flat view draws point 1 is empty now; 100 px right of it is the point.
    fire(c, 'pointermove', cx(5), cy(50));
    frame();
    expect(log).toHaveLength(0);
    fire(c, 'pointermove', cx(5) + 100, cy(50));
    frame();
    expect(log.map((e) => e.name)).toEqual(['hover']);
    const hover = log[0]?.payload as { points: { pointNumber: number }[]; xvals: number[] };
    expect(hover.points[0]?.pointNumber).toBe(1);
    expect(hover.xvals[0]).toBeCloseTo(5, 6);
    const label = [...c.element.querySelectorAll<HTMLElement>('.holochart-hoverlabel')].find(
      (el) => el.style.display !== 'none',
    );
    // Beside the drawn point (right of it, or left when it doesn't fit).
    expect(Math.abs(Number.parseFloat(label!.style.left) - (cx(5) + 100))).toBeLessThan(200);
    expect(Number.parseFloat(label!.style.left)).toBeGreaterThan(cx(5));
    fire(c, 'pointerdown', cx(5) + 100, cy(50));
    fire(c, 'pointerup', cx(5) + 100, cy(50));
    expect(log.map((e) => e.name)).toEqual(['hover', 'click']);
  });

  it('zooms to the data range of the box on the plot plane, outline drawn projected', async () => {
    const c = await chart([DOTS]);
    shift(c);
    fire(c, 'pointerdown', cx(2) + 100, cy(80));
    fire(c, 'pointermove', cx(4) + 100, cy(20));
    frame();
    const path = c.element.querySelector('.holochart-dragoverlay path')!.getAttribute('d')!;
    expect(path.startsWith(`M${cx(2) + 100},`)).toBe(true);
    fire(c, 'pointerup', cx(4) + 100, cy(20));
    await c.relayout({});
    expect(c.fullLayout?.xaxis?.range).toEqual([expect.closeTo(2, 6), expect.closeTo(4, 6)]);
    expect(c.fullLayout?.yaxis?.range).toEqual([expect.closeTo(20, 6), expect.closeTo(80, 6)]);
  });

  it('gives component views the screen position', async () => {
    const seen: number[] = [];
    const probe: ComponentModule = {
      name: 'probe-test',
      draw: {
        create: () => ({
          update: () => undefined,
          handlePointer(e) {
            seen.push(e.x);
            return false;
          },
        }),
      },
    };
    const s = setup({ width: 640, height: 400, components: [probe] });
    t = s;
    const c = await chart([DOTS], {}, {}, s);
    shift(c);
    fire(c, 'pointermove', cx(5) + 100, cy(50));
    expect(seen.at(-1)).toBe(cx(5) + 100);
  });
});
