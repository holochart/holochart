/**
 * Date detection and parsing for data ingestion and axis auto-typing (plan E1.6, E3.5).
 *
 * Only ISO-8601-style strings are treated as dates (`2024-03-01`, `2024-03-01 12:30`,
 * `2024-03-01T12:30:00.000Z`, `2024-03`). Locale formats like `03/01/2024` are ambiguous and are
 * left as categories on purpose.
 *
 * Dates become milliseconds since the Unix epoch, UTC. Strings without an offset are read as UTC
 * rather than local time, like Plotly: a chart must look the same in every viewer's time zone, and
 * `Date.parse` is not an option because its handling of `2024-03-01 12:30` (space separator,
 * no offset) is implementation-defined.
 */

const ISO_DATE =
  /^\s*-?\d{4}-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01])([ T]([01]?\d|2[0-3]):[0-5]\d(:[0-5]\d(\.\d+)?)?(Z|[+-]([01]\d|2[0-3]):?[0-5]\d)?)?)?\s*$/;

// Same language as ISO_DATE, with capture groups; ranges are checked numerically in parseDateString
// so both expressions stay readable.
const ISO_PARTS =
  /^\s*(-?\d{4})-(\d\d)(?:-(\d\d)(?:[ T](\d\d?):(\d\d)(?::(\d\d)(?:\.(\d+))?)?(?:(Z)|([+-])(\d\d):?(\d\d))?)?)?\s*$/;

const MS_PER_DAY = 86_400_000;

/** True if `v` is an ISO-8601-style date string. */
export function isDateString(v: unknown): v is string {
  return typeof v === 'string' && ISO_DATE.test(v);
}

/** True for valid `Date` instances. */
export function isValidDate(v: unknown): v is Date {
  return v instanceof Date && !Number.isNaN(v.getTime());
}

/**
 * A non-Gregorian calendar used to interpret the date part of date strings (the `xcalendar`,
 * `ycalendar`, … attributes; world calendars are plan E3).
 *
 * Only the year/month/day → day-number mapping differs between calendars; time of day and UTC
 * offsets are handled by {@link parseDate} itself, so an implementation stays tiny.
 */
export interface CalendarSystem {
  /**
   * Days since 1970-01-01 (Gregorian, UTC) of the given calendar date, or `undefined` if the
   * date does not exist in this calendar.
   */
  toEpochDay(year: number, month: number, day: number): number | undefined;
}

/**
 * Days since 1970-01-01 for a proleptic Gregorian date. Pure integer arithmetic (H. Hinnant's
 * `days_from_civil`) so years 0–99 and negative years work, which `Date.UTC` gets wrong.
 */
function daysFromCivil(y: number, m: number, d: number): number {
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146_097 + doe - 719_468;
}

function isLeap(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function daysInMonth(y: number, m: number): number {
  return m === 2 ? (isLeap(y) ? 29 : 28) : m === 4 || m === 6 || m === 9 || m === 11 ? 30 : 31;
}

const GREGORIAN: CalendarSystem = {
  toEpochDay: (y, m, d) =>
    m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m) ? daysFromCivil(y, m, d) : undefined,
};

function resolveCalendar(
  calendar: string | CalendarSystem | undefined,
): CalendarSystem | undefined {
  if (calendar === undefined || calendar === 'gregorian') return GREGORIAN;
  return typeof calendar === 'string' ? undefined : calendar;
}

function fractionToMs(digits: string): number {
  // Exact for the common ≤ 3 digit case; `0.007 * 1000` would give 7.000000000000001.
  if (digits.length <= 3) return Number(digits.padEnd(3, '0'));
  return Number(digits.slice(0, 3)) + Number(`0.${digits.slice(3)}`);
}

function parseDateString(s: string, cal: CalendarSystem): number | undefined {
  const m = ISO_PARTS.exec(s);
  if (m === null) return undefined;
  const month = Number(m[2]);
  // An omitted day means the first of the month (`2024-03`).
  const day = m[3] === undefined ? 1 : Number(m[3]);
  // Month is range-checked here as well so a custom calendar never sees month 0 or 13.
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  const epochDay = cal.toEpochDay(Number(m[1]), month, day);
  if (epochDay === undefined || !Number.isFinite(epochDay)) return undefined;
  let ms = epochDay * MS_PER_DAY;
  if (m[4] !== undefined) {
    const h = Number(m[4]);
    const min = Number(m[5]);
    const sec = m[6] === undefined ? 0 : Number(m[6]);
    if (h > 23 || min > 59 || sec > 59) return undefined;
    ms += ((h * 60 + min) * 60 + sec) * 1000;
    if (m[7] !== undefined) ms += fractionToMs(m[7]);
    if (m[9] !== undefined) {
      const oh = Number(m[10]);
      const om = Number(m[11]);
      if (oh > 23 || om > 59) return undefined;
      // `12:00+02:00` is 10:00 UTC.
      ms -= (m[9] === '-' ? -1 : 1) * (oh * 60 + om) * 60_000;
    }
  }
  return ms;
}

/**
 * Convert a date value to milliseconds since the Unix epoch (UTC).
 *
 * Accepts:
 * - valid `Date` instances;
 * - finite numbers, which are already milliseconds;
 * - ISO-8601-style strings (every form {@link isDateString} matches). Date-only strings and
 *   strings without a UTC offset are read as UTC; `Z` and `±hh:mm`/`±hhmm` offsets are honored;
 *   fractional seconds keep sub-millisecond precision. A month without a day means its first day.
 *
 * @param v - The value to convert.
 * @param calendar - Calendar for the date part of strings. `undefined` and `'gregorian'` use the
 * proleptic Gregorian calendar. Other calendar names are reserved for world calendars (plan E3)
 * and currently yield `undefined`; pass a {@link CalendarSystem} to supply one directly.
 * @returns Milliseconds since the epoch, or `undefined` if `v` is not a date — including
 * impossible dates such as `2023-02-29`, which {@link isDateString} still matches.
 *
 * @example
 * ```ts
 * parseDate('2024-03-01');             // 1709251200000
 * parseDate('2024-03-01 12:30+01:00'); // 1709292600000 (11:30 UTC)
 * parseDate(new Date(0));              // 0
 * ```
 */
export function parseDate(v: unknown, calendar?: string | CalendarSystem): number | undefined {
  if (typeof v === 'string') {
    const cal = resolveCalendar(calendar);
    return cal === undefined ? undefined : parseDateString(v, cal);
  }
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (v instanceof Date) {
    const t = v.getTime();
    return Number.isNaN(t) ? undefined : t;
  }
  return undefined;
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

/**
 * Format milliseconds since the epoch as the shortest ISO-style UTC string that
 * {@link parseDate} reads back to the same value, Plotly-style: `2024-03-01`,
 * `2024-03-01 12:30`, `2024-03-01 12:30:05`, `2024-03-01 12:30:05.25`.
 *
 * @param ms - Milliseconds since the epoch; rounded to a whole millisecond.
 * @returns The formatted date, or `undefined` for non-finite values and years outside
 * -9999…9999 (which ISO strings here cannot express).
 */
export function formatDate(ms: number): string | undefined {
  if (!Number.isFinite(ms)) return undefined;
  const t = Math.round(ms);
  const days = Math.floor(t / MS_PER_DAY);
  let rem = t - days * MS_PER_DAY;
  // Inverse of daysFromCivil (H. Hinnant's `civil_from_days`).
  const z = days + 719_468;
  const era = Math.floor(z / 146_097);
  const doe = z - era * 146_097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36_524) - Math.floor(doe / 146_096)) / 365,
  );
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  const y = yoe + era * 400 + (m <= 2 ? 1 : 0);
  if (y < -9999 || y > 9999) return undefined;

  const date = `${y < 0 ? '-' : ''}${pad(Math.abs(y), 4)}-${pad(m, 2)}-${pad(d, 2)}`;
  if (rem === 0) return date;
  const h = Math.floor(rem / 3_600_000);
  rem -= h * 3_600_000;
  const min = Math.floor(rem / 60_000);
  rem -= min * 60_000;
  const s = Math.floor(rem / 1000);
  const frac = rem - s * 1000;
  let out = `${date} ${pad(h, 2)}:${pad(min, 2)}`;
  if (s !== 0 || frac !== 0) out += `:${pad(s, 2)}`;
  if (frac !== 0) out += `.${pad(frac, 3).replace(/0+$/, '')}`;
  return out;
}
