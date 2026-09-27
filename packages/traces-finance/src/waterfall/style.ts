/**
 * Waterfall styling and labels (plan E12.4; plotly.js `waterfall/style.js`, bar's
 * `calcTextinfo` / `calcTexttemplate`, legend `styleWaterfalls`): each bar takes the style of its
 * direction (`increasing`, `decreasing` or `totals`), labels show the `textinfo` parts or the
 * `texttemplate`, and the legend glyph shows the directions side by side.
 */
import { isArrayLike, type FullTrace } from '@mk7s/holochart-core';
import type { AxisInfo, LegendGlyph, LegendGlyphPart } from '@mk7s/holochart-runtime';
import { asBarTrace, labelFormatters, templateLabel, textAt, textinfoFlags } from '../bars/text.ts';
import { WATERFALL_COLORS, type WaterfallDirection } from './attributes.ts';
import { waterfallValues, type WaterfallCalc } from './calc.ts';

/** Direction names by {@link WaterfallCalc.direction} code. */
export const DIRECTIONS: readonly WaterfallDirection[] = ['increasing', 'decreasing', 'totals'];

/** One direction's resolved marker style. */
export interface DirectionMarker {
  readonly color: string;
  readonly lineColor: string;
  readonly lineWidth: number;
}

/** `trace[direction].marker`, resolved. */
export function directionMarker(trace: FullTrace, d: WaterfallDirection): DirectionMarker {
  const m = (trace[d] as { marker?: Record<string, unknown> } | undefined)?.marker ?? {};
  const line = (m['line'] ?? {}) as { color?: unknown; width?: unknown };
  return {
    color: typeof m['color'] === 'string' ? m['color'] : WATERFALL_COLORS[d],
    lineColor: typeof line.color === 'string' ? line.color : '#444',
    lineWidth: typeof line.width === 'number' ? Math.max(0, line.width) : 0,
  };
}

/**
 * The label of each bar (Plotly's `getText`): the `texttemplate`, else the `textinfo` parts
 * (label, text, initial, delta, final; one per line), else `text`.
 */
export function waterfallLabels(
  trace: FullTrace,
  calc: WaterfallCalc,
  xaxis: AxisInfo | undefined,
  yaxis: AxisInfo | undefined,
): string[] {
  const f = labelFormatters(calc, xaxis, yaxis);
  const flags = textinfoFlags(trace);
  const [pLetter, sLetter] = calc.orientation === 'h' ? ['y', 'x'] : ['x', 'y'];
  const out: string[] = [];
  for (let i = 0; i < calc.length; i++) {
    const { initial, delta, final } = waterfallValues(calc, i);
    const label = f.position(calc.pos[i]!);
    const templated = templateLabel(
      trace,
      i,
      {
        label: calc.pos[i],
        value: calc.size[i],
        [pLetter]: isArrayLike(trace[pLetter]) ? (trace[pLetter] as ArrayLike<unknown>)[i] : label,
        [sLetter]: isArrayLike(trace[sLetter])
          ? (trace[sLetter] as ArrayLike<unknown>)[i]
          : calc.size[i],
        initial,
        delta,
        final,
      },
      {
        label,
        // Without a format, `%{y}` (`%{x}` for horizontal bars) is the formatted running total
        // (Plotly's `yLabel` of bar labels).
        [pLetter]: label,
        [sLetter]: f.size(calc.size[i]!),
        value: f.size(calc.size[i]!),
        initial: f.size(initial),
        delta: f.size(delta),
        final: f.size(final),
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
    if (flags.has('initial')) parts.push(f.size(initial));
    if (flags.has('delta')) parts.push(f.size(delta));
    if (flags.has('final')) parts.push(f.size(final));
    out.push(parts.join('<br>'));
  }
  return out;
}

/** The trace as bar's renderer reads it: per-bar direction styles and the finished labels. */
export function waterfallBarTrace(
  trace: FullTrace,
  calc: WaterfallCalc,
  xaxis: AxisInfo | undefined,
  yaxis: AxisInfo | undefined,
): FullTrace {
  const styles = DIRECTIONS.map((d) => directionMarker(trace, d));
  const n = calc.length;
  const color = new Array<string>(n);
  const lineColor = new Array<string>(n);
  const lineWidth = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const s = styles[calc.direction[i]!]!;
    color[i] = s.color;
    lineColor[i] = s.lineColor;
    lineWidth[i] = s.lineWidth;
  }
  return asBarTrace(
    trace,
    { color, line: { color: lineColor, width: lineWidth } },
    waterfallLabels(trace, calc, xaxis, yaxis),
  );
}

/** Whether any bar of the trace is a sum bar (from its `measure`, for the legend). */
function hasTotals(trace: FullTrace): boolean {
  const measure = trace['measure'];
  if (!isArrayLike(measure)) return false;
  const n = typeof trace['_length'] === 'number' ? trace['_length'] : measure.length;
  for (let i = 0; i < Math.min(n, measure.length); i++) {
    const m = measure[i];
    if (m === 't' || m === 'total' || m === 'a' || m === 'absolute') return true;
  }
  return false;
}

/**
 * The legend glyph (Plotly's `styleWaterfalls`): the directions side by side, rising on the left
 * and falling on the right, with the sum style in the middle when the trace has sum bars. Plotly
 * draws triangles; the legend draws rects, so each direction is a vertical band.
 */
export function waterfallLegendIcon(trace: FullTrace): LegendGlyph {
  const order: WaterfallDirection[] = hasTotals(trace)
    ? ['increasing', 'totals', 'decreasing']
    : ['increasing', 'decreasing'];
  const width = 12 / order.length;
  const parts: LegendGlyphPart[] = order.map((d, k) => {
    const s = directionMarker(trace, d);
    return {
      rect: [-6 + k * width, -6, -6 + (k + 1) * width, 6],
      color: s.color,
      ...(s.lineWidth > 0 ? { lineColor: s.lineColor, lineWidth: Math.min(s.lineWidth, 2) } : {}),
    };
  });
  return { kind: 'parts', parts };
}
