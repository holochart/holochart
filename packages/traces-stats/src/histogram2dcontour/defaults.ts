/**
 * `histogram2dcontour` supply-defaults (plan E10.3), following plotly.js
 * `histogram2dcontour/defaults.js` with `contour/contours_defaults.js`, `style_defaults.js` and
 * `label_defaults.js`.
 */
import type { FullTrace, TraceDefaultsContext } from '@mk7s/holochart-core';
import { supplyZColorscaleDefaults } from '../histogram2d/colorscale.ts';
import { supplyCellTextDefaults, supplySampleDefaults } from '../histogram2d/defaults.ts';

function isNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Levels (Plotly `handleContourDefaults`): without both `contours.start` and `contours.end` the
 * levels are automatic; `ncontours` matters when they are, or when `contours.size` is missing.
 */
export function supplyContourLevelDefaults(
  traceIn: Readonly<Record<string, unknown>>,
  traceOut: FullTrace,
  ctx: TraceDefaultsContext,
): void {
  const contoursIn = (traceIn['contours'] ?? {}) as Record<string, unknown>;
  const tmpl = (ctx.template?.['contours'] ?? {}) as Record<string, unknown>;
  const given = (key: string): boolean => isNumber(contoursIn[key]) || isNumber(tmpl[key]);
  const missingEnd = !given('start') || !given('end');
  if (given('start')) ctx.coerce('contours.start');
  if (given('end')) ctx.coerce('contours.end');
  const size = ctx.coerce<number | undefined>('contours.size');
  let auto: boolean;
  if (missingEnd) auto = traceOut['autocontour'] = true;
  else auto = ctx.coerce<boolean>('autocontour', false);
  if (auto || !(isNumber(size) && size > 0)) ctx.coerce('ncontours');
  ctx.coerce('contours.type');
}

/**
 * Coloring, lines, colorscale and labels (Plotly contour `handleStyleDefaults` +
 * `handleLabelDefaults`).
 */
export function supplyContourStyleDefaults(
  traceIn: Readonly<Record<string, unknown>>,
  traceOut: FullTrace,
  ctx: TraceDefaultsContext,
): void {
  const coloring = ctx.coerce<string>('contours.coloring');
  let showLines = true;
  let lineColor = '';
  if (coloring === 'fill') showLines = ctx.coerce<boolean>('contours.showlines');
  if (showLines) {
    if (coloring !== 'lines') lineColor = ctx.coerce<string>('line.color', '#000');
    ctx.coerce('line.width');
    ctx.coerce('line.dash');
  }
  if (coloring !== 'none') {
    // A colorbar describes the levels instead of a legend entry (Plotly).
    if (traceIn['showlegend'] !== true) traceOut['showlegend'] = false;
    supplyZColorscaleDefaults(traceIn, ctx.coerce, ctx.template, true);
  } else if (traceIn['showlegend'] === undefined) {
    // Plain lines: shown in the legend like a line trace (sample defaults hid it).
    traceOut['showlegend'] = true;
  }
  ctx.coerce('line.smoothing');
  if (ctx.coerce<boolean>('contours.showlabels')) {
    const font = ctx.fullLayout.font;
    ctx.coerceContainer('contours.labelfont', {
      family: font.family,
      size: font.size,
      // Unset with `coloring: 'lines'`: each label takes its line's color.
      color: lineColor || undefined,
      weight: font.weight,
      style: font.style,
    });
    ctx.coerce('contours.labelformat');
  }
}

/** Supply `histogram2dcontour` defaults. */
export function supplyHistogram2dContourDefaults(
  traceIn: Readonly<Record<string, unknown>>,
  traceOut: FullTrace,
  ctx: TraceDefaultsContext,
): void {
  if (!supplySampleDefaults(traceIn, traceOut, ctx)) return;
  supplyContourLevelDefaults(traceIn, traceOut, ctx);
  supplyContourStyleDefaults(traceIn, traceOut, ctx);
  ctx.coerce('zorder');
  const contours = traceOut['contours'] as { coloring?: unknown } | undefined;
  if (contours?.coloring === 'heatmap') supplyCellTextDefaults(ctx);
}
