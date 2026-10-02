/**
 * Small helpers shared by the wind and seasons examples of the Dallas weather demo.
 *
 * A `.mts` file, so the example registry does not treat it as an example.
 */
import { MONTH, seasonOf, TMIN, type Season, type WindDay } from './analysis.mts';

/** Median of a list of numbers (the list is not modified). */
export function median(v: readonly number[]): number {
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
}

/**
 * Whether the low of a day looks like a faulty reading: at least 30 °F below the lows of both the
 * day before and the day after. (The record has one such day, a low of 32 °F on Jun 24, 2025
 * between lows of 77 and 75 °F, which would otherwise count as a freeze in summer.)
 */
export function suspectLow(i: number): boolean {
  const t = TMIN[i];
  const before = TMIN[i - 1];
  const after = TMIN[i + 1];
  if (t === null || t === undefined) return false;
  if (before === null || before === undefined || after === null || after === undefined) {
    return false;
  }
  return before - t >= 30 && after - t >= 30;
}

/** Season of a day of the record (by day index). */
export function seasonOfDay(i: number): Season {
  return seasonOf(MONTH[i] as number);
}

/** Season of a wind reading. */
export function windSeason(w: WindDay): Season {
  return seasonOfDay(w.i);
}

/**
 * A repeatable pseudo-random number in [−0.5, 0.5) for an index and a channel (the examples are
 * visual tests, so `Math.random()` is not allowed).
 */
export function spread(i: number, channel: number): number {
  let h = (Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(channel + 1, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0;
  h = (h ^ (h >>> 15)) >>> 0;
  return h / 4294967296 - 0.5;
}

/** The eight main compass points and their bearings, for a numeric angular axis. */
export const BEARINGS = [0, 45, 90, 135, 180, 225, 270, 315];
export const BEARING_NAMES = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
