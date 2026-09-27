/**
 * `heatmap` supply-defaults (plan E11.1), following plotly.js `heatmap/defaults.js`,
 * `xy_defaults.js`, `style_defaults.js` and `label_defaults.js`: a 2D `z` needs at least one
 * numeric cell, a 1D `z` needs `x` and `y` columns; `x0` / `dx` are coerced only when `x` does not
 * place the cells (`xtype: 'scaled'`), gaps only without `zsmooth`.
 */
import { isArrayLike, type FullTrace, type TraceDefaultsContext } from '@mk7s/holochart-core';
import { supplyCellTextDefaults, supplyZColorscaleDefaults } from '@mk7s/holochart-traces-stats';

function lengthOf(v: unknown): number {
  return isArrayLike(v) ? (v as ArrayLike<unknown>).length : 0;
}

/** Plotly's `isNumeric` (fast-isnumeric): finite numbers and numeric strings. */
export function isNumericValue(v: unknown): boolean {
  if (typeof v === 'number') return Number.isFinite(v);
  if (typeof v !== 'string' || v.trim() === '') return false;
  return Number.isFinite(Number(v));
}

/** Whether `z` is 1D (column data): its first entry is not an array (Plotly `isArray1D`). */
export function isColumnZ(z: unknown): boolean {
  return isArrayLike(z) && !isArrayLike((z as ArrayLike<unknown>)[0]);
}

/** Plotly's `isValidZ`: every row an array, one row non-empty, one numeric cell. */
export function isValidZ(z: ArrayLike<unknown>): boolean {
  let filled = false;
  let numeric = false;
  for (let i = 0; i < z.length; i++) {
    const row = z[i];
    if (!isArrayLike(row)) return false;
    const r = row as ArrayLike<unknown>;
    if (r.length > 0) filled = true;
    if (numeric) continue;
    for (let j = 0; j < r.length; j++) {
      if (isNumericValue(r[j])) {
        numeric = true;
        break;
      }
    }
  }
  return filled && numeric;
}

/** A coordinate of a 2D `z` (Plotly `coordDefaults`): `x` places the cells, else `x0` / `dx`. */
function coordinateDefaults(ctx: TraceDefaultsContext, letter: 'x' | 'y'): void {
  const coord = ctx.coerce(letter);
  const type = lengthOf(coord) > 0 ? ctx.coerce<string>(`${letter}type`, 'array') : 'scaled';
  if (type === 'scaled') {
    ctx.coerce(`${letter}0`);
    ctx.coerce(`d${letter}`);
  }
}

/**
 * The grid (Plotly `handleXYZDefaults`). Returns false (and hides the trace) without a usable
 * `z`.
 */
export function supplyGridDefaults(traceOut: FullTrace, ctx: TraceDefaultsContext): boolean {
  const z = ctx.coerce('z');
  if (lengthOf(z) === 0) return false;
  if (isColumnZ(z)) {
    const nx = lengthOf(ctx.coerce('x'));
    const ny = lengthOf(ctx.coerce('y'));
    // Column z needs x and y columns.
    if (nx === 0 || ny === 0) return false;
    traceOut['_length'] = Math.min(nx, ny, lengthOf(z));
    return true;
  }
  coordinateDefaults(ctx, 'x');
  coordinateDefaults(ctx, 'y');
  if (!isValidZ(z as ArrayLike<unknown>)) return false;
  ctx.coerce('transpose');
  traceOut['_length'] = null;
  return true;
}

/** Supply `heatmap` defaults. */
export function supplyHeatmapDefaults(
  traceIn: Readonly<Record<string, unknown>>,
  traceOut: FullTrace,
  ctx: TraceDefaultsContext,
): void {
  if (!supplyGridDefaults(traceOut, ctx)) {
    traceOut.visible = false;
    return;
  }
  ctx.coerce('xhoverformat');
  ctx.coerce('yhoverformat');
  ctx.coerce('text');
  ctx.coerce('hovertext');
  supplyCellTextDefaults(ctx);
  const zsmooth = ctx.coerce('zsmooth');
  if (zsmooth === false) {
    ctx.coerce('xgap');
    ctx.coerce('ygap');
  }
  ctx.coerce('zhoverformat');
  ctx.coerce('hoverongaps');
  ctx.coerce('connectgaps', isColumnZ(traceOut['z']) && zsmooth !== false);
  supplyZColorscaleDefaults(traceIn, ctx.coerce, ctx.template);
  ctx.coerce('zorder');
  // Shown in the legend only on request: the colorbar describes heatmaps (Plotly).
  if (traceIn['showlegend'] !== true) traceOut['showlegend'] = false;
}
