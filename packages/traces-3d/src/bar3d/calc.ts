/**
 * `bar3d` calc (plan E14.9): bar centers in linear coordinates (numbers, ms for dates, category
 * indices), footprints, heights and bases, stacking and the scene autorange. Pure: no three.js.
 *
 * - **Footprint**: `width` along x and `depth` along y, in linear units of those axes (1 is one
 *   category slot, dates in ms), one value or one per bar; by default 0.8 of the smallest distance
 *   between the trace's distinct positions on that axis (1 with a single position), so a grid of
 *   bars leaves a fifth of each cell empty, like Plotly's default `bargap`.
 * - **Heights**: a bar spans `bottom` → `top` on the z axis, in z data units (`bottom = base`,
 *   `top = base + z`); negative heights go down. They are converted to linear z per bar (log10 on
 *   log axes, where a bottom at or below zero starts at the bottom of the axis range when drawn).
 * - **Stacking** ({@link stackBar3d}): traces of one scene with the same non-empty `stackgroup`
 *   stack in trace order (Plotly's `barmode: 'stack'`): at every (x, y) position, a bar starts
 *   where the previous trace's bar there ended; the lowest bar of a stack starts at its own `base`.
 *   Runs in the scenes' shared cross-trace step (`SceneCalc.sceneCrossTrace`) before autorange,
 *   and is idempotent.
 * - **Autorange**: x and y include the whole footprint of every bar, z every bottom and top (so
 *   the base, 0 by default, and stack totals are in range).
 */
import { isArrayLike, type FullLayout, type FullTrace, type Scale } from '@mk7s/holochart-core';
import type { CalcContext, DomainTraceEntry } from '@mk7s/holochart-runtime';
import { sceneScales } from '../scene/axes.ts';
import type { SceneCalc } from '../scene/layout.ts';
import { sceneOf } from '../scene/layout-defaults.ts';

/** Share of the smallest position spacing a default bar footprint covers. */
export const BAR3D_FILL = 0.8;

/** @experimental */
export interface Bar3dCalc extends SceneCalc {
  /** Number of bars: the shortest of `x`, `y`, `z`. */
  readonly count: number;
  /** Bar centers, linear coordinates (NaN: not drawn). */
  readonly x: Float64Array;
  readonly y: Float64Array;
  /** Footprint per bar, linear units of x / y. */
  readonly width: Float64Array;
  readonly depth: Float64Array;
  /** Heights, z data units (NaN: not drawn). */
  readonly value: Float64Array;
  /** The trace's own base per bar (z data units, 0 where unset); 1 in `hasBase` where given. */
  readonly base: Float64Array;
  readonly hasBase: Uint8Array;
  /** Bar ends after stacking, z data units: `bottom` → `top`. */
  readonly bottom: Float64Array;
  readonly top: Float64Array;
  /** The same, linear z (`-Infinity` for a bottom at or below zero on a log axis). */
  readonly bottomL: Float64Array;
  readonly topL: Float64Array;
  /** Whether the bars stack on another trace's (not the lowest of their stacks). */
  stacked: boolean;
  /** The scene's cross-trace step: stacking (see the module comment). */
  readonly sceneCrossTrace: typeof stackBar3d;
  readonly sceneExtremes: { x?: [number, number]; y?: [number, number]; z?: [number, number] };
}

function numbers(v: unknown, n: number): Float64Array {
  const out = new Float64Array(n);
  const a = isArrayLike(v) ? (v as ArrayLike<unknown>) : [];
  for (let i = 0; i < n; i++) {
    const x = a[i];
    out[i] = typeof x === 'number' ? x : typeof x === 'string' && x.trim() !== '' ? +x : NaN;
  }
  return out;
}

/** The smallest distance between distinct finite values (Infinity with fewer than two). */
export function minSpacing(values: ArrayLike<number>): number {
  const sorted = Float64Array.from(values)
    .filter((v) => Number.isFinite(v))
    .sort();
  let best = Infinity;
  const span = sorted.length > 1 ? sorted[sorted.length - 1]! - sorted[0]! : 0;
  // Distinct within a tolerance (Plotly's `distinctVals`), so float noise is not a spacing.
  const eps = span / 1e6;
  for (let i = 1; i < sorted.length; i++) {
    const d = sorted[i]! - sorted[i - 1]!;
    if (d > eps && d < best) best = d;
  }
  return best;
}

/**
 * A footprint per bar: the attribute's value (one or per bar, finite and ≥ 0), else
 * {@link BAR3D_FILL} of the smallest spacing of `positions` (1 without one).
 */
export function barExtents(attr: unknown, positions: Float64Array): Float64Array {
  const n = positions.length;
  const spacing = minSpacing(positions);
  const dflt = BAR3D_FILL * (Number.isFinite(spacing) ? spacing : 1);
  const out = new Float64Array(n);
  const arr = isArrayLike(attr) ? (attr as ArrayLike<unknown>) : undefined;
  for (let i = 0; i < n; i++) {
    const v = arr ? arr[i] : attr;
    out[i] = typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : dflt;
  }
  return out;
}

/** Linear z of bar ends (`d2l` per value; non-finite stays as is: −∞ on log axes at ≤ 0). */
function toLinear(scale: Scale, src: Float64Array, out: Float64Array): void {
  for (let i = 0; i < src.length; i++) {
    const v = src[i]!;
    out[i] = Number.isFinite(v) ? scale.d2l(v) : NaN;
    if (Number.isNaN(out[i]!) && Number.isFinite(v)) out[i] = -Infinity;
  }
}

/** Min / max of `a` and `b` over bars with a finite `value` (finite entries only). */
function extentOf(a: Float64Array, b: Float64Array, valid: Float64Array) {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < a.length; i++) {
    if (!Number.isFinite(valid[i]!)) continue;
    for (const v of [a[i]!, b[i]!]) {
      if (!Number.isFinite(v)) continue;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  return lo <= hi ? ([lo, hi] as [number, number]) : undefined;
}

/** Recompute the linear z ends and the autorange of a calc (after its bottoms / tops changed). */
export function updateBar3dRanges(calc: Bar3dCalc, zScale: Scale): void {
  toLinear(zScale, calc.bottom, calc.bottomL);
  toLinear(zScale, calc.top, calc.topL);
  const n = calc.count;
  const lo = new Float64Array(n);
  const hi = new Float64Array(n);
  const valid = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const ok =
      Number.isFinite(calc.x[i]!) && Number.isFinite(calc.y[i]!) && Number.isFinite(calc.value[i]!);
    valid[i] = ok ? 1 : NaN;
  }
  const e = calc.sceneExtremes;
  for (const [key, center, size] of [
    ['x', calc.x, calc.width],
    ['y', calc.y, calc.depth],
  ] as const) {
    for (let i = 0; i < n; i++) {
      lo[i] = center[i]! - size[i]! / 2;
      hi[i] = center[i]! + size[i]! / 2;
    }
    const ext = extentOf(lo, hi, valid);
    if (ext) e[key] = ext;
    else delete e[key];
  }
  const z = extentOf(calc.bottomL, calc.topL, valid);
  if (z) e.z = z;
  else delete e.z;
}

/** The `bar3d` calc (see the module comment); stacking comes later ({@link stackBar3d}). */
export function calcBar3d(trace: FullTrace, ctx: CalcContext): Bar3dCalc {
  const s = sceneScales(ctx.fullLayout, sceneOf(trace));
  const col = (k: string): ArrayLike<unknown> =>
    isArrayLike(trace[k]) ? (trace[k] as ArrayLike<unknown>) : [];
  const count = Math.min(col('x').length, col('y').length, col('z').length);
  const x = s.x.d2lArray(col('x')).slice(0, count);
  const y = s.y.d2lArray(col('y')).slice(0, count);
  const value = numbers(trace['z'], count);
  const baseIn = trace['base'];
  const base = new Float64Array(count);
  const hasBase = new Uint8Array(count);
  const baseArr = isArrayLike(baseIn) ? numbers(baseIn, count) : undefined;
  for (let i = 0; i < count; i++) {
    const b = baseArr ? baseArr[i]! : typeof baseIn === 'number' ? baseIn : NaN;
    if (Number.isFinite(b)) {
      base[i] = b;
      hasBase[i] = 1;
    }
  }
  const bottom = Float64Array.from(base);
  const top = new Float64Array(count);
  for (let i = 0; i < count; i++) top[i] = base[i]! + value[i]!;
  const calc: Bar3dCalc = {
    count,
    x,
    y,
    width: barExtents(trace['width'], x),
    depth: barExtents(trace['depth'], y),
    value,
    base,
    hasBase,
    bottom,
    top,
    bottomL: new Float64Array(count),
    topL: new Float64Array(count),
    stacked: false,
    sceneCrossTrace: stackBar3d,
    sceneExtremes: {},
  };
  updateBar3dRanges(calc, s.z);
  return calc;
}

/** Key of a bar position (linear x, y) for stacking. */
function positionKey(x: number, y: number): string {
  return `${x}\u0000${y}`;
}

/**
 * Stack the bars of a scene's `bar3d` traces (the cross-trace step of every `bar3d` calc, run by
 * `sceneCrossTraceLayout` with the scene's entries that carry it, in trace order). Idempotent:
 * every bottom and top is recomputed from the traces' own bases and heights.
 */
export function stackBar3d(
  entries: readonly DomainTraceEntry<SceneCalc>[],
  fullLayout: FullLayout,
  sceneId: string,
): void {
  const zScale = sceneScales(fullLayout, sceneId).z;
  const running = new Map<string, Map<string, number>>();
  for (const e of entries) {
    const calc = e.calc as Bar3dCalc;
    const group = typeof e.trace['stackgroup'] === 'string' ? e.trace['stackgroup'] : '';
    let stacked = false;
    for (let i = 0; i < calc.count; i++) {
      const v = calc.value[i]!;
      let from = calc.base[i]!;
      if (group !== '' && Number.isFinite(v) && Number.isFinite(calc.x[i]!)) {
        let tops = running.get(group);
        if (!tops) running.set(group, (tops = new Map()));
        const key = positionKey(calc.x[i]!, calc.y[i]!);
        const below = tops.get(key);
        if (below !== undefined) {
          from = below;
          stacked = true;
        }
        tops.set(key, from + v);
      }
      calc.bottom[i] = from;
      calc.top[i] = from + v;
    }
    calc.stacked = stacked;
    updateBar3dRanges(calc, zScale);
  }
}
