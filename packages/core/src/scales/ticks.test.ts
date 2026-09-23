import { describe, expect, it } from 'vitest';
import { coerceContainer } from '../defaults/container.ts';
import type { FullAxis } from '../defaults/types.ts';
import { xaxisSchema, yaxisSchema } from '../layout/schema.ts';
import type { ObjectNode } from '../schema/types.ts';
import { EPOCH_2000, ONEDAY, ONEHOUR } from './date-math.ts';
import { MINUS_SIGN } from './format.ts';
import { createScale } from './scale.ts';
import { computeTicks, expandRange, tickFirst, tickIncrement } from './ticks.ts';
import type { AxisType, ScaleOptions, Tick } from './types.ts';

const M = MINUS_SIGN;

/** A full axis from the real schema defaults, as supply-defaults would build it. */
function axis(input: Record<string, unknown> = {}, id = 'x'): FullAxis {
  const node = (id.startsWith('y') ? yaxisSchema : xaxisSchema) as unknown as ObjectNode;
  const a = coerceContainer(node, input) as FullAxis;
  a._id = id;
  a._name = `${id.charAt(0)}axis`;
  return a;
}

function ticks(
  type: AxisType,
  range: readonly [number, number],
  length: number,
  input: Record<string, unknown> = {},
  opts: { id?: string; scale?: Partial<ScaleOptions> } = {},
): Tick[] {
  const s = createScale({ type, range, length, ...opts.scale });
  return computeTicks(s, axis(input, opts.id));
}

const majors = (t: Tick[]): Tick[] => t.filter((x) => x.minor !== true);
const minors = (t: Tick[]): number[] => t.filter((x) => x.minor === true).map((x) => x.l);
const texts = (t: Tick[]): string[] => majors(t).map((x) => x.text);
const values = (t: Tick[]): number[] => majors(t).map((x) => x.l);
const utc = (y: number, mo = 1, d = 1, h = 0, mi = 0, s = 0, ms = 0): number =>
  Date.UTC(y, mo - 1, d, h, mi, s, ms);
const iso = (l: number): string => new Date(l).toISOString();

describe('linear axes', () => {
  it('picks round steps from the axis length', () => {
    const t = ticks('linear', [0, 10], 400);
    expect(values(t)).toEqual([0, 2, 4, 6, 8, 10]);
    expect(texts(t)).toEqual(['0', '2', '4', '6', '8', '10']);
    expect(t.every((x) => x.minor === undefined && x.noTick === undefined)).toBe(true);
  });

  it('packs y axes twice as densely as x axes', () => {
    expect(texts(ticks('linear', [0, 100], 200))).toEqual(['0', '50', '100']);
    expect(texts(ticks('linear', [0, 100], 200, {}, { id: 'y2' }))).toEqual([
      '0',
      '20',
      '40',
      '60',
      '80',
      '100',
    ]);
  });

  it('honors nticks', () => {
    expect(texts(ticks('linear', [0, 100], 1000, { nticks: 3 }))).toEqual(['0', '50', '100']);
    // Steps round *up* (2 → 5): 50 ticks requested, 21 drawn.
    expect(values(ticks('linear', [0, 1], 1000, { nticks: 50 })).length).toBe(21);
  });

  it('keeps ticks free of float drift', () => {
    const t = ticks('linear', [0, 1], 1000, { nticks: 12 });
    expect(values(t)).toEqual([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]);
    expect(texts(t)[3]).toBe('0.3');
  });

  it('handles reversed ranges', () => {
    expect(texts(ticks('linear', [10, 0], 400))).toEqual(['10', '8', '6', '4', '2', '0']);
  });

  it('writes negatives with a true minus sign', () => {
    expect(texts(ticks('linear', [-4, 4], 400))).toEqual([`${M}4`, `${M}2`, '0', '2', '4']);
  });

  it('formats large and small numbers per exponentformat', () => {
    const r: [number, number] = [0, 5e9];
    expect(texts(ticks('linear', r, 400))).toEqual(['0', '1B', '2B', '3B', '4B', '5B']);
    expect(texts(ticks('linear', r, 400, { exponentformat: 'SI' }))[1]).toBe('1G');
    expect(texts(ticks('linear', r, 400, { exponentformat: 'e' }))[1]).toBe('1e+9');
    expect(texts(ticks('linear', r, 400, { exponentformat: 'E' }))[1]).toBe('1E+9');
    expect(texts(ticks('linear', r, 400, { exponentformat: 'power' }))[1]).toBe('1×10<sup>9</sup>');
    expect(texts(ticks('linear', r, 400, { exponentformat: 'none' }))[1]).toBe('1,000,000,000');
    expect(texts(ticks('linear', [0, 1e6], 400))).toEqual([
      '0',
      '0.2M',
      '0.4M',
      '0.6M',
      '0.8M',
      '1M',
    ]);
    expect(texts(ticks('linear', [0, 0.001], 400))).toEqual([
      '0',
      '0.0002',
      '0.0004',
      '0.0006',
      '0.0008',
      '0.001',
    ]);
    expect(texts(ticks('linear', [0, 1e-5], 400))[1]).toBe('2μ');
  });

  it('honors minexponent and separatethousands', () => {
    expect(texts(ticks('linear', [0, 50000], 400, { minexponent: 5 }))).toEqual([
      '0',
      '10,000',
      '20,000',
      '30,000',
      '40,000',
      '50,000',
    ]);
    expect(texts(ticks('linear', [0, 5000], 400))).toEqual([
      '0',
      '1000',
      '2000',
      '3000',
      '4000',
      '5000',
    ]);
    expect(texts(ticks('linear', [0, 5000], 400, { separatethousands: true }))[1]).toBe('1,000');
  });

  it('shows exponents on the first/last tick only', () => {
    const first = texts(ticks('linear', [1e6, 5e6], 400, { showexponent: 'first' }));
    expect(first).toEqual(['1M', '2', '3', '4', '5']);
    const last = texts(ticks('linear', [1e6, 5e6], 400, { showexponent: 'last' }));
    expect(last).toEqual(['1', '2', '3', '4', '5M']);
    expect(texts(ticks('linear', [1e6, 5e6], 400, { showexponent: 'none' }))[0]).toBe('1');
  });

  it('applies tickformat and tickformatstops', () => {
    expect(texts(ticks('linear', [0, 1], 400, { tickformat: '.1%' }))).toEqual([
      '0.0%',
      '20.0%',
      '40.0%',
      '60.0%',
      '80.0%',
      '100.0%',
    ]);
    expect(texts(ticks('linear', [-2000, 2000], 400, { tickformat: '$,.2f' }))[0]).toBe(
      `${M}$2,000.00`,
    );
    const stops = [
      { dtickrange: [null, 0.1], value: '.2f' },
      { dtickrange: [0.1, null], value: '.1f' },
    ];
    expect(texts(ticks('linear', [0, 1], 400, { tickformatstops: stops }))[1]).toBe('0.2');
    expect(texts(ticks('linear', [0, 0.1], 400, { tickformatstops: stops }))[1]).toBe('0.02');
  });

  it('adds prefixes and suffixes', () => {
    const t = ticks('linear', [0, 10], 400, {
      tickprefix: '$',
      showtickprefix: 'first',
      ticksuffix: 'u',
      showticksuffix: 'last',
    });
    expect(texts(t)).toEqual(['$0', '2', '4', '6', '8', '10u']);
    expect(texts(ticks('linear', [0, 4], 400, { ticksuffix: '%' }))).toEqual([
      '0%',
      '1%',
      '2%',
      '3%',
      '4%',
    ]);
  });

  it('places linear-mode ticks from tick0 every dtick', () => {
    const t = ticks('linear', [0, 10], 400, { tickmode: 'linear', tick0: 0.5, dtick: 3 });
    expect(values(t)).toEqual([0.5, 3.5, 6.5, 9.5]);
    // Hand-built axes: dtick alone implies linear mode; bad values fall back to auto.
    const s = createScale({ type: 'linear', range: [0, 10], length: 400 });
    const bare = (a: Record<string, unknown>) => a as unknown as FullAxis;
    expect(values(computeTicks(s, bare({ dtick: 5 })))).toEqual([0, 5, 10]);
    expect(values(computeTicks(s, bare({ dtick: 'x', tickmode: 'linear' })))).toEqual([
      0, 2, 4, 6, 8, 10,
    ]);
    expect(values(computeTicks(s, bare({ tickmode: 'sync' })))).toEqual([0, 2, 4, 6, 8, 10]);
    expect(values(computeTicks(s, bare({})))).toEqual([0, 2, 4, 6, 8, 10]);
  });

  it('labels every n-th tick with ticklabelstep', () => {
    const t = ticks('linear', [0, 10], 400, { ticklabelstep: 2 });
    expect(texts(t)).toEqual(['0', '', '4', '', '8', '']);
    expect(values(t)).toEqual([0, 2, 4, 6, 8, 10]);
    // Labelled ticks stay put when panning.
    expect(texts(ticks('linear', [2, 12], 400, { ticklabelstep: 2 }))).toEqual([
      '',
      '4',
      '',
      '8',
      '',
      '12',
    ]);
  });

  it('never hangs on tiny, zero-length or huge ranges', () => {
    expect(values(ticks('linear', [5, 5], 400))).toEqual([5]);
    expect(values(ticks('linear', [5.5, 5.5], 400))).toEqual([]);
    expect(majors(ticks('linear', [1, 1 + 1e-13], 400)).length).toBeLessThan(20);
    expect(majors(ticks('linear', [0, 1e-300], 400)).length).toBe(6);
    const huge = ticks('linear', [-1e308, 1e308], 400);
    expect(huge.length).toBeLessThanOrEqual(1001);
    expect(huge.every((x) => Number.isFinite(x.l))).toBe(true);
    expect(ticks('linear', [0, Infinity], 400)).toEqual([]);
    expect(ticks('linear', [Number.NaN, 1], 400)).toEqual([]);
    const tooDense = ticks('linear', [0, 1e6], 400, { tickmode: 'linear', dtick: 1 });
    expect(tooDense.length).toBe(1001);
    expect(ticks('linear', [0, 1], Number.NaN).length).toBeGreaterThan(0);
  });
});

describe('array ticks', () => {
  it('uses tickvals and ticktext, formatting missing text with extra precision', () => {
    const t = ticks('linear', [0, 10], 400, {
      tickvals: [7.123456, 1, 2.5, 11, -1],
      ticktext: ['seven', 'one'],
    });
    expect(values(t)).toEqual([1, 2.5, 7.123456]);
    expect(texts(t)).toEqual(['one', '2.5', 'seven']);
  });

  it('works without ticktext, on reversed axes and with prefixes', () => {
    const t = ticks('linear', [10, 0], 400, {
      tickvals: [2, 8, 10],
      tickprefix: '#',
      showtickprefix: 'first',
    });
    expect(values(t)).toEqual([10, 8, 2]);
    expect(texts(t)).toEqual(['#10', '8', '2']);
    expect(ticks('linear', [0, 10], 400, { tickmode: 'array' })).toEqual([]);
  });

  it('looks category names up without adding them', () => {
    const t = ticks(
      'category',
      [-0.5, 2.5],
      400,
      { tickvals: ['c', 'zz', 'a'] },
      {
        scale: { categories: ['a', 'b', 'c'] },
      },
    );
    expect(values(t)).toEqual([0, 2]);
    expect(texts(t)).toEqual(['a', 'c']);
  });

  it('formats date and log tickvals', () => {
    const d = ticks('date', [utc(2024), utc(2025)], 600, { tickvals: ['2024-03-05 12:30'] });
    // Extra precision: one field more than the ticks' own rounding.
    expect(texts(d)).toEqual(['12:30<br>Mar 5, 2024']);
    const l = ticks('log', [0, 3], 400, { tickvals: [3, 30, 300] });
    expect(texts(l)).toEqual(['3', '30', '300']);
  });

  it('adds minor tickvals', () => {
    const t = ticks('linear', [0, 10], 400, {
      minor: { tickvals: [0.5, 1.5, 20], ticks: 'outside' },
    });
    expect(minors(t)).toEqual([0.5, 1.5]);
    expect(t.filter((x) => x.minor).every((x) => x.text === '')).toBe(true);
  });
});

describe('log axes', () => {
  it('shows decades for wide ranges', () => {
    const t = ticks('log', [0, 5], 400);
    expect(values(t)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(texts(t)).toEqual(['1', '10', '100', '1000', '10k', '100k']);
    const wide = ticks('log', [-12, 20], 400);
    expect(texts(wide)).toEqual(['1p', '1μ', '1', '1M', '1T', '10<sup>18</sup>']);
    expect(majors(wide)[5]?.fontScale).toBe(1.25);
    const power = ticks('log', [0, 5], 400, { exponentformat: 'power' });
    expect(texts(power)[3]).toBe('10<sup>3</sup>');
    expect(majors(power).every((x) => x.fontScale === 1.25)).toBe(true);
    expect(texts(ticks('log', [0, 5], 400, { exponentformat: 'e' }))[4]).toBe('1e+4');
  });

  it('shows 2 and 5 (D2) with small digit labels', () => {
    const t = ticks('log', [0, 2], 400);
    expect(texts(t)).toEqual(['1', '2', '5', '10', '2', '5', '100']);
    expect(majors(t).map((x) => x.fontScale)).toEqual([
      undefined,
      0.75,
      0.75,
      undefined,
      0.75,
      0.75,
      undefined,
    ]);
    expect(values(t)[1]).toBeCloseTo(Math.log10(2), 12);
    // Digit labels skip prefix and suffix.
    expect(texts(ticks('log', [0, 2], 400, { ticksuffix: 'x' }))).toEqual([
      '1x',
      '2',
      '5',
      '10x',
      '2',
      '5',
      '100x',
    ]);
  });

  it('shows every digit (D1) for about a decade', () => {
    expect(texts(ticks('log', [0, 1.2], 400))).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '10',
    ]);
    expect(texts(ticks('log', [3, 0], 400))).toEqual([
      '1000',
      '5',
      '2',
      '100',
      '5',
      '2',
      '10',
      '5',
      '2',
      '1',
    ]);
  });

  it('uses linear L steps within a decade', () => {
    const t = ticks('log', [0.1, 0.6], 400);
    expect(texts(t)).toEqual(['1.5', '2', '2.5', '3', '3.5']);
    expect(values(t)[0]).toBeCloseTo(Math.log10(1.5), 12);
    const user = ticks('log', [-1, 1], 400, { dtick: 'L2', tick0: 1 });
    expect(texts(user)).toEqual(['1', '3', '5', '7', '9']);
    expect(texts(ticks('log', [0, 4], 400, { dtick: 2 }))).toEqual(['1', '100', '10k']);
    expect(texts(ticks('log', [0, 2], 400, { dtick: 'D1', tickmode: 'linear' })).length).toBe(19);
  });
});

describe('date axes', () => {
  it('ticks years, months and weeks', () => {
    expect(texts(ticks('date', [utc(2020), utc(2026)], 600))).toEqual([
      '2020',
      '2021',
      '2022',
      '2023',
      '2024',
      '2025',
      '2026',
    ]);
    expect(texts(ticks('date', [utc(1990), utc(2030)], 600))).toEqual([
      '1990',
      '1995',
      '2000',
      '2005',
      '2010',
      '2015',
      '2020',
      '2025',
      '2030',
    ]);
    const months = ticks('date', [utc(2020), utc(2021)], 600);
    expect(texts(months)).toEqual([
      'Jan 2020',
      'Mar 2020',
      'May 2020',
      'Jul 2020',
      'Sep 2020',
      'Nov 2020',
      'Jan 2021',
    ]);
    // Week ticks fall on Sundays and carry the year head on the first label.
    const weeks = ticks('date', [utc(2020), utc(2020, 2)], 600);
    expect(texts(weeks)).toEqual(['Jan 5<br>2020', 'Jan 12', 'Jan 19', 'Jan 26']);
    expect(new Date(values(weeks)[0] as number).getUTCDay()).toBe(0);
  });

  it('repeats heads when they change', () => {
    const t = ticks('date', [utc(2019, 12, 20), utc(2020, 1, 20)], 600);
    expect(texts(t)).toEqual(['Dec 22<br>2019', 'Dec 29', 'Jan 5<br>2020', 'Jan 12', 'Jan 19']);
    const hours = ticks('date', [utc(2020), utc(2020, 1, 2)], 600);
    expect(texts(hours)).toEqual([
      '00:00<br>Jan 1, 2020',
      '03:00',
      '06:00',
      '09:00',
      '12:00',
      '15:00',
      '18:00',
      '21:00',
      '00:00<br>Jan 2, 2020',
    ]);
    // Space-filler second line for top axes.
    const top = texts(ticks('date', [utc(2020), utc(2020, 1, 2)], 600, { side: 'top' }));
    expect(top[1]).toBe('03:00<br> ');
  });

  it('ticks minutes, seconds and milliseconds', () => {
    expect(texts(ticks('date', [utc(2020, 1, 1, 23), utc(2020, 1, 2, 1)], 600))).toEqual([
      '23:00<br>Jan 1, 2020',
      '23:15',
      '23:30',
      '23:45',
      '00:00<br>Jan 2, 2020',
      '00:15',
      '00:30',
      '00:45',
      '01:00',
    ]);
    expect(texts(ticks('date', [utc(2020), utc(2020, 1, 1, 0, 0, 20)], 400))).toEqual([
      '00:00:00<br>Jan 1, 2020',
      '00:00:05',
      '00:00:10',
      '00:00:15',
      '00:00:20',
    ]);
    expect(texts(ticks('date', [utc(2020), utc(2020) + 1], 400))).toEqual([
      '00:00:00<br>Jan 1, 2020',
      '00:00:00.0002',
      '00:00:00.0004',
      '00:00:00.0006',
      '00:00:00.0008',
      '00:00:00.001',
    ]);
    // Never below 0.1 ms.
    expect(majors(ticks('date', [utc(2020), utc(2020) + 0.2], 4000)).length).toBe(3);
  });

  it('supports month steps and quarters', () => {
    const q = ticks('date', [utc(2020), utc(2021, 1, 2)], 600, { dtick: 'M3' });
    expect(values(q).map(iso)).toEqual([
      '2020-01-01T00:00:00.000Z',
      '2020-04-01T00:00:00.000Z',
      '2020-07-01T00:00:00.000Z',
      '2020-10-01T00:00:00.000Z',
      '2021-01-01T00:00:00.000Z',
    ]);
    expect(texts(q)).toEqual(['Jan 2020', 'Apr 2020', 'Jul 2020', 'Oct 2020', 'Jan 2021']);
    const far = ticks('date', [utc(1850, 2), utc(1851, 3)], 600, {
      dtick: 'M6',
      tick0: '2000-01-01',
    });
    expect(values(far).map(iso)).toEqual(['1850-07-01T00:00:00.000Z', '1851-01-01T00:00:00.000Z']);
    const rev = ticks('date', [utc(2021), utc(2020)], 600, { dtick: 'M6' });
    expect(texts(rev)).toEqual(['Jan 2021', 'Jul 2020', 'Jan 2020']);
    expect(
      texts(ticks('date', [utc(2020), utc(2020, 5)], 600, { dtick: 'M1', tickformat: 'Q%q %Y' })),
    ).toEqual(['Q1 2020', 'Q1 2020', 'Q1 2020', 'Q2 2020', 'Q2 2020']);
  });

  it('starts ISO-week formats on Mondays', () => {
    const t = ticks('date', [utc(2020), utc(2020, 4)], 600, { tickformat: 'W%V' });
    expect(texts(t).slice(0, 3)).toEqual(['W02', 'W04', 'W06']);
    expect(new Date(values(t)[0] as number).getUTCDay()).toBe(1);
  });

  it('labels every n-th date tick with ticklabelstep', () => {
    const t = ticks('date', [utc(2020), utc(2021)], 600, { ticklabelstep: 2 });
    expect(texts(t)).toEqual(['Jan 2020', '', 'May 2020', '', 'Sep 2020', '', 'Jan 2021']);
    const days = ticks('date', [utc(2020), utc(2020, 1, 2)], 600, { ticklabelstep: 3 });
    // Counted from tick0 (2000-01-01 00:00), so midnight is labelled.
    expect(texts(days)).toEqual(['00:00<br>Jan 1, 2020', '', '', '09:00', '', '', '18:00', '', '']);
  });

  it('centers period labels and adds a label-only leading tick', () => {
    const t = ticks('date', [utc(2020), utc(2021)], 600, { ticklabelmode: 'period' });
    const m = majors(t);
    expect(m[0]).toMatchObject({ text: '', noTick: true, labelL: utc(2020) });
    expect(iso(m[0]?.l as number)).toBe('2019-11-01T00:00:00.000Z');
    expect(texts(t).slice(1, 3)).toEqual(['Jan 2020', 'Mar 2020']);
    // Month labels sit mid-month (M2 steps without a format: one-month periods).
    expect(m[1]?.labelL).toBe(utc(2020) + (365.25 / 24) * ONEDAY);
    // The last tick's period is past the range: label hidden, pinned to the end.
    expect(m[m.length - 1]).toMatchObject({ text: '', labelL: utc(2021) });
    expect(m.slice(1).every((x) => x.noTick === undefined)).toBe(true);
  });

  it('uses the tick format to define periods', () => {
    const years = majors(
      ticks('date', [utc(2019), utc(2023)], 300, { ticklabelmode: 'period', tickformat: '%Y' }),
    );
    expect(years.map((x) => x.text)).toEqual(['', '2019', '2020', '2021', '2022', '']);
    expect(years[1]?.labelL).toBe(utc(2019) + 365 * ONEDAY * 0.5);
    const quarters = majors(
      ticks('date', [utc(2020), utc(2021)], 600, {
        ticklabelmode: 'period',
        tickformat: 'Q%q',
        dtick: 'M3',
      }),
    );
    expect(quarters.map((x) => x.text)).toEqual(['', 'Q1', 'Q2', 'Q3', 'Q4', '']);
    expect(quarters[1]?.labelL).toBe(utc(2020) + 91 * ONEDAY * 0.5);
    const days = majors(
      ticks('date', [utc(2020), utc(2020, 1, 8)], 600, {
        ticklabelmode: 'period',
        tickformat: '%a',
      }),
    );
    expect(days.map((x) => x.text)).toEqual([
      '',
      'Wed',
      'Thu',
      'Fri',
      'Sat',
      'Sun',
      'Mon',
      'Tue',
      '',
    ]);
    expect(days[1]?.labelL).toBe(utc(2020) + ONEDAY / 2);
    const weeks = majors(
      ticks('date', [utc(2020), utc(2020, 3)], 600, { ticklabelmode: 'period', tickformat: 'W%W' }),
    );
    expect(weeks[1]?.labelL).toBe((weeks[1]?.l as number) + 3.5 * ONEDAY);
    const hours = majors(
      ticks('date', [utc(2020), utc(2020, 1, 1, 6)], 600, {
        ticklabelmode: 'period',
        tickformat: '%H',
      }),
    );
    expect(hours[1]?.labelL).toBe((hours[1]?.l as number) + ONEHOUR / 2);
    const ampm = majors(
      ticks('date', [utc(2020), utc(2020, 1, 4)], 600, {
        ticklabelmode: 'period',
        tickformat: '%p',
      }),
    );
    expect(ampm[1]?.labelL).toBe((ampm[1]?.l as number) + ONEHOUR * 6);
    const noPeriod = majors(
      ticks('date', [utc(2020), utc(2020, 1, 1, 6)], 600, { ticklabelmode: 'period' }),
    );
    expect(noPeriod[1]?.labelL).toBe(noPeriod[1]?.l);
    const one = majors(
      ticks('date', [utc(2020), utc(2020, 1, 1, 1)], 600, { ticklabelmode: 'period', dtick: 'M1' }),
    );
    // Both periods (Dec, Jan) are centered outside the one-hour range.
    expect(one.map((x) => x.text)).toEqual(['', '']);
  });

  it('does not let hidden period labels swallow the date head', () => {
    const t = majors(
      ticks('date', [utc(2020, 1, 1, 6), utc(2020, 1, 3)], 400, { ticklabelmode: 'period' }),
    );
    const shown = t.filter((x) => x.text !== '');
    expect(shown[0]?.text).toContain('<br>');
  });
});

describe('category axes', () => {
  const cats = Array.from({ length: 100 }, (_, i) => `c${i}`);

  it('labels categories, skipping some when crowded', () => {
    const t = ticks(
      'category',
      [-0.5, 3.5],
      400,
      {},
      { scale: { categories: ['a', 'b', 'c', 'd'] } },
    );
    expect(values(t)).toEqual([0, 1, 2, 3]);
    expect(texts(t)).toEqual(['a', 'b', 'c', 'd']);
    const crowded = ticks('category', [-0.5, 99.5], 300, {}, { scale: { categories: cats } });
    expect(texts(crowded).slice(0, 3)).toEqual(['c0', 'c5', 'c10']);
    expect(values(crowded).at(-1)).toBe(95);
  });

  it('stays within the category list', () => {
    expect(ticks('category', [10, 20], 300, {}, { scale: { categories: ['a', 'b'] } })).toEqual([]);
    expect(ticks('category', [-5, -1], 300, {}, { scale: { categories: ['a', 'b'] } })).toEqual([]);
    expect(ticks('category', [-0.5, 5], 300, {}, { scale: { categories: [] } })).toEqual([]);
    const rev = ticks('category', [2.5, -0.5], 300, {}, { scale: { categories: ['a', 'b', 'c'] } });
    expect(texts(rev)).toEqual(['c', 'b', 'a']);
    expect(
      ticks(
        'category',
        [-0.5, 1.5],
        300,
        { minor: { ticks: 'outside' } },
        { scale: { categories: ['a', 'b'] } },
      ).length,
    ).toBe(2);
  });

  it('gives multicategory group labels as text2', () => {
    const t = ticks(
      'multicategory',
      [-0.5, 3.5],
      400,
      {},
      {
        scale: {
          multicategories: [
            ['g1', 'a'],
            ['g1', 'b'],
            ['g2', 'a'],
            ['g2', 'b'],
          ],
        },
      },
    );
    expect(majors(t).map((x) => [x.text, x.text2])).toEqual([
      ['a', 'g1'],
      ['b', 'g1'],
      ['a', 'g2'],
      ['b', 'g2'],
    ]);
  });
});

describe('minor ticks', () => {
  it('are off unless minor ticks or grid are shown', () => {
    expect(minors(ticks('linear', [0, 10], 400))).toEqual([]);
  });

  it('divide linear major intervals', () => {
    const t = ticks('linear', [0, 10], 400, { minor: { ticks: 'outside' } });
    expect(minors(t)).toEqual([0.5, 1, 1.5, 2.5, 3, 3.5, 4.5, 5, 5.5, 6.5, 7, 7.5, 8.5, 9, 9.5]);
    expect(t.findIndex((x) => x.minor)).toBe(6);
    expect(minors(ticks('linear', [0, 10], 400, { minor: { showgrid: true, nticks: 2 } }))).toEqual(
      [1, 3, 5, 7, 9],
    );
    // 2.5 ratio (major 5, minor 2) → halves.
    expect(
      minors(ticks('linear', [0, 10], 150, { minor: { ticks: 'inside', nticks: 3 } })),
    ).toEqual([2.5, 7.5]);
    // Can't divide evenly: minors on the majors → all dropped.
    expect(
      minors(ticks('linear', [0, 12], 400, { dtick: 3, minor: { ticks: 'inside', nticks: 2 } })),
    ).toEqual([]);
  });

  it('keep ticks on majors when inside/outside differ', () => {
    const t = ticks('linear', [0, 4], 400, {
      ticks: 'outside',
      minor: { ticks: 'inside', nticks: 2 },
    });
    expect(minors(t)).toContain(1);
  });

  it('honor explicit minor dtick and tick0', () => {
    const t = ticks('linear', [0, 2], 400, {
      minor: { ticks: 'outside', dtick: 0.25, tick0: 0.1 },
    });
    expect(minors(t)).toEqual([0.1, 0.35, 0.6, 0.85, 1.1, 1.35, 1.6, 1.85]);
    const noTick0 = ticks('linear', [0, 2], 400, { minor: { ticks: 'outside', dtick: 0.25 } });
    expect(minors(noTick0).slice(0, 3)).toEqual([0.25, 0.75, 1.25]);
  });

  it('work without a major step (array majors)', () => {
    const t = ticks('linear', [0, 10], 400, { tickvals: [3], minor: { ticks: 'outside' } });
    expect(values(t)).toEqual([3]);
    expect(minors(t)).toEqual([
      0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10,
    ]);
  });

  it('divide log decades', () => {
    const d2 = ticks('log', [0, 2], 400, { minor: { showgrid: true } });
    expect(minors(d2).map((v) => Math.round(10 ** v))).toEqual([
      3, 4, 6, 7, 8, 9, 30, 40, 60, 70, 80, 90,
    ]);
    const decades = ticks('log', [0, 10], 400, { minor: { ticks: 'outside' } });
    expect(minors(decades)).toEqual([1, 3, 5, 7, 9]);
    const d1 = ticks('log', [0, 5], 400, { minor: { ticks: 'outside' } });
    expect(minors(d1).length).toBe(5 * 8);
    const l = ticks('log', [0.1, 0.6], 400, { minor: { ticks: 'outside' } });
    expect(minors(l).map((v) => +(10 ** v).toFixed(6))).toEqual([
      1.3, 1.4, 1.6, 1.7, 1.8, 1.9, 2.1, 2.2, 2.3, 2.4, 2.6, 2.7, 2.8, 2.9, 3.1, 3.2, 3.3, 3.4, 3.6,
      3.7, 3.8, 3.9,
    ]);
    const lUser = ticks('log', [0, 1], 400, {
      dtick: 'L5',
      tick0: 0,
      minor: { ticks: 'outside', nticks: 3 },
    });
    expect(minors(lUser).map((v) => +(10 ** v).toFixed(6))).toEqual([2.5, 7.5]);
    const lOdd = ticks('log', [0, 1], 400, {
      dtick: 'L3',
      tick0: 0,
      minor: { ticks: 'outside', nticks: 2 },
    });
    expect(minors(lOdd)).toEqual([]);
  });

  it('divide date intervals', () => {
    const years = ticks('date', [utc(2000), utc(2010)], 600, { minor: { ticks: 'outside' } });
    expect(minors(years).slice(0, 3).map(iso)).toEqual([
      '2000-07-01T00:00:00.000Z',
      '2001-01-01T00:00:00.000Z',
      '2001-07-01T00:00:00.000Z',
    ]);
    const quarters = ticks('date', [utc(2020), utc(2021)], 600, {
      dtick: 'M3',
      minor: { ticks: 'outside' },
    });
    expect(minors(quarters).slice(0, 2).map(iso)).toEqual([
      '2020-02-01T00:00:00.000Z',
      '2020-03-01T00:00:00.000Z',
    ]);
    const weeks = ticks('date', [utc(2020), utc(2020, 2)], 600, { minor: { ticks: 'outside' } });
    expect(minors(weeks).length).toBeGreaterThan(20);
    expect(minors(weeks).every((v) => (v - EPOCH_2000) % ONEDAY === 0)).toBe(true);
    const hours = ticks('date', [utc(2020), utc(2020, 1, 2)], 600, { minor: { ticks: 'outside' } });
    expect(minors(hours).length).toBe(16);
    const month = ticks('date', [utc(2020), utc(2020, 4)], 400, {
      dtick: 'M1',
      minor: { ticks: 'outside' },
    });
    expect(minors(month).length).toBeGreaterThan(0);
    const twoWeeks = ticks('date', [utc(2020), utc(2020, 4)], 400, {
      dtick: 14 * ONEDAY,
      minor: { ticks: 'outside', nticks: 7 },
    });
    expect(minors(twoWeeks).every((v) => (v - EPOCH_2000 - ONEDAY) % (7 * ONEDAY) === 0)).toBe(
      true,
    );
    const twoWeeks3 = ticks('date', [utc(2020), utc(2020, 4)], 400, {
      dtick: 14 * ONEDAY,
      minor: { ticks: 'outside', nticks: 4 },
    });
    expect(minors(twoWeeks3).every((v) => (v - EPOCH_2000 - ONEDAY) % (7 * ONEDAY) === 0)).toBe(
      true,
    );
    // Weeks: daily minors by default, but an explicit nticks that doesn't divide 7 gives up.
    const week = ticks('date', [utc(2020), utc(2020, 3)], 400, {
      dtick: 7 * ONEDAY,
      minor: { ticks: 'outside' },
    });
    expect(minors(week).every((v) => (v - EPOCH_2000) % ONEDAY === 0)).toBe(true);
    expect(minors(week).length).toBeGreaterThan(40);
    const week3 = ticks('date', [utc(2020), utc(2020, 3)], 400, {
      dtick: 7 * ONEDAY,
      minor: { ticks: 'outside', nticks: 3 },
    });
    expect(minors(week3)).toEqual([]);
    const years12 = ticks('date', [utc(2000), utc(2004)], 400, {
      dtick: 'M12',
      minor: { ticks: 'outside', nticks: 2 },
    });
    expect(minors(years12).slice(0, 1).map(iso)).toEqual(['2000-07-01T00:00:00.000Z']);
    const years5 = ticks('date', [utc(2000), utc(2030)], 400, {
      dtick: 'M60',
      minor: { ticks: 'outside', nticks: 3 },
    });
    // 2-year minors don't divide 5-year majors: Plotly gives up.
    expect(minors(years5)).toEqual([]);
    const m24 = ticks('date', [utc(2000), utc(2010)], 400, {
      dtick: 'M24',
      minor: { ticks: 'outside', nticks: 2 },
    });
    expect(minors(m24).map(iso)).toEqual([
      '2001-01-01T00:00:00.000Z',
      '2003-01-01T00:00:00.000Z',
      '2005-01-01T00:00:00.000Z',
      '2007-01-01T00:00:00.000Z',
      '2009-01-01T00:00:00.000Z',
    ]);
    // Years over 2-month minors → quarters (6 months is not a multiple of 4).
    const m2 = ticks('date', [utc(2000), utc(2002)], 400, {
      dtick: 'M12',
      minor: { ticks: 'outside', nticks: 6 },
    });
    expect(minors(m2).slice(0, 2).map(iso)).toEqual([
      '2000-04-01T00:00:00.000Z',
      '2000-07-01T00:00:00.000Z',
    ]);
  });

  it('never outlive an empty major pass', () => {
    const t = ticks(
      'category',
      [10, 20],
      300,
      { minor: { ticks: 'outside' } },
      {
        scale: { categories: ['a', 'b'] },
      },
    );
    expect(t).toEqual([]);
  });
});

describe('helpers', () => {
  it('expandRange widens by 0.01% keeping direction', () => {
    expect(expandRange([0, 10])).toEqual([-0.001, 10.001]);
    expect(expandRange([10, 0])).toEqual([10.001, -0.001]);
    const big = expandRange([-1e308, 1e308]);
    expect(big.every(Number.isFinite)).toBe(true);
  });

  it('tickIncrement steps every dtick form', () => {
    expect(tickIncrement(0.1, 0.2)).toBe(0.3);
    expect(tickIncrement(1, 0.5, true)).toBe(0.5);
    expect(iso(tickIncrement(utc(2020, 1, 31), 'M1'))).toBe('2020-03-02T00:00:00.000Z');
    expect(tickIncrement(0, 'L2')).toBeCloseTo(Math.log10(3), 12);
    expect(tickIncrement(0, 'D2')).toBeCloseTo(Math.log10(2), 12);
    expect(tickIncrement(Math.log10(5), 'D2')).toBe(1);
    expect(tickIncrement(1, 'D1', true)).toBeCloseTo(Math.log10(9), 12);
    expect(tickIncrement(0, 'X1')).toBeNaN();
  });

  it('tickFirst finds the first tick in range', () => {
    const s = createScale({ type: 'linear', range: [0.3, 10], length: 400 });
    expect(tickFirst(s, { dtick: 0.2, tick0: 0 })).toBe(0.4);
    expect(tickFirst(s, { dtick: 2, tick0: 0 }, [9.5, 0])).toBe(8);
    const l = createScale({ type: 'log', range: [0.1, 1], length: 400 });
    expect(tickFirst(l, { dtick: 'D1', tick0: 0 })).toBeCloseTo(Math.log10(2), 12);
    expect(tickFirst(l, { dtick: 'D2', tick0: 0 }, [0.9, 0])).toBeCloseTo(Math.log10(5), 12);
    expect(tickFirst(l, { dtick: 'L0.5', tick0: 0 })).toBeCloseTo(Math.log10(1.5), 12);
    expect(tickFirst(l, { dtick: 'Q1', tick0: 0 })).toBeNaN();
    const d = createScale({ type: 'date', range: [utc(2020, 2, 10), utc(2021)], length: 400 });
    expect(iso(tickFirst(d, { dtick: 'M1', tick0: EPOCH_2000 }))).toBe('2020-03-01T00:00:00.000Z');
    expect(iso(tickFirst(d, { dtick: 'M1', tick0: utc(2030) }))).toBe('2020-03-01T00:00:00.000Z');
    // Does not converge in 10 jumps for absurd spans: returns the last estimate.
    expect(Number.isFinite(tickFirst(d, { dtick: 'M1', tick0: utc(-200000) }))).toBe(true);
  });
});
