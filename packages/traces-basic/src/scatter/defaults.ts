/**
 * `scatter` supply-defaults (plan E1.4, E9.1–E9.3, E9.7), following plotly.js
 * `traces/scatter/defaults.js` and its marker, line, text and error-bar helpers.
 */
import {
  isArrayLike,
  toRGBA,
  type FullLayout,
  type FullTrace,
  type TraceDefaultsContext,
} from '@mk7s/holochart-core';
import {
  hasColorscale,
  resolveColorscale,
  supplyColorscaleDefaults,
} from '../shared/colorscale.ts';
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

/** Whether a (defaulted) trace fills an area (`fill` other than `'none'`). */
export function hasFill(trace: Readonly<Record<string, unknown>>): boolean {
  const fill = trace['fill'];
  return typeof fill === 'string' && fill !== 'none';
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

// ---- Stacks and fills (E9.4) -----------------------------------------------------------------

/** Stack-wide options, shared by every trace of one `stackgroup` on one subplot. */
export interface StackGroupOptions {
  orientation: 'v' | 'h';
  groupnorm: '' | 'fraction' | 'percent';
  stackgaps: 'infer zero' | 'interpolate';
  /** `fill` default of the group's traces: `tonexty`, or `tonextx` when stacking horizontally. */
  fillDflt: 'tonexty' | 'tonextx';
  /** The group's traces so far (a later `orientation` resets their default `fill`). */
  traces: FullTrace[];
  /** Which stack-wide attributes a trace set explicitly (the first one found wins). */
  found: Set<string>;
}

/**
 * Stack groups of one supply-defaults pass, by subplot then group name (Plotly's
 * `fullLayout._scatterStackOpts`). `fullLayout` is new on every pass, so this never goes stale.
 */
const STACK_OPTS = '_scatterStackOpts';

type StackRegistry = Record<string, Record<string, StackGroupOptions>>;

/** The options of `trace`'s stack group, once the trace has been defaulted. */
export function stackGroupOptions(
  fullLayout: FullLayout,
  trace: Readonly<Record<string, unknown>>,
): StackGroupOptions | undefined {
  const group = trace['stackgroup'];
  if (typeof group !== 'string' || group === '') return undefined;
  const registry = fullLayout[STACK_OPTS] as StackRegistry | undefined;
  return registry?.[`${String(trace['xaxis'])}${String(trace['yaxis'])}`]?.[group];
}

const PER_STACK = ['orientation', 'groupnorm', 'stackgaps'] as const;

/**
 * Plotly's `handleStackDefaults`: `stackgroup`, and the stack-wide `orientation` / `groupnorm` /
 * `stackgaps` from the first trace of the group that sets them (the group's first trace carries
 * the defaults until a later trace sets a value). Returns the group options, or `undefined` for
 * an unstacked trace.
 */
function coerceStack(
  traceIn: Readonly<Record<string, unknown>>,
  traceOut: FullTrace,
  ctx: TraceDefaultsContext,
): StackGroupOptions | undefined {
  const group = ctx.coerce<string>('stackgroup');
  if (!group) return undefined;
  const subplot = `${String(traceOut['xaxis'])}${String(traceOut['yaxis'])}`;
  const registry = ((ctx.fullLayout[STACK_OPTS] as StackRegistry | undefined) ??= {});
  const bySubplot = (registry[subplot] ??= {});
  let opts = bySubplot[group];
  const first = opts === undefined;
  if (!opts) {
    opts = {
      orientation: 'v',
      groupnorm: '',
      stackgaps: 'infer zero',
      fillDflt: 'tonexty',
      traces: [],
      found: new Set(),
    };
    bySubplot[group] = opts;
  }
  opts.traces.push(traceOut);
  const dfltOrientation = traceIn['x'] !== undefined && traceIn['y'] === undefined ? 'h' : 'v';
  for (const key of PER_STACK) {
    if (opts.found.has(key)) continue;
    const given = traceIn[key] !== undefined;
    if (!given && !first) continue;
    const value = ctx.coerce(key, key === 'orientation' ? dfltOrientation : undefined);
    (opts as unknown as Record<string, unknown>)[key] = value;
    if (key === 'orientation') opts.fillDflt = value === 'h' ? 'tonextx' : 'tonexty';
    if (!given) continue;
    opts.found.add(key);
    if (first) continue;
    // Only one trace of the group shows a stack-wide attribute in fullData (Plotly).
    const head = opts.traces[0];
    if (head) delete head[key];
    if (key !== 'orientation') continue;
    // A later orientation changes the default fill of the traces before it.
    for (const t of opts.traces.slice(0, -1)) {
      const input = (t._input ?? {}) as Record<string, unknown>;
      if (input['fill'] !== t['fill']) t['fill'] = opts.fillDflt;
    }
  }
  return opts;
}

/** `color` (any CSS color) with its alpha replaced by `alpha` (Plotly's `Color.addOpacity`). */
export function withAlpha(color: string, alpha: number): string {
  const c = toRGBA(color);
  if (!c) return color;
  const byte = (v: number): number => Math.round(Math.min(1, Math.max(0, v)) * 255);
  return `rgba(${byte(c[0])}, ${byte(c[1])}, ${byte(c[2])}, ${alpha})`;
}

/** Plotly's `averageColors`: a representative color of a colorscale (for `fillcolor`). */
function averageColor(colorscale: unknown): string | undefined {
  const stops = resolveColorscale(colorscale);
  if (!stops || stops.length === 0) return undefined;
  const mix = (a: readonly number[], b: readonly number[], t: number): number[] =>
    a.map((v, k) => v + ((b[k] ?? v) - v) * t);
  const first = stops[0]!;
  const second = stops[1] ?? first;
  let color = mix(first[1], second[1], 0.5);
  for (let i = 2; i < stops.length; i++) {
    const prev = stops[i - 1]!;
    const cur = stops[i]!;
    const avg = mix(prev[1], cur[1], 0.5);
    color = mix(color, avg, cur[0] > 0 ? prev[0] / cur[0] : 0);
  }
  const byte = (v: number | undefined): number =>
    Math.round(Math.min(1, Math.max(0, v ?? 0)) * 255);
  return `rgba(${byte(color[0])}, ${byte(color[1])}, ${byte(color[2])}, ${color[3] ?? 1})`;
}

/**
 * Plotly's `fillColorDefaults` (with `fillgradient`): `fillcolor` defaults to the line color, else
 * a single marker (or marker outline) color, else the gradient's average color, else the colorway
 * color — at half opacity.
 */
function coerceFillColor(traceOut: FullTrace, ctx: TraceDefaultsContext): void {
  const marker = objectAt(traceOut, 'marker');
  const markerColor = marker?.['color'];
  const markerLineColor = objectAt(marker, 'line')?.['color'];
  let inherit: string | undefined;
  if (typeof markerColor === 'string' && markerColor) inherit = markerColor;
  else if (typeof markerLineColor === 'string' && markerLineColor) inherit = markerLineColor;
  let gradientColor: string | undefined;
  if (ctx.coerce('fillgradient.type') !== 'none') {
    ctx.coerce('fillgradient.start');
    ctx.coerce('fillgradient.stop');
    const colorscale = ctx.coerce('fillgradient.colorscale');
    if (colorscale !== undefined) gradientColor = averageColor(colorscale);
  }
  const lineColor = objectAt(traceOut, 'line')?.['color'];
  const base =
    (typeof lineColor === 'string' && lineColor ? lineColor : undefined) ??
    inherit ??
    gradientColor ??
    ctx.defaultColor;
  ctx.coerce('fillcolor', withAlpha(base, 0.5));
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
  const stack = coerceStack(traceIn, traceOut, ctx);
  const mode = ctx.coerce<string>(
    'mode',
    !stack && length < MARKERS_DEFAULT_MAX ? 'lines+markers' : 'lines',
  );
  ctx.coerce('text');
  if (hasLines(mode)) coerceLine(traceIn, ctx);
  if (hasMarkers(mode)) coerceMarker(traceIn, traceOut, ctx);
  if (hasText(mode)) coerceText(ctx);

  const hoverOn: string[] = hasMarkers(mode) || hasText(mode) ? ['points'] : [];
  // A later trace of the stack group may still change this default (see `coerceStack`).
  const fill = ctx.coerce<string>('fill', stack ? stack.fillDflt : 'none');
  if (fill !== 'none') {
    coerceFillColor(traceOut, ctx);
    if (!hasLines(mode)) {
      // The fill follows the line shape even when the line is not drawn (Plotly).
      if (ctx.coerce('line.shape') === 'spline') ctx.coerce('line.smoothing');
    }
  }
  if (fill === 'tonext' || fill === 'toself') hoverOn.push('fills');
  ctx.coerce('hoveron', hoverOn.join('+') || 'points');

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
