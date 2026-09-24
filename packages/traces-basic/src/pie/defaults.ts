/** `pie` supply-defaults (plan E9.11), following plotly.js' `traces/pie/defaults.js`. */
import {
  isArrayLike,
  type FullLayout,
  type FullTrace,
  type LayoutDefaultsContext,
  type TraceDefaultsContext,
} from '@mk7s/holochart-core';
import { isNumeric } from './helpers.ts';

/**
 * Plotly's `handleLabelsAndValues`: the slice count is the shorter of `labels` and `values` (either
 * may be missing, not both), and 0 when no value is positive.
 */
export function labelsAndValues(
  labels: unknown,
  values: unknown,
): { hasLabels: boolean; hasValues: boolean; length: number } {
  const hasLabels = isArrayLike(labels);
  const hasValues = isArrayLike(values);
  let length = Math.min(
    hasLabels ? (labels as ArrayLike<unknown>).length : Infinity,
    hasValues ? (values as ArrayLike<unknown>).length : Infinity,
  );
  if (!Number.isFinite(length)) length = 0;
  if (length > 0 && hasValues) {
    let positive = false;
    for (let i = 0; i < length; i++) {
      const v = (values as ArrayLike<unknown>)[i];
      if (isNumeric(v) && Number(v) > 0) {
        positive = true;
        break;
      }
    }
    if (!positive) length = 0;
  }
  return { hasLabels, hasValues, length };
}

/**
 * Supply pie defaults. Sets `_length` (data points considered), `_hasLabels` and `_hasValues`.
 * `domain` was coerced by core before this runs (the `domain` category).
 */
export function supplyPieDefaults(
  traceIn: Readonly<Record<string, unknown>>,
  traceOut: FullTrace,
  ctx: TraceDefaultsContext,
): void {
  const labels = ctx.coerce('labels');
  const values = ctx.coerce('values');
  const { hasLabels, hasValues, length } = labelsAndValues(labels, values);
  traceOut['_hasLabels'] = hasLabels;
  traceOut['_hasValues'] = hasValues;
  if (!hasLabels && hasValues) {
    ctx.coerce('label0');
    ctx.coerce('dlabel');
  }
  if (length === 0) {
    traceOut.visible = false;
    return;
  }
  traceOut['_length'] = length;

  const lineWidth = ctx.coerce('marker.line.width');
  if (lineWidth) ctx.coerce('marker.line.color');
  ctx.coerce('marker.colors');

  ctx.coerce('scalegroup');

  const text = ctx.coerce('text');
  const texttemplate = ctx.coerce('texttemplate');
  let textinfo: unknown;
  if (!texttemplate)
    textinfo = ctx.coerce('textinfo', isArrayLike(text) ? 'text+percent' : 'percent');

  if (texttemplate || (textinfo && textinfo !== 'none')) {
    const textposition = ctx.coerce('textposition');
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
    // Inside labels contrast with the slice unless the user picked a text color (Plotly's
    // `determineInsideTextFont` reads `_input.textfont.color`).
    const userColor =
      (traceIn['textfont'] as { color?: unknown } | undefined)?.color !== undefined ||
      (ctx.template?.['textfont'] as { color?: unknown } | undefined)?.color !== undefined;
    ctx.coerceContainer(
      'insidetextfont',
      userColor ? inherited : { ...inherited, color: undefined },
    );
    ctx.coerceContainer('outsidetextfont', inherited);
    if (textposition === 'inside' || textposition === 'auto' || isArrayLike(textposition)) {
      ctx.coerce('insidetextorientation');
    }
  } else if (textinfo === 'none') {
    ctx.coerce('textposition', 'none');
  }

  const hole = ctx.coerce<number>('hole');
  const title = ctx.coerce<string>('title.text');
  if (title) {
    const position = ctx.coerce<string>('title.position', hole ? 'middle center' : 'top center');
    if (!hole && position === 'middle center') {
      (traceOut['title'] as Record<string, unknown>)['position'] = 'top center';
    }
    const font = ctx.fullLayout.font;
    ctx.coerceContainer('title.font', {
      family: font.family,
      size: font.size,
      color: font.color,
      weight: font.weight,
      style: font.style,
    });
  }

  ctx.coerce('sort');
  ctx.coerce('direction');
  ctx.coerce('rotation');
  ctx.coerce('pull');
}

/** Layout defaults for pies (Plotly's `layout_defaults.js`): `piecolorway` defaults to `colorway`. */
export function supplyPieLayoutDefaults(
  _layoutIn: Readonly<Record<string, unknown>>,
  layoutOut: FullLayout,
  ctx: LayoutDefaultsContext,
): void {
  ctx.coerce('hiddenlabels');
  ctx.coerce('piecolorway', layoutOut.colorway);
  ctx.coerce('extendpiecolors');
}
