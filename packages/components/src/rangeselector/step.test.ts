import { describe, expect, it } from 'vitest';
import { createBreakMap, createScale, type Scale } from '@mk7s/holochart-core';
import {
  buttonDescription,
  buttonLabel,
  rangeselectorIsActive,
  rangeselectorRange,
  rangeselectorUpdate,
  stepCeil,
  stepFloor,
  stepOffset,
  type RangeselectorAxisLike,
  type RangeselectorButton,
  type RangeselectorDateStep,
  type RangeselectorStepmode,
} from './step.ts';

const ms = (iso: string): number => new Date(iso).getTime();
const iso = (t: number): string => new Date(t).toISOString();

const END = '2024-03-31T12:34:56.789Z';

function button(
  step: RangeselectorButton['step'],
  count = 1,
  stepmode: RangeselectorStepmode = 'backward',
  label?: string,
): RangeselectorButton {
  return label === undefined ? { step, count, stepmode } : { step, count, stepmode, label };
}

function start(
  end: string,
  step: RangeselectorDateStep,
  count: number,
  mode: RangeselectorStepmode,
): string {
  const r = rangeselectorRange(ms(end), button(step, count, mode));
  if (!r) throw new Error('no range');
  expect(iso(r[1])).toBe(end);
  return iso(r[0]);
}

describe('stepOffset / stepFloor / stepCeil (d3-time UTC semantics)', () => {
  it('offsets months and years with Date overflow', () => {
    expect(iso(stepOffset(ms(END), 'month', -1))).toBe('2024-03-02T12:34:56.789Z');
    expect(iso(stepOffset(ms('2023-03-31T00:00:00Z'), 'month', -1))).toBe(
      '2023-03-03T00:00:00.000Z',
    );
    expect(iso(stepOffset(ms('2024-02-29T06:00:00Z'), 'year', -1))).toBe(
      '2023-03-01T06:00:00.000Z',
    );
    expect(iso(stepOffset(ms('2024-01-31T00:00:00Z'), 'month', 1))).toBe(
      '2024-03-02T00:00:00.000Z',
    );
  });

  it('floors the count like d3 interval.offset', () => {
    expect(iso(stepOffset(ms(END), 'day', -1.5))).toBe('2024-03-29T12:34:56.789Z');
    expect(iso(stepOffset(ms(END), 'hour', 2.9))).toBe('2024-03-31T14:34:56.789Z');
  });

  it('floors to the start of each period, before 1970 too', () => {
    const t = ms(END);
    expect(iso(stepFloor(t, 'year'))).toBe('2024-01-01T00:00:00.000Z');
    expect(iso(stepFloor(t, 'month'))).toBe('2024-03-01T00:00:00.000Z');
    expect(iso(stepFloor(t, 'day'))).toBe('2024-03-31T00:00:00.000Z');
    expect(iso(stepFloor(t, 'hour'))).toBe('2024-03-31T12:00:00.000Z');
    expect(iso(stepFloor(t, 'minute'))).toBe('2024-03-31T12:34:00.000Z');
    expect(iso(stepFloor(t, 'second'))).toBe('2024-03-31T12:34:56.000Z');
    expect(iso(stepFloor(ms('1969-12-31T23:30:15.5Z'), 'hour'))).toBe('1969-12-31T23:00:00.000Z');
  });

  it('ceils to the next boundary; a boundary stays itself', () => {
    expect(iso(stepCeil(ms('2023-12-31T12:34:56.789Z'), 'month'))).toBe('2024-01-01T00:00:00.000Z');
    expect(iso(stepCeil(ms('2024-01-01T00:00:00Z'), 'year'))).toBe('2024-01-01T00:00:00.000Z');
    expect(iso(stepCeil(ms('2024-03-01T00:00:00Z'), 'month'))).toBe('2024-03-01T00:00:00.000Z');
    expect(iso(stepCeil(ms('2024-03-31T00:00:00Z'), 'day'))).toBe('2024-03-31T00:00:00.000Z');
    expect(iso(stepCeil(ms('2024-03-31T00:00:00.001Z'), 'day'))).toBe('2024-04-01T00:00:00.000Z');
    expect(iso(stepCeil(ms('2024-03-31T12:00:00Z'), 'hour'))).toBe('2024-03-31T12:00:00.000Z');
  });
});

describe('rangeselectorRange', () => {
  it('backward: count steps before the end, for every step', () => {
    expect(start(END, 'second', 1, 'backward')).toBe('2024-03-31T12:34:55.789Z');
    expect(start(END, 'minute', 1, 'backward')).toBe('2024-03-31T12:33:56.789Z');
    expect(start(END, 'hour', 1, 'backward')).toBe('2024-03-31T11:34:56.789Z');
    expect(start(END, 'day', 1, 'backward')).toBe('2024-03-30T12:34:56.789Z');
    // Feb 31 overflows to Mar 2 (2024 is a leap year).
    expect(start(END, 'month', 1, 'backward')).toBe('2024-03-02T12:34:56.789Z');
    // Sep 31 → Oct 1.
    expect(start(END, 'month', 6, 'backward')).toBe('2023-10-01T12:34:56.789Z');
    expect(start(END, 'year', 1, 'backward')).toBe('2023-03-31T12:34:56.789Z');
    expect(start(END, 'second', 30, 'backward')).toBe('2024-03-31T12:34:26.789Z');
    expect(start(END, 'minute', 15, 'backward')).toBe('2024-03-31T12:19:56.789Z');
    expect(start(END, 'hour', 24, 'backward')).toBe('2024-03-30T12:34:56.789Z');
    expect(start(END, 'day', 7, 'backward')).toBe('2024-03-24T12:34:56.789Z');
    expect(start(END, 'year', 5, 'backward')).toBe('2019-03-31T12:34:56.789Z');
  });

  it('todate: the first period boundary after count steps back, for every step', () => {
    expect(start(END, 'second', 1, 'todate')).toBe('2024-03-31T12:34:56.000Z');
    expect(start(END, 'minute', 1, 'todate')).toBe('2024-03-31T12:34:00.000Z');
    expect(start(END, 'hour', 1, 'todate')).toBe('2024-03-31T12:00:00.000Z');
    expect(start(END, 'day', 1, 'todate')).toBe('2024-03-31T00:00:00.000Z');
    expect(start(END, 'year', 1, 'todate')).toBe('2024-01-01T00:00:00.000Z');
    expect(start(END, 'year', 2, 'todate')).toBe('2023-01-01T00:00:00.000Z');
    // Dec 31 12:34 ceils to Jan 1.
    expect(start(END, 'month', 3, 'todate')).toBe('2024-01-01T00:00:00.000Z');
    expect(start(END, 'hour', 3, 'todate')).toBe('2024-03-31T10:00:00.000Z');
    expect(start(END, 'day', 7, 'todate')).toBe('2024-03-25T00:00:00.000Z');
    expect(start('2024-03-15T08:00:00.000Z', 'month', 1, 'todate')).toBe(
      '2024-03-01T00:00:00.000Z',
    );
  });

  it('todate from an exact boundary keeps it', () => {
    expect(start('2024-03-01T00:00:00.000Z', 'month', 1, 'todate')).toBe(
      '2024-02-01T00:00:00.000Z',
    );
    expect(start('2024-01-01T00:00:00.000Z', 'year', 1, 'todate')).toBe('2023-01-01T00:00:00.000Z');
  });

  it('reproduces the month-end overflow of Plotly / d3 (1 month to date on Mar 31)', () => {
    // Mar 31 − 1 month = "Feb 31" = Mar 2, whose month ceiling is Apr 1 (after the end).
    expect(start(END, 'month', 1, 'todate')).toBe('2024-04-01T00:00:00.000Z');
  });

  it('floors fractional counts', () => {
    expect(start(END, 'month', 1.5, 'backward')).toBe('2024-01-31T12:34:56.789Z');
  });

  it('has no range for `all`', () => {
    expect(rangeselectorRange(ms(END), button('all'))).toBeUndefined();
  });
});

describe('labels and descriptions', () => {
  it('uses the label, else `all`, else count + step initial', () => {
    expect(buttonLabel(button('month', 6))).toBe('6m');
    expect(buttonLabel(button('year', 1, 'todate'))).toBe('1y');
    expect(buttonLabel(button('day', 1))).toBe('1d');
    expect(buttonLabel(button('hour', 12))).toBe('12h');
    expect(buttonLabel(button('minute', 5))).toBe('5m');
    expect(buttonLabel(button('second', 30))).toBe('30s');
    expect(buttonLabel(button('all'))).toBe('all');
    expect(buttonLabel(button('year', 1, 'todate', 'YTD'))).toBe('YTD');
    expect(buttonLabel(button('year', 1, 'todate', ''))).toBe('1y');
  });

  it('describes the range', () => {
    expect(buttonDescription(button('month', 6))).toBe('Last 6 months');
    expect(buttonDescription(button('month', 1))).toBe('Last 1 month');
    expect(buttonDescription(button('year', 1, 'todate'))).toBe('Year to date');
    expect(buttonDescription(button('month', 3, 'todate'))).toBe('3 months to date');
    expect(buttonDescription(button('all'))).toBe('All');
  });
});

describe('rangeselectorUpdate / rangeselectorIsActive on a core date scale', () => {
  function dateAxis(range: [string, string], autorange = false) {
    const scale = createScale({ type: 'date', length: 800 });
    scale.setRange(scale.r2l(range[0]), scale.r2l(range[1]));
    const full: { autorange?: unknown } = { autorange };
    const axis: RangeselectorAxisLike = { name: 'xaxis2', full, scale };
    return { axis, scale, full };
  }

  /** Apply a range update to the axis as the runtime would. */
  function apply(scale: Scale, name: string, u: Record<string, unknown>): void {
    scale.setRange(scale.r2l(u[`${name}.range[0]`]), scale.r2l(u[`${name}.range[1]`]));
  }

  it('`all` autoranges and is active while the axis autoranges', () => {
    const { axis, full } = dateAxis(['2023-01-01', '2024-03-31 12:34:56.789']);
    expect(rangeselectorUpdate(axis, button('all'))).toEqual({ 'xaxis2.autorange': true });
    expect(rangeselectorIsActive(axis, button('all'))).toBe(false);
    full.autorange = true;
    expect(rangeselectorIsActive(axis, button('all'))).toBe(true);
  });

  it('sets date-string ranges ending at the current end; the clicked button becomes active', () => {
    const { axis, scale } = dateAxis(['2023-01-01', '2024-03-31 12:34:56.789']);
    const six = button('month', 6);
    const ytd = button('year', 1, 'todate');
    const u = rangeselectorUpdate(axis, six);
    expect(u).toEqual({
      'xaxis2.range[0]': '2023-10-01 12:34:56.789',
      'xaxis2.range[1]': '2024-03-31 12:34:56.789',
    });
    expect(rangeselectorIsActive(axis, six)).toBe(false);
    apply(scale, axis.name, u);
    expect(rangeselectorIsActive(axis, six)).toBe(true);
    expect(rangeselectorIsActive(axis, ytd)).toBe(false);
    expect(rangeselectorIsActive(axis, button('month', 1))).toBe(false);

    const y = rangeselectorUpdate(axis, ytd);
    expect(y).toEqual({
      'xaxis2.range[0]': '2024-01-01',
      'xaxis2.range[1]': '2024-03-31 12:34:56.789',
    });
    apply(scale, axis.name, y);
    expect(rangeselectorIsActive(axis, ytd)).toBe(true);
    expect(rangeselectorIsActive(axis, six)).toBe(false);
  });

  it('stays active within 1 ms (range strings round to whole ms)', () => {
    const { axis, scale } = dateAxis(['2024-03-01', '2024-03-31 12:00']);
    const day = button('day', 1);
    scale.setRange(scale.r2l('2024-03-30 12:00') + 0.6, scale.range[1] + 0.4);
    expect(rangeselectorIsActive(axis, day)).toBe(true);
    scale.setRange(scale.r2l('2024-03-30 12:00') + 5, scale.range[1]);
    expect(rangeselectorIsActive(axis, day)).toBe(false);
  });

  it('compares reversed ranges positionally, like Plotly', () => {
    const { axis, scale } = dateAxis(['2024-03-31', '2024-03-01']);
    const u = rangeselectorUpdate(axis, button('day', 1));
    // The end is range[1] (the earlier date here); the start is a day before it.
    expect(u).toEqual({ 'xaxis2.range[0]': '2024-02-29', 'xaxis2.range[1]': '2024-03-01' });
    apply(scale, axis.name, u);
    expect(rangeselectorIsActive(axis, button('day', 1))).toBe(true);
  });

  it('works in the compressed space of a range-breaks axis', () => {
    const breaks = createBreakMap([{ bounds: ['sat', 'mon'] }], 'date');
    expect(breaks).toBeDefined();
    const scale = createScale({ type: 'date', length: 800, ...(breaks ? { breaks } : {}) });
    // Wednesday noon.
    scale.setRange(scale.r2l('2024-02-01'), scale.r2l('2024-03-06 12:00'));
    const axis: RangeselectorAxisLike = { name: 'xaxis', full: { autorange: false }, scale };

    // A week back is a Wednesday again, 5 trading days in compressed space.
    const week = button('day', 7);
    const u = rangeselectorUpdate(axis, week);
    expect(u).toEqual({
      'xaxis.range[0]': '2024-02-28 12:00',
      'xaxis.range[1]': '2024-03-06 12:00',
    });
    apply(scale, axis.name, u);
    expect(scale.range[1] - scale.range[0]).toBe(5 * 86_400_000);
    expect(rangeselectorIsActive(axis, week)).toBe(true);

    // Three days back from Wednesday noon is Sunday noon, inside the weekend: the start snaps to
    // the end of the break (Monday 00:00), a valid date string.
    const three = button('day', 3);
    const v = rangeselectorUpdate(axis, three);
    expect(v['xaxis.range[0]']).toBe('2024-03-04');
    expect(Number.isFinite(new Date(`${String(v['xaxis.range[0]'])}T00:00:00Z`).getTime())).toBe(
      true,
    );
    apply(scale, axis.name, v);
    expect(rangeselectorIsActive(axis, three)).toBe(true);
    expect(rangeselectorIsActive(axis, week)).toBe(false);
  });
});
