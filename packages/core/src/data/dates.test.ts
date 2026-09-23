import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { formatDate, isDateString, isValidDate, parseDate, type CalendarSystem } from './dates.ts';

describe('isDateString / isValidDate', () => {
  it('matches ISO-style strings only', () => {
    for (const s of ['2024-03', '2024-03-01', '2024-03-01 12:30', '2024-03-01T12:30:00.5Z']) {
      expect(isDateString(s), s).toBe(true);
    }
    for (const s of ['03/01/2024', '2024', '2024-13-01', 'abc', '']) {
      expect(isDateString(s), s).toBe(false);
    }
    expect(isDateString(20240301)).toBe(false);
  });

  it('accepts only valid Date instances', () => {
    expect(isValidDate(new Date(0))).toBe(true);
    expect(isValidDate(new Date(NaN))).toBe(false);
    expect(isValidDate('2024-01-01')).toBe(false);
  });
});

describe('parseDate', () => {
  it('reads date-only and offset-less strings as UTC', () => {
    expect(parseDate('2024-03-01')).toBe(Date.UTC(2024, 2, 1));
    expect(parseDate('2024-03')).toBe(Date.UTC(2024, 2, 1));
    expect(parseDate('2024-03-01 12:30')).toBe(Date.UTC(2024, 2, 1, 12, 30));
    expect(parseDate('2024-03-01T12:30:45')).toBe(Date.UTC(2024, 2, 1, 12, 30, 45));
    expect(parseDate('  2024-03-01 9:05  ')).toBe(Date.UTC(2024, 2, 1, 9, 5));
  });

  it('handles fractional seconds exactly, keeping sub-millisecond precision', () => {
    expect(parseDate('2024-03-01 00:00:00.007')).toBe(Date.UTC(2024, 2, 1) + 7);
    expect(parseDate('2024-03-01 00:00:00.5')).toBe(Date.UTC(2024, 2, 1) + 500);
    expect(parseDate('2024-03-01 00:00:00.1234')).toBeCloseTo(Date.UTC(2024, 2, 1) + 123.4, 3);
  });

  it('honors Z and ±hh:mm / ±hhmm offsets', () => {
    const utc = Date.UTC(2024, 2, 1, 12, 30);
    expect(parseDate('2024-03-01T12:30Z')).toBe(utc);
    expect(parseDate('2024-03-01T12:30+01:00')).toBe(utc - 3_600_000);
    expect(parseDate('2024-03-01T12:30-0230')).toBe(utc + 9_000_000);
  });

  it('rejects impossible dates that the regex still matches', () => {
    expect(isDateString('2023-02-29')).toBe(true);
    expect(parseDate('2023-02-29')).toBeUndefined();
    expect(parseDate('2024-02-29')).toBe(Date.UTC(2024, 1, 29));
    expect(parseDate('2024-04-31')).toBeUndefined();
  });

  it('handles years 0–99 and negative years (where Date.UTC does not)', () => {
    const d = new Date(0);
    d.setUTCFullYear(50, 0, 1);
    expect(parseDate('0050-01-01')).toBe(d.getTime());
    d.setUTCFullYear(-44, 2, 15);
    expect(parseDate('-0044-03-15')).toBe(d.getTime());
  });

  it('passes through Dates and finite numbers and rejects everything else', () => {
    expect(parseDate(new Date(1234))).toBe(1234);
    expect(parseDate(1234.5)).toBe(1234.5);
    for (const bad of [NaN, Infinity, new Date(NaN), null, undefined, true, {}, '03/01/2024', '']) {
      expect(parseDate(bad), String(bad)).toBeUndefined();
    }
  });

  it('reserves non-Gregorian calendar names and accepts a CalendarSystem', () => {
    expect(parseDate('2024-03-01', 'gregorian')).toBe(Date.UTC(2024, 2, 1));
    expect(parseDate('2024-03-01', 'chinese')).toBeUndefined();
    // Calendars only affect strings: numbers and Dates are absolute instants.
    expect(parseDate(5, 'chinese')).toBe(5);
    // A toy calendar whose day 1 of month 1 of year 1 is the Unix epoch.
    const toy: CalendarSystem = {
      toEpochDay: (y, m, d) => (y === 1 && m === 1 ? d - 1 : undefined),
    };
    expect(parseDate('0001-01-03 06:00', toy)).toBe(2 * 86_400_000 + 6 * 3_600_000);
    expect(parseDate('0002-01-01', toy)).toBeUndefined();
  });

  it('agrees with Date.UTC for generated components', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1000, max: 9999 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 28 }),
        fc.integer({ min: 0, max: 23 }),
        fc.integer({ min: 0, max: 59 }),
        fc.integer({ min: 0, max: 59 }),
        fc.integer({ min: 0, max: 999 }),
        fc.constantFrom(' ', 'T'),
        (y, mo, d, h, mi, s, ms, sep) => {
          const p = (n: number, w = 2) => String(n).padStart(w, '0');
          const str = `${y}-${p(mo)}-${p(d)}${sep}${p(h)}:${p(mi)}:${p(s)}.${p(ms, 3)}`;
          expect(isDateString(str)).toBe(true);
          expect(parseDate(str)).toBe(Date.UTC(y, mo - 1, d, h, mi, s, ms));
          expect(parseDate(`${str}Z`)).toBe(Date.UTC(y, mo - 1, d, h, mi, s, ms));
        },
      ),
    );
  });

  it('only parses strings that isDateString matches', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        if (parseDate(s) !== undefined) expect(isDateString(s)).toBe(true);
      }),
    );
  });
});

describe('formatDate', () => {
  it('uses the shortest Plotly-style form', () => {
    const base = Date.UTC(2024, 2, 1);
    expect(formatDate(base)).toBe('2024-03-01');
    expect(formatDate(base + 12 * 3_600_000 + 30 * 60_000)).toBe('2024-03-01 12:30');
    expect(formatDate(base + 5_000)).toBe('2024-03-01 00:00:05');
    expect(formatDate(base + 5_250)).toBe('2024-03-01 00:00:05.25');
    expect(formatDate(base + 7)).toBe('2024-03-01 00:00:00.007');
    expect(formatDate(-1)).toBe('1969-12-31 23:59:59.999');
  });

  it('rejects values it cannot express', () => {
    expect(formatDate(NaN)).toBeUndefined();
    expect(formatDate(Infinity)).toBeUndefined();
    expect(formatDate(8.64e15)).toBeUndefined();
  });

  it('round-trips through parseDate', () => {
    fc.assert(
      fc.property(fc.integer({ min: -62_000_000_000_000, max: 250_000_000_000_000 }), (ms) => {
        const s = formatDate(ms);
        expect(s).toBeDefined();
        expect(parseDate(s)).toBe(ms);
      }),
    );
  });

  it('agrees with Date#toISOString on the date part', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 253_402_300_799_999 }), (ms) => {
        expect(formatDate(ms)?.slice(0, 10)).toBe(new Date(ms).toISOString().slice(0, 10));
      }),
    );
  });
});
