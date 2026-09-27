/**
 * Bar period alignment (`xperiod`, E3.5 as Plotly's `bar/calc.js`) and the hover value of bars at
 * implicit positions (`x0` + `dx`), including across range breaks.
 */
import {
  createBreakMap,
  createScale,
  supplyDefaults,
  type BreakMap,
  type FullTrace,
} from '@mk7s/holochart-core';
import { IDENTITY_TRANSFORM } from '@mk7s/holochart-render';
import {
  createChartRegistry,
  type AxisInfo,
  type HoverContext,
  type HoverQuery,
} from '@mk7s/holochart-runtime';
import { describe, expect, it } from 'vitest';
import { bar, type BarCalc } from './index.ts';

const registry = createChartRegistry().register(bar);
const DAY = 86_400_000;
const utc = (y: number, m: number, d = 1, h = 0): number => Date.UTC(y, m - 1, d, h);

function axisInfo(
  id: string,
  type: 'linear' | 'date' | 'category',
  opts: { categories?: string[]; breaks?: BreakMap } = {},
): AxisInfo {
  const scale = createScale({ type, length: 400, ...opts });
  return { id, scale, type, letter: id.charAt(0), full: { type } } as unknown as AxisInfo;
}

/** Defaults, calc and cross-trace calc of one bar trace. */
function build(data: Record<string, unknown>, x: AxisInfo, y: AxisInfo) {
  const { fullData, fullLayout } = supplyDefaults(
    { data: [{ type: 'bar', ...data }], layout: {} },
    registry.core,
  );
  const trace = fullData[0] as FullTrace;
  const calc = bar.calc!(trace, { fullLayout, index: 0, xaxis: x, yaxis: y }) as BarCalc;
  bar.crossTraceCalc!([{ trace, index: 0, calc }], {
    fullLayout,
    xaxis: x,
    yaxis: y,
    subplot: {} as never,
  });
  // 1 px per ms or unit on both axes: hover queries below are in linear coordinates.
  const ctx: HoverContext = { fullLayout, xaxis: x, yaxis: y, transform: IDENTITY_TRANSFORM };
  // Hits nearest first (the runtime ranks them): at 1 px per unit, the 4 px minimum hit size
  // makes small bars overlap.
  const hover = (px: number, py: number, mode: HoverQuery['mode'] = 'closest') =>
    bar.hoverPoints!(calc, trace, { px, py, xl: px, yl: py, mode, distance: 20 }, ctx).sort(
      (a, b) => a.distance - b.distance,
    );
  return { trace, calc, hover };
}

const MONTHS = ['2024-01-01', '2024-02-01', '2024-03-01'];

describe('bar xperiod', () => {
  it('coerces period attributes like scatter: alignment and period0 only with a period', () => {
    const { fullData } = supplyDefaults(
      {
        data: [
          { type: 'bar', x: MONTHS, y: [1, 2, 3] },
          { type: 'bar', x: MONTHS, y: [1, 2, 3], xperiod: 'M1' },
          { type: 'bar', orientation: 'h', y: MONTHS, x: [1, 2, 3], yperiod: DAY, yperiod0: 5 },
        ],
        layout: {},
      },
      registry.core,
    );
    expect(fullData[0]!['xperiodalignment']).toBeUndefined();
    expect(fullData[1]).toMatchObject({ xperiod: 'M1', xperiodalignment: 'middle' });
    expect(fullData[2]).toMatchObject({ yperiod: DAY, yperiod0: 5, yperiodalignment: 'middle' });
  });

  it('aligns vertical bars on a date x axis (vals, starts, ends)', () => {
    const x = axisInfo('x', 'date');
    const y = axisInfo('y', 'linear');
    const { calc } = build({ x: MONTHS, y: [1, 2, 3], xperiod: 'M1' }, x, y);
    // Mid-month: halfway between the month's first day and the next month's.
    expect(Array.from(calc.pos)).toEqual([
      (utc(2024, 1) + utc(2024, 2)) / 2,
      (utc(2024, 2) + utc(2024, 3)) / 2,
      (utc(2024, 3) + utc(2024, 4)) / 2,
    ]);
    expect(Array.from(calc.period!.starts)).toEqual([utc(2024, 1), utc(2024, 2), utc(2024, 3)]);
    expect(Array.from(calc.period!.ends)).toEqual([utc(2024, 2), utc(2024, 3), utc(2024, 4)]);
    expect(Array.from(calc.bars.center)).toEqual(Array.from(calc.pos));
    // Widths from the aligned positions (Plotly: no period-specific width): mid-months are 30
    // days apart here, and bars take 80% of that.
    expect(calc.bars.width[0]).toBeCloseTo(0.8 * 30 * DAY, -1);
  });

  it('honors xperiodalignment and xperiod0', () => {
    const x = axisInfo('x', 'date');
    const y = axisInfo('y', 'linear');
    const end = build({ x: MONTHS, y: [1, 2, 3], xperiod: 'M1', xperiodalignment: 'end' }, x, y);
    expect(Array.from(end.calc.pos)).toEqual([utc(2024, 2), utc(2024, 3), utc(2024, 4)]);
    const weeks = build(
      {
        x: ['2024-01-03', '2024-01-10'],
        y: [1, 2],
        xperiod: 7 * DAY,
        xperiod0: '2024-01-01',
        xperiodalignment: 'start',
      },
      x,
      y,
    );
    expect(Array.from(weeks.calc.pos)).toEqual([utc(2024, 1, 1), utc(2024, 1, 8)]);
  });

  it('aligns horizontal bars on y (yperiod), and not the size axis', () => {
    const x = axisInfo('x', 'linear');
    const y = axisInfo('y', 'linear');
    const { calc } = build(
      { orientation: 'h', y: [1, 12], x: [3, 4], yperiod: 10, xperiod: 100 },
      x,
      y,
    );
    expect(Array.from(calc.pos)).toEqual([5, 15]);
    expect(Array.from(calc.s1)).toEqual([3, 4]);
  });

  it('ignores periods on category axes', () => {
    const x = axisInfo('x', 'category', { categories: ['a', 'b'] });
    const y = axisInfo('y', 'linear');
    const { calc } = build({ x: ['a', 'b'], y: [1, 2], xperiod: 1 }, x, y);
    expect(Array.from(calc.pos)).toEqual([0, 1]);
    expect(calc.period).toBeUndefined();
  });

  it('hovers the unaligned position (Plotly orig_p), over the whole period in x mode', () => {
    const x = axisInfo('x', 'date');
    const y = axisInfo('y', 'linear');
    const { calc, hover } = build(
      { x: MONTHS, y: [1, 2, 3], xperiod: 'M1', xperiodalignment: 'start', width: DAY },
      x,
      y,
    );
    expect(Array.from(calc.pos)).toEqual([utc(2024, 1), utc(2024, 2), utc(2024, 3)]);
    // In x mode a bar catches the pointer over its period's length around its position (Plotly's
    // `di.p ± periodLength / 2`), not over its own 1-day width: 10 days before February 1st.
    const [p] = hover(utc(2024, 2) - 10 * DAY, 0, 'x');
    expect(p).toMatchObject({ pointIndex: 1, x: '2024-02-01', y: 2 });
    expect(p!.fields).toMatchObject({ label: '2024-02-01', x: '2024-02-01' });
    // 20 days before February 1st is nearer January's (31-day) period.
    expect(hover(utc(2024, 2) - 20 * DAY, 0, 'x')[0]?.pointIndex).toBe(0);
    // Closest mode stays on the bar itself.
    expect(hover(utc(2024, 2) - 10 * DAY, 1, 'closest')).toEqual([]);
  });
});

describe('bar hover at implicit positions (x0 + dx)', () => {
  it('steps a date x0 by dx (ms) for every bar', () => {
    const x = axisInfo('x', 'date');
    const y = axisInfo('y', 'linear');
    const { calc, hover } = build({ x0: '2024-01-01', dx: 7 * DAY, y: [1, 2, 3] }, x, y);
    expect(Array.from(calc.pos)).toEqual([utc(2024, 1, 1), utc(2024, 1, 8), utc(2024, 1, 15)]);
    const [p] = hover(utc(2024, 1, 15), 1);
    expect(p).toMatchObject({ pointIndex: 2, x: '2024-01-15', y: 3 });
    expect(p!.fields).toMatchObject({ label: '2024-01-15', x: '2024-01-15' });
  });

  it('steps horizontal bars along y (y0 + dy), numbers and numeric strings alike', () => {
    const x = axisInfo('x', 'linear');
    const y = axisInfo('y', 'linear');
    const { hover } = build({ orientation: 'h', x: [4, 5, 6], y0: '10', dy: 2 }, x, y);
    expect(hover(1, 14)[0]).toMatchObject({ pointIndex: 2, x: 6, y: 14 });
  });

  it('names the category at each implicit index on category axes', () => {
    const x = axisInfo('x', 'category', { categories: ['a', 'b', 'c'] });
    const y = axisInfo('y', 'linear');
    const { calc, hover } = build({ x0: 'a', dx: 1, y: [1, 2, 3] }, x, y);
    expect(Array.from(calc.pos)).toEqual([0, 1, 2]);
    expect(hover(2, 1)[0]).toMatchObject({ pointIndex: 2, x: 'c' });
  });

  it('steps raw dates across range breaks and hides bars inside a break (Plotly)', () => {
    const breaks = createBreakMap([{ bounds: ['sat', 'mon'] }], 'date');
    const x = axisInfo('x', 'date', { breaks: breaks! });
    const y = axisInfo('y', 'linear');
    // Thursday 2024-01-04 to Tuesday the 9th; Saturday and Sunday are hidden.
    const { calc, hover } = build({ x0: '2024-01-04', dx: DAY, y: [1, 2, 3, 4, 5, 6] }, x, y);
    const raw = Array.from(calc.pos, (l) => (Number.isNaN(l) ? NaN : breaks!.toRaw(l)));
    expect(raw).toEqual([
      utc(2024, 1, 4),
      utc(2024, 1, 5),
      NaN,
      NaN,
      utc(2024, 1, 8),
      utc(2024, 1, 9),
    ]);
    const [p] = hover(calc.pos[4]!, 1);
    expect(p).toMatchObject({ pointIndex: 4, x: '2024-01-08' });
  });
});
