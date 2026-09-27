/**
 * Funnel labels and styling (plan E12.5; plotly.js bar `calcTextinfo` / `calcTexttemplate` for
 * funnels, `funnel/style.js`): labels show the `textinfo` parts or the `texttemplate`, and bar's
 * renderer draws the bars with the trace's own `marker` (per-bar colors and colorscales work as
 * for bars).
 */
import { isArrayLike, type FullTrace } from '@mk7s/holochart-core';
import type { AxisInfo } from '@mk7s/holochart-runtime';
import {
  asBarTrace,
  formatPercent,
  labelFormatters,
  templateLabel,
  textAt,
  textinfoFlags,
} from '../bars/text.ts';
import type { FunnelCalc } from './calc.ts';

const PERCENTS = [
  ['percent initial', 'percentInitial', 'initial'],
  ['percent previous', 'percentPrevious', 'previous'],
  ['percent total', 'percentTotal', 'total'],
] as const;

/**
 * The label of each bar (Plotly's `getText`): the `texttemplate`, else the `textinfo` parts
 * (label, text, value, then the percentages, each suffixed `of initial` / `of previous` /
 * `of total` when several are shown; one per line), else `text`.
 */
export function funnelLabels(
  trace: FullTrace,
  calc: FunnelCalc,
  xaxis: AxisInfo | undefined,
  yaxis: AxisInfo | undefined,
): string[] {
  const f = labelFormatters(calc, xaxis, yaxis);
  const flags = textinfoFlags(trace);
  const [pLetter, sLetter] = calc.orientation === 'h' ? ['y', 'x'] : ['x', 'y'];
  const shown = flags ? PERCENTS.filter(([flag]) => flags.has(flag)) : [];
  const out: string[] = [];
  for (let i = 0; i < calc.length; i++) {
    const label = f.position(calc.pos[i]!);
    const value = calc.size[i]!;
    const at = (letter: string, dflt: unknown): unknown =>
      isArrayLike(trace[letter]) ? (trace[letter] as ArrayLike<unknown>)[i] : dflt;
    const templated = templateLabel(
      trace,
      i,
      {
        label: calc.pos[i],
        value,
        [pLetter]: at(pLetter, label),
        [sLetter]: at(sLetter, value),
        percentInitial: calc.percentInitial[i],
        percentPrevious: calc.percentPrevious[i],
        percentTotal: calc.percentTotal[i],
      },
      {
        label,
        [pLetter]: label,
        [sLetter]: f.size(value),
        value: f.size(value),
        percentInitial: formatPercent(calc.percentInitial[i]!),
        percentPrevious: formatPercent(calc.percentPrevious[i]!),
        percentTotal: formatPercent(calc.percentTotal[i]!),
      },
    );
    if (templated !== undefined) {
      out.push(templated);
      continue;
    }
    if (!flags) {
      out.push(textAt(trace, 'text', i) ?? '');
      continue;
    }
    const parts: string[] = [];
    if (flags.has('label')) parts.push(label);
    const text = flags.has('text') ? textAt(trace, 'text', i) : undefined;
    if (text !== undefined) parts.push(text);
    if (flags.has('value')) parts.push(f.size(value));
    for (const [, key, of] of shown) {
      const p = formatPercent(calc[key][i]!);
      parts.push(shown.length > 1 ? `${p} of ${of}` : p);
    }
    out.push(parts.join('<br>'));
  }
  return out;
}

/** The trace as bar's renderer reads it: its marker (without corner radius) and the labels. */
export function funnelBarTrace(
  trace: FullTrace,
  calc: FunnelCalc,
  xaxis: AxisInfo | undefined,
  yaxis: AxisInfo | undefined,
): FullTrace {
  const marker = (trace['marker'] ?? {}) as Record<string, unknown>;
  return asBarTrace(trace, marker, funnelLabels(trace, calc, xaxis, yaxis));
}
