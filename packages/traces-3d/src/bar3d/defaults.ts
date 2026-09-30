/**
 * `bar3d` supply-defaults (plan E14.9): `x`, `y` and `z` must be non-empty arrays (else the trace
 * is hidden; lengths may differ, calc uses the shortest). The marker color defaults to the
 * colorway; with a colorscale requested (`marker.colorscale`, `cmin` / `cmax`, `showscale`, a
 * colorbar or `marker.coloraxis`) and no color array, it is `z` (bars colored by height).
 */
import { isArrayLike, type FullTrace, type TraceDefaultsContext } from '@mk7s/holochart-core';
import { hasColorscale, supplyColorscaleDefaults } from '@mk7s/holochart-traces-basic';
import { supplySceneLightingDefaults } from '../scene/lighting-attributes.ts';

type Container = Readonly<Record<string, unknown>>;

function objectAt(v: unknown, key: string): Container | undefined {
  if (v === null || typeof v !== 'object') return undefined;
  const c = (v as Container)[key];
  return c !== null && typeof c === 'object' && !Array.isArray(c) ? (c as Container) : undefined;
}

/** Supply `bar3d` defaults. */
export function supplyBar3dDefaults(
  traceIn: Container,
  traceOut: FullTrace,
  ctx: TraceDefaultsContext,
): void {
  ctx.coerce('scene');
  for (const k of ['x', 'y', 'z']) {
    const v = ctx.coerce(k);
    if (!isArrayLike(v) || v.length === 0) {
      traceOut.visible = false;
      return;
    }
  }
  ctx.coerce('base');
  ctx.coerce('width');
  ctx.coerce('depth');
  ctx.coerce('stackgroup');
  const markerIn = objectAt(traceIn, 'marker');
  const byZ =
    !isArrayLike(markerIn?.['color']) &&
    (hasColorscale(markerIn) || typeof markerIn?.['coloraxis'] === 'string');
  ctx.coerce('marker.color', byZ ? traceOut['z'] : ctx.defaultColor);
  if (byZ || hasColorscale(markerIn)) {
    supplyColorscaleDefaults(markerIn, ctx.coerce, 'marker.', { inTrace: true, showscale: true });
  }
  ctx.coerce('marker.opacity');
  if (ctx.coerce<number>('marker.line.width') > 0) ctx.coerce('marker.line.color');
  supplySceneLightingDefaults(ctx);
  ctx.coerce('text');
  for (const k of ['x', 'y', 'z']) ctx.coerce(`${k}hoverformat`);
}
