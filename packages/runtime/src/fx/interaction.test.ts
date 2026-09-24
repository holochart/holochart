// @vitest-environment jsdom
/**
 * Interaction dispatch through a real chart with a fake renderer (no WebGL): hover, click,
 * zoom / pan, selection, wheel and component pointer hooks. The container is 640×400 with margins
 * l 40, r 20, t 30, b 50, so the `xy` plot area is x 40–620, y 30–350; with x in [0, 10] and y in
 * [0, 100], data (x, y) sits at container (40 + 58·x, 350 − 3.2·y).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChart, type Chart } from '../chart.ts';
import type { ComponentModule, TraceModule } from '../contracts.ts';
import type { ChartEventName } from '../events.ts';
import { createDotsModule, createLog, setup, type TestSetup } from '../__testing__/fakes.ts';

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
    { data, layout: { margin: MARGIN, ...RANGES, ...layout }, config },
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
