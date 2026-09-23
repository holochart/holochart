/**
 * `scatter` supply-defaults (plan E1.4, E9.1–E9.3, E9.7), following plotly.js
 * `traces/scatter/defaults.js` and its marker, line, text and error-bar helpers.
 */
import { isArrayLike, type FullTrace, type TraceDefaultsContext } from '@mk7s/holochart-core';
import { hasColorscale, supplyColorscaleDefaults } from '../shared/colorscale.ts';
import { pointCount } from '../shared/data.ts';
import { supplyErrorBarDefaults } from '../shared/error-bars/index.ts';

/** Plotly's `Color.defaultLine`: the default marker outline color. */
const DEFAULT_LINE = '#444';
/** Plotly's `Color.background`: bubble outlines. */
const BACKGROUND = '#fff';

/** Point count below which `mode` defaults to `'lines+markers'` (Plotly). */
export const MARKERS_DEFAULT_MAX = 20;

function hasFlag(mode: unknown, flag: string): boolean {
  return typeof mode === 'string' && mode.split('+').includes(flag);
}

/** Whether a (defaulted) `mode` draws markers. */
export function hasMarkers(mode: unknown): boolean {
  return hasFlag(mode, 'markers');
}

/** Whether a (defaulted) `mode` draws lines. */
export function hasLines(mode: unknown): boolean {
  return hasFlag(mode, 'lines');
}

/** Whether a (defaulted) `mode` draws text labels. */
export function hasText(mode: unknown): boolean {
  return hasFlag(mode, 'text');
}

/**
 * Whether per-point marker sizes are given (Plotly's `isBubble`): `sizeref`, `sizemode` and
 * `sizemin` apply, and bubbles get a translucent fill with a white outline by default.
 */
export function isBubble(trace: Readonly<Record<string, unknown>>): boolean {
  const marker = trace['marker'] as { size?: unknown } | undefined;
  return hasMarkers(trace['mode']) && isArrayLike(marker?.size);
}

function lengthOf(v: unknown): number | undefined {
  return pointCount(v);
}

function objectAt(v: unknown, key: string): Record<string, unknown> | undefined {
  if (v === null || typeof v !== 'object') return undefined;
  const c = (v as Record<string, unknown>)[key];
  return c !== null && typeof c === 'object' && !Array.isArray(c)
    ? (c as Record<string, unknown>)
    : undefined;
}

/**
 * Coerce `x`/`y`, or the implicit `x0`/`dx` (`y0`/`dy`) when one is missing. Returns the point
 * count, 0 when there is no data (the trace is then hidden, as in Plotly).
 */
function coerceCoordinates(ctx: TraceDefaultsContext): number {
  const nx = lengthOf(ctx.coerce('x'));
  const ny = lengthOf(ctx.coerce('y'));
  if (nx !== undefined && ny !== undefined) return Math.min(nx, ny);
  if (nx !== undefined) {
    ctx.coerce('y0');
    ctx.coerce('dy');
    return nx;
  }
  if (ny !== undefined) {
    ctx.coerce('x0');
    ctx.coerce('dx');
    return ny;
  }
  return 0;
}

/** Plotly's `handlePeriodDefaults`: `period0`/`periodalignment` only matter with a period. */
function coercePeriods(ctx: TraceDefaultsContext): void {
  for (const letter of ['x', 'y'] as const) {
    if (ctx.coerce(`${letter}period`) === undefined) continue;
    ctx.coerce(`${letter}period0`);
    ctx.coerce(`${letter}periodalignment`);
  }
}

/** Plotly's `handleMarkerDefaults` (with `gradient` deferred). */
function coerceMarker(
  traceIn: Readonly<Record<string, unknown>>,
  traceOut: FullTrace,
  ctx: TraceDefaultsContext,
): void {
  const bubble = isBubble({ mode: traceOut['mode'], marker: traceIn['marker'] });
  const lineColor = objectAt(traceIn, 'line')?.['color'];
  const markerIn = objectAt(traceIn, 'marker');
  // Plotly: a trace-level line color is the marker's default color too.
  const lineOut = objectAt(traceOut, 'line')?.['color'];
  const defaultColor = typeof lineOut === 'string' && lineColor ? lineOut : ctx.defaultColor;

  ctx.coerce('marker.symbol');
  ctx.coerce('marker.opacity', bubble ? 0.7 : 1);
  ctx.coerce('marker.size');
  ctx.coerce('marker.angle');
  const color = ctx.coerce('marker.color', defaultColor);
  if (hasColorscale(markerIn)) {
    supplyColorscaleDefaults(markerIn, ctx.coerce, 'marker.', { inTrace: true, showscale: true });
  }
  ctx.coerce('marker.maxdisplayed');

  // A line with a different color than the markers outlines them (Plotly).
  let mlc = DEFAULT_LINE;
  if (typeof lineOut === 'string' && lineColor && color !== lineOut) mlc = lineOut;
  else if (bubble) mlc = BACKGROUND;
  ctx.coerce('marker.line.color', mlc);
  const lineIn = objectAt(markerIn, 'line');
  if (hasColorscale(lineIn)) {
    supplyColorscaleDefaults(lineIn, ctx.coerce, 'marker.line.', {
      inTrace: true,
      showscale: false,
    });
  }
  ctx.coerce('marker.line.width', bubble ? 1 : 0);
  if (bubble) {
    ctx.coerce('marker.sizeref');
    ctx.coerce('marker.sizemin');
    ctx.coerce('marker.sizemode');
  }
  ctx.coerce('selected.marker.color');
  ctx.coerce('unselected.marker.color');
  ctx.coerce('selected.marker.size');
  ctx.coerce('unselected.marker.size');
  ctx.coerce('selected.marker.opacity');
  ctx.coerce('unselected.marker.opacity');
}

/** Plotly's `handleLineDefaults` + `handleLineShapeDefaults`. */
function coerceLine(traceIn: Readonly<Record<string, unknown>>, ctx: TraceDefaultsContext): void {
  const markerColor = objectAt(traceIn, 'marker')?.['color'];
  // A single marker color is the line's default color; per-point colors are not.
  const dflt = typeof markerColor === 'string' ? markerColor : ctx.defaultColor;
  ctx.coerce('line.color', dflt);
  ctx.coerce('line.width');
  ctx.coerce('line.dash');
  const shape = ctx.coerce('line.shape');
  if (shape === 'spline') ctx.coerce('line.smoothing');
  ctx.coerce('line.simplify');
  ctx.coerce('connectgaps');
}

/** Plotly's `handleTextDefaults`: `textfont` defaults to `layout.font`. */
function coerceText(ctx: TraceDefaultsContext): void {
  ctx.coerce('texttemplate');
  ctx.coerce('textposition');
  const font = (ctx.fullLayout['font'] ?? {}) as Record<string, unknown>;
  ctx.coerce('textfont.family', font['family']);
  ctx.coerce('textfont.size', font['size']);
  ctx.coerce('textfont.color', font['color']);
  ctx.coerce('textfont.weight', font['weight']);
  ctx.coerce('textfont.style', font['style']);
  ctx.coerce('selected.textfont.color');
  ctx.coerce('unselected.textfont.color');
}

/**
 * Supply scatter defaults. Sets `_length` (the point count) for calc. Attributes of modes that are
 * off are not coerced, so they don't show in `fullData` (Plotly semantics).
 */
export function supplyScatterDefaults(
  traceIn: Readonly<Record<string, unknown>>,
  traceOut: FullTrace,
  ctx: TraceDefaultsContext,
): void {
  const length = coerceCoordinates(ctx);
  if (length === 0) {
    traceOut.visible = false;
    return;
  }
  traceOut['_length'] = length;
  coercePeriods(ctx);
  const mode = ctx.coerce<string>('mode', length < MARKERS_DEFAULT_MAX ? 'lines+markers' : 'lines');
  ctx.coerce('text');
  if (hasLines(mode)) coerceLine(traceIn, ctx);
  if (hasMarkers(mode)) coerceMarker(traceIn, traceOut, ctx);
  if (hasText(mode)) coerceText(ctx);

  const lineColor = objectAt(traceOut, 'line')?.['color'];
  const markerColor = objectAt(traceOut, 'marker')?.['color'];
  const barColor =
    typeof lineColor === 'string'
      ? lineColor
      : typeof markerColor === 'string'
        ? markerColor
        : ctx.defaultColor;
  supplyErrorBarDefaults(traceIn, traceOut, ctx, 'y', { defaultColor: barColor });
  supplyErrorBarDefaults(traceIn, traceOut, ctx, 'x', { defaultColor: barColor, inherit: 'y' });
  ctx.coerce('zorder');
}
