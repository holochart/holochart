/** `funnelarea` supply-defaults (plan E12.6), following plotly.js' `funnelarea/defaults.js`. */
import {
  isArrayLike,
  type FullLayout,
  type FullTrace,
  type LayoutDefaultsContext,
  type TraceDefaultsContext,
} from '@mk7s/holochart-core';

function isNumeric(v: unknown): boolean {
  if (typeof v === 'number') return Number.isFinite(v);
  return typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v));
}

/**
 * Plotly's `handleLabelsAndValues` (as pie): the stage count is the shorter of `labels` and
 * `values` (either may be missing, not both), and 0 when no value is positive.
 */
export function stageCount(labels: unknown, values: unknown): number {
  const n = Math.min(
    isArrayLike(labels) ? labels.length : Infinity,
    isArrayLike(values) ? values.length : Infinity,
  );
  if (!Number.isFinite(n)) return 0;
  if (!isArrayLike(values)) return n;
  for (let i = 0; i < n; i++) {
    const v = values[i];
    if (isNumeric(v) && Number(v) > 0) return n;
  }
  return 0;
}

/**
 * Supply funnelarea defaults. Sets `_length`, `_hasLabels` and `_hasValues` (as pie). `domain`
 * was coerced by core before this runs (the `domain` category).
 */
export function supplyFunnelareaDefaults(
  traceIn: Readonly<Record<string, unknown>>,
  traceOut: FullTrace,
  ctx: TraceDefaultsContext,
): void {
  const labels = ctx.coerce('labels');
  const values = ctx.coerce('values');
  traceOut['_hasLabels'] = isArrayLike(labels);
  traceOut['_hasValues'] = isArrayLike(values);
  if (!isArrayLike(labels) && isArrayLike(values)) {
    ctx.coerce('label0');
    ctx.coerce('dlabel');
  }
  const length = stageCount(labels, values);
  if (length === 0) {
    traceOut.visible = false;
    return;
  }
  traceOut['_length'] = length;

  // Outlines take the paper color by default, separating the stages (Plotly).
  if (ctx.coerce('marker.line.width')) {
    ctx.coerce('marker.line.color', ctx.fullLayout.paper_bgcolor);
  }
  ctx.coerce('marker.colors');
  ctx.coerce('scalegroup');

  const text = ctx.coerce('text');
  const texttemplate = ctx.coerce('texttemplate');
  let textinfo: unknown;
  if (!texttemplate) {
    textinfo = ctx.coerce('textinfo', isArrayLike(text) ? 'text+percent' : 'percent');
  }
  if (texttemplate || (textinfo && textinfo !== 'none')) {
    ctx.coerce('textposition');
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
    // Labels contrast with their stage unless the user picked a text color (Plotly).
    const userColor =
      (traceIn['textfont'] as { color?: unknown } | undefined)?.color !== undefined ||
      (ctx.template?.['textfont'] as { color?: unknown } | undefined)?.color !== undefined;
    ctx.coerceContainer(
      'insidetextfont',
      userColor ? inherited : { ...inherited, color: undefined },
    );
  } else if (textinfo === 'none') {
    ctx.coerce('textposition', 'none');
  }

  if (ctx.coerce<string>('title.text')) {
    ctx.coerce('title.position');
    const font = ctx.fullLayout.font;
    ctx.coerceContainer('title.font', {
      family: font.family,
      size: font.size,
      color: font.color,
      weight: font.weight,
      style: font.style,
    });
  }
  ctx.coerce('aspectratio');
  ctx.coerce('baseratio');
}

/**
 * Layout defaults (Plotly's `funnelarea/layout_defaults.js`): `hiddenlabels` (shared with pies)
 * and `funnelareacolorway`, defaulting to `colorway`.
 */
export function supplyFunnelareaLayoutDefaults(
  _layoutIn: Readonly<Record<string, unknown>>,
  layoutOut: FullLayout,
  ctx: LayoutDefaultsContext,
): void {
  ctx.coerce('hiddenlabels');
  ctx.coerce('funnelareacolorway', layoutOut.colorway);
  ctx.coerce('extendfunnelareacolors');
}
