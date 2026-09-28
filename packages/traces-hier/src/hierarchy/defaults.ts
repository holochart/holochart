/**
 * Supply-defaults shared by the hierarchy traces (plan E13.1), following plotly.js'
 * `traces/sunburst/defaults.js` (treemap and icicle extend it) and `layout_defaults.js`.
 */
import {
  isArrayLike,
  type FullLayout,
  type FullTrace,
  type LayoutDefaultsContext,
  type TraceDefaultsContext,
} from '@mk7s/holochart-core';
import { supplyColorscaleDefaults, supplyPatternDefaults } from '@mk7s/holochart-traces-basic';
import { hierarchyHasColorscale } from './colors.ts';

function nonEmpty(v: unknown): boolean {
  return isArrayLike(v) && v.length > 0;
}

/**
 * The rows, levels and node colors of a hierarchy trace. Returns `false` (and hides the trace)
 * without both `labels` and `parents`, as Plotly. Sets `_hasColorscale`.
 */
export function supplyHierarchyDefaults(
  traceIn: Readonly<Record<string, unknown>>,
  traceOut: FullTrace,
  ctx: TraceDefaultsContext,
): boolean {
  const labels = ctx.coerce('labels');
  const parents = ctx.coerce('parents');
  if (!nonEmpty(labels) || !nonEmpty(parents)) {
    traceOut.visible = false;
    return false;
  }
  const values = ctx.coerce('values');
  if (nonEmpty(values)) ctx.coerce('branchvalues');
  else ctx.coerce('count');

  ctx.coerce('level');
  ctx.coerce('maxdepth');

  const lineWidth = ctx.coerce<number>('marker.line.width');
  if (lineWidth) ctx.coerce('marker.line.color', ctx.fullLayout.paper_bgcolor);
  ctx.coerce('marker.colors');
  const markerIn = traceIn['marker'] as Readonly<Record<string, unknown>> | undefined;
  const colorscale = hierarchyHasColorscale(traceIn);
  traceOut['_hasColorscale'] = colorscale;
  if (colorscale) {
    supplyColorscaleDefaults(markerIn, ctx.coerce, 'marker.', { inTrace: true, showscale: true });
  }
  supplyPatternDefaults(traceIn, ctx, 'marker.pattern');
  ctx.coerce('leaf.opacity', colorscale ? 1 : 0.7);
  ctx.coerce('root.color');
  ctx.coerce('sort');
  return true;
}

/**
 * Labels and their fonts (Plotly's `handleText` with `textposition: 'auto'`): `textinfo` defaults
 * to `'label'` (`'text+label'` with a `text` array); inside labels contrast with their node unless
 * a text color is set.
 */
export function supplyHierarchyTextDefaults(
  traceIn: Readonly<Record<string, unknown>>,
  traceOut: FullTrace,
  ctx: TraceDefaultsContext,
): void {
  const text = ctx.coerce('text');
  const texttemplate = ctx.coerce('texttemplate');
  if (!texttemplate) ctx.coerce('textinfo', isArrayLike(text) ? 'text+label' : 'label');

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
  // Plotly's `determineInsideTextFont` reads `_input.textfont.color`: without one, inside labels
  // contrast with their node.
  const userColor =
    (traceIn['textfont'] as { color?: unknown } | undefined)?.color !== undefined ||
    (ctx.template?.['textfont'] as { color?: unknown } | undefined)?.color !== undefined;
  ctx.coerceContainer('insidetextfont', userColor ? inherited : { ...inherited, color: undefined });
  ctx.coerceContainer('outsidetextfont', inherited);
}

/** Layout defaults of a hierarchy type: `<type>colorway` defaults to `colorway`. */
export function supplyHierarchyLayoutDefaults(
  type: string,
  layoutOut: FullLayout,
  ctx: LayoutDefaultsContext,
): void {
  ctx.coerce(`${type}colorway`, layoutOut.colorway);
  ctx.coerce(`extend${type}colors`);
}
