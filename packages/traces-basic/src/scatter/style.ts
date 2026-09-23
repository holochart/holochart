/**
 * Scatter styles in render-layer terms (plan E9.1–E9.3, E6.3): defaulted trace attributes → sRGB
 * 0–1 colors, px sizes, opacities and dash specs for the marker, line and text primitives, plus
 * the per-point CSS colors hover labels and legends use. Pure (no GPU objects).
 */
import {
  isArrayLike,
  toFloat32Array,
  toRGBA,
  toRGBAArray,
  type FullLayout,
  type FullTrace,
} from '@mk7s/holochart-core';
import {
  MARKER_DEFAULTS,
  type ColorInput,
  type LineData,
  type MarkerData,
  type RGBA,
  type ScalarInput,
  type SymbolInput,
} from '@mk7s/holochart-render';
import {
  colorValues,
  mapColor,
  mapColors,
  resolveColorMapping,
  rgbaToCss,
  type ColorMapping,
} from '../shared/colorscale.ts';
import type { ScatterCalc } from './calc.ts';

/** The defaulted `marker` container. */
export interface FullMarker {
  color?: unknown;
  size?: unknown;
  symbol?: unknown;
  opacity?: unknown;
  angle?: unknown;
  maxdisplayed?: unknown;
  line?: { color?: unknown; width?: unknown };
}

interface SelectionStyle {
  marker?: { opacity?: unknown; color?: unknown; size?: unknown };
  textfont?: { color?: unknown };
}

/** Plotly's `DESELECTDIM`: opacity factor of unselected points without an explicit style. */
export const DESELECT_DIM = 0.2;

const DEFAULT_FILL = MARKER_DEFAULTS.color as RGBA;
const DEFAULT_LINE_COLOR = MARKER_DEFAULTS.lineColor as RGBA;

/** The trace `opacity` (multiplies everything the trace draws, like Plotly's group opacity). */
export function traceOpacity(trace: FullTrace): number {
  return typeof trace['opacity'] === 'number' ? trace['opacity'] : 1;
}

export function markerOf(trace: FullTrace): FullMarker {
  return (trace['marker'] ?? {}) as FullMarker;
}

function colorInput(value: unknown, fallback: RGBA): ColorInput {
  if (typeof value === 'string') return toRGBA(value) ?? fallback;
  if (isArrayLike(value)) return toRGBAArray(value as ArrayLike<unknown>, fallback);
  return fallback;
}

function scalarInput(value: unknown, fallback: number, scale = 1): ScalarInput {
  if (typeof value === 'number') return value * scale;
  if (isArrayLike(value)) {
    const out = toFloat32Array(value as ArrayLike<unknown>);
    for (let i = 0; i < out.length; i++) out[i] = Number.isFinite(out[i]) ? out[i]! * scale : 0;
    return out;
  }
  return fallback * scale;
}

function symbolInput(value: unknown): SymbolInput {
  if (typeof value === 'string' || typeof value === 'number') return value;
  if (isArrayLike(value)) return value as ArrayLike<number | string>;
  return 0;
}

function at(input: ScalarInput, i: number, fallback: number): number {
  if (typeof input === 'number') return input;
  const v = i < input.length ? input[i] : input[input.length - 1];
  return v ?? fallback;
}

function colorAt(input: ColorInput, i: number): RGBA {
  if (!(input instanceof Float32Array)) return input;
  const n = input.length >> 2;
  if (n === 0) return DEFAULT_FILL;
  const k = Math.min(i, n - 1) * 4;
  return [input[k]!, input[k + 1]!, input[k + 2]!, input[k + 3]!];
}

/** The fill colorscale mapping of `marker.color`, when its colors are numeric. */
export function markerColorMapping(
  trace: FullTrace,
  fullLayout?: FullLayout,
): ColorMapping | undefined {
  return resolveColorMapping(trace['marker'] as Record<string, unknown> | undefined, fullLayout);
}

/** Options of {@link markerStyle}. */
export interface MarkerStyleOptions {
  /** Calcdata, for the drawn (sizeref-scaled) sizes. */
  calc?: ScatterCalc;
  /** Needed for `coloraxis` references. */
  fullLayout?: FullLayout;
  /** Active selection (E6.3): indices of selected points, or null/undefined for none. */
  selectedPoints?: readonly number[] | null;
}

/**
 * Marker style from the full trace, in the render layer's formats (sRGB 0–1 colors, px sizes).
 * The trace `opacity` multiplies `marker.opacity` (Plotly draws the whole trace group with it).
 * Numeric `marker.color` arrays use the GPU colorscale path (`colorValues` + LUT) unless a
 * selection recolors points; numeric `marker.line.color` is mapped on the CPU.
 */
export function markerStyle(
  trace: FullTrace,
  options: MarkerStyleOptions = {},
): Partial<MarkerData> {
  const marker = markerOf(trace);
  const opacity = traceOpacity(trace);
  const n = options.calc?.length ?? 0;
  const mapping = markerColorMapping(trace, options.fullLayout);
  const lineMapping = resolveColorMapping(
    marker.line as Record<string, unknown> | undefined,
    options.fullLayout,
  );
  const style: Partial<MarkerData> = {
    size: options.calc ? options.calc.markerSize : scalarInput(marker.size, 6),
    symbol: symbolInput(marker.symbol),
    opacity: scalarInput(marker.opacity, 1, opacity),
    angle: scalarInput(marker.angle, 0),
    lineColor: lineMapping
      ? mapColors(marker.line!.color as ArrayLike<unknown>, lineMapping)
      : colorInput(marker.line?.color, DEFAULT_LINE_COLOR),
    lineWidth: scalarInput(marker.line?.width, 0),
  };
  if (mapping) {
    Object.assign(style, {
      color: DEFAULT_FILL,
      colorValues: colorValues(marker.color as ArrayLike<unknown>),
      colorscale: mapping.colorscale,
      cmin: mapping.cmin,
      cmax: mapping.cmax,
      cmid: null,
      reversescale: mapping.reversescale,
    });
  } else {
    Object.assign(style, {
      color: colorInput(marker.color, DEFAULT_FILL),
      colorValues: null,
      colorscale: null,
    });
  }
  const selected = options.selectedPoints;
  if (selected && n > 0) applySelection(trace, style, n, selected, mapping);
  return style;
}

/**
 * Selected / unselected point styles (Plotly `makeSelectedPointStyleFns`): explicit
 * `selected.marker.*` / `unselected.marker.*` values win; otherwise unselected points are dimmed
 * to {@link DESELECT_DIM} × their opacity.
 */
function applySelection(
  trace: FullTrace,
  style: Partial<MarkerData>,
  n: number,
  selectedPoints: readonly number[],
  mapping: ColorMapping | undefined,
): void {
  const isSelected = new Uint8Array(n);
  for (const i of selectedPoints) if (i >= 0 && i < n) isSelected[i] = 1;
  const sel = ((trace['selected'] as SelectionStyle | undefined)?.marker ?? {}) as Record<
    string,
    unknown
  >;
  const unsel = ((trace['unselected'] as SelectionStyle | undefined)?.marker ?? {}) as Record<
    string,
    unknown
  >;
  const opacity = traceOpacity(trace);

  const baseOpacity = style.opacity ?? opacity;
  const op = new Float32Array(n);
  const smo = typeof sel['opacity'] === 'number' ? sel['opacity'] * opacity : undefined;
  const usmo = typeof unsel['opacity'] === 'number' ? unsel['opacity'] * opacity : undefined;
  for (let i = 0; i < n; i++) {
    const mo = at(baseOpacity, i, opacity);
    op[i] = isSelected[i] ? (smo ?? mo) : (usmo ?? DESELECT_DIM * mo);
  }
  style.opacity = op;

  const smc = typeof sel['color'] === 'string' ? toRGBA(sel['color']) : null;
  const usmc = typeof unsel['color'] === 'string' ? toRGBA(unsel['color']) : null;
  if (smc || usmc) {
    // Explicit colors replace the colorscale path: resolve every point's color on the CPU.
    const marker = markerOf(trace);
    const base = mapping
      ? mapColors(marker.color as ArrayLike<unknown>, mapping)
      : (style.color ?? DEFAULT_FILL);
    const colors = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      colors.set((isSelected[i] ? smc : usmc) ?? colorAt(base, i), i * 4);
    }
    Object.assign(style, { color: colors, colorValues: null, colorscale: null });
  }

  const sms = typeof sel['size'] === 'number' ? sel['size'] : undefined;
  const usms = typeof unsel['size'] === 'number' ? unsel['size'] : undefined;
  if (sms !== undefined || usms !== undefined) {
    const baseSize = style.size ?? 6;
    const size = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      size[i] = (isSelected[i] ? sms : usms) ?? at(baseSize, i, 6);
    }
    style.size = size;
  }
}

/** The defaulted `line` container. */
interface FullLine {
  color?: unknown;
  width?: unknown;
  dash?: unknown;
}

/** Line style (`mode` `lines`) for the line primitive. */
export function lineStyle(
  trace: FullTrace,
): Pick<LineData, 'color' | 'width' | 'dash' | 'opacity'> {
  const line = (trace['line'] ?? {}) as FullLine;
  return {
    color: (typeof line.color === 'string' ? toRGBA(line.color) : null) ?? DEFAULT_FILL,
    width: typeof line.width === 'number' ? line.width : 2,
    dash: typeof line.dash === 'string' ? line.dash : 'solid',
    opacity: traceOpacity(trace),
  };
}

/**
 * CSS color of point `i` for hover labels and legends: the marker color (colorscale-mapped when
 * numeric) when markers are drawn, else the line color.
 */
export function pointColor(
  trace: FullTrace,
  i: number,
  fullLayout?: FullLayout,
): string | undefined {
  const marker = trace['marker'] as FullMarker | undefined;
  if (marker) {
    const mapping = markerColorMapping(trace, fullLayout);
    const c = marker.color;
    if (mapping && isArrayLike(c)) {
      const v = (c as ArrayLike<unknown>)[i];
      return rgbaToCss(mapColor(typeof v === 'number' ? v : NaN, mapping));
    }
    if (typeof c === 'string') return c;
    if (isArrayLike(c)) {
      const v = (c as ArrayLike<unknown>)[i];
      if (typeof v === 'string') return v;
    }
  }
  const line = (trace['line'] as FullLine | undefined)?.color;
  return typeof line === 'string' ? line : undefined;
}

export { colorAt as rgbaAt };
