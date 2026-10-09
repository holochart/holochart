/**
 * `choropleth` supply-defaults (backlog GEO4), following plotly.js `choropleth/defaults.js` (MIT):
 * a trace needs `locations` and `z` (its length is the shorter of the two); `geojson` makes
 * `'geojson-id'` the default `locationmode`, which is what `featureidkey` belongs to; the outline
 * color is only coerced with a width; the colorscale defaults are the shared ones
 * (`supplyColorscaleDefaults` of traces-basic, under Plotly's `z` names); and the opacities of
 * selected and unselected regions follow `marker.opacity` (Plotly's
 * `coerceSelectionMarkerOpacity`). `elevationscale` is only coerced with an `elevation`.
 */
import {
  isArrayLike,
  isPlainObject,
  type FullTrace,
  type TraceDefaultsContext,
} from '@mk7s/holochart-core';
import { supplyColorscaleDefaults } from '@mk7s/holochart-traces-basic';
import { DESELECT_DIM } from './attributes.ts';

/** The shared helper's names → the trace's (Plotly's `cLetter: 'z'`). */
const Z_NAMES: Readonly<Record<string, string>> = {
  cauto: 'zauto',
  cmin: 'zmin',
  cmax: 'zmax',
  cmid: 'zmid',
};

function lengthOf(v: unknown): number {
  return isArrayLike(v) ? v.length : 0;
}

export function supplyChoroplethDefaults(
  traceIn: Readonly<Record<string, unknown>>,
  traceOut: FullTrace,
  ctx: TraceDefaultsContext,
): void {
  ctx.coerce('geo');
  const locations = lengthOf(ctx.coerce('locations'));
  const z = lengthOf(ctx.coerce('z'));
  if (locations === 0 || z === 0) {
    traceOut.visible = false;
    return;
  }
  traceOut['_length'] = Math.min(locations, z);

  const geojson = ctx.coerce('geojson');
  const custom = (typeof geojson === 'string' && geojson !== '') || isPlainObject(geojson);
  const locationmode = ctx.coerce('locationmode', custom ? 'geojson-id' : undefined);
  if (locationmode === 'geojson-id') ctx.coerce('featureidkey');

  ctx.coerce('text');

  // Holochart's own: the height of each region on a 3D globe.
  if (lengthOf(ctx.coerce('elevation')) > 0) ctx.coerce('elevationscale');

  if (ctx.coerce('marker.line.width')) ctx.coerce('marker.line.color');
  const opacity = ctx.coerce('marker.opacity');

  // A valid colorscale from the template turns the automatic scale off, like one from the user.
  const scale = traceIn['colorscale'] ?? ctx.template?.['colorscale'];
  supplyColorscaleDefaults(
    { ...traceIn, cmin: traceIn['zmin'], cmax: traceIn['zmax'], colorscale: scale },
    <T>(path: string, dflt?: unknown): T => ctx.coerce<T>(Z_NAMES[path] ?? path, dflt),
    '',
    { inTrace: true, showscale: true },
  );

  // With one opacity for all regions, a selection keeps it for the selected ones and dims the
  // others. With one per region there is no default: the view dims each region's own.
  const one = typeof opacity === 'number';
  ctx.coerce('selected.marker.opacity', one ? opacity : undefined);
  ctx.coerce('unselected.marker.opacity', one ? DESELECT_DIM * opacity : undefined);

  // In the legend only on request: the colorbar is what explains a choropleth (Plotly).
  if (traceIn['showlegend'] !== true) traceOut['showlegend'] = false;
}
