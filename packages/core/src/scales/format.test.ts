import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { coerceContainer } from '../defaults/container.ts';
import type { FullAxis } from '../defaults/types.ts';
import { xaxisSchema, yaxisSchema } from '../layout/schema.ts';
import type { ObjectNode } from '../schema/types.ts';
import { EPOCH_2000, ONEDAY, ONEHOUR, ONEMIN, ONESEC, ONEWEEK } from './date-math.ts';
import {
  autoTicks,
  createTickFormatter,
  formatDateLabel,
  formatNumber,
  formatValue,
  getTickFormat,
  MINUS_SIGN,
  parseDtick,
  resolveTickMode,
  roundUp,
  tickOptions,
  tickSpec,
} from './format.ts';
import { createScale } from './scale.ts';
import type { AxisType, ScaleOptions } from './types.ts';

const M = MINUS_SIGN;

/** A full axis from the real schema defaults, as supply-defaults would build it. */
function axis(input: Record<string, unknown> = {}, id = 'x'): FullAxis {
  const node = (id.startsWith('y') ? yaxisSchema : xaxisSchema) as unknown as ObjectNode;
  const a = coerceContainer(node, input) as FullAxis;
  a._id = id;
  a._name = `${id.charAt(0)}axis`;
  return a;
}

/** A hand-built axis with only the given fields (tests that missing fields fall back). */
function bare(input: Record<string, unknown> = {}): FullAxis {
  return input as unknown as FullAxis;
}

function scale(
  type: AxisType,
  range: readonly [number, number],
  length = 400,
  extra: Partial<ScaleOptions> = {},
) {
  return createScale({ type, range, length, ...extra });
}

const utc = (y: number, mo = 1, d = 1, h = 0, mi = 0, s = 0, ms = 0): number =>
  Date.UTC(y, mo - 1, d, h, mi, s, ms);

describe('formatNumber', () => {
  it('uses hover precision by default', () => {
    expect(formatNumber(4.12345)).toBe('4.12345');
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(1234)).toBe('1234');
    expect(formatNumber(12345)).toBe('12.345k');
  });

  it('writes negatives with a true minus sign', () => {
    expect(formatNumber(-2.5, { tickround: 2 })).toBe(`${M}2.5`);
    expect(formatNumber(-0.0001, { tickround: 2 })).toBe('0');
  });

  it('separates thousands per Plotly numSeparate', () => {
    expect(formatNumber(1234, { tickround: 0 })).toBe('1234');
    expect(formatNumber(12345, { tickround: 0 })).toBe('12,345');
    expect(formatNumber(1234.5, { tickround: 1 })).toBe('1,234.5');
    expect(formatNumber(1234, { tickround: 0, separatethousands: true })).toBe('1,234');
  });

  it('rounds to tickround digits, including negative ones', () => {
    expect(formatNumber(12345, { tickround: -2 })).toBe('12,300');
    expect(formatNumber(12355, { tickround: -1 })).toBe('12,360');
    expect(formatNumber(2.4999, { tickround: 0 })).toBe('2');
    expect(formatNumber(0.30000000000000004, { tickround: 3 })).toBe('0.3');
  });

  it('writes exponents per exponentformat', () => {
    const o = { tickround: 2 - 6, tickexponent: 6 };
    expect(formatNumber(2e6, { ...o, exponentformat: 'SI' })).toBe('2M');
    expect(formatNumber(2e6, { ...o, exponentformat: 'B' })).toBe('2M');
    expect(formatNumber(2e6, { ...o, exponentformat: 'e' })).toBe('2e+6');
    expect(formatNumber(2e6, { ...o, exponentformat: 'E' })).toBe('2E+6');
    expect(formatNumber(2e6, { ...o, exponentformat: 'power' })).toBe('2×10<sup>6</sup>');
    expect(formatNumber(2e6, { ...o, exponentformat: 'none' })).toBe('2,000,000');
    expect(formatNumber(2e6, { ...o, hideExponent: true })).toBe('2');
    const b = { tickround: 2 - 9, tickexponent: 9 };
    expect(formatNumber(3e9, { ...b, exponentformat: 'B' })).toBe('3B');
    expect(formatNumber(3e9, { ...b, exponentformat: 'SI' })).toBe('3G');
    const small = { tickround: 2 + 6, tickexponent: -6 };
    expect(formatNumber(5e-6, { ...small, exponentformat: 'SI' })).toBe('5μ');
    expect(formatNumber(5e-6, { ...small, exponentformat: 'e' })).toBe(`5e${M}6`);
    expect(formatNumber(5e-6, { ...small, exponentformat: 'power' })).toBe(`5×10<sup>${M}6</sup>`);
  });

  it('falls back to power beyond the SI prefixes', () => {
    expect(formatNumber(1e18)).toBe('1×10<sup>18</sup>');
    expect(formatNumber(1e-18, { exponentformat: 'SI' })).toBe(`1×10<sup>${M}18</sup>`);
  });

  it('honors minexponent', () => {
    expect(formatNumber(12345, { minexponent: 5 })).toBe('12,345');
    expect(formatNumber(0.0001234, { minexponent: 5 })).toBe('0.0001234');
    expect(formatNumber(0.0001234)).toBe('123.4μ');
  });

  it('applies d3 tickformats with a true minus', () => {
    expect(formatNumber(0.256, { tickformat: '.1%' })).toBe('25.6%');
    expect(formatNumber(-1234.5, { tickformat: '$,.2f' })).toBe(`${M}$1,234.50`);
    expect(formatNumber(1500, { tickformat: '~s' })).toBe('1.5k');
    // Invalid specifier: the raw number, like Plotly's noFormat.
    expect(formatNumber(-1.5, { tickformat: 'bogus%%%' })).toBe(`${M}1.5`);
  });
});

describe('tickOptions', () => {
  it('falls back to schema defaults on hand-built axes', () => {
    const o = tickOptions(bare());
    expect(o.letter).toBe('x');
    expect(o.tickmode).toBeUndefined();
    expect(o.exponentformat).toBe('B');
    expect(o.showexponent).toBe('all');
    expect(o.minexponent).toBe(3);
    expect(o.ticklabelstep).toBe(1);
    expect(o.tickfontSize).toBe(12);
    expect(o.minor.nticks).toBe(5);
    expect(o.minor.ticks).toBe('');
    expect(o.tickformatstops).toEqual([]);
  });

  it('reads and validates attributes', () => {
    const o = tickOptions(
      bare({
        _id: 'y3',
        tickmode: 'linear',
        exponentformat: 'nope',
        ticklabelstep: 2.6,
        tickfont: { size: 20 },
        tickvals: new Float64Array([1, 2]),
        ticktext: 'not an array',
        tickformatstops: [
          { dtickrange: [1, 2], value: 'a' },
          { enabled: false, dtickrange: [1, 2], value: 'b' },
          { visible: false, dtickrange: [1, 2], value: 'c' },
          { value: 'd' },
          'junk',
        ],
        minor: { tickmode: 'auto', nticks: 3, showgrid: true, tickvals: [1] },
      }),
    );
    expect(o.letter).toBe('y');
    expect(o.tickmode).toBe('linear');
    expect(o.exponentformat).toBe('B');
    expect(o.ticklabelstep).toBe(3);
    expect(o.tickfontSize).toBe(20);
    expect(o.tickvals).toBeInstanceOf(Float64Array);
    expect(o.ticktext).toBeUndefined();
    expect(o.tickformatstops.map((s) => s.value)).toEqual(['a', 'd', '']);
    expect(o.tickformatstops[1]?.dtickrange).toEqual([null, null]);
    expect(o.minor).toMatchObject({ tickmode: 'auto', nticks: 3, showgrid: true, tickvals: [1] });
  });
});

describe('parseDtick / resolveTickMode', () => {
  it('validates steps per axis type', () => {
    expect(parseDtick(2, 'linear')).toBe(2);
    expect(parseDtick('2.5', 'linear')).toBe(2.5);
    expect(parseDtick(0, 'linear')).toBeUndefined();
    expect(parseDtick(-1, 'linear')).toBeUndefined();
    expect(parseDtick(undefined, 'linear')).toBeUndefined();
    expect(parseDtick('', 'linear')).toBeUndefined();
    expect(parseDtick('M3', 'linear')).toBeUndefined();
    expect(parseDtick(2.6, 'category')).toBe(3);
    expect(parseDtick(0.2, 'multicategory')).toBe(1);
    expect(parseDtick(0.01, 'date')).toBe(0.1);
    expect(parseDtick('M3', 'date')).toBe('M3');
    expect(parseDtick('M1.5', 'date')).toBeUndefined();
    expect(parseDtick('M', 'date')).toBeUndefined();
    expect(parseDtick('L0.5', 'log')).toBe('L0.5');
    expect(parseDtick('L-1', 'log')).toBeUndefined();
    expect(parseDtick('D1', 'log')).toBe('D1');
    expect(parseDtick('D2', 'log')).toBe('D2');
    expect(parseDtick('D3', 'log')).toBeUndefined();
    expect(parseDtick('X1', 'log')).toBeUndefined();
    expect(parseDtick('LInfinity', 'log')).toBeUndefined();
    expect(parseDtick({}, 'log')).toBeUndefined();
  });

  it('resolves tick modes', () => {
    expect(resolveTickMode('array', undefined, undefined)).toBe('array');
    expect(resolveTickMode('linear', undefined, 2)).toBe('linear');
    expect(resolveTickMode('linear', undefined, undefined)).toBe('auto');
    expect(resolveTickMode('sync', [1], 2)).toBe('auto');
    expect(resolveTickMode(undefined, [1], 2)).toBe('array');
    expect(resolveTickMode(undefined, undefined, 2)).toBe('linear');
    expect(resolveTickMode(undefined, undefined, undefined)).toBe('auto');
  });
});

describe('roundUp', () => {
  it('finds the first element above (or last below when reversed)', () => {
    expect(roundUp(1.5, [2, 5, 10])).toBe(2);
    expect(roundUp(2, [2, 5, 10])).toBe(5);
    expect(roundUp(20, [2, 5, 10])).toBe(10);
    expect(roundUp(0.5, [-0.301, 0, 0.301, 0.699, 1], true)).toBe(0.301);
    expect(roundUp(-1, [-0.301, 0, 0.301, 0.699, 1], true)).toBe(-0.301);
  });
});

describe('autoTicks', () => {
  it('rounds linear steps to 1/2/5 × 10^n', () => {
    expect(autoTicks('linear', 1.67)).toEqual({ dtick: 2, tick0: 0 });
    expect(autoTicks('linear', 20)).toEqual({ dtick: 50, tick0: 0 });
    expect(autoTicks('linear', 0.0003).dtick).toBeCloseTo(0.0005, 12);
  });

  it('picks date units', () => {
    expect(autoTicks('date', 3 * 365 * ONEDAY).dtick).toBe('M60');
    expect(autoTicks('date', 200 * ONEDAY).dtick).toBe('M12');
    expect(autoTicks('date', 50 * ONEDAY).dtick).toBe('M2');
    expect(autoTicks('date', 5 * ONEDAY)).toEqual({
      dtick: ONEWEEK,
      tick0: EPOCH_2000 + ONEDAY,
      dayOfWeek: true,
    });
    expect(autoTicks('date', 5 * ONEDAY, { tickformat: '%W' }).tick0).toBe(EPOCH_2000 + 2 * ONEDAY);
    expect(autoTicks('date', 5 * ONEDAY, { isMinor: true }).tick0).toBe(EPOCH_2000);
    expect(autoTicks('date', 5 * ONEHOUR).dtick).toBe(6 * ONEHOUR);
    expect(autoTicks('date', 7 * ONEMIN).dtick).toBe(10 * ONEMIN);
    expect(autoTicks('date', 7 * ONESEC).dtick).toBe(10 * ONESEC);
    expect(autoTicks('date', 30).dtick).toBe(50);
  });

  it('picks log steps', () => {
    expect(autoTicks('log', 1.2, { range: [0, 7] }).dtick).toBe(2);
    expect(autoTicks('log', 0.5, { range: [0, 3] }).dtick).toBe('D2');
    expect(autoTicks('log', 0.2, { range: [0, 2] }).dtick).toBe('D1');
    expect(autoTicks('log', 0.5, { range: [0, 2], isMinor: true }).dtick).toBe(1);
    expect(autoTicks('log', 0.1, { range: [0, 0.5] }).dtick).toBe('L0.5');
    expect(autoTicks('log', 0.1).dtick).toBe('D1');
  });

  it('uses whole categories', () => {
    expect(autoTicks('category', 0.3)).toEqual({ dtick: 1, tick0: 0 });
    expect(autoTicks('multicategory', 4.2).dtick).toBe(5);
  });
});

describe('getTickFormat', () => {
  const stops = [
    { dtickrange: [null, 1000], value: 'ms' },
    { dtickrange: [1000, 'M1'], value: 'sec-month' },
    { dtickrange: ['M1', null], value: 'months' },
  ];
  const o = tickOptions(axis({ tickformat: 'base', tickformatstops: stops }));

  it('picks the first matching stop on linear/date axes', () => {
    expect(getTickFormat(o, 'date', 10)).toBe('ms');
    expect(getTickFormat(o, 'date', ONEDAY)).toBe('sec-month');
    expect(getTickFormat(o, 'date', 'M1')).toBe('sec-month');
    expect(getTickFormat(o, 'date', 'M12')).toBe('months');
    expect(getTickFormat(o, 'linear', 5)).toBe('ms');
    expect(getTickFormat(o, 'category', 5)).toBe('base');
    expect(getTickFormat(tickOptions(axis({ tickformat: 'x' })), 'linear', 1)).toBe('x');
  });

  it('orders log steps L < D < numbers', () => {
    const lo = tickOptions(
      axis({
        tickformatstops: [
          { dtickrange: ['L0.1', 'L10'], value: 'linear' },
          { dtickrange: ['D1', 'D2'], value: 'digits' },
          { dtickrange: [1, null], value: 'decades' },
        ],
      }),
    );
    expect(getTickFormat(lo, 'log', 'L2')).toBe('linear');
    expect(getTickFormat(lo, 'log', 'L0.01')).toBe('');
    expect(getTickFormat(lo, 'log', 'L20')).toBe('');
    expect(getTickFormat(lo, 'log', 'D1')).toBe('digits');
    expect(getTickFormat(lo, 'log', 3)).toBe('decades');
    const d = tickOptions(axis({ tickformatstops: [{ dtickrange: ['D1', 2], value: 'mixed' }] }));
    expect(getTickFormat(d, 'log', 'L2')).toBe('');
    expect(getTickFormat(d, 'log', 1)).toBe('mixed');
    expect(getTickFormat(d, 'log', 5)).toBe('');
  });
});

describe('tickSpec', () => {
  it('derives auto nticks from the axis length and letter', () => {
    expect(tickSpec(scale('linear', [0, 100], 200), axis()).dtick).toBe(50);
    expect(tickSpec(scale('linear', [0, 100], 200), axis({}, 'y')).dtick).toBe(20);
    expect(tickSpec(scale('linear', [0, 100], 2000), axis({ nticks: 3 })).dtick).toBe(50);
    const cats = { categories: Array.from({ length: 100 }, (_, i) => `c${i}`) };
    expect(tickSpec(scale('category', [-0.5, 99.5], 280, cats), axis()).dtick).toBe(5);
    expect(
      tickSpec(scale('category', [-0.5, 99.5], 280, cats), axis({ tickfont: { size: 5 } })).dtick,
    ).toBe(3);
  });

  it('computes tick rounding and exponents', () => {
    const s = tickSpec(scale('linear', [0, 5e6]), axis());
    expect(s).toMatchObject({ mode: 'auto', dtick: 1e6, tickround: -4, tickexponent: 6 });
    expect(tickSpec(scale('linear', [0, 5e6]), axis({ exponentformat: 'e' })).tickexponent).toBe(
      7 - 1,
    );
    expect(tickSpec(scale('linear', [0, 5e7]), axis({ exponentformat: 'e' })).tickexponent).toBe(7);
    expect(tickSpec(scale('log', [0, 1]), axis()).tickround).toBeNull();
    expect(
      tickSpec(scale('category', [0, 1], 400, { categories: ['a'] }), axis()).tickround,
    ).toBeNull();
  });

  it('keeps user steps in linear mode and validates tick0', () => {
    expect(
      tickSpec(scale('linear', [0, 10]), axis({ tickmode: 'linear', tick0: 0.5, dtick: 3 })),
    ).toMatchObject({
      mode: 'linear',
      dtick: 3,
      tick0: 0.5,
      auto: false,
    });
    expect(tickSpec(scale('linear', [0, 10]), axis({ dtick: 3, tick0: 'x' })).tick0).toBe(0);
    expect(tickSpec(scale('log', [0, 3]), bare({ dtick: 'D2', tick0: 5 })).tick0).toBe(0);
    const week = tickSpec(scale('date', [utc(2020), utc(2021)]), bare({ dtick: ONEWEEK }));
    expect(week.tick0).toBe(EPOCH_2000 + ONEDAY);
    const day = tickSpec(scale('date', [utc(2020), utc(2021)]), bare({ dtick: ONEDAY }));
    expect(day.tick0).toBe(EPOCH_2000);
    const t0 = tickSpec(
      scale('date', [utc(2020), utc(2021)]),
      bare({ dtick: 'M1', tick0: '2020-01-15' }),
    );
    expect(t0).toMatchObject({ tick0: utc(2020, 1, 15), tickround: 'd' });
    // `linear` without a valid dtick behaves as auto.
    expect(tickSpec(scale('linear', [0, 10]), bare({ tickmode: 'linear', dtick: -1 })).mode).toBe(
      'auto',
    );
  });

  it('computes date rounding', () => {
    const d = (r: [number, number], extra: Record<string, unknown> = {}) =>
      tickSpec(scale('date', r, 600), bare(extra)).tickround;
    expect(d([utc(2000), utc(2020)])).toBe('y');
    expect(d([utc(2020), utc(2021)])).toBe('m');
    expect(d([utc(2020), utc(2020, 2)])).toBe('d');
    expect(d([utc(2020), utc(2020, 1, 2)])).toBe('M');
    expect(d([utc(2020), utc(2020, 1, 1, 0, 1)])).toBe('S');
    expect(d([utc(2020), utc(2020, 1, 1, 0, 0, 1)])).toBe(1);
    expect(d([utc(2020), utc(2020, 1, 1, 0, 0, 0, 20)])).toBe(3);
    expect(d([utc(2020), utc(2020, 1, 1, 0, 0, 0, 1)])).toBe(4);
    expect(d([utc(2020), utc(2021)], { dtick: 'M1', tick0: '2000-02-01' })).toBe('d');
    expect(d([utc(2020), utc(2021)], { dtick: ONEHOUR, tick0: '2000-01-01 00:00:30' })).toBe('M');
    expect(d([utc(2020), utc(2021)], { dtick: ONEMIN, tick0: '2000-01-01 00:00:00.5' })).toBe('S');
  });

  it('grows auto steps to the period of the tick format (period mode)', () => {
    const p = (fmt: string, r: [number, number] = [utc(2020), utc(2020, 1, 3)]) =>
      tickSpec(scale('date', r, 600), axis({ ticklabelmode: 'period', tickformat: fmt }));
    expect(p('%H')).toMatchObject({ dtick: ONEHOUR * 6, definedDelta: ONEHOUR });
    expect(p('%H:%M')).not.toHaveProperty('definedDelta');
    expect(p('%H', [utc(2020), utc(2020, 1, 1, 1)])).toMatchObject({ dtick: ONEHOUR });
    expect(p('%p', [utc(2020), utc(2020, 1, 1, 1)])).toMatchObject({ dtick: ONEHOUR * 12 });
    expect(p('%a', [utc(2020), utc(2020, 1, 1, 1)])).toMatchObject({ dtick: ONEDAY });
    expect(p('%W', [utc(2020), utc(2020, 1, 1, 1)])).toMatchObject({ dtick: ONEWEEK });
    expect(p('%b')).toMatchObject({ dtick: 'M1', tick0: EPOCH_2000 });
    expect(p('%b', [utc(2020), utc(2020, 2, 1)])).toMatchObject({ dtick: 'M1', tick0: EPOCH_2000 });
    expect(p('Q%q')).toMatchObject({ dtick: 'M3' });
    expect(p('%Y')).toMatchObject({ dtick: 'M12' });
    expect(p('%Y', [utc(2000), utc(2030)])).toMatchObject({ dtick: 'M60' });
    expect(p('%S')).not.toHaveProperty('definedDelta');
    expect(p('%%')).not.toHaveProperty('definedDelta');
    // A user step is kept, only definedDelta is set.
    const user = tickSpec(
      scale('date', [utc(2020), utc(2021)], 600),
      axis({ ticklabelmode: 'period', tickformat: '%b', dtick: ONEDAY }),
    );
    expect(user).toMatchObject({ dtick: ONEDAY, definedDelta: expect.any(Number) });
  });

  it('survives degenerate ranges', () => {
    expect(tickSpec(scale('linear', [5, 5]), axis())).toMatchObject({ dtick: 1, tick0: 0 });
    expect(tickSpec(scale('date', [5, 5]), axis())).toMatchObject({
      dtick: ONEDAY,
      tick0: EPOCH_2000,
    });
    expect(tickSpec(scale('linear', [0, 1], 0), axis()).dtick).toBeGreaterThan(0);
    expect(tickSpec(scale('date', [0, 0.01], 600), axis()).dtick).toBe(0.1);
  });

  it('computes minor specs and array precision', () => {
    const s = scale('linear', [0, 10]);
    expect(tickSpec(s, axis({ minor: { dtick: 0.5 } }), { minor: true }).dtick).toBe(0.5);
    expect(tickSpec(s, axis(), { minor: true, range: [0, 2] }).dtick).toBe(0.5);
    expect(tickSpec(s, axis({ tickvals: [1] })).dtick).toBeCloseTo(0.02, 12);
    expect(tickSpec(s, axis({ tickvals: [1] }), { arrayPrecision: false }).dtick).toBe(2);
  });
});

describe('formatDateLabel', () => {
  const t = utc(2024, 3, 5, 12, 30, 5, 250);
  it('uses the default formats per rounding level', () => {
    expect(formatDateLabel(t, '', 'y')).toBe('2024');
    expect(formatDateLabel(t, '', 'm')).toBe('Mar 2024');
    expect(formatDateLabel(t, '', 'd')).toBe('Mar 5\n2024');
    expect(formatDateLabel(t, '', 'M')).toBe('12:30\nMar 5, 2024');
    expect(formatDateLabel(t, '', 'S')).toBe('12:30:05\nMar 5, 2024');
    expect(formatDateLabel(t, '', 2)).toBe('12:30:05.25\nMar 5, 2024');
    expect(formatDateLabel(utc(2024, 1, 1, 23, 59, 59, 999), '', 1)).toBe(
      '23:59:59.9\nJan 1, 2024',
    );
  });

  it('applies d3-time-format in UTC with Plotly extensions', () => {
    expect(formatDateLabel(t, '%Y-%m-%d %H:%M', null)).toBe('2024-03-05 12:30');
    expect(formatDateLabel(t, '%S.%{2}f', null)).toBe('05.25');
    expect(formatDateLabel(t, '%S.%3f', null)).toBe('05.25');
    expect(formatDateLabel(t, '%f', null)).toBe('25');
    expect(formatDateLabel(utc(2024, 3, 5), '%f', null)).toBe('0');
    expect(formatDateLabel(t, 'H%h %Y', null)).toBe('H1 2024');
    expect(formatDateLabel(utc(2024, 9, 1), 'H%h', null)).toBe('H2');
    expect(formatDateLabel(t, 'Q%q', null)).toBe('Q1');
  });
});

describe('createTickFormatter / formatValue', () => {
  it('formats hover values on linear axes with extra precision', () => {
    const s = scale('linear', [0, 10]);
    expect(formatValue(s, axis(), 4.12345, true)).toBe('4.12345');
    expect(formatValue(s, axis(), 1234.5678, true)).toBe('1,234.568');
    expect(formatValue(s, axis(), -2e7, true)).toBe(`${M}20M`);
    expect(formatValue(s, axis(), 4.12345, false)).toBe('4.12');
    expect(formatValue(s, axis({ hoverformat: '.1f' }), 4.12345, true)).toBe('4.1');
    expect(formatValue(s, axis({ tickformat: '.3f' }), 4.12345, true)).toBe('4.123');
    expect(formatValue(s, axis(), Number.NaN, true)).toBe('');
    expect(formatValue(s, axis(), Infinity, false)).toBe('');
  });

  it('keeps the axis exponent on hover when exponents are hidden', () => {
    const s = scale('linear', [0, 5e6]);
    expect(formatValue(s, axis({ showexponent: 'none' }), 1234, true)).toBe('0.001234M');
    expect(formatValue(s, axis(), 1234, true)).toBe('1234');
    expect(formatValue(s, axis(), 1234567, true)).toBe('1.234567M');
  });

  it('hides exponents per showexponent on tick labels', () => {
    const s = scale('linear', [0, 5e6]);
    const f = createTickFormatter(s, axis({ showexponent: 'first' }));
    f.first = 1e6;
    expect(f.label(1e6).text).toBe('1M');
    expect(f.label(2e6).text).toBe('2');
    expect(f.label(2e6, true).text).toBe('2M');
    expect(createTickFormatter(s, axis()).label(0).text).toBe('0');
    const last = createTickFormatter(s, axis({ showexponent: 'last', exponentformat: 'e' }));
    last.last = 5e6;
    expect(last.label(5e6).text).toBe('5e+6');
    expect(last.label(4e6).text).toBe('4');
  });

  it('adds prefixes and suffixes per show mode', () => {
    const s = scale('linear', [0, 10]);
    const f = createTickFormatter(
      s,
      axis({ tickprefix: '$', showtickprefix: 'first', ticksuffix: '%', showticksuffix: 'last' }),
    );
    f.first = 0;
    f.last = 10;
    expect([0, 4, 10].map((v) => f.label(v).text)).toEqual(['$0', '4', '10%']);
    expect(f.label(4, true).text).toBe('$4%');
    expect(f.label(4, false, true).text).toBe('4');
    const none = createTickFormatter(s, axis({ tickprefix: '$', showtickprefix: 'none' }));
    expect(none.label(4, true).text).toBe('4');
    const all = createTickFormatter(s, axis({ tickprefix: '~' }));
    expect(all.label(4).text).toBe('~4');
  });

  it('formats log values', () => {
    const s = scale('log', [0, 5]);
    expect(formatValue(s, axis(), 2, true)).toBe('100');
    expect(formatValue(s, axis(), 6, true)).toBe('1M');
    expect(formatValue(s, axis(), Math.log10(2.5), true)).toBe('2.5');
    const f = (input: Record<string, unknown>, r: [number, number] = [0, 5]) =>
      createTickFormatter(scale('log', r), axis(input));
    expect(f({}).label(4)).toEqual({ text: '10k' });
    expect(f({ exponentformat: 'power' }).label(4)).toEqual({
      text: '10<sup>4</sup>',
      fontScale: 1.25,
    });
    expect(f({ exponentformat: 'power' }).label(0)).toEqual({ text: '1', fontScale: 1.25 });
    expect(f({ exponentformat: 'power' }).label(1)).toEqual({ text: '10', fontScale: 1.25 });
    expect(f({ exponentformat: 'power' }).label(-3).text).toBe(`10<sup>${M}3</sup>`);
    expect(f({ exponentformat: 'e' }).label(4).text).toBe('1e+4');
    expect(f({ exponentformat: 'E' }).label(-4).text).toBe(`1E${M}4`);
    expect(f({ exponentformat: 'e' }).label(2).text).toBe('100');
    expect(f({}, [-20, 20]).label(18)).toEqual({ text: '10<sup>18</sup>', fontScale: 1.25 });
    // D2 in-between digits.
    const d2 = f({}, [0, 3]);
    expect(d2.label(Math.log10(5))).toEqual({ text: '5', fontScale: 0.75 });
    expect(d2.label(1).text).toBe('10');
    // L steps and tickformat: the full number.
    expect(f({}, [0.1, 0.6]).label(Math.log10(2.5)).text).toBe('2.5');
    expect(f({ tickformat: '.1e' }).label(3).text).toBe('1.0e+3');
  });

  it('formats categories', () => {
    const s = scale('category', [-0.5, 2.5], 400, { categories: ['a', 'b', 'c'] });
    expect(formatValue(s, axis(), 1, true)).toBe('b');
    expect(formatValue(s, axis(), 1.3, false)).toBe('b');
    expect(formatValue(s, axis(), 7, false)).toBe('');
    const m = scale('multicategory', [-0.5, 1.5], 400, {
      multicategories: [
        ['2023', 'Q1'],
        ['2024', 'Q2'],
      ],
    });
    expect(formatValue(m, axis(), 1, true)).toBe('2024 - Q2');
    expect(createTickFormatter(m, axis()).label(0)).toEqual({ text: 'Q1', text2: '2023' });
    expect(createTickFormatter(m, axis()).label(9)).toEqual({ text: '', text2: '' });
  });

  it('formats date hover labels on one line', () => {
    const days = scale('date', [utc(2026), utc(2026, 1, 10)], 600);
    expect(formatValue(days, axis(), utc(2026, 1, 5), true)).toBe('Jan 5, 2026');
    expect(formatValue(days, axis(), utc(2026, 1, 5, 12, 30), true)).toBe('Jan 5, 2026, 12:30');
    // Day ticks + one field of extra precision: minutes.
    expect(formatValue(days, axis(), utc(2026, 1, 5, 12, 30, 15), true)).toBe('Jan 5, 2026, 12:30');
    expect(formatValue(days, axis(), utc(2026, 1, 5), false)).toBe('Jan 5<br>2026');
    const years = scale('date', [utc(2000), utc(2030)], 600);
    expect(formatValue(years, axis(), utc(2026, 3, 5), true)).toBe('Mar 2026');
    const months = scale('date', [utc(2026), utc(2027)], 600);
    expect(formatValue(months, axis(), utc(2026, 3, 5), true)).toBe('Mar 5, 2026');
    const ms = scale('date', [utc(2026), utc(2026, 1, 1, 0, 0, 0, 20)], 600);
    expect(formatValue(ms, axis(), utc(2026) + 12.5, true)).toBe('Jan 1, 2026, 00:00:00.0125');
    expect(formatValue(ms, axis(), utc(2026, 1, 1), true)).toBe('Jan 1, 2026');
    const secs = scale('date', [utc(2026), utc(2026, 1, 1, 0, 2)], 600);
    expect(formatValue(secs, axis(), utc(2026, 1, 1, 0, 1, 30, 500), true)).toBe(
      'Jan 1, 2026, 00:01:30.5',
    );
    expect(formatValue(days, axis({ hoverformat: '%Y/%m/%d' }), utc(2026, 1, 5), true)).toBe(
      '2026/01/05',
    );
    expect(formatValue(days, axis({ tickformat: '%d %b' }), utc(2026, 1, 5), true)).toBe('05 Jan');
  });

  it('repeats date heads only when they change within a tick pass', () => {
    const s = scale('date', [utc(2026), utc(2026, 1, 3)], 600);
    const f = createTickFormatter(s, axis());
    f.inCalcTicks = true;
    expect(f.label(utc(2026, 1, 1, 12)).text).toBe('12:00<br>Jan 1, 2026');
    expect(f.label(utc(2026, 1, 1, 18)).text).toBe('18:00');
    expect(f.label(utc(2026, 1, 2)).text).toBe('00:00<br>Jan 2, 2026');
    const top = createTickFormatter(s, axis({ side: 'top' }));
    top.inCalcTicks = true;
    top.label(utc(2026, 1, 1, 12));
    expect(top.label(utc(2026, 1, 1, 18)).text).toBe('18:00<br> ');
    const inside = createTickFormatter(s, axis({ ticklabelposition: 'inside' }));
    inside.inCalcTicks = true;
    inside.label(utc(2026, 1, 1, 12));
    expect(inside.label(utc(2026, 1, 1, 18)).text).toBe('18:00<br> ');
    const insideTop = createTickFormatter(s, axis({ ticklabelposition: 'inside', side: 'top' }));
    insideTop.inCalcTicks = true;
    insideTop.label(utc(2026, 1, 1, 12));
    expect(insideTop.label(utc(2026, 1, 1, 18)).text).toBe('18:00');
  });

  it('uses ticktext for matching values in array mode', () => {
    const s = scale('linear', [0, 10]);
    const a = axis({ tickvals: [1, 5], ticktext: ['one'] });
    expect(formatValue(s, a, 1, true)).toBe('one');
    expect(formatValue(s, a, 5, false)).toBe('5');
    expect(formatValue(s, a, 1.23456789, false)).toBe('1.234568');
  });

  it('never throws', () => {
    const types: AxisType[] = ['linear', 'log', 'date', 'category', 'multicategory'];
    fc.assert(
      fc.property(
        fc.constantFrom(...types),
        fc.double({ noNaN: false }),
        fc.double({ min: -1e15, max: 1e15, noNaN: true }),
        fc.double({ min: -1e15, max: 1e15, noNaN: true }),
        fc.boolean(),
        fc.constantFrom('', '.2f', '%Y', 'bad%', '~s'),
        fc.constantFrom('none', 'e', 'E', 'power', 'SI', 'B'),
        (type, l, a, b, hover, fmt, ef) => {
          const s = scale(type, [a, b], 300, {
            categories: ['a', 'b'],
            multicategories: [['g', 'a']],
          });
          const text = formatValue(s, axis({ tickformat: fmt, exponentformat: ef }), l, hover);
          expect(typeof text).toBe('string');
        },
      ),
    );
  });
});
