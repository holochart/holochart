/**
 * Legend glyphs of the financial traces (plotly.js `legend/style.js`, `styleOHLC` and
 * `styleCandles`): a falling and a rising glyph side by side, each in its direction's style.
 *
 * - `ohlc`: Plotly's paths — a horizontal stroke from each side to the center with a vertical
 *   tick, rising on the left and falling on the right.
 * - `candlestick`: Plotly splits a square along its diagonal into a rising and a falling
 *   triangle, each with a wick; the legend draws rects, so here it is split down the middle.
 */
import type { FullTrace } from '@mk7s/holochart-core';
import type { LegendGlyph, LegendGlyphPart } from '@mk7s/holochart-runtime';
import { directionStyle } from './style.ts';

/** The ohlc legend glyph. */
export function ohlcLegendIcon(trace: FullTrace): LegendGlyph {
  const parts: LegendGlyphPart[] = [];
  for (const [increasing, side] of [
    [false, 1],
    [true, -1],
  ] as const) {
    const s = directionStyle(trace, increasing);
    const line = { color: s.color, width: s.width, dash: s.dash };
    parts.push({ segment: [15 * side, 0, 0, 0], ...line });
    parts.push({ segment: [8 * side, -6, 8 * side, 6], ...line });
  }
  return { kind: 'parts', parts };
}

/** The candlestick legend glyph. */
export function candlestickLegendIcon(trace: FullTrace): LegendGlyph {
  const parts: LegendGlyphPart[] = [];
  for (const [increasing, side] of [
    [false, 1],
    [true, -1],
  ] as const) {
    const s = directionStyle(trace, increasing);
    const [x0, x1] = side > 0 ? [0, 8] : [-8, 0];
    parts.push({
      rect: [x0, -6, x1, 6],
      color: s.fillcolor,
      lineColor: s.color,
      lineWidth: s.width,
    });
    parts.push({ segment: [8 * side, 0, 15 * side, 0], color: s.color, width: s.width });
  }
  return { kind: 'parts', parts };
}
