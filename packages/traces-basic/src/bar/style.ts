/**
 * Bar styling (plan E9.8, E6.3): fills, outlines, opacity and selection styles as per-bar render
 * buffers, the legend glyph, and helpers shared with text and hover.
 */
import { isArrayLike, toRGBA, type FullLayout, type FullTrace } from '@mk7s/holochart-core';
import type { RGBA, ScalarInput } from '@mk7s/holochart-render';
import type { LegendGlyph } from '@mk7s/holochart-runtime';
import { mapColors, resolveColorMapping } from '../shared/colorscale.ts';

/** Plotly's `DESELECTDIM`: opacity factor of unselected bars without an explicit style. */
export const DESELECT_DIM = 0.2;

const GREY: RGBA = [0.5, 0.5, 0.5, 1];
const DEFAULT_LINE: RGBA = [68 / 255, 68 / 255, 68 / 255, 1];

interface FullMarker {
  color?: unknown;
  opacity?: unknown;
  cornerradius?: unknown;
  line?: { color?: unknown; width?: unknown; [key: string]: unknown };
  [key: string]: unknown;
}

interface SelectionStyle {
  marker?: { color?: unknown; opacity?: unknown };
  textfont?: { color?: unknown };
}

/** Per-bar style buffers in the render layer's formats (sRGB 0–1, straight alpha). */
export interface BarStyle {
  /** Fill per bar, 4 floats each, with marker opacity and selection applied. */
  readonly fill: Float32Array;
  /** Outline color per bar, 4 floats each, with the same opacity as the fill. */
  readonly border: Float32Array;
  readonly borderWidth: ScalarInput;
  /** Fill per bar before opacity: hover label and legend colors, text contrast. */
  readonly color: Float32Array;
}

/** Per-bar colors of a color container (`marker`, `marker.line`): CSS colors or a colorscale. */
function colorsOf(
  container: Readonly<Record<string, unknown>> | undefined,
  count: number,
  fallback: RGBA,
  fullLayout: FullLayout | undefined,
): Float32Array {
  const value = container?.['color'];
  const mapping = resolveColorMapping(container, fullLayout);
  if (mapping && isArrayLike(value)) {
    const mapped = mapColors(value, mapping);
    if (mapped.length === count * 4) return mapped;
    const out = new Float32Array(count * 4);
    out.set(mapped.subarray(0, Math.min(mapped.length, out.length)));
    return out;
  }
  const out = new Float32Array(count * 4);
  if (isArrayLike(value)) {
    for (let i = 0; i < count; i++) {
      const c = value[i];
      out.set((typeof c === 'string' ? toRGBA(c) : null) ?? fallback, i * 4);
    }
    return out;
  }
  const c = (typeof value === 'string' ? toRGBA(value) : null) ?? fallback;
  for (let i = 0; i < count; i++) out.set(c, i * 4);
  return out;
}

/** Per-bar number from a scalar-or-array attribute. */
export function numberAt(value: unknown, i: number, fallback: number): number {
  const v = isArrayLike(value) ? value[i] : value;
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/** Whether bar `i` is selected, for a sorted-or-not index list turned into a set. */
export function selectionSet(selected: readonly number[] | null | undefined): Set<number> | null {
  return selected ? new Set(selected) : null;
}

/**
 * Style buffers for `count` bars. With an active selection (`selected` not null), selected bars use
 * `selected.marker.*` and the others `unselected.marker.*`, dimmed to 0.2× their opacity by
 * default (Plotly). `fullLayout` resolves `coloraxis` references.
 */
export function barStyle(
  trace: FullTrace,
  count: number,
  selected: ReadonlySet<number> | null = null,
  fullLayout?: FullLayout,
): BarStyle {
  const marker = (trace['marker'] ?? {}) as FullMarker;
  const color = colorsOf(marker, count, GREY, fullLayout);
  const fill = new Float32Array(color);
  const border = colorsOf(marker.line, count, DEFAULT_LINE, fullLayout);
  const sel = (trace['selected'] ?? {}) as SelectionStyle;
  const unsel = (trace['unselected'] ?? {}) as SelectionStyle;
  const selColor = typeof sel.marker?.color === 'string' ? toRGBA(sel.marker.color) : null;
  const unselColor = typeof unsel.marker?.color === 'string' ? toRGBA(unsel.marker.color) : null;
  for (let i = 0; i < count; i++) {
    let opacity = numberAt(marker.opacity, i, 1);
    if (selected) {
      const isSelected = selected.has(i);
      const style = isSelected ? sel : unsel;
      const override = isSelected ? selColor : unselColor;
      if (override) fill.set(override, i * 4);
      const o = style.marker?.opacity;
      opacity = typeof o === 'number' ? o : isSelected ? opacity : opacity * DESELECT_DIM;
    }
    fill[i * 4 + 3]! *= opacity;
    border[i * 4 + 3]! *= opacity;
  }
  const width = marker.line?.width;
  const borderWidth: ScalarInput = isArrayLike(width)
    ? Float32Array.from({ length: count }, (_, i) => Math.max(0, numberAt(width, i, 0)))
    : Math.max(0, numberAt(width, 0, 0));
  return { fill, border, borderWidth, color };
}

/** An sRGB 0–1 color from a style buffer as a CSS `rgb()`/`rgba()` string. */
export function cssColor(buffer: ArrayLike<number>, i: number): string {
  const c = (k: number): number => Math.round(Math.min(1, Math.max(0, buffer[i * 4 + k]!)) * 255);
  const a = buffer[i * 4 + 3]!;
  return a >= 1
    ? `rgb(${c(0)}, ${c(1)}, ${c(2)})`
    : `rgba(${c(0)}, ${c(1)}, ${c(2)}, ${+a.toFixed(3)})`;
}

/**
 * Plotly's `Color.contrast`: white text on dark fills, `#444` on light ones. Translucent fills are
 * composited over `background` first.
 */
export function contrastColor(fill: ArrayLike<number>, i: number, background: RGBA): RGBA {
  const a = fill[i * 4 + 3]!;
  const ch = (k: 0 | 1 | 2): number => (fill[i * 4 + k]! * a + background[k] * (1 - a)) * 255;
  const brightness = (ch(0) * 299 + ch(1) * 587 + ch(2) * 114) / 1000;
  return brightness < 128 ? [1, 1, 1, 1] : DEFAULT_LINE;
}

/**
 * Corner radius of bar `i` in px from `marker.cornerradius` (or `layout.barcornerradius`): a
 * number of px, or a percentage of the bar's width in px. 0 when unset or invalid.
 */
export function cornerRadiusPx(radius: unknown, barWidthPx: number): number {
  if (typeof radius === 'number') return Number.isFinite(radius) && radius > 0 ? radius : 0;
  if (typeof radius !== 'string') return 0;
  const s = radius.trim();
  const n = Number.parseFloat(s);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return s.endsWith('%') ? (Math.min(n, 50) / 100) * Math.abs(barWidthPx) : n;
}

/**
 * The legend glyph: a bar in the first bar's colors (Plotly). Without the layout, a `coloraxis`
 * reference falls back to the trace's own colorscale attributes.
 */
export function barLegendIcon(trace: FullTrace): LegendGlyph {
  // The whole trace decides the colorscale domain; the glyph uses the first bar.
  const length = typeof trace['_length'] === 'number' ? trace['_length'] : 1;
  const style = barStyle(trace, Math.max(1, length));
  const marker = (trace['marker'] ?? {}) as FullMarker;
  return {
    kind: 'bar',
    fill: {
      color: cssColor(style.fill, 0),
      lineColor: cssColor(style.border, 0),
      lineWidth: numberAt(marker.line?.width, 0, 0),
    },
  };
}
