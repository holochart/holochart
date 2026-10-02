/**
 * Helpers shared by the rain, snow and storm examples of the Dallas weather demo.
 *
 * A `.mts` file, so the example registry does not treat it as an example.
 */
import { RAIN_YEARS, type YearSummary } from './analysis.mts';

/** A sequential blue colorscale for rain amounts on the dark template (more rain is lighter). */
export const RAIN_SCALE: [number, string][] = [
  [0, '#141b33'],
  [0.2, '#1d3f73'],
  [0.45, '#2a79ad'],
  [0.7, '#4fb8d8'],
  [1, '#e6faff'],
];

/** A lighter tint of the rain color, for highlights. */
export const RAIN_LIGHT = '#9fdcf0';

export const DAY_MS = 86_400_000;

/** The wettest and driest complete years, and the average of all of them. */
export const WETTEST_YEAR: YearSummary = RAIN_YEARS.reduce((a, b) => (b.rain > a.rain ? b : a));
export const DRIEST_YEAR: YearSummary = RAIN_YEARS.reduce((a, b) => (b.rain < a.rain ? b : a));
export const MEAN_YEAR_RAIN: number =
  RAIN_YEARS.reduce((a, y) => a + y.rain, 0) / RAIN_YEARS.length;

export function median(v: readonly number[]): number {
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
}

/** `1234` → `1,234`. */
export function count(n: number): string {
  return n.toLocaleString('en-US');
}

const FULL_MONTH = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;
/** Full name of a month, 1–12. */
export function monthName(month: number): string {
  return FULL_MONTH[month - 1] as string;
}
