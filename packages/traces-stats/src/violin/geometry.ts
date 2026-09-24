/**
 * Violin shapes in linear coordinates (plotly.js `violin/plot.js`): the density outline of each
 * violin — mirrored, or one-sided for split violins — as filled polygons and stroked polylines, and
 * the mean line across the density. Pure; the inner box comes from `box/geometry.ts`.
 */
import { calcToLinear } from '../box/calc.ts';
import type { Polygons, Polylines } from '../box/geometry.ts';
import { kdeAt } from '../shared/stats.ts';
import type { ViolinCalc } from './calc.ts';

/** Violin side. */
export type ViolinSide = 'both' | 'positive' | 'negative';

/** Density outlines and mean lines of every violin of a calc. */
export interface ViolinShapes {
  readonly bodies: Polygons;
  readonly outlines: Polylines;
  /** Mean lines across the density (drawn when the inner box is hidden). */
  readonly means: Polylines;
}

/**
 * The density half-width (position-axis units) of violin `b` at value `c` (calc space): the KDE
 * scaled like the drawn outline (Plotly's `getPositionOnKdePath`).
 */
export function densityWidth(calc: ViolinCalc, b: number, c: number): number {
  const { samples } = calc;
  const h = calc.bandwidth[b]!;
  if (!(h > 0)) return 1 / calc.scale[b]!;
  return kdeAt(samples.value, h, c, samples.start[b]!, samples.start[b + 1]!) / calc.scale[b]!;
}

/** Violin outlines: rings for `both`, open paths along the drawn side for one-sided violins. */
export function violinShapes(calc: ViolinCalc, side: ViolinSide, meanline: boolean): ViolinShapes {
  const horizontal = calc.orientation === 'h';
  const bx: number[] = [];
  const by: number[] = [];
  const rings: number[] = [];
  const lx: number[] = [];
  const ly: number[] = [];
  const starts: number[] = [];
  const mx: number[] = [];
  const my: number[] = [];
  const mstarts: number[] = [];
  const push = (xs: number[], ys: number[], p: number, v: number): void => {
    xs.push(horizontal ? v : p);
    ys.push(horizontal ? p : v);
  };
  const { bPos } = calc.offsets;
  const { start, t, v } = calc.density;
  for (let b = 0; b < calc.count; b++) {
    const center = calc.pos[b]! + bPos;
    const scale = calc.scale[b]!;
    const k0 = start[b]!;
    const k1 = start[b + 1]!;
    if (k1 <= k0 || !Number.isFinite(center)) continue;
    const pts: [number, number][] = [];
    const lin = (k: number) => calcToLinear(calc.valType, t[k]!);
    const t0 = lin(k0);
    const t1 = lin(k1 - 1);
    if (side !== 'negative') {
      for (let k = k0; k < k1; k++) pts.push([center + v[k]! / scale, lin(k)]);
    }
    if (side !== 'positive') {
      for (let k = k1 - 1; k >= k0; k--) pts.push([center - v[k]! / scale, lin(k)]);
    }
    // One-sided: from the center at one end, along the side, back to the center at the other.
    const outline: [number, number][] =
      side === 'both'
        ? [[center, t0], ...pts, [center, t0]]
        : side === 'positive'
          ? [[center, t0], ...pts, [center, t1]]
          : [[center, t1], ...pts, [center, t0]];
    const valid = outline.filter(([p, q]) => Number.isFinite(p) && Number.isFinite(q));
    if (valid.length < 2) continue;
    rings.push(bx.length);
    for (const [p, q] of side === 'both' ? pts : outline) push(bx, by, p, q);
    starts.push(lx.length);
    for (const [p, q] of valid) push(lx, ly, p, q);

    if (meanline) {
      const mean = calc.stats.mean[b]!;
      const m = calcToLinear(calc.valType, mean);
      const w = densityWidth(calc, b, mean);
      if (Number.isFinite(m) && Number.isFinite(w)) {
        mstarts.push(mx.length);
        push(mx, my, side === 'positive' ? center : center - w, m);
        push(mx, my, side === 'negative' ? center : center + w, m);
      }
    }
  }
  return {
    bodies: { x: Float64Array.from(bx), y: Float64Array.from(by), rings: Int32Array.from(rings) },
    outlines: {
      x: Float64Array.from(lx),
      y: Float64Array.from(ly),
      starts: Int32Array.from(starts),
    },
    means: { x: Float64Array.from(mx), y: Float64Array.from(my), starts: Int32Array.from(mstarts) },
  };
}
