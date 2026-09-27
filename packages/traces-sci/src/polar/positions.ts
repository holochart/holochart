/**
 * Where a polar trace's points are drawn (plan E11.4): geometric px of each point on its subplot,
 * for the current view, cached per calc and subplot version (views, hover and the fill share it).
 */
import type { PolarCalc } from './cross-trace.ts';
import type { PolarSubplot } from './subplot.ts';

/** Geometric px (center at the origin, y up) of each point; NaN where it can't be placed. */
export interface PolarPositions {
  readonly x: Float64Array;
  readonly y: Float64Array;
  /** 1 where the point is inside the subplot's region (drawn as a marker, hoverable). */
  readonly inside: Uint8Array;
}

const MEMO = new WeakMap<
  PolarCalc,
  { subplot: PolarSubplot; version: number; positions: PolarPositions }
>();

/** The positions of `calc`'s points on `subplot` (cached until the subplot's view changes). */
export function polarPositions(calc: PolarCalc, subplot: PolarSubplot): PolarPositions {
  const hit = MEMO.get(calc);
  if (hit && hit.subplot === subplot && hit.version === subplot.version) return hit.positions;
  const { r, theta, length } = calc.coords;
  const x = new Float64Array(length);
  const y = new Float64Array(length);
  const inside = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    const rp = subplot.r2px(r[i]!);
    const g = subplot.c2g(theta[i]!);
    if (!Number.isFinite(rp) || !Number.isFinite(g)) {
      x[i] = y[i] = NaN;
      continue;
    }
    x[i] = rp * Math.cos(g);
    y[i] = rp * Math.sin(g);
    inside[i] = subplot.inside(x[i]!, y[i]!) ? 1 : 0;
  }
  const positions = { x, y, inside };
  MEMO.set(calc, { subplot, version: subplot.version, positions });
  return positions;
}

/** `positions` with the points outside the region hidden (NaN), for markers and text. */
export function visiblePositions(p: PolarPositions): { x: Float64Array; y: Float64Array } {
  const x = new Float64Array(p.x.length);
  const y = new Float64Array(p.y.length);
  for (let i = 0; i < x.length; i++) {
    const on = p.inside[i] === 1;
    x[i] = on ? p.x[i]! : NaN;
    y[i] = on ? p.y[i]! : NaN;
  }
  return { x, y };
}
