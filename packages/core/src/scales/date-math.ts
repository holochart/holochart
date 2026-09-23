/**
 * Date constants and calendar arithmetic shared by date ticks, periods and autorange (plan E3.5).
 * Everything is UTC milliseconds since the epoch; display time zones are a later story.
 */

export const ONESEC = 1000;
export const ONEMIN = 60 * ONESEC;
export const ONEHOUR = 60 * ONEMIN;
export const HALFDAY = 12 * ONEHOUR;
export const ONEDAY = 24 * ONEHOUR;
export const ONEWEEK = 7 * ONEDAY;
/** Average Gregorian year (365.25 days), used to estimate month/year steps. */
export const ONEAVGYEAR = 365.25 * ONEDAY;
export const ONEAVGMONTH = ONEAVGYEAR / 12;
export const ONEAVGQUARTER = ONEAVGYEAR / 4;
export const ONEMINYEAR = 365 * ONEDAY;
export const ONEMAXYEAR = 366 * ONEDAY;
export const ONEMINMONTH = 28 * ONEDAY;
export const ONEMAXMONTH = 31 * ONEDAY;
export const ONEMINQUARTER = 89 * ONEDAY;
export const ONEMAXQUARTER = 92 * ONEDAY;

/** 2000-01-01T00:00:00Z, Plotly's reference instant for date ticks and periods. */
export const EPOCH_2000 = 946_684_800_000;

/** Non-negative remainder (`mod(-1, 5) === 4`). */
export function mod(v: number, d: number): number {
  const r = v % d;
  return r < 0 ? r + d : r;
}

/**
 * Plotly's default date `tick0`: 2000-01-01 (`dayOfWeek` 0), or the nearest Sunday (1, 2000-01-02)
 * / Monday (2, 2000-01-03) for week-based ticks.
 */
export function dateTick0(dayOfWeek: 0 | 1 | 2 = 0): number {
  return EPOCH_2000 + dayOfWeek * ONEDAY;
}

/**
 * Add `months` calendar months to `ms` (UTC), keeping the time of day. Like `Date#setUTCMonth`,
 * an overflowing day rolls into the next month (Jan 31 + 1 month → Mar 2/3); ticks and periods
 * built on this always sit on the 1st, where that never happens.
 */
export function incrementMonth(ms: number, months: number): number {
  const time = mod(ms, ONEDAY);
  const d = new Date(Math.round(ms - time));
  return d.setUTCMonth(d.getUTCMonth() + months) + time;
}

/** Parse a month step `'M<n>'` (`n` a positive integer), or `undefined`. */
export function monthStep(dtick: unknown): number | undefined {
  if (typeof dtick !== 'string' || dtick.charAt(0) !== 'M') return undefined;
  const n = Number(dtick.slice(1));
  return Number.isInteger(n) && n > 0 ? n : undefined;
}
