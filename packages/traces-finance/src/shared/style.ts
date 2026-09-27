/**
 * Styling shared by `ohlc` and `candlestick`: each direction's resolved style (Plotly styles every
 * bar from `increasing` or `decreasing`), per-bar colors as render buffers with Plotly's
 * selection dimming, and the legend glyph pieces.
 */
import { toRGBA, type FullTrace } from '@mk7s/holochart-core';
import type { RGBA } from '@mk7s/holochart-render';
import type { PriceCalc } from './calc.ts';

/** Plotly's opacity of unselected bars while a selection is active (`ohlc/style.js`). */
export const UNSELECTED_OPACITY = 0.3;

const TRANSPARENT: RGBA = [0, 0, 0, 0];

/** A CSS color as render RGBA (transparent when invalid or unset). */
export function rgba(color: unknown): RGBA {
  return (typeof color === 'string' ? toRGBA(color) : null) ?? TRANSPARENT;
}

/** The style of one direction (`increasing` or `decreasing`), resolved. */
export interface DirectionStyle {
  /** CSS line color (`''` when unset). */
  readonly color: string;
  readonly width: number;
  /** `ohlc` only. */
  readonly dash: string;
  /** `candlestick` only: CSS body fill (`''` when unset). */
  readonly fillcolor: string;
}

function numberOr(v: unknown, dflt: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : dflt;
}

/** `trace.increasing` or `trace.decreasing`, resolved. */
export function directionStyle(trace: FullTrace, increasing: boolean): DirectionStyle {
  const d = (trace[increasing ? 'increasing' : 'decreasing'] ?? {}) as {
    line?: { color?: unknown; width?: unknown; dash?: unknown };
    fillcolor?: unknown;
  };
  const line = (trace['line'] ?? {}) as { width?: unknown; dash?: unknown };
  const dash = d.line?.dash ?? line.dash;
  return {
    color: typeof d.line?.color === 'string' ? d.line.color : '',
    width: Math.max(0, numberOr(d.line?.width, numberOr(line.width, 2))),
    dash: typeof dash === 'string' ? dash : 'solid',
    fillcolor: typeof d.fillcolor === 'string' ? d.fillcolor : '',
  };
}

/** The trace's `opacity` (1 when unset). */
export function traceOpacity(trace: FullTrace): number {
  return typeof trace['opacity'] === 'number' ? trace['opacity'] : 1;
}

/**
 * The CSS color hover labels use for a bar (Plotly: the direction's line color when it is drawn,
 * else its fill).
 */
export function hoverColor(style: DirectionStyle): string {
  return rgba(style.color)[3] > 0 && style.width > 0 ? style.color : style.fillcolor;
}

/**
 * Alpha factor per drawn bar: 1, or {@link UNSELECTED_OPACITY} for bars outside an active
 * selection (`selected` holds data indices). `undefined` without a selection.
 */
export function selectionAlpha(
  calc: PriceCalc,
  selected: readonly number[] | null | undefined,
): Float32Array | undefined {
  if (!selected) return undefined;
  const set = new Set(selected);
  const out = new Float32Array(calc.drawn.length);
  for (let k = 0; k < out.length; k++) {
    out[k] = set.has(calc.drawn[k]!) ? 1 : UNSELECTED_OPACITY;
  }
  return out;
}

/** Write `color` with its alpha scaled by `alpha` into `out` at RGBA slot `k`. */
export function putColor(out: Float32Array, k: number, color: RGBA, alpha: number): void {
  out[4 * k] = color[0];
  out[4 * k + 1] = color[1];
  out[4 * k + 2] = color[2];
  out[4 * k + 3] = color[3] * alpha;
}
