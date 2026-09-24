// @vitest-environment jsdom
/**
 * Axis features of M3 wave 1 through a real chart with a fake renderer: linked axes (`matches`,
 * E3.9), aspect constraints (`scaleanchor`, `constrain`), overlaid axes moving together, range
 * breaks (E3.8) end to end, and spike lines (E3.10) in the hover layer. The container is 640×400
 * with margins l 40, r 20, t 30, b 50, so a full-size plot area is x 40–620, y 30–350 (580 × 320).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChart, type Chart } from './chart.ts';
import { setup, type TestSetup } from './__testing__/fakes.ts';

const MARGIN = { l: 40, r: 20, t: 30, b: 50 };

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
  const c = createChart(t.container, { data, layout: { margin: MARGIN, ...layout } }, t.options);
  charts.push(c);
  await c.ready;
  return c;
}

function range(c: Chart, id: string): number[] {
  return [...(c.axes.get(id)?.scale.range ?? [])];
}

/** px per linear unit of an axis. */
function pxPerUnit(c: Chart, id: string): number {
  const s = c.axes.get(id)?.scale;
  if (!s) throw new Error(`no axis ${id}`);
  return Math.abs(s.length / (s.range[1] - s.range[0]));
}

function fire(c: Chart, type: string, x: number, y: number): void {
  c.three.root.canvas.dispatchEvent(
    new PointerEvent(type, {
      clientX: x,
      clientY: y,
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      bubbles: true,
    }),
  );
}

async function drag(c: Chart, from: [number, number], to: [number, number]): Promise<void> {
  fire(c, 'pointerdown', from[0], from[1]);
  fire(c, 'pointermove', (from[0] + to[0]) / 2, (from[1] + to[1]) / 2);
  t.scheduler.step();
  fire(c, 'pointermove', to[0], to[1]);
  t.scheduler.step();
  fire(c, 'pointerup', to[0], to[1]);
  await c.relayout({});
}

const TWO_PANELS = {
  xaxis: { domain: [0, 0.45] },
  xaxis2: { domain: [0.55, 1], anchor: 'y2', matches: 'x' },
  yaxis2: { anchor: 'x2' },
};

describe('matches (E3.9)', () => {
  it('autoranges the whole match group over all its data, as one range', async () => {
    const c = await chart(
      [
        { type: 'dots', x: [0, 5], y: [0, 1], size: 0 },
        { type: 'dots', x: [3, 10], y: [0, 1], xaxis: 'x2', yaxis: 'y2', size: 0 },
      ],
      TWO_PANELS,
    );
    expect(range(c, 'x')).toEqual(range(c, 'x2'));
    const [r0, r1] = range(c, 'x') as [number, number];
    expect(r0).toBeLessThanOrEqual(0);
    expect(r1).toBeGreaterThanOrEqual(10);
    // The y axes are not linked.
    expect(c.fullLayout?.['_axisMatchGroups']).toEqual([{ x2: 1, x: 1 }]);
  });

  it('moves every axis of the group on relayout of any member', async () => {
    const c = await chart(
      [
        { type: 'dots', x: [0, 5], y: [0, 1] },
        { type: 'dots', x: [3, 10], y: [0, 1], xaxis: 'x2', yaxis: 'y2' },
      ],
      TWO_PANELS,
    );
    const log: unknown[] = [];
    c.on('relayout', (e) => void log.push(e));
    await c.relayout({ 'xaxis2.range': [2, 4] });
    expect(range(c, 'x')).toEqual([2, 4]);
    expect(range(c, 'x2')).toEqual([2, 4]);
    expect(log[0]).toMatchObject({ 'xaxis.range': [2, 4], 'xaxis2.range': [2, 4] });
    await c.relayout({ 'xaxis.autorange': true });
    expect(range(c, 'x2')).toEqual(range(c, 'x'));
    expect((range(c, 'x')[1] as number) >= 10).toBe(true);
  });

  it('zooms and pans matched axes together', async () => {
    const c = await chart(
      [
        { type: 'dots', x: [0, 10], y: [0, 1] },
        { type: 'dots', x: [0, 10], y: [0, 1], xaxis: 'x2', yaxis: 'y2' },
      ],
      { ...TWO_PANELS, xaxis: { domain: [0, 0.45], range: [0, 10] } },
    );
    await c.zoom(0.5, { subplot: 'xy' });
    expect(range(c, 'x')).toEqual([2.5, 7.5]);
    expect(range(c, 'x2')).toEqual([2.5, 7.5]);
    // Pan inside the right subplot (x2 spans 55%–100% of the 580 px plot area).
    const sp = c.subplots.get('x2y2');
    if (!sp) throw new Error('no x2y2');
    const midY = sp.rect.y + sp.rect.height / 2;
    await c.setDragmode('pan');
    const x0 = sp.rect.x + 100;
    await drag(c, [x0, midY], [x0 - sp.rect.width / 5, midY]);
    const r = range(c, 'x');
    expect(r[0]).toBeCloseTo(3.5, 5);
    expect(r[1]).toBeCloseTo(8.5, 5);
    expect(range(c, 'x2')).toEqual(r);
  });

  it('shares fixedrange across the group', async () => {
    const c = await chart(
      [
        { type: 'dots', x: [0, 10], y: [0, 1] },
        { type: 'dots', x: [0, 10], y: [0, 1], xaxis: 'x2', yaxis: 'y2' },
      ],
      { ...TWO_PANELS, xaxis2: { ...TWO_PANELS.xaxis2, fixedrange: true } },
    );
    expect(c.fullLayout?.['xaxis']).toMatchObject({ fixedrange: true });
    const before = range(c, 'x');
    await c.zoom(0.5);
    expect(range(c, 'x')).toEqual(before);
    expect(range(c, 'x2')).toEqual(before);
  });
});

describe('scaleanchor and constrain (E3.9)', () => {
  const SQUARE = { type: 'dots', x: [0, 10], y: [0, 10], size: 0 };

  it('widens the range of the more zoomed-in axis so px per unit agree', async () => {
    const c = await chart([SQUARE], { yaxis: { scaleanchor: 'x' } });
    expect(pxPerUnit(c, 'x')).toBeCloseTo(pxPerUnit(c, 'y'), 6);
    // y (320 px) decides; x (580 px) widens around its center.
    const [x0, x1] = range(c, 'x') as [number, number];
    expect((x0 + x1) / 2).toBeCloseTo(5, 6);
    expect(x1 - x0).toBeGreaterThan(15);
  });

  it('applies scaleratio', async () => {
    const c = await chart([SQUARE], { yaxis: { scaleanchor: 'x', scaleratio: 2 } });
    expect(pxPerUnit(c, 'y') / pxPerUnit(c, 'x')).toBeCloseTo(2, 6);
  });

  it("keeps the aspect when one axis' range is set: the other zooms to match", async () => {
    const c = await chart([SQUARE], { yaxis: { scaleanchor: 'x' } });
    await c.relayout({ 'xaxis.range': [4, 6] });
    expect(range(c, 'x')).toEqual([4, 6]);
    expect(pxPerUnit(c, 'y')).toBeCloseTo(pxPerUnit(c, 'x'), 6);
    const [y0, y1] = range(c, 'y') as [number, number];
    expect((y0 + y1) / 2).toBeCloseTo(5, 1);
  });

  it('zooms the partner axis of an x-only zoom box', async () => {
    const c = await chart([SQUARE], {
      yaxis: { scaleanchor: 'x' },
      xaxis: { range: [0, 20] },
    });
    const before = pxPerUnit(c, 'y');
    // A thin horizontal drag: x-only zoom box over half the plot width.
    await drag(c, [40 + 145, 190], [40 + 435, 192]);
    expect(pxPerUnit(c, 'x')).toBeCloseTo(pxPerUnit(c, 'y'), 6);
    expect(pxPerUnit(c, 'y')).toBeCloseTo(before * 2, 3);
  });

  it("shrinks the domain with constrain: 'domain', toward constraintoward", async () => {
    const c = await chart([SQUARE], {
      xaxis: { constrain: 'domain', constraintoward: 'left' },
      yaxis: { scaleanchor: 'x' },
    });
    expect(pxPerUnit(c, 'x')).toBeCloseTo(pxPerUnit(c, 'y'), 3);
    const sp = c.subplots.get('xy');
    // Left edge kept, narrower than the 580 px plot area, as tall as it.
    expect(sp?.rect.x).toBe(40);
    expect(sp?.rect.width).toBeLessThan(400);
    expect(sp?.rect.height).toBe(320);
    const d = c.fullLayout?.xaxis?.domain as number[];
    expect(d[0]).toBe(0);
    expect(d[1]).toBeLessThan(0.7);
    // The input domain is untouched.
    expect(c.layout['xaxis']).toEqual({ constrain: 'domain', constraintoward: 'left' });
  });
});

describe('overlaid axes zoom together', () => {
  it('zooms a secondary y axis with its primary in a plot-area zoom box', async () => {
    const c = await chart(
      [
        { type: 'dots', x: [0, 10], y: [0, 100] },
        { type: 'dots', x: [0, 10], y: [0, 1], yaxis: 'y2' },
      ],
      {
        xaxis: { range: [0, 10] },
        yaxis: { range: [0, 100] },
        yaxis2: { overlaying: 'y', side: 'right', range: [0, 1] },
      },
    );
    // A tall thin drag over the lower half: y-only zoom to [0, 50] on y, [0, 0.5] on y2.
    await drag(c, [300, 350], [302, 190]);
    const y = range(c, 'y');
    const y2 = range(c, 'y2');
    expect(y[0]).toBeCloseTo(0, 6);
    expect(y[1]).toBeCloseTo(50, 6);
    expect(y2[0]).toBeCloseTo(0, 6);
    expect(y2[1]).toBeCloseTo(0.5, 6);
  });
});

describe('range breaks (E3.8) end to end', () => {
  const DAY = 86_400_000;
  // Fri 2024-01-05 … Tue 2024-01-09, the weekend removed.
  const DAYS = ['2024-01-05', '2024-01-06', '2024-01-08', '2024-01-09'];

  it('compresses linear space: a weekend adds no width, and data inside it is dropped', async () => {
    const c = await chart([{ type: 'dots', x: DAYS, y: [1, 2, 3, 4], size: 0 }], {
      xaxis: { rangebreaks: [{ bounds: ['sat', 'mon'] }] },
    });
    const calc = c.getCalcdata(0) as { x: Float64Array };
    expect(calc.x[1]).toBeNaN(); // Saturday
    // Friday → Monday is one day in linear space.
    expect((calc.x[2] as number) - (calc.x[0] as number)).toBe(DAY);
    const s = c.axes.get('x')?.scale;
    expect(s?.l2d(calc.x[2] as number)).toBe(Date.parse('2024-01-08'));
    // fullLayout reports raw (ms) ranges, valid as range values.
    const r = c.fullLayout?.xaxis?.range as number[];
    expect(s?.r2l(r[0])).toBeCloseTo(s?.range[0] as number, 3);
  });

  it('commits date strings when a pan crosses a break', async () => {
    const c = await chart([{ type: 'dots', x: DAYS, y: [1, 2, 3, 4] }], {
      xaxis: {
        range: ['2024-01-05', '2024-01-09'],
        rangebreaks: [{ bounds: ['sat', 'mon'] }],
      },
      dragmode: 'pan',
    });
    const log: Record<string, unknown>[] = [];
    c.on('relayout', (e) => void log.push(e as Record<string, unknown>));
    // Two linear days (Fri, Mon) over 580 px: drag left by one day.
    await drag(c, [330, 200], [330 - 580 / 2, 200]);
    const e = log.at(-1) ?? {};
    expect(e['xaxis.range[0]']).toBe('2024-01-08');
    expect(e['xaxis.range[1]']).toBe('2024-01-10');
  });
});

describe('spike lines (E3.10)', () => {
  function spikeLines(c: Chart): SVGLineElement[] {
    return [...c.element.querySelectorAll<SVGLineElement>('.holochart-spikeline')].filter(
      (el) => el.style.display !== 'none' && (el.ownerSVGElement?.style.display ?? '') !== 'none',
    );
  }

  const DOTS = { type: 'dots', x: [0, 5, 10], y: [0, 50, 100] };
  const RANGES = { xaxis: { range: [0, 10] }, yaxis: { range: [0, 100] } };
  const cx = (x: number): number => 40 + 58 * x;
  const cy = (y: number): number => 350 - 3.2 * y;

  it('draws spikes from the hovered point to the axes and hides them on unhover', async () => {
    const c = await chart([DOTS], {
      ...RANGES,
      xaxis: { ...RANGES.xaxis, showspikes: true },
      yaxis: { ...RANGES.yaxis, showspikes: true, spikemode: 'toaxis+marker' },
    });
    fire(c, 'pointermove', cx(5) + 2, cy(50) - 1);
    t.scheduler.step();
    const lines = spikeLines(c);
    // Background + spike per axis.
    expect(lines).toHaveLength(4);
    const v = lines.find(
      (l) => l.getAttribute('x1') === l.getAttribute('x2') && l.getAttribute('stroke-dasharray'),
    );
    expect(Number(v?.getAttribute('x1'))).toBeCloseTo(cx(5), 6);
    expect(Number(v?.getAttribute('y1'))).toBeCloseTo(350, 6);
    expect(Number(v?.getAttribute('y2'))).toBeCloseTo(cy(50), 6);
    expect(c.element.querySelectorAll('.holochart-spikemarker')).toHaveLength(1);
    fire(c, 'pointerleave', 700, 500);
    expect(spikeLines(c)).toHaveLength(0);
  });

  it('follows the pointer with spikesnap: cursor', async () => {
    const c = await chart([DOTS], {
      ...RANGES,
      xaxis: { ...RANGES.xaxis, showspikes: true, spikesnap: 'cursor' },
    });
    fire(c, 'pointermove', cx(5) + 4, cy(50));
    t.scheduler.step();
    expect(Number(spikeLines(c)[1]?.getAttribute('x1'))).toBeCloseTo(cx(5) + 4, 6);
    fire(c, 'pointermove', cx(5) - 6, cy(50));
    t.scheduler.step();
    expect(Number(spikeLines(c)[1]?.getAttribute('x1'))).toBeCloseTo(cx(5) - 6, 6);
  });

  it("spikes the nearest data within spikedistance with spikesnap: 'data', without a label", async () => {
    const c = await chart([DOTS], {
      ...RANGES,
      hoverdistance: 5,
      spikedistance: 200,
      xaxis: { ...RANGES.xaxis, showspikes: true, spikesnap: 'data' },
    });
    fire(c, 'pointermove', cx(5) + 40, cy(50));
    t.scheduler.step();
    expect(c.element.querySelectorAll('.holochart-hoverlabel[style*="flex"]')).toHaveLength(0);
    const lines = spikeLines(c);
    expect(lines).toHaveLength(2);
    expect(Number(lines[1]?.getAttribute('x1'))).toBeCloseTo(cx(5), 6);
  });

  it('draws nothing when spikedistance is 0 or no axis shows spikes', async () => {
    const off = await chart([DOTS], RANGES);
    fire(off, 'pointermove', cx(5), cy(50));
    t.scheduler.step();
    expect(spikeLines(off)).toHaveLength(0);
    off.destroy();
    const zero = await chart([DOTS], {
      ...RANGES,
      spikedistance: 0,
      xaxis: { ...RANGES.xaxis, showspikes: true },
    });
    fire(zero, 'pointermove', cx(5), cy(50));
    t.scheduler.step();
    expect(spikeLines(zero)).toHaveLength(0);
  });

  it('shows spikes for a programmatic hover and keeps them when the pointer leaves', async () => {
    const c = await chart([DOTS], {
      ...RANGES,
      xaxis: { ...RANGES.xaxis, showspikes: true },
    });
    c.hover([{ curveNumber: 0, pointNumber: 2 }]);
    expect(spikeLines(c)).toHaveLength(2);
    fire(c, 'pointerleave', 700, 500);
    expect(spikeLines(c)).toHaveLength(2);
  });

  it('follows spike attribute edits that skip the layout stage', async () => {
    const c = await chart([DOTS], {
      ...RANGES,
      xaxis: { ...RANGES.xaxis, showspikes: true },
    });
    await c.relayout({ 'xaxis.spikecolor': '#00ff00' });
    fire(c, 'pointermove', cx(5), cy(50));
    t.scheduler.step();
    expect(spikeLines(c)[1]?.getAttribute('stroke')).toBe('rgb(0, 255, 0)');
    // The modebar toggle's relayout: spikes off at once, and the range in use is kept.
    const before = range(c, 'x');
    await c.relayout({ 'xaxis.showspikes': false });
    expect(spikeLines(c)).toHaveLength(0);
    expect(range(c, 'x')).toEqual(before);
    expect(c.fullLayout?.xaxis?.range).toEqual(before);
  });

  it('keeps a programmatic hover (and its spikes) across a pipeline run', async () => {
    const c = await chart([DOTS], { ...RANGES, xaxis: { ...RANGES.xaxis, showspikes: true } });
    const log: unknown[] = [];
    c.on('hover', (e) => void log.push(e));
    c.hover([{ curveNumber: 0, pointNumber: 1 }]);
    expect(log).toHaveLength(1);
    await c.relayout({ 'xaxis.range': [0, 20] });
    const lines = spikeLines(c);
    expect(lines).toHaveLength(2);
    // Redrawn at the point's new position (x = 5 of 0–20), without a second `hover` event.
    expect(Number(lines[1]?.getAttribute('x1'))).toBeCloseTo(40 + 580 / 4, 6);
    expect(log).toHaveLength(1);
    c.unhover();
    await c.relayout({ 'xaxis.range': [0, 10] });
    expect(spikeLines(c)).toHaveLength(0);
  });

  it('turns spikes on with any spike attribute or unified hover (Plotly defaults)', async () => {
    const c = await chart([DOTS], {
      ...RANGES,
      hovermode: 'x unified',
      yaxis: { ...RANGES.yaxis, spikecolor: '#f00' },
    });
    expect(c.fullLayout?.xaxis).toMatchObject({
      showspikes: true,
      spikemode: 'across',
      spikedash: 'dot',
      spikethickness: 1.5,
    });
    expect(c.fullLayout?.yaxis).toMatchObject({ showspikes: true, spikecolor: 'rgb(255, 0, 0)' });
  });
});
