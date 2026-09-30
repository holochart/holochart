/**
 * The colorscale of a `surface` (plan E14.3): the `c` attributes at the trace root (or its
 * `coloraxis`) map `surfacecolor`, else `z`. The domain comes from the values' extent (cached per
 * data array, see `grid.ts`), resolved with traces-basic's colorscale helpers.
 */
import type { FullLayout, FullTrace } from '@mk7s/holochart-core';
import type { ColorbarSpec } from '@mk7s/holochart-runtime';
import { markerColorbar, resolveColorMapping } from '@mk7s/holochart-traces-basic';
import { surfaceColorExtent } from './grid.ts';

/** A resolved surface colorscale (render stops with the interpolation space baked in). */
export type SurfaceColorMapping = NonNullable<ReturnType<typeof resolveColorMapping>>;

const KEYS = ['cauto', 'cmin', 'cmax', 'cmid', 'colorscale', 'autocolorscale', 'reversescale'];

/** The trace's colorscale container with `color` set to its values' extent. */
function container(trace: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const c: Record<string, unknown> = { color: surfaceColorExtent(trace) ?? [] };
  for (const k of KEYS) c[k] = trace[k];
  if (typeof trace['coloraxis'] === 'string') c['coloraxis'] = trace['coloraxis'];
  return c;
}

/** The surface's colorscale mapping, or `undefined` without numeric values. */
export function surfaceColorMapping(
  trace: Readonly<Record<string, unknown>>,
  fullLayout: FullLayout | undefined,
): SurfaceColorMapping | undefined {
  const c = container(trace);
  // A trace without color values (all gaps) still draws: map through [0, 1].
  if ((c['color'] as unknown[]).length === 0) c['color'] = [0, 1];
  return resolveColorMapping(c, fullLayout, 'color');
}

/** The colorbar of a surface with `showscale` (or of its color axis). */
export function surfaceColorbar(trace: FullTrace, fullLayout: FullLayout): ColorbarSpec | null {
  if (trace.visible !== true) return null;
  const c = container(trace);
  if ((c['color'] as unknown[]).length === 0) return null;
  c['showscale'] = trace['showscale'];
  c['colorbar'] = trace['colorbar'];
  return markerColorbar({ ...trace, marker: c } as FullTrace, fullLayout, 'marker');
}
