/**
 * Supply-defaults shared by `waterfall` and `funnel` (plotly.js `scatter/xy_defaults.js`,
 * `scatter/period_defaults.js`, bar's `handleText` and `scatter/grouping_defaults.js`): the
 * coordinates and their count, period alignment, label styles, and per layout the offset groups of
 * each alignment group, so grouped bars line up across subplots.
 */
import {
  isArrayLike,
  type FullLayout,
  type FullTrace,
  type LayoutDefaultsContext,
  type TraceDefaultsContext,
} from '@mk7s/holochart-core';

function lengthOf(v: unknown): number | undefined {
  return isArrayLike(v) ? v.length : undefined;
}

/**
 * Plotly's `handleXYDefaults`: coerce `x` and `y` (and `x0`/`dx` or `y0`/`dy` for a missing one)
 * and set `_length`. Returns the bar count, 0 without data.
 */
export function supplyCoordinates(traceOut: FullTrace, ctx: TraceDefaultsContext): number {
  const nx = lengthOf(ctx.coerce('x'));
  const ny = lengthOf(ctx.coerce('y'));
  let length: number;
  if (nx !== undefined) {
    length = ny !== undefined ? Math.min(nx, ny) : nx;
    if (ny === undefined) {
      ctx.coerce('y0');
      ctx.coerce('dy');
    }
  } else {
    if (ny === undefined) return 0;
    length = ny;
    ctx.coerce('x0');
    ctx.coerce('dx');
  }
  if (length === 0) return 0;
  traceOut['_length'] = length;
  // Plotly's `handlePeriodDefaults` (both letters, as bar): `period0` / `periodalignment` only
  // matter with a period.
  for (const letter of ['x', 'y'] as const) {
    if (ctx.coerce(`${letter}period`) === undefined) continue;
    ctx.coerce(`${letter}period0`);
    ctx.coerce(`${letter}periodalignment`);
  }
  return length;
}

/** Whether any bar may show a label (`textposition` is not `'none'` everywhere). */
export function mayShowText(textposition: unknown): boolean {
  return isArrayLike(textposition) || textposition !== 'none';
}

/**
 * Label styles when some bar may show a label (bar's `handleText`): `textfont` from
 * `layout.font`, `insidetextfont` (its color left to contrast with the bar unless the user set
 * one) and `outsidetextfont` from it, `insidetextanchor`, `textangle`, `constraintext`,
 * `cliponaxis`. Returns the `textposition`.
 */
export function supplyTextDefaults(
  traceIn: Readonly<Record<string, unknown>>,
  traceOut: FullTrace,
  ctx: TraceDefaultsContext,
): unknown {
  const textposition = ctx.coerce('textposition');
  if (!mayShowText(textposition)) return textposition;
  const font = ctx.fullLayout.font;
  ctx.coerceContainer('textfont', {
    family: font.family,
    size: font.size,
    color: font.color,
    weight: font.weight,
    style: font.style,
  });
  const textfont = (traceOut['textfont'] ?? {}) as Record<string, unknown>;
  const inherited = {
    family: textfont['family'],
    size: textfont['size'],
    color: textfont['color'],
    weight: textfont['weight'],
    style: textfont['style'],
  };
  const userColor =
    (traceIn['textfont'] as { color?: unknown } | undefined)?.color !== undefined ||
    (ctx.template?.['textfont'] as { color?: unknown } | undefined)?.color !== undefined;
  ctx.coerceContainer('insidetextfont', userColor ? inherited : { ...inherited, color: undefined });
  ctx.coerceContainer('outsidetextfont', inherited);
  ctx.coerce('insidetextanchor');
  ctx.coerce('textangle');
  ctx.coerce('constraintext');
  ctx.coerce('cliponaxis');
  return textposition;
}

/** Private `fullLayout` key of a type's offset groups per alignment group (see below). */
export function alignmentKeyOf(type: string): string {
  return `_${type}Alignment`;
}

/** The position axis id of a (defaulted) bar-like trace. */
export function positionAxisId(trace: FullTrace): string {
  return String(trace['orientation'] === 'h' ? trace['yaxis'] : trace['xaxis']);
}

/** Key of an alignment group: position axis, orientation and `alignmentgroup`. */
export function alignmentKey(axisId: string, orientation: string, alignmentgroup: string): string {
  return `${axisId}|${orientation}|${alignmentgroup}`;
}

/**
 * Record, per position axis, orientation and alignment group, the `offsetgroup`s of the visible
 * traces of `type` in trace order (Plotly's `_alignmentOpts`), so grouped bars on subplots
 * sharing a position axis agree on their slots.
 */
export function supplyAlignmentGroups(
  type: string,
  layoutOut: FullLayout,
  ctx: LayoutDefaultsContext,
): void {
  const groups: Record<string, string[]> = {};
  for (const trace of ctx.fullData) {
    if (trace.type !== type || trace.visible !== true) continue;
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
  layoutOut[alignmentKeyOf(type)] = groups;
}
