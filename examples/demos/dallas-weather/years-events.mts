/**
 * Helpers shared by the "years and events" examples of the Dallas weather demo: the color ramp
 * that encodes time (older pale, newer strong), runs of consecutive days, and small formatters.
 *
 * A `.mts` file, so the example registry does not treat it as an example.
 */
import { DATE, MONTH_NAMES, N, TMAX, YEAR } from './analysis.mts';

/** Older years dim and cool, recent years bright and hot: readable on the dark template. */
export const YEAR_SCALE: [number, string][] = [
  [0, '#46527a'],
  [0.35, '#7f8fc4'],
  [0.65, '#e3b56a'],
  [0.85, '#ee6b3b'],
  [1, '#f0303c'],
];

const channels = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

/** The color of a scale at `t` (0–1), as `#rrggbb`. */
export function scaleColor(scale: readonly [number, string][], t: number): string {
  const u = Math.min(1, Math.max(0, t));
  let k = 1;
  while (k < scale.length - 1 && (scale[k] as [number, string])[0] < u) k++;
  const [t0, c0] = scale[k - 1] as [number, string];
  const [t1, c1] = scale[k] as [number, string];
  const f = t1 === t0 ? 0 : (u - t0) / (t1 - t0);
  const a = channels(c0);
  const b = channels(c1);
  return `#${a
    .map((v, i) =>
      Math.round(v + ((b[i] as number) - v) * f)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

/** `#rrggbb` → `rgba(r, g, b, alpha)`. */
export function alpha(hex: string, a: number): string {
  const [r, g, b] = channels(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/** `1987` → `1980`. */
export const decadeOf = (year: number): number => Math.floor(year / 10) * 10;

/** `2011-07-02` → `Jul 2`. */
export function fmtDay(date: string): string {
  return `${MONTH_NAMES[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8, 10))}`;
}

export interface Run {
  /** Day index of the first day, and the number of days. */
  start: number;
  length: number;
}

/**
 * Runs of consecutive days in `[from, to]` (day indexes, inclusive) for which `test` holds. A
 * missing reading ends a run.
 */
export function runs(test: (i: number) => boolean, from = 0, to = N - 1): Run[] {
  const out: Run[] = [];
  let length = 0;
  for (let i = from; i <= to + 1; i++) {
    if (i <= to && test(i)) {
      length++;
    } else {
      if (length > 0) out.push({ start: i - length, length });
      length = 0;
    }
  }
  return out;
}

/** The longest run (the earliest of equals), or `undefined` when there is none. */
export function longest(list: readonly Run[]): Run | undefined {
  return list.reduce<Run | undefined>((a, b) => (a && a.length >= b.length ? a : b), undefined);
}

/** Whether the high of day `i` reached 100 °F. */
export const is100 = (i: number): boolean => {
  const t = TMAX[i];
  return t !== null && t !== undefined && t >= 100;
};

/** The longest run of 100 °F days starting in each year, by the year it started in. */
export function hotStreaks(): { year: number; length: number; startDate: string }[] {
  const best = new Map<number, Run>();
  for (const r of runs(is100)) {
    const y = YEAR[r.start] as number;
    const b = best.get(y);
    if (!b || r.length > b.length) best.set(y, r);
  }
  return [...best.entries()].map(([year, r]) => ({
    year,
    length: r.length,
    startDate: DATE[r.start] as string,
  }));
}
