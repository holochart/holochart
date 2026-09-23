import { describe, expect, it } from 'vitest';
import { defaults, layoutAxes, measure } from '../__testing__/fixtures.ts';
import { buildAxesScene } from './axes.ts';
import { axisMarginNeeds, marginPushOf, unmetNeeds } from './margins.ts';
import { automarginAllows, axisMarginSide, axisPlacement, lineCrossings } from './placement.ts';

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
