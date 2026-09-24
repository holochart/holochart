/**
 * Bars on date axes (plan E9.14): `base` as a date, lengths in ms, `width` in ms, and the hover
 * value of the size axis (`base + size`, Plotly's `bar/hover.js`). Gantt charts are built on this.
 */
import {
  autorange,
  createScale,
  supplyDefaults,
  type FullAxis,
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
const JAN = (d: number, h = 0): number => Date.UTC(2024, 0, d, h);

function axisInfo(
  id: string,
  type: 'linear' | 'date' | 'category',
  categories?: string[],
  length = 400,
): AxisInfo {
  const scale = createScale({ type, length, ...(categories ? { categories } : {}) });
  return { id, scale, type, letter: id.charAt(0), full: { type } } as unknown as AxisInfo;
}

/** Defaults, calc and cross-trace calc of bar traces on one subplot. */
function build(
  data: Record<string, unknown>[],
  layout: Record<string, unknown>,
  x: AxisInfo,
  y: AxisInfo,
) {
  const { fullData, fullLayout } = supplyDefaults(
    { data: data.map((t) => ({ type: 'bar', ...t })), layout },
    registry.core,
  );
  const calcs = fullData.map((trace, index) =>
    bar.calc!(trace, { fullLayout, index, xaxis: x, yaxis: y }),
  ) as BarCalc[];
  bar.crossTraceCalc!(
    fullData.map((trace, index) => ({ trace, index, calc: calcs[index]! })),
    { fullLayout, xaxis: x, yaxis: y, subplot: {} as never },
  );
  const extremes = fullData.map((trace, index) =>
    bar.extremes!(calcs[index]!, trace, { fullLayout, index, xaxis: x, yaxis: y }),
  );
  return { traces: fullData as FullTrace[], calcs, extremes, fullLayout };
}

/** A horizontal Gantt-like trace on a date x axis over categories. */
function gantt(trace: Record<string, unknown>, layout: Record<string, unknown> = {}) {
  const tasks = ['a', 'b', 'c'];
  const x = axisInfo('x', 'date');
  const y = axisInfo('y', 'category', tasks);
  return { ...build([{ orientation: 'h', y: tasks, ...trace }], layout, x, y), x, y };
}

const autoAxis = { _id: 'x', autorange: true, rangemode: 'normal', range: [null, null] };

describe('bars on date axes', () => {
  it('accepts date strings, Date objects and ms numbers as base, with ms lengths', () => {
    const lengths = [2 * DAY, 3 * DAY + 12 * 3_600_000, DAY];
    const bases = [
      ['2024-01-01', '2024-01-03 12:00', '2024-01-08'],
      [new Date(JAN(1)), new Date(JAN(3, 12)), new Date(JAN(8))],
      [JAN(1), JAN(3, 12), JAN(8)],
    ];
    for (const base of bases) {
      const { calcs } = gantt({ x: lengths, base });
      const c = calcs[0]!;
      expect([...c.s0]).toEqual([JAN(1), JAN(3, 12), JAN(8)]);
      expect([...c.s1]).toEqual([JAN(3), JAN(7), JAN(9)]);
      expect([...c.hasBase]).toEqual([1, 1, 1]);
    }
  });

  it('accepts one scalar base for every bar', () => {
    const { calcs } = gantt({ x: [DAY, 2 * DAY, 3 * DAY], base: '2024-01-10' });
    expect([...calcs[0]!.s0]).toEqual([JAN(10), JAN(10), JAN(10)]);
    expect([...calcs[0]!.s1]).toEqual([JAN(11), JAN(12), JAN(13)]);
  });

  it('skips bars whose base does not parse and draws them from zero', () => {
    const { calcs } = gantt({ x: [DAY, DAY, DAY], base: ['2024-01-01', 'soon', null] });
    expect([...calcs[0]!.hasBase]).toEqual([1, 0, 0]);
    expect(calcs[0]!.s0[1]).toBe(0);
  });

  it('autoranges over base..end with 5% padding and without the epoch', () => {
    const { extremes, x } = gantt({
      x: [2 * DAY, 4 * DAY, DAY],
      base: ['2024-01-01', '2024-01-03', '2024-01-09'],
    });
    const e = extremes[0]!.x!;
    expect(e.tozero).toBeFalsy();
    expect(Math.min(...e.min.map((p) => p.l))).toBe(JAN(1));
    expect(Math.max(...e.max.map((p) => p.l))).toBe(JAN(10));
    expect(e.min.every((p) => p.extrapad)).toBe(true);
    const range = autorange([e], x.scale, autoAxis as unknown as FullAxis);
    // 5% of the axis length on each side: the data fills 90% of it.
    const pad = ((JAN(10) - JAN(1)) / 0.9) * 0.05;
    expect(range[0]).toBeCloseTo(JAN(1) - pad, -1);
    expect(range[1]).toBeCloseTo(JAN(10) + pad, -1);
  });

  it('lays out overlaid bars at their own dates (barmode overlay, as px.timeline)', () => {
    const { calcs } = gantt(
      { x: [DAY, DAY], y: ['a', 'a'], base: ['2024-01-01', '2024-01-05'] },
      { barmode: 'overlay' },
    );
    expect([...calcs[0]!.bars.center]).toEqual([0, 0]);
    expect([...calcs[0]!.s0]).toEqual([JAN(1), JAN(5)]);
  });

  it('sizes vertical bars on a date x axis with width in ms', () => {
    const x = axisInfo('x', 'date');
    const y = axisInfo('y', 'linear');
    const { calcs, extremes } = build(
      [{ x: ['2024-01-01', '2024-01-08'], y: [3, 5], width: 2 * DAY }],
      {},
      x,
      y,
    );
    const c = calcs[0]!;
    expect([...c.bars.width]).toEqual([2 * DAY, 2 * DAY]);
    expect([...c.bars.center]).toEqual([JAN(1), JAN(8)]);
    // The position extremes cover the full slots (a week each here).
    expect(extremes[0]!.x!.min[0]!.l).toBe(JAN(1) - 3.5 * DAY);
    // Default width: 80% of the smallest spacing between dates.
    const { calcs: d } = build([{ x: ['2024-01-01', '2024-01-02'], y: [1, 2] }], {}, x, y);
    expect(d[0]!.bars.width[0]).toBeCloseTo(0.8 * DAY);
  });

  it('accepts per-bar widths in ms', () => {
    const x = axisInfo('x', 'date');
    const y = axisInfo('y', 'linear');
    const { calcs } = build([{ x: [JAN(1), JAN(8)], y: [3, 5], width: [DAY, 3 * DAY] }], {}, x, y);
    expect([...calcs[0]!.bars.width]).toEqual([DAY, 3 * DAY]);
  });
});

describe('bar hover on date size axes', () => {
  /** A 1 px per hour transform starting at JAN(1); category rows are 100 px apart. */
  function hover(trace: Record<string, unknown>, layout: Record<string, unknown> = {}) {
    const { traces, calcs, x, y, fullLayout } = gantt(trace, layout);
    const ctx: HoverContext = {
      fullLayout,
      xaxis: x,
      yaxis: y,
      transform: {
        ...IDENTITY_TRANSFORM,
        scaleX: 1 / 3_600_000,
        offsetX: -JAN(1) / 3_600_000,
        scaleY: 100,
        offsetY: 50,
      },
    };
    return (px: number, py: number) => {
      const q: HoverQuery = { px, py, xl: 0, yl: 0, mode: 'closest', distance: 20 };
      return bar.hoverPoints!(calcs[0]!, traces[0]!, q, ctx);
    };
  }

  it('reports base + size on the size axis when the trace has a base (Plotly)', () => {
    const at = hover({ x: [2 * DAY, DAY, DAY], base: ['2024-01-01', '2024-01-03', '2024-01-04'] });
    // Row 'a' (py 50), 24 h into its two-day bar.
    const [p] = at(24, 50);
    expect(p).toMatchObject({ pointIndex: 0, x: JAN(3), y: 'a' });
    expect(p!.fields).toMatchObject({ base: JAN(1), value: 2 * DAY });
    expect(p!.px).toBeCloseTo(48, 6);
  });

  it('keeps the bar length when the trace has no base', () => {
    const x = axisInfo('x', 'linear');
    const y = axisInfo('y', 'category', ['a']);
    const { traces, calcs, fullLayout } = build([{ orientation: 'h', y: ['a'], x: [5] }], {}, x, y);
    const ctx: HoverContext = {
      fullLayout,
      xaxis: x,
      yaxis: y,
      transform: { ...IDENTITY_TRANSFORM, scaleX: 10, scaleY: 100, offsetY: 50 },
    };
    const q: HoverQuery = { px: 20, py: 50, xl: 0, yl: 0, mode: 'closest', distance: 20 };
    expect(bar.hoverPoints!(calcs[0]!, traces[0]!, q, ctx)[0]).toMatchObject({ x: 5, y: 'a' });
  });
});
