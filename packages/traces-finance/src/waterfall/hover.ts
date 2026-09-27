/**
 * Waterfall hover (plan E12.4, E6.1; plotly.js `waterfall/hover.js`): bar's hit testing and
 * label anchor (the bar end), reporting the running total after the bar as its value, then
 * Plotly's extra lines for relative bars — the final value (only when the value line is hidden),
 * the change with ▲ or ▼ (negative changes in parentheses), and `Initial: …`. The label color is
 * the direction's fill (its outline when the fill is transparent). `hovertemplate` gets
 * `%{initial}`, `%{delta}` and `%{final}`.
 */
import { formatValue, isArrayLike, toRGBA, type FullTrace } from '@mk7s/holochart-core';
import type { AxisInfo, HoverContext, HoverPoint, HoverQuery } from '@mk7s/holochart-runtime';
import { barHoverPoints } from '@mk7s/holochart-traces-basic';
import { DIRECTION_SYMBOL } from '../shared/hover.ts';
import type { WaterfallCalc } from './calc.ts';
import { DIRECTIONS, directionMarker } from './style.ts';

/** A size-axis value (calc space) as the axis' hover labels show it. */
function sizeText(axis: AxisInfo | undefined, c: number): string {
  if (!Number.isFinite(c)) return '';
  if (!axis) return String(c);
  const l = axis.scale.type === 'log' ? (c > 0 ? Math.log10(c) : NaN) : c;
  return Number.isFinite(l) ? formatValue(axis.scale, axis.full, l, true) : '';
}

function flagsAt(trace: FullTrace, i: number): Set<string> | 'all' | undefined {
  const info = isArrayLike(trace['hoverinfo']) ? trace['hoverinfo'][i] : trace['hoverinfo'];
  if (info === undefined || info === 'all' || info === '') return 'all';
  if (typeof info !== 'string' || info === 'none' || info === 'skip') return undefined;
  return new Set(info.split('+'));
}

/** The label color of bar `i` (Plotly's `getTraceColor`). */
export function waterfallHoverColor(trace: FullTrace, calc: WaterfallCalc, i: number): string {
  const s = directionMarker(trace, DIRECTIONS[calc.direction[i]!]!);
  const fill = toRGBA(s.color);
  if (fill && fill[3] > 0) return s.color;
  const line = toRGBA(s.lineColor);
  return line && line[3] > 0 && s.lineWidth > 0 ? s.lineColor : s.color;
}

/** Waterfall `hoverPoints`: bar's points with the waterfall values and lines. */
export function waterfallHoverPoints(
  calc: WaterfallCalc,
  trace: FullTrace,
  query: HoverQuery,
  ctx: HoverContext,
): HoverPoint[] {
  const horizontal = calc.orientation === 'h';
  const sizeAxis = horizontal ? ctx.xaxis : ctx.yaxis;
  return barHoverPoints(calc, trace, query, ctx).map((point) => {
    const i = point.pointIndex;
    // Plotly: a sum bar's change is its whole height (`b + s`), a relative bar's its own value.
    const base = calc.bars.base[i]!;
    const final = calc.final[i]!;
    const delta = calc.isSum[i] ? base + calc.size[i]! : calc.delta[i]!;
    const initial = final - delta;
    const text = (c: number): string => sizeText(sizeAxis, c);
    const deltaLabel = delta < 0 ? `(${text(Math.abs(delta))})` : text(Math.abs(delta));
    const labels = { initial: text(initial), delta: deltaLabel, final: text(final) };
    const lines: string[] = [];
    const flags = flagsAt(trace, i);
    const has = (flag: string): boolean => flags === 'all' || flags?.has(flag) === true;
    if (flags && !calc.isSum[i]) {
      // The final value repeats the value line unless that is hidden.
      if (has('final') && !has(horizontal ? 'x' : 'y')) lines.push(labels.final);
      if (has('delta')) {
        lines.push(`${deltaLabel} ${DIRECTION_SYMBOL[delta < 0 ? 'decreasing' : 'increasing']}`);
      }
      if (has('initial')) lines.push(`Initial: ${labels.initial}`);
    }
    return {
      ...point,
      ...(horizontal ? { x: final } : { y: final }),
      color: waterfallHoverColor(trace, calc, i),
      fields: { ...point.fields, initial, delta, final },
      labels,
      ...(lines.length > 0 ? { extraText: lines.join('<br>') } : {}),
    };
  });
}
