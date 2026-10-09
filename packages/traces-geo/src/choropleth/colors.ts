/**
 * The colors of a `choropleth` (backlog GEO4), following plotly.js `choropleth/style.js` and
 * `components/colorscale` (MIT): `z` through the trace's colorscale, or through the color axis it
 * names. Nothing of the color scaling is done here: the trace's root attributes are handed to the
 * shared helpers of `@mk7s/holochart-traces-basic` as a color container (`z` as its `color`,
 * `zauto` / `zmin` / `zmax` / `zmid` as `cauto` / `cmin` / `cmax` / `cmid`), which is how they
 * resolve the domain (`zauto`, `zmid`), the automatic scales of `layout.colorscale`,
 * `reversescale`, `layout.colorscaleInterpolation`, the colorbar, and a `coloraxis` shared with
 * the color containers of other traces (a `scattergeo`'s `marker`, a bar's).
 *
 * As in Plotly, the automatic domain spans every number of `z`, also those of locations that are
 * not drawn.
 */
import {
  isArrayLike,
  type FullLayout,
  type FullTrace,
  type LayoutDefaultsContext,
} from '@mk7s/holochart-core';
import type { ColorbarSpec, LegendGlyph, LegendIconContext } from '@mk7s/holochart-runtime';
import {
  mapColor,
  markerColorbar,
  numericExtent,
  resolveColorMapping,
  rgbaToCss,
  supplyColorscaleDefaults,
} from '@mk7s/holochart-traces-basic';

/** The mapping the shared helpers resolve (`ColorMapping` of traces-basic). */
export type ChoroplethColorMapping = NonNullable<ReturnType<typeof resolveColorMapping>>;

const NUMBERS = new WeakMap<object, Float64Array>();

/** Plotly's `isNumeric`: a finite number, or a string that reads as one; NaN otherwise. */
function numeric(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  if (typeof v !== 'string' || v.trim() === '') return NaN;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * `z` as numbers, NaN where an entry is not one. One array per `z` array (and length): the shared
 * helpers cache the extent of a color array by the array, and so do the calc and the colorbar.
 */
export function zValues(z: unknown): Float64Array {
  if (!isArrayLike(z)) return new Float64Array(0);
  if (z instanceof Float64Array) return z;
  const hit = NUMBERS.get(z);
  if (hit?.length === z.length) return hit;
  const out = new Float64Array(z.length);
  for (let i = 0; i < z.length; i++) out[i] = numeric(z[i]);
  NUMBERS.set(z, out);
  return out;
}

/** The trace's colorscale attributes as the color container the shared helpers read. */
function colorContainer(trace: FullTrace): Record<string, unknown> {
  return {
    color: zValues(trace['z']),
    cauto: trace['zauto'],
    cmin: trace['zmin'],
    cmax: trace['zmax'],
    cmid: trace['zmid'],
    colorscale: trace['colorscale'],
    autocolorscale: trace['autocolorscale'],
    reversescale: trace['reversescale'],
    showscale: trace['showscale'],
    colorbar: trace['colorbar'],
    coloraxis: trace['coloraxis'],
  };
}

/**
 * The colorscale mapping of a trace (its own, or its color axis'), or `undefined` when `z` has no
 * number to span a domain with.
 */
export function choroplethColorMapping(
  trace: FullTrace,
  fullLayout: FullLayout | undefined,
): ChoroplethColorMapping | undefined {
  return resolveColorMapping(colorContainer(trace), fullLayout);
}

/** The CSS color of value `z` (the hover label's). */
export function choroplethCssColor(
  z: number,
  mapping: ChoroplethColorMapping | undefined,
): string | undefined {
  return mapping && Number.isFinite(z) ? rgbaToCss(mapColor(z, mapping)) : undefined;
}

/** The `colorbar` hook: the trace's bar (`showscale`), or its color axis'. */
export function choroplethColorbar(trace: FullTrace, fullLayout: FullLayout): ColorbarSpec | null {
  return markerColorbar({ ...trace, marker: colorContainer(trace) }, fullLayout);
}

/**
 * Legend glyph (only shown with `showlegend: true`): a swatch of the middle of the colorscale,
 * with the outline of the regions.
 */
export function choroplethLegendIcon(trace: FullTrace, ctx?: LegendIconContext): LegendGlyph {
  const mapping = choroplethColorMapping(trace, ctx?.fullLayout);
  const color = mapping ? rgbaToCss(mapColor((mapping.cmin + mapping.cmax) / 2, mapping)) : '#888';
  const line = (trace['marker'] as { line?: { color?: unknown; width?: unknown } } | undefined)
    ?.line;
  return {
    kind: 'fill',
    fill: {
      color,
      ...(typeof line?.color === 'string' ? { lineColor: line.color } : {}),
      ...(typeof line?.width === 'number' ? { lineWidth: line.width } : {}),
    },
  };
}

/**
 * Layout defaults for the color axes choropleths name with `coloraxis` (Plotly's
 * `colorAxisDefaults` and `calcColorAxis`): coerce each axis and widen its cross-trace `_min` /
 * `_max` with the trace's `z`. Idempotent, and merges with the extents the color containers of
 * other traces gave the axis (`supplyColoraxisDefaults` of traces-basic).
 */
export function supplyChoroplethColoraxisDefaults(
  layoutIn: Readonly<Record<string, unknown>>,
  layoutOut: FullLayout,
  ctx: LayoutDefaultsContext,
): void {
  for (const trace of ctx.fullData) {
    const id = trace['coloraxis'];
    if (trace.visible === false || trace.type !== 'choropleth' || typeof id !== 'string') continue;
    const input = layoutIn[id];
    supplyColorscaleDefaults(
      input !== null && typeof input === 'object' ? (input as Record<string, unknown>) : undefined,
      ctx.coerce,
      `${id}.`,
      { inTrace: false, showscale: true },
    );
    const out = layoutOut[id] as Record<string, unknown> | undefined;
    if (out === null || typeof out !== 'object') continue;
    const [lo, hi] = numericExtent(zValues(trace['z']));
    const min = out['_min'];
    const max = out['_max'];
    out['_min'] = Math.min(lo, typeof min === 'number' ? min : Infinity);
    out['_max'] = Math.max(hi, typeof max === 'number' ? max : -Infinity);
  }
}
