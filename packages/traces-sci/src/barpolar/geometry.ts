/**
 * Where `barpolar` bars are drawn (plan E11.5): each bar's radial extent in px from the subplot
 * center and its angular extent in geometric radians, for the current view (cached per calc and
 * subplot version), and the outline of a bar on a polygon grid (plotly.js `barpolar/plot.js`
 * `makePathFn`).
 */
import { radialC2l, type PolarCalc } from '../polar/cross-trace.ts';
import { angleDelta, enclosingVertexAngles, polygonVertices } from '../polar/geometry.ts';
import type { PolarSubplot } from '../polar/subplot.ts';

export interface BarPixels {
  /** Radial extent in px from the center (`rp0` at the base). */
  readonly rp0: Float64Array;
  readonly rp1: Float64Array;
  /** Angular extent, geometric radians. */
  readonly g0: Float64Array;
  readonly g1: Float64Array;
  /** 1 where the bar has an extent (finite, non-empty). */
  readonly visible: Uint8Array;
}

const MEMO = new WeakMap<PolarCalc, { subplot: PolarSubplot; version: number; px: BarPixels }>();

export function barPixels(calc: PolarCalc, subplot: PolarSubplot): BarPixels | undefined {
  const bars = calc.bars;
  if (!bars) return undefined;
  const hit = MEMO.get(calc);
  if (hit && hit.subplot === subplot && hit.version === subplot.version) return hit.px;
  const n = bars.p0.length;
  const scale = calc.coords.radialScale;
  const rp0 = new Float64Array(n);
  const rp1 = new Float64Array(n);
  const g0 = new Float64Array(n);
  const g1 = new Float64Array(n);
  const visible = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    rp0[i] = subplot.r2px(radialC2l(scale, bars.s0[i]!));
    rp1[i] = subplot.r2px(radialC2l(scale, bars.s1[i]!));
    g0[i] = subplot.c2g(bars.p0[i]!);
    g1[i] = subplot.c2g(bars.p1[i]!);
    visible[i] =
      Number.isFinite(rp0[i]!) &&
      Number.isFinite(rp1[i]!) &&
      Number.isFinite(g0[i]!) &&
      Number.isFinite(g1[i]!) &&
      rp0[i] !== rp1[i] &&
      g0[i] !== g1[i]
        ? 1
        : 0;
  }
  const px = { rp0, rp1, g0, g1, visible };
  MEMO.set(calc, { subplot, version: subplot.version, px });
  return px;
}

/**
 * The outline ring of a bar on a polygon grid (geometric px), between "radii" `r0 < r1` and
 * angles `a0`, `a1`: the grid polygon's edges through the vertices enclosing the bar.
 */
export function polygonBarRing(
  r0: number,
  r1: number,
  a0In: number,
  a1In: number,
  vangles: readonly number[],
): [number, number][] {
  const [a0, a1] = angleDelta(a0In, a1In) > 0 ? [a0In, a1In] : [a1In, a0In];
  const va0 = enclosingVertexAngles(a0, vangles)[0];
  const va1 = enclosingVertexAngles(a1, vangles)[1];
  const vaBar = [va0, (a0 + a1) / 2, va1];
  const outer = polygonVertices(r1, a0, a1, vaBar);
  outer.pop(); // the origin
  if (r0 <= 0) return [...outer, [0, 0]];
  const inner = polygonVertices(r0, a0, a1, vaBar);
  inner.pop();
  return [...outer, ...inner.reverse()];
}
