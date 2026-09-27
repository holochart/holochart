/**
 * `image` supply-defaults (plan E11.3), following plotly.js `image/defaults.js`: `source` only as
 * a base64 data URI; `z` needs a first row with pixels; without either the trace is hidden. With
 * `z`, `colormodel` defaults to `'rgb'` and `zmin` / `zmax` to the model's range (each missing
 * component filled from it); a `source` is always `'rgba256'` at its full range.
 */
import { isArrayLike, type FullTrace, type TraceDefaultsContext } from '@mk7s/holochart-core';
import { COLORMODELS, type Colormodel } from './colormodel.ts';
import { isImageDataUri } from './source.ts';

/** Whether `z` has pixels: a first row with at least one entry (Plotly's `_hasZ`). */
export function hasPixels(z: unknown): boolean {
  if (!isArrayLike(z) || (z as ArrayLike<unknown>).length === 0) return false;
  const row = (z as ArrayLike<unknown>)[0];
  return isArrayLike(row) && (row as ArrayLike<unknown>).length > 0;
}

/** A component range: numbers from `v` where given, else the default's. */
function componentRange(v: unknown, dflt: readonly number[], channels: number): number[] {
  const given = Array.isArray(v) ? (v as unknown[]) : [];
  return Array.from({ length: channels }, (_, k) => {
    const c = given[k];
    return typeof c === 'number' && Number.isFinite(c) ? c : dflt[k]!;
  });
}

/** Supply `image` defaults. */
export function supplyImageDefaults(
  _traceIn: Readonly<Record<string, unknown>>,
  traceOut: FullTrace,
  ctx: TraceDefaultsContext,
): void {
  const source = ctx.coerce('source');
  // Only data URIs (Plotly sanitizes `source` to them).
  if (source !== undefined && !isImageDataUri(source)) delete traceOut['source'];
  const hasSource = traceOut['source'] !== undefined;
  const hasZ = hasPixels(ctx.coerce('z'));
  if (!hasZ && !hasSource) {
    traceOut.visible = false;
    return;
  }
  if (!hasZ) delete traceOut['z'];
  ctx.coerce('x0');
  ctx.coerce('y0');
  ctx.coerce('dx');
  ctx.coerce('dy');
  let model: Colormodel;
  if (hasZ) {
    model = ctx.coerce<Colormodel>('colormodel', 'rgb');
    const spec = COLORMODELS[model];
    traceOut['zmin'] = componentRange(ctx.coerce('zmin', spec.zmin), spec.zmin, spec.channels);
    traceOut['zmax'] = componentRange(ctx.coerce('zmax', spec.zmax), spec.zmax, spec.channels);
  } else {
    model = 'rgba256';
    traceOut['colormodel'] = model;
    traceOut['zmin'] = [...COLORMODELS[model].zmin];
    traceOut['zmax'] = [...COLORMODELS[model].zmax];
  }
  ctx.coerce('zsmooth');
  ctx.coerce('text');
  ctx.coerce('hovertext');
  ctx.coerce('zorder');
  traceOut['_length'] = null;
  // Images have no legend entry (Plotly: not a `showLegend` trace).
  traceOut['showlegend'] = false;
}
