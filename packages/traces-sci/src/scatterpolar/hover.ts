/**
 * `scatterpolar` hover (plan E11.4), following plotly.js `scatterpolar/hover.js`: the nearest
 * point in screen distance (scatter's hit test, run on the points' px positions), hidden points
 * excluded; else, with `hoveron` including `fills`, the fill under the pointer. Labels read
 * `r: …` and `θ: …` (axis-formatted), then the text; `hovertemplate` gets `%{r}` / `%{theta}`.
 */
import type { FullTrace } from '@mk7s/holochart-core';
import type { HoverContext, HoverPoint, HoverQuery } from '@mk7s/holochart-runtime';
import { scatter } from '@mk7s/holochart-traces-basic';
import { fillContains, linePath, polarFillGeometry } from '../polar/fill.ts';
import { polarPositions } from '../polar/positions.ts';
import type { PolarSubplot } from '../polar/subplot.ts';
import type { ScatterpolarCalc } from './calc.ts';
import { innerCalc, subplotTransform } from './plot.ts';

function valueAt(v: unknown, i: number): unknown {
  return ArrayBuffer.isView(v) || Array.isArray(v) ? (v as ArrayLike<unknown>)[i] : v;
}

/** The data value of `r` or `theta` of point `i` (given, or implicit `r0 + i·dr`). */
function coordinate(trace: FullTrace, key: 'r' | 'theta', i: number): unknown {
  const values = trace[key];
  if (ArrayBuffer.isView(values) || Array.isArray(values)) {
    return (values as ArrayLike<unknown>)[i];
  }
  return undefined;
}

/**
 * The `hoverinfo` lines of a polar point (plotly.js `makeHoverPointText`): `r: …`, `θ: …`, then
 * the text, `<br>`-separated.
 */
export function polarHoverText(
  trace: FullTrace,
  i: number,
  rLabel: string,
  thetaLabel: string,
  text: string | undefined,
): string {
  const info = valueAt(trace['hoverinfo'], i);
  let parts = typeof info === 'string' && info !== '' ? info.split('+') : ['all'];
  if (parts.includes('all')) parts = ['r', 'theta', 'text'];
  const lines: string[] = [];
  if (parts.includes('r')) lines.push(`r: ${rLabel}`);
  if (parts.includes('theta')) lines.push(`θ: ${thetaLabel}`);
  if (parts.includes('text') && text !== undefined && text !== '') lines.push(text);
  return lines.join('<br>');
}

/** `r` / `theta` fields and labels of point `i` for events and templates. */
export function polarPointFields(
  trace: FullTrace,
  i: number,
  subplot: PolarSubplot,
  r: number,
  theta: number,
): { fields: Record<string, unknown>; labels: Record<string, string> } {
  const rLabel = subplot.rLabel(r);
  const thetaLabel = subplot.thetaLabel(theta);
  const rValue = coordinate(trace, 'r', i);
  const thetaValue = coordinate(trace, 'theta', i);
  return {
    fields: {
      r: rValue ?? subplot.radialScale.l2d(r),
      theta: thetaValue ?? thetaLabel,
    },
    labels: { r: rLabel, theta: thetaLabel },
  };
}

export function scatterpolarHoverPoints(
  calc: ScatterpolarCalc,
  trace: FullTrace,
  query: HoverQuery,
  ctx: HoverContext,
): HoverPoint[] {
  const subplot = calc.subplot;
  if (!subplot || calc.coords.length === 0) return [];
  // Domain queries are in overlay px from the bottom: `py + cy` is the figure height.
  const height = query.cy !== undefined ? query.py + query.cy : 0;
  const transform = subplotTransform(subplot, height);
  const gx = query.px - transform.offsetX;
  const gy = query.py - transform.offsetY;
  const flags = String(trace['hoveron'] ?? 'points').split('+');
  if (flags.includes('points')) {
    const found = scatter.hoverPoints!(
      innerCalc(calc, subplot),
      { ...trace, hoveron: 'points' },
      { ...query, mode: 'closest', xl: gx, yl: gy },
      { fullLayout: ctx.fullLayout, xaxis: undefined, yaxis: undefined, transform },
    );
    const p = found[0];
    if (p && p.pointIndex >= 0) {
      const i = p.pointIndex;
      const { fields, labels } = polarPointFields(
        trace,
        i,
        subplot,
        calc.coords.r[i]!,
        calc.coords.theta[i]!,
      );
      const { x: _x, y: _y, ...rest } = p;
      return [
        {
          ...rest,
          fields: { ...p.fields, ...fields },
          labels,
          hoverText: polarHoverText(trace, i, labels['r']!, labels['theta']!, p.text),
        },
      ];
    }
  }
  if (flags.includes('fills') && subplot.inside(gx, gy)) {
    const path = linePath(trace, polarPositions(calc, subplot));
    const previous = calc.previous;
    const g = polarFillGeometry(
      trace,
      path,
      subplot,
      previous ? linePath(previous.trace, polarPositions(previous.calc, subplot)) : undefined,
      false,
    );
    if (g && fillContains(g, gx, gy)) {
      const text =
        typeof trace['text'] === 'string' && trace['text'] !== ''
          ? trace['text']
          : String(trace['name'] ?? '');
      const fillcolor = trace['fillcolor'];
      return [
        {
          pointIndex: -1,
          distance: Number.isFinite(query.distance) ? query.distance : Number.MAX_VALUE,
          px: query.px,
          py: query.py,
          text,
          hoverText: text,
          ...(typeof fillcolor === 'string' ? { color: fillcolor } : {}),
          fields: { hoveron: 'fills', fill: trace['fill'] },
        },
      ];
    }
  }
  return [];
}
