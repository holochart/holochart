/**
 * Funnel hover (plan E12.5, E6.1; plotly.js `funnel/hover.js`): bar's hit testing, label anchor
 * (the bar's far end) and color, reporting the stage's value, then Plotly's percentage lines per
 * `hoverinfo` flags — `… of initial`, `… of previous`, `… of total` (one decimal). `hovertemplate`
 * gets `%{value}`, `%{percentInitial}`, `%{percentPrevious}` and `%{percentTotal}` (formatted as
 * percentages without a format).
 */
import { isArrayLike, type FullTrace } from '@mk7s/holochart-core';
import type { HoverContext, HoverPoint, HoverQuery } from '@mk7s/holochart-runtime';
import { barHoverPoints } from '@mk7s/holochart-traces-basic';
import { formatPercent } from '../bars/text.ts';
import type { FunnelCalc } from './calc.ts';

const PERCENTS = [
  ['percent initial', 'percentInitial', 'initial'],
  ['percent previous', 'percentPrevious', 'previous'],
  ['percent total', 'percentTotal', 'total'],
] as const;

/** Funnel `hoverPoints`: bar's points with the stage percentages. */
export function funnelHoverPoints(
  calc: FunnelCalc,
  trace: FullTrace,
  query: HoverQuery,
  ctx: HoverContext,
): HoverPoint[] {
  return barHoverPoints(calc, trace, query, ctx).map((point) => {
    const i = point.pointIndex;
    const info = isArrayLike(trace['hoverinfo']) ? trace['hoverinfo'][i] : trace['hoverinfo'];
    const all = info === undefined || info === 'all' || info === '';
    const flags = typeof info === 'string' ? new Set(info.split('+')) : new Set<string>();
    const fields: Record<string, unknown> = { ...point.fields };
    const labels: Record<string, string> = {};
    const lines: string[] = [];
    for (const [flag, key, of] of PERCENTS) {
      const label = formatPercent(calc[key][i]!, 1);
      fields[key] = calc[key][i];
      labels[key] = label;
      if (all || flags.has(flag)) lines.push(`${label} of ${of}`);
    }
    return {
      ...point,
      fields,
      labels,
      ...(lines.length > 0 ? { extraText: lines.join('<br>') } : {}),
    };
  });
}
