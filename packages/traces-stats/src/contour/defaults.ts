/**
 * Contour supply-defaults shared by `histogram2dcontour` and `contour`, following plotly.js
 * `contour/contours_defaults.js`, `style_defaults.js`, `label_defaults.js` and
 * `constraint_defaults.js`.
 */
import { toRGBA, type FullTrace, type TraceDefaultsContext } from '@mk7s/holochart-core';
import { rgbaToCss } from '@mk7s/holochart-traces-basic';
import { supplyZColorscaleDefaults } from '../histogram2d/colorscale.ts';
import {
  CONSTRAINT_REDUCTION,
  constraintValue,
  type ConstraintOperation,
} from '../shared/contour-constraint.ts';

function isNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** `color` with its alpha replaced (Plotly `Color.addOpacity`). */
function withOpacity(color: string, alpha: number): string {
  const c = toRGBA(color);
  return c ? rgbaToCss([c[0], c[1], c[2], alpha]) : color;
}

/** The alpha of a CSS color (0 when it does not parse). */
function opacityOf(color: unknown): number {
  const c = typeof color === 'string' ? toRGBA(color) : null;
  return c ? c[3] : 0;
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
}

/**
 * Level labels (Plotly `handleLabelDefaults`): `labelfont` defaults to `layout.font` in the line
 * color (unset with `coloring: 'lines'`, where each label takes its line's color).
 */
function supplyLabelDefaults(ctx: TraceDefaultsContext, lineColor: string): void {
  if (!ctx.coerce<boolean>('contours.showlabels')) return;
  const font = ctx.fullLayout.font;
  ctx.coerceContainer('contours.labelfont', {
    family: font.family,
    size: font.size,
    color: lineColor || undefined,
    weight: font.weight,
    style: font.style,
  });
  ctx.coerce('contours.labelformat');
}

/** Options of {@link supplyContourStyleDefaults} and {@link supplyContourDefaults}. @internal */
export interface ContourStyleOptions {
  /**
   * Default of `autocolorscale`: true for `histogram2dcontour` (Plotly's `colorscaleDefaults`
   * without `autoColorDflt: false`), false for `contour`.
   */
  readonly autoColorscale: boolean;
}

/**
 * Coloring, lines, colorscale and labels of level contours (Plotly contour `handleStyleDefaults`
 * + `handleLabelDefaults`).
 */
export function supplyContourStyleDefaults(
  traceIn: Readonly<Record<string, unknown>>,
  traceOut: FullTrace,
  ctx: TraceDefaultsContext,
  options: ContourStyleOptions = { autoColorscale: true },
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
    supplyZColorscaleDefaults(traceIn, ctx.coerce, ctx.template, options.autoColorscale);
  } else if (traceIn['showlegend'] === undefined) {
    // Plain lines: shown in the legend like a line trace.
    traceOut['showlegend'] = true;
  }
  ctx.coerce('line.smoothing');
  supplyLabelDefaults(ctx, lineColor);
}

/**
 * Constraint contours (Plotly `handleConstraintDefaults`): the operation and its value (a number,
 * or a `[lo, hi]` pair for intervals), the shading (`fillcolor`, half-transparent line or trace
 * color by default; none for `=`), 2 px lines in the opaque fill color, and labels.
 */
export function supplyConstraintDefaults(
  traceIn: Readonly<Record<string, unknown>>,
  traceOut: FullTrace,
  ctx: TraceDefaultsContext,
): void {
  const op = ctx.coerce<ConstraintOperation>('contours.operation');
  const contours = traceOut['contours'] as Record<string, unknown>;
  contours['value'] = constraintValue(op, ctx.coerce('contours.value'));
  let showLines = true;
  let fillColor: string | undefined;
  if (CONSTRAINT_REDUCTION[op] === '=') {
    contours['showlines'] = true;
  } else {
    showLines = ctx.coerce<boolean>('contours.showlines');
    const lineIn = (traceIn['line'] ?? {}) as Record<string, unknown>;
    const base = typeof lineIn['color'] === 'string' ? lineIn['color'] : ctx.defaultColor;
    fillColor = ctx.coerce<string>('fillcolor', withOpacity(base, 0.5));
  }
  let lineColor = '';
  if (showLines) {
    const lineDflt =
      fillColor !== undefined && opacityOf(fillColor) > 0
        ? withOpacity(fillColor, 1)
        : ctx.defaultColor;
    lineColor = ctx.coerce<string>('line.color', lineDflt);
    ctx.coerce('line.width', 2);
    ctx.coerce('line.dash');
  }
  ctx.coerce('line.smoothing');
  supplyLabelDefaults(ctx, lineColor);
}

/**
 * Every contour attribute: `contours.type`, then the levels and their style, or the constraint.
 * Returns the type.
 * @internal
 */
export function supplyContourDefaults(
  traceIn: Readonly<Record<string, unknown>>,
  traceOut: FullTrace,
  ctx: TraceDefaultsContext,
  options: ContourStyleOptions,
): 'levels' | 'constraint' {
  const type = ctx.coerce<'levels' | 'constraint'>('contours.type');
  if (type === 'constraint') {
    supplyConstraintDefaults(traceIn, traceOut, ctx);
    return type;
  }
  supplyContourLevelDefaults(traceIn, traceOut, ctx);
  supplyContourStyleDefaults(traceIn, traceOut, ctx, options);
  return type;
}
