/**
 * `scattergeo` hover (backlog GEO3, GEO6), following plotly.js `scattergeo/hover.js` and
 * `scattergeo/format_labels.js` (MIT): the nearest point in screen distance (scatter's hit test,
 * run on the points' projected positions), points the projection hides excluded. Labels read
 * `(lat°, lon°)` (or `lon: …°` / `lat: …°` when `hoverinfo` has one of them), then the text;
 * `hovertemplate` gets `%{lon}`, `%{lat}` and `%{text}`.
 *
 * A trace given by `locations` shows the location instead of the coordinates (which are those of
 * the point its feature is drawn at), and `hovertemplate` also gets `%{location}` and, for a
 * feature of the trace's `geojson`, its `%{properties.<key>}` (Plotly's event data).
 */
import {
  createScale,
  createTickFormatter,
  localeOf,
  localize,
  type FullAxis,
  type FullLayout,
  type FullTrace,
} from '@mk7s/holochart-core';
import type { HoverContext, HoverPoint, HoverQuery } from '@mk7s/holochart-runtime';
import { scatter } from '@mk7s/holochart-traces-basic';
import type { ScattergeoCalc } from './calc.ts';
import { geoPositions, subplotFrame } from './positions.ts';

function valueAt(v: unknown, i: number): unknown {
  return ArrayBuffer.isView(v) || Array.isArray(v) ? (v as ArrayLike<unknown>)[i] : v;
}

const FORMATTERS = new WeakMap<FullLayout, (v: number) => string>();

/**
 * Hover text of a longitude or latitude (Plotly's `formatLabels`): the hover format of a linear
 * axis with SI exponents, which is what the subplot's mock axis is in Plotly.
 */
export function geoLabel(fullLayout: FullLayout, v: number): string {
  if (!Number.isFinite(v)) return '';
  let format = FORMATTERS.get(fullLayout);
  if (!format) {
    const formatter = createTickFormatter(createScale({ type: 'linear', range: [-180, 180] }), {
      showexponent: 'all',
      exponentformat: 'B',
      _locale: localeOf(fullLayout),
    } as unknown as FullAxis);
    format = (value) => formatter.label(value, true).text;
    FORMATTERS.set(fullLayout, format);
  }
  return format(v);
}

/**
 * The `hoverinfo` lines of a geo point (plotly.js `getExtraText`): the location, or the
 * coordinates, then the text, `<br>`-separated.
 */
export function geoHoverText(
  trace: FullTrace,
  i: number,
  labels: Readonly<Record<string, string>>,
  text: string | undefined,
  location: unknown,
  fullLayout: FullLayout,
): string {
  const info = valueAt(trace['hoverinfo'], i);
  let parts = typeof info === 'string' && info !== '' ? info.split('+') : ['all'];
  if (parts.includes('all')) parts = ['lon', 'lat', 'location', 'text'];
  const lon = `${labels['lon'] ?? ''}°`;
  const lat = `${labels['lat'] ?? ''}°`;
  const lines: string[] = [];
  if (parts.includes('location') && location !== null && location !== undefined) {
    lines.push(String(location));
  } else if (parts.includes('lon') && parts.includes('lat')) {
    lines.push(`(${lat}, ${lon})`);
  } else if (parts.includes('lon')) {
    lines.push(`${localize(fullLayout, 'lon:')} ${lon}`);
  } else if (parts.includes('lat')) {
    lines.push(`${localize(fullLayout, 'lat:')} ${lat}`);
  }
  if (parts.includes('text') && text !== undefined && text !== '') lines.push(text);
  return lines.join('<br>');
}

/**
 * Plotly's fields of point `i` for events and templates (`lon`, `lat`, `location`, and the
 * `properties` of a feature of the trace's `geojson`), and the formatted coordinates a
 * `hovertemplate` shows for `%{lon}` and `%{lat}`.
 */
export function geoPointFields(
  calc: ScattergeoCalc,
  trace: FullTrace,
  i: number,
  fullLayout?: FullLayout,
): { fields: Record<string, unknown>; labels: Record<string, string> } {
  const lon = calc.lon[i] as number;
  const lat = calc.lat[i] as number;
  const location = valueAt(trace['locations'], i);
  const feature = calc.features?.[i];
  const properties = feature?.custom ? feature.feature.properties : undefined;
  return {
    fields: {
      lon,
      lat,
      location: location === undefined || location === '' ? null : location,
      ...(properties ? { properties } : {}),
    },
    labels: fullLayout ? { lon: geoLabel(fullLayout, lon), lat: geoLabel(fullLayout, lat) } : {},
  };
}

function textAt(v: unknown, i: number): string | undefined {
  const s = valueAt(v, i);
  return typeof s === 'string' && s !== '' ? s : typeof s === 'number' ? String(s) : undefined;
}

/**
 * `p`, the hover point of the point drawn on top at a spot, as the hover point of point `i` drawn
 * on the same spot: its index, text, fields and label lines (the label's color stays). Scatter's
 * hit test reports one point per spot, and keyboard navigation stops at every point.
 */
export function geoHoverPointOf(
  calc: ScattergeoCalc,
  trace: FullTrace,
  i: number,
  p: HoverPoint,
  fullLayout: FullLayout,
): HoverPoint {
  if (p.pointIndex === i) return p;
  const { fields, labels } = geoPointFields(calc, trace, i, fullLayout);
  const own: Record<string, unknown> = {};
  // The per-point fields scatter's hover gives a `hovertemplate`.
  const marker = trace['marker'] as Record<string, unknown> | undefined;
  if (marker) {
    for (const key of ['size', 'color', 'symbol']) own[`marker.${key}`] = valueAt(marker[key], i);
  }
  if (trace['customdata'] !== undefined) own['customdata'] = valueAt(trace['customdata'], i);
  if (trace['ids'] !== undefined) own['id'] = valueAt(trace['ids'], i);
  const text = textAt(trace['hovertext'], i) ?? textAt(trace['text'], i);
  const { text: _text, ...rest } = p;
  return {
    ...rest,
    pointIndex: i,
    ...(text !== undefined ? { text } : {}),
    fields: { ...own, ...fields },
    labels,
    hoverText: geoHoverText(trace, i, labels, text, fields['location'], fullLayout),
  };
}

export function scattergeoHoverPoints(
  calc: ScattergeoCalc,
  trace: FullTrace,
  query: HoverQuery,
  ctx: HoverContext,
): HoverPoint[] {
  const subplot = calc.subplot;
  const positions = subplot && !calc.unresolved ? geoPositions(calc, subplot) : undefined;
  if (!subplot || !positions || calc.length === 0) return [];
  // Domain queries are in overlay px from the bottom: `py + cy` is the figure height.
  const height = ctx.height ?? (query.cy !== undefined ? query.py + query.cy : 0);
  const cx = query.cx ?? query.px;
  const cy = query.cy ?? height - query.py;
  // Outside the part of the subplot that draws, nothing of the map is under the pointer.
  if (!subplot.contains(cx, cy)) return [];
  const frame = subplotFrame(subplot, height);
  const [xl, yl] = frame.toBase(cx, cy);
  const found = scatter.hoverPoints!(
    positions.scatter,
    { ...trace, hoveron: 'points' },
    { ...query, mode: 'closest', xl, yl },
    { fullLayout: ctx.fullLayout, xaxis: undefined, yaxis: undefined, transform: frame.transform },
  );
  const p = found[0];
  if (!p || p.pointIndex < 0) return [];
  const i = p.pointIndex;
  const { fields, labels } = geoPointFields(calc, trace, i, ctx.fullLayout);
  const { x: _x, y: _y, ...rest } = p;
  return [
    {
      ...rest,
      fields: { ...p.fields, ...fields },
      labels,
      hoverText: geoHoverText(trace, i, labels, p.text, fields['location'], ctx.fullLayout),
    },
  ];
}
