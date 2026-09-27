import { describe, expect, it } from 'vitest';
import { defaults, layoutAxes, measure } from '../__testing__/fixtures.ts';
import { buildAxesScene } from './axes.ts';
import { axisMarginNeeds, marginPushOf, unmetNeeds } from './margins.ts';
import type { RectItem } from './geometry.ts';
import {
  automarginAllows,
  axisMarginSide,
  axisPlacement,
  lineCrossings,
  mainSubplots,
} from './placement.ts';

const AREA = { x: 80, y: 40, width: 400, height: 300 };

function setup(layout: Record<string, unknown>, data: Record<string, unknown>[] = []) {
  const { fullLayout } = defaults(layout, data);
  return { fullLayout, ...layoutAxes(fullLayout, AREA) };
}

describe('axisPlacement', () => {
  it('draws x axes at the bottom or top of the counter axis, pushed out by pad', () => {
    const { axes, subplots } = setup({ xaxis: { side: 'bottom' } });
    const x = axes.get('x');
    if (!x) throw new Error('no x');
    expect(axisPlacement(x, axes, subplots.values(), AREA, 0).frame).toEqual({
      cross: 340,
      sgn: 1,
    });
    expect(axisPlacement(x, axes, subplots.values(), AREA, 4).frame).toEqual({
      cross: 344,
      sgn: 1,
    });
    const top = setup({ xaxis: { side: 'top' } });
    const xt = top.axes.get('x');
    if (!xt) throw new Error('no x');
    expect(axisPlacement(xt, top.axes, top.subplots.values(), AREA, 0).frame).toEqual({
      cross: 40,
      sgn: -1,
    });
  });

  it('draws y axes left or right', () => {
    const { axes, subplots } = setup({ yaxis: { side: 'right' } });
    const y = axes.get('y');
    if (!y) throw new Error('no y');
    const p = axisPlacement(y, axes, subplots.values(), AREA, 0);
    expect(p.frame).toEqual({ cross: 480, sgn: 1 });
    expect(p.margin).toBe('r');
  });

  it('places free axes at their paper position', () => {
    const { axes, subplots } = setup({ yaxis: { anchor: 'free', position: 0.25 } });
    const y = axes.get('y');
    if (!y) throw new Error('no y');
    const p = axisPlacement(y, axes, subplots.values(), AREA, 0);
    expect(p.frame).toEqual({ cross: 180, sgn: -1 });
    expect(p.counter).toBeUndefined();
    expect(p.margin).toBeUndefined();
  });

  it('mirrors on the opposite edge, or on every subplot sharing the axis', () => {
    const one = setup({ xaxis: { mirror: 'ticks', showline: true } });
    const x = one.axes.get('x');
    if (!x) throw new Error('no x');
    const p = axisPlacement(x, one.axes, one.subplots.values(), AREA, 2);
    expect(p.mirrors).toEqual([{ cross: 38, sgn: -1, ticks: true }]);
    expect(lineCrossings(p, 2)).toEqual([340, 40]);

    const shared = setup(
      { xaxis: { mirror: 'all' }, yaxis: { domain: [0, 0.4] }, yaxis2: { domain: [0.6, 1] } },
      [
        { x: [1], y: [1] },
        { x: [1], y: [1], yaxis: 'y2' },
      ],
    );
    const xs = shared.axes.get('x');
    if (!xs) throw new Error('no x');
    const ps = axisPlacement(xs, shared.axes, shared.subplots.values(), AREA, 0);
    // Main line at the bottom of y; mirrors at the top of y and both edges of y2.
    expect(ps.mirrors.map((m) => [m.cross, m.sgn])).toEqual([
      [220, -1],
      [160, 1],
      [40, -1],
    ]);
  });

  it('joins lines at the corner with the counter axis line width', () => {
    const { axes, subplots } = setup({ yaxis: { showline: true, linewidth: 3 } });
    const x = axes.get('x');
    if (!x) throw new Error('no x');
    expect(axisPlacement(x, axes, subplots.values(), AREA, 0).overhang).toBe(3);
  });
});

describe('automargin rules', () => {
  it('reads automargin flags per side', () => {
    expect(automarginAllows(true, 'l')).toBe(true);
    expect(automarginAllows(false, 'l')).toBe(false);
    expect(automarginAllows('width', 'r')).toBe(true);
    expect(automarginAllows('width', 't')).toBe(false);
    expect(automarginAllows('left+bottom', 'b')).toBe(true);
    expect(automarginAllows('left+bottom', 'r')).toBe(false);
  });

  it('only grows the margin an axis actually touches', () => {
    const { axes } = setup({ yaxis: { domain: [0.5, 1] }, xaxis: { side: 'bottom' } });
    const x = axes.get('x');
    const y = axes.get('y');
    if (!x || !y) throw new Error('no axes');
    // x sits at the bottom of y, whose domain starts at 0.5: not on the figure edge.
    expect(axisMarginSide(x, axes)).toBeUndefined();
    expect(axisMarginSide(y, axes)).toBe('l');
  });

  it('computes needs, folds them per side and finds unmet ones', () => {
    const { fullLayout, axes } = setup({
      xaxis: { automargin: true, ticks: 'outside', title: { text: 'Time' } },
      yaxis: { automargin: 'height' },
      margin: { pad: 2 },
    });
    const needs = axisMarginNeeds(axes, fullLayout, { width: 560, height: 420 }, measure);
    expect(needs.map((n) => n.side)).toEqual(['b']);
    const need = needs[0]?.need ?? 0;
    // pad + ticklen + gap + one label line + standoff + title line.
    expect(need).toBe(Math.ceil(2 + 5 + 3 + 12 * 1.3 + 10 + 14 * 1.3));
    expect(marginPushOf(needs)).toEqual({ b: need });
    expect(marginPushOf([])).toBeUndefined();
    expect(unmetNeeds(needs, { l: 0, r: 0, t: 0, b: need })).toEqual([]);
    expect(unmetNeeds(needs, { l: 0, r: 0, t: 0, b: need - 1 })).toHaveLength(1);
  });

  it('measures an axis with no length yet at the hinted length', () => {
    const { fullLayout, axes } = setup({ yaxis: { automargin: true } });
    const y = axes.get('y');
    if (!y) throw new Error('no y');
    y.scale.setLength(1);
    y.scale.setRange(0, 12345);
    const needs = axisMarginNeeds(
      axes,
      fullLayout,
      { width: 560, height: 420 },
      measure,
      () => 300,
    );
    expect(needs[0]?.side).toBe('l');
    expect(needs[0]?.need).toBeGreaterThan(20);
  });
});

describe('buildAxesScene', () => {
  it('routes grids to subplots and lines/labels to the overlay', () => {
    const { fullLayout, axes, subplots } = setup({
      xaxis: { showline: true, ticks: 'outside' },
      yaxis: { showline: true, layer: 'below traces', ticks: 'inside' },
    });
    const scene = buildAxesScene(
      {
        axes: axes as never,
        subplots: subplots as never,
        plotArea: AREA,
        fullLayout,
        width: 560,
        height: 420,
      },
      measure,
    );
    const under = scene.under.get('xy');
    expect(under?.rects.length).toBeGreaterThan(0);
    // The y line lies outside the plot area (overlay); its inside ticks lie inside it (under).
    const yTicksUnder = under?.rects.filter((r) => r.x0 === 80 && r.x1 === 85) ?? [];
    expect(yTicksUnder.length).toBeGreaterThan(0);
    expect(scene.over.some((r) => r.x0 === 79 && r.x1 === 80)).toBe(true);
    expect(scene.labels.length).toBeGreaterThan(0);
  });

  it('skips invisible axes', () => {
    const { fullLayout, axes, subplots } = setup({
      xaxis: { visible: false },
      yaxis: { visible: false },
    });
    const scene = buildAxesScene(
      {
        axes: axes as never,
        subplots: subplots as never,
        plotArea: AREA,
        fullLayout,
        width: 560,
        height: 420,
      },
      measure,
    );
    expect(scene.over).toEqual([]);
    expect(scene.labels).toEqual([]);
    expect(scene.under.get('xy')?.rects).toEqual([]);
  });
});

describe('buildAxesScene on overlaying axes', () => {
  const RANGES = { x: [0, 10], y: [-5, 10], y2: [-2, 20] } as const;

  function scene(layout: Record<string, unknown>, data: Record<string, unknown>[]) {
    const { fullLayout } = defaults(layout, data);
    const { axes, subplots } = layoutAxes(fullLayout, AREA, RANGES);
    const s = buildAxesScene(
      {
        axes: axes as never,
        subplots: subplots as never,
        plotArea: AREA,
        fullLayout,
        width: 560,
        height: 420,
      },
      measure,
    );
    return { ...s, axes, mains: mainSubplots(subplots.values()) };
  }
  const horizontal = (r: RectItem): boolean => r.x0 <= AREA.x + 1 && r.x1 >= AREA.x + 399;
  const vertical = (r: RectItem): boolean => r.y0 <= AREA.y + 1 && r.y1 >= AREA.y + 299;
  const mid = (r: RectItem): number => (r.y0 + r.y1) / 2;
  const GRIDS = {
    xaxis: { showgrid: true, zeroline: false },
    yaxis: { showgrid: true, zeroline: true },
    yaxis2: { overlaying: 'y', side: 'right', showgrid: true, zeroline: true, griddash: 'dot' },
  };

  it('draws their grids and zero lines with the main subplot, under every trace', () => {
    const s = scene(GRIDS, [{}, { yaxis: 'y2' }]);
    expect(s.mains).toEqual(new Map([['xy2', 'xy']]));
    expect(s.under.get('xy2')).toEqual({ rects: [], dashed: [] });
    const main = s.under.get('xy');
    if (!main) throw new Error('no xy');
    // y2's dotted grid, then the zero lines of y and y2 after every solid grid line.
    expect(main.dashed.length).toBeGreaterThan(0);
    expect(main.dashed.every((d) => d.y0 === d.y1)).toBe(true);
    const zeros = [s.axes.get('y')?.l2c(0), s.axes.get('y2')?.l2c(0)];
    const rows = main.rects.filter(horizontal).map(mid);
    expect(rows.slice(-2).map(Math.round)).toEqual(zeros.map((z) => Math.round(z ?? NaN)));
    // One x grid for the pair, not one per subplot (Plotly's `finishedGrids`).
    const single = scene({ xaxis: GRIDS.xaxis }, [{}]);
    expect(main.rects.filter(vertical)).toEqual(single.under.get('xy')?.rects.filter(vertical));
  });

  it('keeps them in their own subplot when the overlaid axis has no subplot', () => {
    const s = scene(GRIDS, [{ yaxis: 'y2' }]);
    expect(s.mains.size).toBe(0);
    expect(s.under.has('xy')).toBe(false);
    expect(s.under.get('xy2')?.rects.filter(vertical).length).toBeGreaterThan(0);
    expect(s.under.get('xy2')?.dashed.length).toBeGreaterThan(0);
  });

  it('draws the in-plot items of a `below traces` overlaying axis with the main subplot', () => {
    const s = scene(
      { yaxis2: { overlaying: 'y', side: 'right', layer: 'below traces', ticks: 'inside' } },
      [{}, { yaxis: 'y2' }],
    );
    // y2's inside ticks point left from the right edge of the plot area.
    const ticks = (r: RectItem): boolean => r.x1 === AREA.x + 400 && r.x0 === AREA.x + 395;
    expect(s.under.get('xy')?.rects.some(ticks)).toBe(true);
    expect(s.under.get('xy2')?.rects).toEqual([]);
    expect(s.over.some(ticks)).toBe(false);
  });
});

describe('free-axis shift and autoshift (E3.9)', () => {
  // y2 and y3 overlay y on its left, free at the plot edge; y's tick labels are ~20 px deep.
  const LAYOUT = {
    yaxis: { showline: true, ticks: 'outside', ticklen: 5 },
    yaxis2: { overlaying: 'y', anchor: 'free', autoshift: true, showline: true },
    yaxis3: { overlaying: 'y', anchor: 'free', autoshift: true, showline: true },
  };
  const DATA = [{}, { yaxis: 'y2' }, { yaxis: 'y3' }];

  function scene(layout: Record<string, unknown>, data = DATA) {
    const { fullLayout, axes, subplots } = setup(layout, data);
    const s = buildAxesScene(
      {
        axes: axes as never,
        subplots: subplots as never,
        plotArea: AREA,
        fullLayout,
        width: 560,
        height: 420,
      },
      measure,
    );
    // The x of each y axis line (1 px wide rects spanning the plot height).
    const lines = s.over
      .filter((r) => r.x1 - r.x0 <= 1.01 && r.y1 - r.y0 >= AREA.height - 1)
      .map((r) => r.x1)
      .sort((a, b) => a - b);
    return { fullLayout, axes, lines };
  }

  it('stacks autoshift axes outward past the axes drawn before them', () => {
    const { lines, fullLayout } = scene(LAYOUT);
    expect(fullLayout['yaxis2']).toMatchObject({ position: 0, shift: -3, automargin: true });
    // y at the plot edge, then y2 and y3 further left, each past the previous one's labels.
    expect(lines).toHaveLength(3);
    const [y3, y2, y] = lines as [number, number, number];
    expect(y).toBe(AREA.x);
    expect(y2).toBeLessThan(y - 10);
    expect(y3).toBeLessThan(y2 - 10);
  });

  it('moves a free axis by its shift without autoshift', () => {
    const { lines } = scene(
      {
        yaxis2: {
          overlaying: 'y',
          anchor: 'free',
          position: 1,
          side: 'right',
          shift: 12,
          showline: true,
        },
      },
      [{}, { yaxis: 'y2' }],
    );
    expect(lines).toContain(AREA.x + AREA.width + 12 + 1);
  });

  it('reserves margin for the shifted axes', () => {
    const { fullLayout, axes } = scene(LAYOUT);
    const plain = axisMarginNeeds(axes, fullLayout, { width: 560, height: 420 }, measure).find(
      (n) => n.axis === 'y2',
    );
    const shifted = plain?.need ?? 0;
    const y = axisMarginNeeds(axes, fullLayout, { width: 560, height: 420 }, measure).find(
      (n) => n.axis === 'y',
    );
    // y2 sits outside y's labels, so it needs more room than y does (y has no automargin here).
    expect(y).toBeUndefined();
    expect(shifted).toBeGreaterThan(20);
    const y3 = axisMarginNeeds(axes, fullLayout, { width: 560, height: 420 }, measure).find(
      (n) => n.axis === 'y3',
    );
    expect(y3?.need ?? 0).toBeGreaterThan(shifted);
  });
});
