/**
 * Box and violin styling (plan E10.4, E10.5): colors as render buffers, the point markers
 * (Plotly's `Drawing.pointStyle` with the suspected-outlier style and selection dimming), and the
 * legend glyph.
 */
import { toRGBA, type FullTrace } from '@mk7s/holochart-core';
import type { RGBA } from '@mk7s/holochart-render';
import type { LegendGlyph } from '@mk7s/holochart-runtime';
import { calcToLinear, pointsMode, type BoxCalc } from './calc.ts';

/** Plotly's `DESELECTDIM`: opacity factor of unselected points without an explicit style. */
export const DESELECT_DIM = 0.2;

const TRANSPARENT: RGBA = [0, 0, 0, 0];

/** A CSS color as render RGBA (transparent when invalid or unset). */
export function rgba(color: unknown, fallback: RGBA = TRANSPARENT): RGBA {
  return (typeof color === 'string' ? toRGBA(color) : null) ?? fallback;
}

/** Whether a CSS color is visible (valid with alpha > 0). */
export function isOpaque(color: unknown): boolean {
  return rgba(color)[3] > 0;
}

/** The trace's `opacity` (1 when unset). */
export function traceOpacity(trace: FullTrace): number {
  return typeof trace['opacity'] === 'number' ? trace['opacity'] : 1;
}

function objectAt(v: unknown, key: string): Record<string, unknown> | undefined {
  const c = v !== null && typeof v === 'object' ? (v as Record<string, unknown>)[key] : undefined;
  return c !== null && typeof c === 'object' ? (c as Record<string, unknown>) : undefined;
}

function numberOr(v: unknown, dflt: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : dflt;
}

/** Marker buffers of the drawn points, in sample order (only shown samples). */
export interface PointStyle {
  readonly count: number;
  /** Sample (index into `calc.samples`) of each point. */
  readonly sample: Int32Array;
  /** Linear coordinates. */
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly color: Float32Array;
  readonly lineColor: Float32Array;
  readonly lineWidth: Float32Array;
  readonly opacity: Float32Array;
  readonly size: number;
  readonly symbol: string | number;
  readonly angle: number;
}

/**
 * The drawn points of a calc with their style: `marker.*`, the suspected-outlier style
 * (`marker.outliercolor`, `marker.line.outliercolor` / `outlierwidth`), and `selected` /
 * `unselected` while a selection is active (`selected` holds data indices).
 */
export function pointStyle(
  calc: BoxCalc,
  trace: FullTrace,
  selected: ReadonlySet<number> | null,
): PointStyle {
  const { samples } = calc;
  const ks: number[] = [];
  if (calc.mode) {
    for (let k = 0; k < samples.shown.length; k++) {
      if (samples.shown[k] && Number.isFinite(calc.pointPos[k]!)) ks.push(k);
    }
  }
  const n = ks.length;
  const marker = objectAt(trace, 'marker') ?? {};
  const line = objectAt(marker, 'line') ?? {};
  const fill = rgba(marker['color'], [0, 0, 0, 1]);
  const stroke = rgba(line['color'], [68 / 255, 68 / 255, 68 / 255, 1]);
  const strokeWidth = numberOr(line['width'], 0);
  const outlierFill = rgba(marker['outliercolor']);
  const outlierStroke = rgba(line['outliercolor'], fill);
  const outlierWidth = numberOr(line['outlierwidth'], 1);
  const baseOpacity = numberOr(marker['opacity'], 1);
  const sel = objectAt(objectAt(trace, 'selected'), 'marker');
  const unsel = objectAt(objectAt(trace, 'unselected'), 'marker');
  const selColor = typeof sel?.['color'] === 'string' ? toRGBA(sel['color']) : null;
  const unselColor = typeof unsel?.['color'] === 'string' ? toRGBA(unsel['color']) : null;
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  const color = new Float32Array(n * 4);
  const lineColor = new Float32Array(n * 4);
  const lineWidth = new Float32Array(n);
  const opacity = new Float32Array(n);
  const horizontal = calc.orientation === 'h';
  for (let j = 0; j < n; j++) {
    const k = ks[j]!;
    const p = calc.pointPos[k]!;
    const v = calcToLinear(calc.valType, samples.value[k]!);
    x[j] = horizontal ? v : p;
    y[j] = horizontal ? p : v;
    const so = samples.suspected[k] === 1;
    let c = so ? outlierFill : fill;
    color.set(c, j * 4);
    lineColor.set(so ? outlierStroke : stroke, j * 4);
    lineWidth[j] = so ? outlierWidth : strokeWidth;
    let o = baseOpacity;
    if (selected) {
      const isSelected = selected.has(samples.index[k]!);
      if (isSelected) {
        o = numberOr(sel?.['opacity'], baseOpacity);
        if (selColor) c = selColor;
      } else {
        o = numberOr(unsel?.['opacity'], baseOpacity * DESELECT_DIM);
        if (unselColor) c = unselColor;
      }
      color.set(c, j * 4);
    }
    opacity[j] = o;
  }
  return {
    count: n,
    sample: Int32Array.from(ks),
    x,
    y,
    color,
    lineColor,
    lineWidth,
    opacity,
    size: numberOr(marker['size'], 6),
    symbol: (marker['symbol'] as string | number | undefined) ?? 'circle',
    angle: numberOr(marker['angle'], 0),
  };
}

/**
 * Legend glyph (Plotly's `styleBoxes`): a square with the fill and outline (at most 2 px), or a
 * marker for strip plots (all points, no fill, no outline: transparent or 0 px wide).
 */
export function boxLegendIcon(trace: FullTrace): LegendGlyph {
  const line = objectAt(trace, 'line') ?? {};
  const marker = objectAt(trace, 'marker') ?? {};
  const outline = isOpaque(line['color']) && numberOr(line['width'], 2) > 0;
  if (pointsMode(trace) === 'all' && !isOpaque(trace['fillcolor']) && !outline) {
    const mline = objectAt(marker, 'line') ?? {};
    return {
      kind: 'marker',
      marker: {
        symbol: (marker['symbol'] as string | number | undefined) ?? 'circle',
        size: Math.min(Math.max(numberOr(marker['size'], 6), 2), 16),
        color: String(marker['color'] ?? '#444'),
        lineColor: String(mline['color'] ?? '#444'),
        lineWidth: numberOr(mline['width'], 0),
        opacity: numberOr(marker['opacity'], 1),
      },
    };
  }
  const width = Math.min(numberOr(line['width'], 2), 2);
  return {
    kind: 'bar',
    fill: {
      color: String(trace['fillcolor'] ?? 'rgba(0, 0, 0, 0)'),
      lineColor: String(line['color'] ?? '#444'),
      lineWidth: width,
    },
  };
}
