import { createScale, type FullAxis } from '@mk7s/holochart-core';
import { describe, expect, it } from 'vitest';
import { defaults, layoutAxes, layoutAxis, measure } from '../__testing__/fixtures.ts';
import {
  axisGeometry,
  axisTicks,
  gridGeometry,
  LABEL_GAP,
  labelBounds,
  tickLabelAnchor,
  TITLE_STANDOFF,
  type AxisLike,
} from './geometry.ts';

const AREA = { x: 100, y: 50, width: 400, height: 300 };
const SIZE = { width: 600, height: 400 };
const LINE = 12 * 1.3;

function xAxis(layout: Record<string, unknown> = {}, range: [number, number] = [0, 10]): AxisLike {
  const { fullLayout } = defaults({ xaxis: layout });
  return layoutAxis(fullLayout.xaxis as FullAxis, AREA, range);
}

function yAxis(layout: Record<string, unknown> = {}, range: [number, number] = [0, 10]): AxisLike {
  const { fullLayout } = defaults({ yaxis: layout });
  return layoutAxis(fullLayout.yaxis as FullAxis, AREA, range);
}

const BOTTOM = { cross: 350, sgn: 1 as const };
const LEFT = { cross: 100, sgn: -1 as const };

describe('labelBounds', () => {
  it('anchors an unrotated box', () => {
    expect(labelBounds(20, 10, 'left', 'top', 0)).toEqual({ minX: 0, maxX: 20, minY: 0, maxY: 10 });
    expect(labelBounds(20, 10, 'center', 'middle', 0)).toEqual({
      minX: -10,
      maxX: 10,
      minY: -5,
      maxY: 5,
    });
    expect(labelBounds(20, 10, 'right', 'bottom', 0)).toEqual({
      minX: -20,
      maxX: 0,
      minY: -10,
      maxY: 0,
    });
  });

  it('rotates clockwise about the anchor', () => {
    const b = labelBounds(20, 10, 'left', 'top', 90);
    // The text runs downward; its top edge faces +x... so the box spans x ∈ [−10, 0], y ∈ [0, 20].
    expect(b.minX).toBeCloseTo(-10);
    expect(b.maxX).toBeCloseTo(0);
    expect(b.minY).toBeCloseTo(0);
    expect(b.maxY).toBeCloseTo(20);
  });
});

describe('tickLabelAnchor', () => {
  it('hangs unrotated x labels centered below (or above) the tick', () => {
    expect(tickLabelAnchor('x', 1, 0, 20, 10)).toMatchObject({ anchorX: 'center', anchorY: 'top' });
    expect(tickLabelAnchor('x', -1, 0, 20, 10)).toMatchObject({ anchorY: 'bottom' });
  });

  it('starts clockwise labels at the tick below the axis and ends them at it above', () => {
    expect(tickLabelAnchor('x', 1, 30, 20, 10)).toMatchObject({
      anchorX: 'left',
      anchorY: 'middle',
    });
    expect(tickLabelAnchor('x', 1, -30, 20, 10)).toMatchObject({ anchorX: 'right' });
    expect(tickLabelAnchor('x', -1, 45, 20, 10)).toMatchObject({ anchorX: 'right' });
    expect(tickLabelAnchor('x', 1, 90, 20, 10).shift).toBeCloseTo(0);
    expect(tickLabelAnchor('x', 1, 30, 20, 10).shift).toBeCloseTo(5 * Math.cos(Math.PI / 6));
  });

  it('aligns y labels towards the axis', () => {
    expect(tickLabelAnchor('y', -1, 0, 20, 10)).toMatchObject({
      anchorX: 'right',
      anchorY: 'middle',
    });
    expect(tickLabelAnchor('y', 1, 0, 20, 10)).toMatchObject({ anchorX: 'left' });
    const r = tickLabelAnchor('y', -1, -90, 20, 10);
    expect(r).toMatchObject({ anchorX: 'center', anchorY: 'middle' });
    expect(r.shift).toBeCloseTo(5);
  });
});

describe('axisGeometry', () => {
  it('stacks line, outside ticks and labels outward from a bottom x axis', () => {
    const axis = xAxis({ showline: true, linewidth: 2, ticks: 'outside', ticklen: 6 });
    const geo = axisGeometry(axis, BOTTOM, axisTicks(axis), { measure, ...SIZE });
    const line = geo.rects[0];
    expect(line).toMatchObject({ x0: 100, x1: 500, y0: 350, y1: 352 });
    const tick = geo.rects[1];
    expect(tick?.y0).toBe(352);
    expect(tick?.y1).toBe(358);
    const zero = geo.labels.find((l) => l.text === '0');
    expect(zero).toMatchObject({ x: 100, y: 358 + LABEL_GAP, anchorX: 'center', anchorY: 'top' });
    expect(geo.extent).toBeCloseTo(8 + LABEL_GAP + LINE);
    expect(geo.angle).toBe(0);
  });

  it('puts left y-axis labels right-aligned and measures their width', () => {
    const axis = yAxis({ ticks: 'outside', ticklen: 5 }, [0, 1000]);
    const geo = axisGeometry(axis, LEFT, axisTicks(axis), { measure, ...SIZE });
    const label = geo.labels.find((l) => l.text === '1000');
    expect(label).toMatchObject({ x: 100 - 5 - LABEL_GAP, anchorX: 'right', anchorY: 'middle' });
    // '1000' is 4 × 6 px wide in the test measure.
    expect(geo.extent).toBeCloseTo(5 + LABEL_GAP + 24);
  });

  it('keeps inside ticks and labels out of the extent', () => {
    const axis = yAxis({ ticks: 'inside', ticklen: 8, ticklabelposition: 'inside' });
    const geo = axisGeometry(axis, LEFT, axisTicks(axis), { measure, ...SIZE });
    expect(geo.extent).toBe(0);
    const tick = geo.rects[0];
    expect(tick).toMatchObject({ x0: 100, x1: 108 });
    const label = geo.labels[0];
    expect(label?.anchorX).toBe('left');
    expect(label?.x).toBe(100 + 8 + LABEL_GAP);
  });

  it('mirrors the line (and ticks) on the opposite side', () => {
    const axis = xAxis({ showline: true, ticks: 'outside' });
    const ticks = axisTicks(axis);
    const plain = axisGeometry(axis, BOTTOM, ticks, {
      measure,
      ...SIZE,
      mirrors: [{ cross: 50, sgn: -1, ticks: false }],
    });
    const withTicks = axisGeometry(axis, BOTTOM, ticks, {
      measure,
      ...SIZE,
      mirrors: [{ cross: 50, sgn: -1, ticks: true }],
    });
    expect(plain.rects.some((r) => r.y0 === 49 && r.y1 === 50 && r.x1 - r.x0 === 400)).toBe(true);
    expect(withTicks.rects.length - plain.rects.length).toBe(ticks.length);
    expect(withTicks.rects.some((r) => r.y1 === 49 && r.y0 === 44)).toBe(true);
  });

  it('places titles past the labels, rotating y titles', () => {
    const x = xAxis({ title: { text: 'Time' } });
    const gx = axisGeometry(x, BOTTOM, axisTicks(x), { measure, ...SIZE });
    const tx = gx.labels.find((l) => l.text === 'Time');
    expect(tx).toMatchObject({ x: 300, anchorY: 'top', angle: 0 });
    expect(tx?.y).toBeCloseTo(350 + LABEL_GAP + LINE + TITLE_STANDOFF);
    // The title font is 1.2 × 12 px.
    expect(gx.extent).toBeCloseTo(LABEL_GAP + LINE + TITLE_STANDOFF + 14 * 1.3);

    const y = yAxis({ title: { text: 'Value', standoff: 4 } });
    const gy = axisGeometry(y, LEFT, axisTicks(y), { measure, ...SIZE });
    const ty = gy.labels.find((l) => l.text === 'Value');
    expect(ty).toMatchObject({ angle: -90, anchorX: 'center', anchorY: 'bottom', y: 200 });
    expect(ty?.x).toBeCloseTo(100 - LABEL_GAP - 12 - 4);
  });

  it('draws bold titles for fully bold text', () => {
    const x = xAxis({ title: { text: '<b>Time</b>' } });
    const g = axisGeometry(x, BOTTOM, axisTicks(x), { measure, ...SIZE });
    expect(g.labels.find((l) => l.text === 'Time')?.font.weight).toBe('bold');
  });

  it('rotates crowded x labels (tickangle auto) and anchors them at the tick', () => {
    const axis = xAxis(
      { tickmode: 'array', tickvals: [0, 1, 2], ticktext: ['long label', 'b', 'c'] },
      [0, 2],
    );
    const narrow = { ...axis, l2c: (l: number) => 100 + l * 30, start: 100, end: 160 };
    const g = axisGeometry(narrow, BOTTOM, axisTicks(axis), { measure, ...SIZE });
    expect(g.angle).not.toBe(0);
    expect(g.labels[0]?.anchorX).toBe('left');
  });

  it('hides labels past the figure (ticklabeloverflow)', () => {
    const axis = xAxis({ tickmode: 'array', tickvals: [0, 10], ticktext: ['start', 'the end'] });
    const wide = { ...axis, start: 0, end: 600, l2c: (l: number) => l * 60 };
    const g = axisGeometry(wide, BOTTOM, axisTicks(axis), { measure, ...SIZE });
    expect(g.labels.map((l) => l.text)).toEqual([]);
    const allow = { ...wide, full: { ...wide.full, ticklabeloverflow: 'allow' } as FullAxis };
    const g2 = axisGeometry(allow, BOTTOM, axisTicks(axis), { measure, ...SIZE });
    expect(g2.labels.map((l) => l.text)).toEqual(['start', 'the end']);
  });

  it('draws nothing but the frame for hidden labels and no ticks', () => {
    const axis = xAxis({ showticklabels: false });
    const g = axisGeometry(axis, BOTTOM, axisTicks(axis), { measure, ...SIZE });
    expect(g).toMatchObject({ rects: [], labels: [], extent: 0 });
  });

  it('draws minor ticks with their own length', () => {
    const axis = xAxis({ ticks: 'outside', minor: { ticks: 'outside', ticklen: 2 } });
    const g = axisGeometry(axis, BOTTOM, axisTicks(axis), { measure, ...SIZE });
    const minor = g.rects.filter((r) => r.y1 - r.y0 === 2);
    expect(minor.length).toBeGreaterThan(0);
  });

  it('splits joined multicategory labels into two rows with dividers', () => {
    const { fullLayout } = defaults({ xaxis: { type: 'multicategory' } });
    const axis = layoutAxis(fullLayout.xaxis as FullAxis, AREA, [-0.5, 3.5], {
      type: 'multicategory',
      categories: ['2024/Q1', '2024/Q2', '2025/Q1', '2025/Q2'],
    });
    const ticks = axisTicks(axis);
    expect(ticks.filter((t) => !t.minor).map((t) => [t.text2, t.text])).toEqual([
      ['2024', 'Q1'],
      ['2024', 'Q2'],
      ['2025', 'Q1'],
      ['2025', 'Q2'],
    ]);
    const g = axisGeometry(axis, BOTTOM, ticks, { measure, ...SIZE });
    const rows = new Set(g.labels.map((l) => l.y));
    expect(rows.size).toBe(2);
    expect(g.labels.filter((l) => l.text === '2024')).toHaveLength(1);
    // Dividers at the outer edges and between the groups.
    const dividers = g.rects.filter((r) => r.y0 === 350 && r.y1 > 360);
    expect(dividers.map((r) => (r.x0 + r.x1) / 2).sort((a, b) => a - b)).toEqual([100, 300, 500]);
  });
});

describe('gridGeometry', () => {
  it('draws grid lines across the counter span and the zero line last', () => {
    const axis = xAxis({}, [-5, 5]);
    const g = gridGeometry(axis, axisTicks(axis), 350, 50);
    expect(g.zero).toHaveLength(1);
    expect(g.zero[0]).toMatchObject({ x0: 299.5, x1: 300.5, y0: 50, y1: 350 });
    // No grid line under the zero line.
    expect(g.rects.some((r) => Math.abs(r.x0 + 0.5 - 300) < 1)).toBe(false);
    expect(g.rects.length).toBeGreaterThan(2);
  });

  it('skips grid lines under counter-axis lines and draws dashes separately', () => {
    const axis = xAxis({ griddash: 'dash', zeroline: false }, [0, 10]);
    const g = gridGeometry(axis, axisTicks(axis), 350, 50, [100]);
    expect(g.rects).toEqual([]);
    expect(g.dashed.every((d) => d.dash === 'dash')).toBe(true);
    expect(g.dashed.some((d) => d.x0 === 100)).toBe(false);
  });

  it('adds minor grid lines and honors showgrid/zeroline off', () => {
    const on = xAxis({ minor: { showgrid: true }, zeroline: false }, [0, 10]);
    const off = xAxis({ showgrid: false, zeroline: false }, [0, 10]);
    const ticks = axisTicks(on);
    expect(gridGeometry(on, ticks, 350, 50).rects.length).toBeGreaterThan(
      ticks.filter((t) => !t.minor).length,
    );
    expect(gridGeometry(off, axisTicks(off), 350, 50).rects).toEqual([]);
  });

  it('draws no zero line on log axes or when 0 is out of range', () => {
    const { fullLayout } = defaults({ xaxis: { type: 'log' } });
    const log = layoutAxis(fullLayout.xaxis as FullAxis, AREA, [-1, 1], { type: 'log' });
    expect(gridGeometry(log, axisTicks(log), 350, 50).zero).toEqual([]);
    const positive = xAxis({}, [1, 10]);
    expect(gridGeometry(positive, axisTicks(positive), 350, 50).zero).toEqual([]);
  });
});

describe('layoutAxes fixture', () => {
  it('matches the runtime conventions (y start is the bottom)', () => {
    const { fullLayout } = defaults();
    const { axes } = layoutAxes(fullLayout, AREA);
    expect(axes.get('y')).toMatchObject({ start: 350, end: 50 });
    expect(axes.get('y')?.l2c(10)).toBe(50);
    expect(createScale({ type: 'linear' }).range).toEqual([0, 1]);
  });
});
