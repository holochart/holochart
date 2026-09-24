/**
 * `histogram2d` supply-defaults (plan E10.2), following plotly.js `histogram2d/defaults.js`,
 * `sample_defaults.js`, `heatmap/style_defaults.js` and `heatmap/label_defaults.js`. The binning
 * attributes are coerced here too (Plotly does it in `crossTraceDefaults`); the automatic values
 * are resolved in calc, where the samples of every trace of a bin group are known.
 */
import { isArrayLike, type FullTrace, type TraceDefaultsContext } from '@mk7s/holochart-core';
import { supplyZColorscaleDefaults } from './colorscale.ts';

function lengthOf(v: unknown): number {
  return isArrayLike(v) ? (v as ArrayLike<unknown>).length : 0;
}

/**
 * Samples, aggregation and binning (Plotly `handleSampleDefaults` + the bin attributes). Returns
 * false (and hides the trace) without both `x` and `y`.
 */
export function supplySampleDefaults(
  traceIn: Readonly<Record<string, unknown>>,
  traceOut: FullTrace,
  ctx: TraceDefaultsContext,
): boolean {
  const nx = lengthOf(ctx.coerce('x'));
  const ny = lengthOf(ctx.coerce('y'));
  if (nx === 0 || ny === 0) {
    traceOut.visible = false;
    return false;
  }
  traceOut['_length'] = Math.min(nx, ny);
  // `marker.color` stands in for `z` (a colored scatter turned into a 2D histogram).
  const hasAggregation = lengthOf(ctx.coerce('z')) > 0 || lengthOf(ctx.coerce('marker.color')) > 0;
  if (hasAggregation) ctx.coerce('histfunc');
  else traceOut['histfunc'] = 'count';
  ctx.coerce('histnorm');
  ctx.coerce('autobinx');
  ctx.coerce('autobiny');
  for (const letter of ['x', 'y'] as const) {
    ctx.coerce(`nbins${letter}`);
    ctx.coerce(`${letter}bins.start`);
    ctx.coerce(`${letter}bins.end`);
    ctx.coerce(`${letter}bins.size`);
  }
  const bingroup = ctx.coerce<string>('bingroup');
  ctx.coerce('xbingroup', bingroup ? `${bingroup}__x` : '');
  ctx.coerce('ybingroup', bingroup ? `${bingroup}__y` : '');
  ctx.coerce('xhoverformat');
  ctx.coerce('yhoverformat');
  ctx.coerce('zhoverformat');
  // Shown in the legend only on request: the colorbar describes these traces (Plotly).
  if (traceIn['showlegend'] !== true) traceOut['showlegend'] = false;
  return true;
}

/** Cell labels (Plotly `handleHeatmapLabelDefaults`): the font inherits `layout.font`. */
export function supplyCellTextDefaults(ctx: TraceDefaultsContext): void {
  const texttemplate = ctx.coerce<string>('texttemplate');
  if (!texttemplate) return;
  const font = ctx.fullLayout.font;
  ctx.coerceContainer('textfont', {
    family: font.family,
    weight: font.weight,
    style: font.style,
  });
}

/** Supply `histogram2d` defaults. */
export function supplyHistogram2dDefaults(
  traceIn: Readonly<Record<string, unknown>>,
  traceOut: FullTrace,
  ctx: TraceDefaultsContext,
): void {
  if (!supplySampleDefaults(traceIn, traceOut, ctx)) return;
  const zsmooth = ctx.coerce('zsmooth');
  if (zsmooth === false) {
    ctx.coerce('xgap');
    ctx.coerce('ygap');
  }
  ctx.coerce('zorder');
  supplyZColorscaleDefaults(traceIn, ctx.coerce, ctx.template);
  supplyCellTextDefaults(ctx);
}
