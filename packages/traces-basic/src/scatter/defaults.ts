/** `scatter` supply-defaults (plan E1.4, E9.1), following plotly.js' scatter defaults. */
import type { FullTrace, TraceDefaultsContext } from '@mk7s/holochart-core';

/** Plotly's `Color.defaultLine`: the default marker outline color. */
const DEFAULT_LINE = '#444';

/** Point count below which `mode` defaults to `'lines+markers'` (Plotly). */
export const MARKERS_DEFAULT_MAX = 20;

/** Whether a (defaulted) `mode` draws markers. */
export function hasMarkers(mode: unknown): boolean {
  return typeof mode === 'string' && mode.split('+').includes('markers');
}

function lengthOf(v: unknown): number | undefined {
  return v !== null && typeof v === 'object' && 'length' in v
    ? (v as ArrayLike<unknown>).length
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

/**
 * Supply scatter defaults. Sets `_length` (the point count) for calc. Attributes of modes that are
 * off are not coerced, so they don't show in `fullData` (Plotly semantics).
 */
export function supplyScatterDefaults(
  _traceIn: Readonly<Record<string, unknown>>,
  traceOut: FullTrace,
  ctx: TraceDefaultsContext,
): void {
  const length = coerceCoordinates(ctx);
  if (length === 0) {
    traceOut.visible = false;
    return;
  }
  traceOut['_length'] = length;
  const mode = ctx.coerce<string>('mode', length < MARKERS_DEFAULT_MAX ? 'lines+markers' : 'lines');
  ctx.coerce('text');
  if (hasMarkers(mode)) {
    ctx.coerce('marker.color', ctx.defaultColor);
    ctx.coerce('marker.size');
    ctx.coerce('marker.symbol');
    ctx.coerce('marker.opacity');
    ctx.coerce('marker.line.color', DEFAULT_LINE);
    ctx.coerce('marker.line.width');
  }
}
