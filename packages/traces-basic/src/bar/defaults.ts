/** `bar` supply-defaults (plan E1.4, E9.8, E9.9), following plotly.js' bar defaults. */
import {
  autoType,
  isArrayLike,
  type FullLayout,
  type FullTrace,
  type LayoutDefaultsContext,
  type TraceDefaultsContext,
} from '@mk7s/holochart-core';
import { hasColorscale, supplyColorscaleDefaults } from '../shared/colorscale.ts';
import { pointCount } from '../shared/data.ts';
import { supplyErrorBarDefaults } from '../shared/error-bars/index.ts';

/** Plotly's `Color.defaultLine`: the default bar outline color. */
const DEFAULT_LINE = '#444';

/** Private `fullLayout` key holding the offset groups of each alignment group (see below). */
export const BAR_ALIGNMENT_KEY = '_barAlignment';

function objectAt(v: unknown, key: string): Readonly<Record<string, unknown>> | undefined {
  const c = v !== null && typeof v === 'object' ? (v as Record<string, unknown>)[key] : undefined;
  return c !== null && typeof c === 'object' && !Array.isArray(c)
    ? (c as Record<string, unknown>)
    : undefined;
}

function lengthOf(v: unknown): number | undefined {
  return pointCount(v);
}

/** Whether any bar may show text (`textposition` is not `'none'` everywhere). */
export function mayShowText(textposition: unknown): boolean {
  if (isArrayLike(textposition)) return true;
  return textposition !== 'none';
}

/**
 * Coerce the coordinates (or the implicit `x0`/`dx`, `y0`/`dy` for a missing one) and the
 * orientation. Returns the bar count, 0 without data.
 */
function coerceCoordinates(ctx: TraceDefaultsContext): number {
  const nx = lengthOf(ctx.coerce('x'));
  const ny = lengthOf(ctx.coerce('y'));
  if (nx === undefined && ny === undefined) return 0;
  const o = ctx.coerce<string>('orientation', nx !== undefined && ny === undefined ? 'h' : 'v');
  // The length coordinate is required; the position coordinate may be implicit.
  const [nSize, nPos, pos] = o === 'h' ? [nx, ny, 'y'] : [ny, nx, 'x'];
  if (nSize === undefined) return 0;
  if (nPos !== undefined) return Math.min(nSize, nPos);
  ctx.coerce(`${pos}0`);
  ctx.coerce(`d${pos}`);
  return nSize;
}

/**
 * Supply bar defaults. Sets `_length` (the bar count). Text styling is only coerced when some bar
 * can show text; colorscale attributes only for colorscaled containers (Plotly's `hasColorscale`).
 */
export function supplyBarDefaults(
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

  ctx.coerce('base');
  ctx.coerce('offset');
  ctx.coerce('width');
  ctx.coerce('offsetgroup');
  ctx.coerce('alignmentgroup');
  ctx.coerce('zorder');

  supplyBarStyleDefaults(traceIn, traceOut, ctx);
}

/**
 * Bar labels, marker, error bars and selection styles (the part of bar defaults shared with
 * `histogram`, plotly.js' `handleText` + `handleStyleDefaults` + error bars). The trace's schema
 * must declare bar's text, marker, `error_x` / `error_y` and `selected` / `unselected` attributes.
 */
export function supplyBarStyleDefaults(
  traceIn: Readonly<Record<string, unknown>>,
  traceOut: FullTrace,
  ctx: TraceDefaultsContext,
): void {
  ctx.coerce('text');
  ctx.coerce('texttemplate');
  const textposition = ctx.coerce('textposition');
  if (mayShowText(textposition)) {
    const font = ctx.fullLayout.font;
    const base = {
      family: font.family,
      size: font.size,
      color: font.color,
      weight: font.weight,
      style: font.style,
    };
    ctx.coerceContainer('textfont', base);
    const textfont = (traceOut['textfont'] ?? {}) as Record<string, unknown>;
    const inherited = {
      family: textfont['family'],
      size: textfont['size'],
      color: textfont['color'],
      weight: textfont['weight'],
      style: textfont['style'],
    };
    // Inside labels contrast with the bar unless the user picked a text color.
    const userColor =
      (traceIn['textfont'] as { color?: unknown } | undefined)?.color !== undefined ||
      (ctx.template?.['textfont'] as { color?: unknown } | undefined)?.color !== undefined;
    ctx.coerceContainer(
      'insidetextfont',
      userColor ? inherited : { ...inherited, color: undefined },
    );
    ctx.coerceContainer('outsidetextfont', inherited);
    ctx.coerce('insidetextanchor');
    ctx.coerce('textangle');
    ctx.coerce('constraintext');
    ctx.coerce('cliponaxis');
  }

  const markerIn = objectAt(traceIn, 'marker');
  ctx.coerce('marker.color', ctx.defaultColor);
  if (hasColorscale(markerIn)) {
    supplyColorscaleDefaults(markerIn, ctx.coerce, 'marker.', { inTrace: true, showscale: true });
  }
  ctx.coerce('marker.opacity');
  ctx.coerce('marker.cornerradius');
  ctx.coerce('marker.line.color', DEFAULT_LINE);
  const lineIn = objectAt(markerIn, 'line');
  if (hasColorscale(lineIn)) {
    supplyColorscaleDefaults(lineIn, ctx.coerce, 'marker.line.', {
      inTrace: true,
      showscale: false,
    });
  }
  ctx.coerce('marker.line.width');

  // Error bars default to the outline color (Plotly), y first so x can copy its style.
  const lineColor = (traceOut['marker'] as { line?: { color?: unknown } } | undefined)?.line?.color;
  const defaultColor = typeof lineColor === 'string' ? lineColor : DEFAULT_LINE;
  supplyErrorBarDefaults(traceIn, traceOut, ctx, 'y', { defaultColor });
  supplyErrorBarDefaults(traceIn, traceOut, ctx, 'x', { defaultColor, inherit: 'y' });

  for (const which of ['selected', 'unselected']) {
    ctx.coerce(`${which}.marker.color`);
    ctx.coerce(`${which}.marker.opacity`);
    ctx.coerce(`${which}.textfont.color`);
  }
}

/** The position axis id of a (defaulted) bar trace. */
export function positionAxisId(trace: FullTrace): string {
  return String(trace['orientation'] === 'h' ? trace['yaxis'] : trace['xaxis']);
}

/** Key of an alignment group in {@link BAR_ALIGNMENT_KEY}. */
export function alignmentKey(axisId: string, orientation: string, alignmentgroup: string): string {
  return `${axisId}|${orientation}|${alignmentgroup}`;
}

/**
 * Layout defaults for bars: record, per position axis, orientation and alignment group, the
 * `offsetgroup`s in trace order. Cross-trace calc runs per subplot, so this is how grouped bars on
 * different subplots sharing a position axis agree on their slots (Plotly's `_alignmentOpts`).
 */
export function supplyBarLayoutDefaults(
  layoutIn: Readonly<Record<string, unknown>>,
  layoutOut: FullLayout,
  ctx: LayoutDefaultsContext,
): void {
  const groups: Record<string, string[]> = {};
  for (const trace of ctx.fullData) {
    if (!isBarLike(trace) || trace.visible !== true) continue;
    const offsetgroup = trace['offsetgroup'];
    if (typeof offsetgroup !== 'string' || offsetgroup === '') continue;
    const key = alignmentKey(
      positionAxisId(trace),
      String(trace['orientation']),
      String(trace['alignmentgroup'] ?? ''),
    );
    const list = (groups[key] ??= []);
    if (!list.includes(offsetgroup)) list.push(offsetgroup);
  }
  layoutOut[BAR_ALIGNMENT_KEY] = groups;
  if (ctx.fullData.some((t) => t.type === 'histogram' && t.visible === true)) {
    supplyHistogramBargap(layoutIn, layoutOut, ctx);
  }
}

/** Whether a trace stacks and groups with bars (its module lists `bar-like`: bar, histogram…). */
export function isBarLike(trace: FullTrace): boolean {
  return trace._module?.categories.includes('bar-like') === true;
}

/**
 * Plotly's gapless histograms: with a visible histogram on a non-category position axis,
 * `bargap` defaults to 0, unless `barmode: 'group'` puts two bar-like traces on one subplot.
 * Axis types are not defaulted yet at this point, so the position axis counts as categorical when
 * its `type` says so or, when automatic, when the histogram's samples look categorical.
 */
function supplyHistogramBargap(
  layoutIn: Readonly<Record<string, unknown>>,
  layoutOut: FullLayout,
  ctx: LayoutDefaultsContext,
): void {
  let gapless = false;
  let gapped = false;
  const used = new Set<string>();
  const group = layoutOut['barmode'] === 'group';
  for (const trace of ctx.fullData) {
    if (!isBarLike(trace) || trace.visible === false) continue;
    const subplot = `${String(trace['xaxis'])}${String(trace['yaxis'])}`;
    if (group) {
      if (used.has(subplot)) gapped = true;
      used.add(subplot);
    }
    if (trace.type !== 'histogram' || trace.visible !== true) continue;
    const letter = trace['orientation'] === 'h' ? 'y' : 'x';
    const id = String(trace[`${letter}axis`] ?? letter);
    const axisIn = layoutIn[`${id.charAt(0)}axis${id.slice(1)}`] as { type?: unknown } | undefined;
    const type = axisIn?.type;
    const samples = trace[letter];
    const category =
      type === 'category' ||
      ((type === undefined || type === '-') &&
        isArrayLike(samples) &&
        autoType(samples) === 'category');
    if (!category) gapless = true;
  }
  if (gapless && !gapped) ctx.coerce('bargap', 0);
}
