import { describe, expect, it } from 'vitest';
import {
  dateTick0,
  EPOCH_2000,
  incrementMonth,
  mod,
  monthStep,
  ONEAVGMONTH,
  ONEAVGYEAR,
  ONEDAY,
} from './date-math.ts';

describe('date math', () => {
  it('has Plotly reference values', () => {
    expect(EPOCH_2000).toBe(Date.UTC(2000, 0, 1));
    expect(ONEAVGYEAR).toBe(365.25 * ONEDAY);
    expect(ONEAVGMONTH * 12).toBe(ONEAVGYEAR);
  });

  it('mod is non-negative', () => {
    expect(mod(-1, 5)).toBe(4);
    expect(mod(7, 5)).toBe(2);
  });

  it('dateTick0 gives 2000-01-01 and the following Sunday/Monday', () => {
    expect(dateTick0()).toBe(Date.UTC(2000, 0, 1));
    expect(new Date(dateTick0(1)).getUTCDay()).toBe(0);
    expect(new Date(dateTick0(2)).getUTCDay()).toBe(1);
  });

  it('incrementMonth steps calendar months in UTC and keeps the time of day', () => {
    const t = Date.UTC(2024, 0, 1, 13, 30);
    expect(incrementMonth(t, 1)).toBe(Date.UTC(2024, 1, 1, 13, 30));
    expect(incrementMonth(t, -13)).toBe(Date.UTC(2022, 11, 1, 13, 30));
    expect(incrementMonth(Date.UTC(-50, 5, 1), 12)).toBe(Date.UTC(-49, 5, 1));
    // Overflowing days roll over like Date#setUTCMonth.
    expect(incrementMonth(Date.UTC(2024, 0, 31), 1)).toBe(Date.UTC(2024, 2, 2));
  });

  it('monthStep parses M<n>', () => {
    expect(monthStep('M3')).toBe(3);
    expect(monthStep('M0')).toBeUndefined();
    expect(monthStep('M1.5')).toBeUndefined();
    expect(monthStep('L3')).toBeUndefined();
    expect(monthStep(3)).toBeUndefined();
  });
});
