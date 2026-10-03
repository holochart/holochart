/**
 * Helpers shared by the temperature charts of the Dallas weather demo: the years the "pick a year"
 * toggles offer, a median, and colors taken from a colorscale.
 *
 * A `.mts` file, so the example registry does not treat it as an example.
 */
import { CURRENT_YEAR, LAST_YEAR } from './analysis.mts';

export const DAY_MS = 86_400_000;

/**
 * Years of the "Year" toggles: the hottest summer on record (1980), the runner-up (2011), the
 * year of the February deep freeze (2021), the last complete year and the year in progress.
 */
export const YEAR_CHOICES: readonly number[] = [
  ...new Set([1980, 2011, 2021, LAST_YEAR, CURRENT_YEAR]),
];
export const YEAR_OPTIONS: readonly { value: string; text: string }[] = YEAR_CHOICES.map((y) => ({
  value: String(y),
  text: y === CURRENT_YEAR ? `${y} so far` : String(y),
}));

/** Day of the week of an ISO date, Monday = 0 … Sunday = 6. */
export function weekday(date: string): number {
  return (new Date(Date.parse(date)).getUTCDay() + 6) % 7;
}

export function quantile(values: readonly number[], q: number): number {
  const s = [...values].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return (s[lo] as number) + ((s[hi] as number) - (s[lo] as number)) * (pos - lo);
}
export const median = (values: readonly number[]): number => quantile(values, 0.5);

export const mean = (values: readonly number[]): number =>
  values.reduce((a, b) => a + b, 0) / values.length;

const channels = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

/** The color of a colorscale (hex stops) at `t` in 0–1, as `rgb(…)` or `rgba(…)`. */
export function scaleColor(scale: readonly [number, string][], t: number, alpha = 1): string {
  const u = Math.min(1, Math.max(0, t));
  let k = 1;
  while (k < scale.length - 1 && (scale[k] as [number, string])[0] < u) k++;
  const [t0, c0] = scale[k - 1] as [number, string];
  const [t1, c1] = scale[k] as [number, string];
  const f = t1 === t0 ? 0 : (u - t0) / (t1 - t0);
  const a = channels(c0);
  const b = channels(c1);
  const rgb = a.map((v, i) => Math.round(v + ((b[i] as number) - v) * f)).join(', ');
  return alpha === 1 ? `rgb(${rgb})` : `rgba(${rgb}, ${alpha})`;
}

/** A hex color with an alpha, as `rgba(…)`. */
export function withAlpha(hex: string, alpha: number): string {
  return `rgba(${channels(hex).join(', ')}, ${alpha})`;
}
