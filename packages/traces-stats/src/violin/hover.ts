/**
 * Violin hover (plan E10.5, E6.1; plotly.js `violin/hover.js`): the box statistics of the violin
 * under the pointer (`hoveron: 'violins'`, within its density span and on its drawn side), the
 * density at the pointer's value (`'kde'`: a label on the violin's edge, relative to the scale
 * group's peak, as Plotly shows it), and the nearest point (`'points'`), combined like box hover.
 * Plotly also draws a line across the violin at the hovered value; that line is not drawn here.
 */
import type { FullTrace } from '@mk7s/holochart-core';
import {
  formatAxisValue,
  type HoverContext,
  type HoverPoint,
  type HoverQuery,
} from '@mk7s/holochart-runtime';
import { calcToLinear } from '../box/calc.ts';
import {
  boxUnderPointer,
  combineHover,
  hoverAxes,
  hoverColor,
  pointUnderPointer,
  statPoints,
  type BoxHoverOptions,
} from '../box/hover.ts';
import { kdeAt } from '../shared/stats.ts';
import type { ViolinCalc } from './calc.ts';
import { violinSide } from './plot.ts';

function has(flags: unknown, flag: string): boolean {
  return typeof flags === 'string' && (flags === 'all' || flags.split('+').includes(flag));
}

/** Hover points of a violin trace (see the module comment). */
export function violinHoverPoints(
  calc: ViolinCalc,
  trace: FullTrace,
  query: HoverQuery,
  ctx: HoverContext,
): HoverPoint[] {
  if (calc.count === 0) return [];
  const axes = hoverAxes(calc, ctx);
  const hoveron = trace['hoveron'] ?? 'violins+points+kde';
  const side = violinSide(trace);
  const meanline = trace['meanline'] as { visible?: unknown } | undefined;
  const options: BoxHoverOptions = {
    hasMean: meanline?.visible === true,
    side,
    range: (b) => [calc.span0[b]!, calc.span1[b]!],
  };
  const out: HoverPoint[] = [];
  if (has(hoveron, 'violins') || has(hoveron, 'kde')) {
    const b = boxUnderPointer(calc, query, axes, options);
    if (b >= 0) {
      const stats = statPoints(calc, trace, b, query, axes, options);
      const horizontal = calc.orientation === 'h';
      const vVal = horizontal ? query.xl : query.yl;
      const s0 = calcToLinear(calc.valType, calc.span0[b]!);
      const s1 = calcToLinear(calc.valType, calc.span1[b]!);
      if (has(hoveron, 'kde') && stats.length > 0 && vVal >= s0 && vVal <= s1) {
        // The pointer's value in calc space (raw values on log axes).
        const c = calc.valType === 'log' ? Math.pow(10, vVal) : vVal;
        const { samples } = calc;
        const h = calc.bandwidth[b]!;
        const from = samples.start[b]!;
        const to = samples.start[b + 1]!;
        const density = h > 0 ? kdeAt(samples.value, h, c, from, to) : 1;
        const width = density / calc.scale[b]!;
        const center = calc.pos[b]! + calc.offsets.bPos;
        const edge = side === 'negative' ? center - width : center + width;
        const edgePx = edge * axes.pm + axes.pb;
        const vPx = vVal * axes.vm + axes.vb;
        const letter = horizontal ? 'x' : 'y';
        // Plotly's `getKdeValue`: density over `scale · bdPos` (the peak of the scale group is 1).
        const kde = density / (calc.scale[b]! * calc.offsets.bdPos);
        const valueText = formatAxisValue(axes.va, vVal);
        const text = `${letter}: ${valueText}, kde: ${kde.toFixed(3)}`;
        const posLabel = formatAxisValue(axes.pa, calc.pos[b]!);
        const posData = axes.pa ? axes.pa.scale.l2d(calc.pos[b]!) : calc.pos[b]!;
        const valData = axes.va ? axes.va.scale.l2d(vVal) : vVal;
        out.push({
          pointIndex: -1 - b,
          distance: stats[0]!.distance,
          px: horizontal ? vPx : edgePx,
          py: horizontal ? edgePx : vPx,
          x: horizontal ? valData : posData,
          y: horizontal ? posData : valData,
          color: hoverColor(trace, calc),
          hoverText: query.mode === 'closest' ? `(${posLabel}, ${text})` : text,
          fields: { kde },
          multi: true,
          showName: false,
          spikeDistance: stats[0]!.distance,
        });
      }
      if (has(hoveron, 'violins')) out.push(...stats);
    }
  }
  const point = has(hoveron, 'points') ? pointUnderPointer(calc, trace, query, axes) : undefined;
  return combineHover(out, point, query.mode);
}
