/**
 * `mesh3d` supply-defaults (plan E14.4), following plotly.js `mesh3d/defaults.js`: `x`, `y`, `z`
 * must be arrays of one length and `i`, `j`, `k` all given or none (else the trace is hidden);
 * the colors follow Plotly's precedence — `intensity` (with the colorscale attributes), else
 * `facecolor`, else `vertexcolor`, else `color` (the colorway color) — and only the winner is
 * coerced; `contour.color` / `width` only with `contour.show`. Mesh traces are left out of the
 * legend unless asked (`showlegend: true`), as in Plotly.
 */
import { isArrayLike, type FullTrace, type TraceDefaultsContext } from '@mk7s/holochart-core';
import { supplyColorscaleDefaults } from '@mk7s/holochart-traces-basic';
import { supplySceneLightingDefaults } from '../scene/lighting-attributes.ts';

/** Coerce equal-length arrays at `keys`; false unless all are arrays of one length. */
function arrays(ctx: TraceDefaultsContext, keys: readonly string[]): boolean {
  const values = keys.map((k) => ctx.coerce(k));
  return values.every(
    (v) => isArrayLike(v) && v.length === (values[0] as ArrayLike<unknown>).length,
  );
}

/** Supply `mesh3d` defaults. */
export function supplyMesh3dDefaults(
  traceIn: Readonly<Record<string, unknown>>,
  traceOut: FullTrace,
  ctx: TraceDefaultsContext,
): void {
  ctx.coerce('scene');
  if (!arrays(ctx, ['x', 'y', 'z'])) {
    traceOut.visible = false;
    return;
  }
  arrays(ctx, ['i', 'j', 'k']);
  const given = ['i', 'j', 'k'].filter((k) => isArrayLike(traceOut[k])).length;
  if (given > 0 && given < 3) {
    traceOut.visible = false;
    return;
  }
  supplySceneLightingDefaults(ctx);
  ctx.coerce('flatshading');
  ctx.coerce('alphahull');
  ctx.coerce('delaunayaxis');
  if (ctx.coerce<boolean>('contour.show')) {
    ctx.coerce('contour.color');
    ctx.coerce('contour.width');
  }
  if ('intensity' in traceIn && isArrayLike(ctx.coerce('intensity'))) {
    ctx.coerce('intensitymode');
    supplyColorscaleDefaults(traceIn, ctx.coerce, '', { inTrace: true, showscale: true });
  } else {
    traceOut['showscale'] = false;
    if ('facecolor' in traceIn) ctx.coerce('facecolor');
    else if ('vertexcolor' in traceIn) ctx.coerce('vertexcolor');
    else ctx.coerce('color', ctx.defaultColor);
  }
  ctx.coerce('text');
  ctx.coerce('xhoverformat');
  ctx.coerce('yhoverformat');
  ctx.coerce('zhoverformat');
  // Shown in the legend only on request (Plotly's `showlegend` default for mesh3d).
  if (traceIn['showlegend'] !== true) traceOut['showlegend'] = false;
}
