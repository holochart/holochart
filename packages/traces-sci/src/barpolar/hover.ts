/**
 * `barpolar` hover (plan E11.5), following plotly.js `barpolar/hover.js`: the bar under the
 * pointer, ranked just under points (so a marker within reach wins) and, among overlapping bars,
 * narrower ones and those whose outer end is nearer. The label sits at the middle of the bar's
 * outer edge and reads `r: …` (the bar's own size) and `θ: …`.
 */
import type { FullTrace } from '@mk7s/holochart-core';
import type { HoverContext, HoverPoint, HoverQuery } from '@mk7s/holochart-runtime';
import { barStyle, rgbaToCss } from '@mk7s/holochart-traces-basic';
import type { PolarCalc } from '../polar/cross-trace.ts';
import { isAngleInsideSector, polygonScale, TAU } from '../polar/geometry.ts';
import { polarHoverText, polarPointFields } from '../scatterpolar/hover.ts';
import { barPixels } from './geometry.ts';

function stringAt(v: unknown, i: number): string | undefined {
  const s = ArrayBuffer.isView(v) || Array.isArray(v) ? (v as ArrayLike<unknown>)[i] : v;
  return typeof s === 'string' && s !== '' ? s : typeof s === 'number' ? String(s) : undefined;
}

export function barpolarHoverPoints(
  calc: PolarCalc,
  trace: FullTrace,
  query: HoverQuery,
  _ctx: HoverContext,
): HoverPoint[] {
  const sp = calc.subplot;
  const px = sp ? barPixels(calc, sp) : undefined;
  if (!sp || !px || query.cx === undefined || query.cy === undefined) return [];
  const [gx, gy] = sp.toGeometric(query.cx, query.cy);
  if (!sp.inside(gx, gy)) return [];
  const angle = Math.atan2(gy, gx);
  // On polygon grids a bar's edges follow the polygon: measure radii in its units.
  const r = Math.hypot(gx, gy) / polygonScale(angle, sp.vangles);
  const max = Number.isFinite(query.distance) ? query.distance : 1e6;
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < px.rp0.length; i++) {
    if (px.visible[i] !== 1) continue;
    const rp0 = Math.min(px.rp0[i]!, px.rp1[i]!);
    const rp1 = Math.max(px.rp0[i]!, px.rp1[i]!);
    const g0 = Math.min(px.g0[i]!, px.g1[i]!);
    const g1 = Math.max(px.g0[i]!, px.g1[i]!);
    if (r < rp0 || r > rp1 || !isAngleInsideSector(angle, [g0, g1])) continue;
    const d =
      max + Math.min(1, (g1 - g0) / TAU) - 1 + (px.rp1[i]! - r) / (px.rp1[i]! - px.rp0[i]!) - 1;
    if (d <= bestD) {
      bestD = d;
      best = i;
    }
  }
  if (best < 0) return [];
  const i = best;
  const mid = (px.g0[i]! + px.g1[i]!) / 2;
  const rOut = px.rp1[i]! * polygonScale(mid, sp.vangles);
  const height = query.py + query.cy;
  const { fields, labels } = polarPointFields(
    trace,
    i,
    sp,
    calc.coords.r[i]!,
    calc.coords.theta[i]!,
  );
  const text = stringAt(trace['hovertext'], i) ?? stringAt(trace['text'], i);
  const style = barStyle(trace, calc.coords.length, null);
  return [
    {
      pointIndex: i,
      distance: Math.min(bestD, max),
      px: sp.cx + rOut * Math.cos(mid),
      py: height - (sp.cy - rOut * Math.sin(mid)),
      ...(text !== undefined ? { text } : {}),
      color: rgbaToCss(style.color.subarray(i * 4, i * 4 + 4)),
      fields: {
        ...fields,
        ...(trace['customdata'] !== undefined
          ? { customdata: (trace['customdata'] as ArrayLike<unknown>)[i] }
          : {}),
      },
      labels,
      hoverText: polarHoverText(trace, i, labels['r']!, labels['theta']!, text),
    },
  ];
}
