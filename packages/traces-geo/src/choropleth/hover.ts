/**
 * `choropleth` hover (backlog GEO4, GEO6, ADR-010), following plotly.js `choropleth/hover.js`
 * (MIT): the region under the pointer, by point-in-polygon in projected px. The pointer is taken
 * to the geometry of the view's base state, where the regions' polygons are kept, and tested
 * against them through a grid of their boxes (`regions.ts`): a hole is not a hit, and of regions
 * that overlap the one drawn on top is.
 *
 * The label is anchored where Plotly anchors it: at the point of the region's feature (Plotly's
 * `ct`: the label point of a basemap feature, the vertex mean of a `geojson` feature's largest
 * polygon), not at the pointer. When that point is hidden by the projection or outside the part
 * of the subplot that draws, the label is at the pointer.
 *
 * On a 3D globe (`projection.type: 'globe3d'`, backlog GEO8, ADR-028) the region under the
 * pointer is found by a GPU pick of what the globe's viewport draws (`globe.ts`,
 * `geo/globe-pick.ts`): a region raised into a prism is hit on its walls and its cap, a prism in
 * front hides the regions behind it, and nothing behind the globe is hit. The pick resolves
 * asynchronously; hover is run again when it has. The label of a raised region is anchored at
 * the top of its prism. Points carry `elevation` when the trace has one (`%{elevation}`).
 *
 * Label lines follow `hoverinfo` (`location`, `z`, `text`, `name`) as Plotly's `makeHoverInfo`
 * does: without `name`, the location takes the place of the trace name beside the label.
 * `hovertemplate` gets `%{location}`, `%{z}`, `%{text}`, `%{ct}` and, for a feature of the
 * trace's `geojson`, its `%{properties.<key>}`.
 */
import type { FullLayout, FullTrace } from '@mk7s/holochart-core';
import type { HoverContext, HoverPoint, HoverQuery } from '@mk7s/holochart-runtime';
import { geoLabel } from '../scattergeo/hover.ts';
import { subplotFrame } from '../scattergeo/positions.ts';
import type { ChoroplethCalc } from './calc.ts';
import { choroplethColorMapping, choroplethCssColor } from './colors.ts';
import { globeRegionsOf } from './globe-state.ts';
import { choroplethRegions, regionAt } from './regions.ts';

const FLAGS = ['location', 'z', 'text', 'name'] as const;

function valueAt(v: unknown, i: number): unknown {
  return ArrayBuffer.isView(v) || Array.isArray(v) ? (v as ArrayLike<unknown>)[i] : v;
}

function textAt(v: unknown, i: number): string | undefined {
  const s = valueAt(v, i);
  return typeof s === 'string' && s !== '' ? s : typeof s === 'number' ? String(s) : undefined;
}

/**
 * Plotly's fields of location `i` for events and templates: `location`, `z`, the feature's point
 * `ct` and, for a feature of the trace's `geojson`, its `properties`.
 */
export function choroplethPointFields(
  calc: ChoroplethCalc,
  trace: FullTrace,
  i: number,
): Record<string, unknown> {
  const location = valueAt(trace['locations'], i);
  const z = calc.z[i] as number;
  const feature = calc.features?.[i];
  const properties = feature?.custom ? feature.feature.properties : undefined;
  const elevation = calc.elevation?.[i];
  return {
    location: location === undefined || location === '' ? null : location,
    z: Number.isFinite(z) ? z : null,
    // Holochart's second value (the height of the region on a 3D globe), when the trace has one.
    ...(calc.elevation ? { elevation: Number.isFinite(elevation) ? elevation : null } : {}),
    ...(feature && Number.isFinite(feature.point[0]) ? { ct: [...feature.point] } : {}),
    ...(properties ? { properties } : {}),
  };
}

/**
 * What a region is called in descriptions: the name of a basemap feature (`'France'`), else its
 * location as the trace gives it.
 */
export function choroplethRegionName(calc: ChoroplethCalc, trace: FullTrace, i: number): string {
  const feature = calc.features?.[i];
  const name = (feature?.feature.properties as { name?: unknown } | null | undefined)?.name;
  if (feature && !feature.custom && typeof name === 'string' && name !== '') return name;
  const location = valueAt(trace['locations'], i);
  return location === null || location === undefined ? '' : String(location as string | number);
}

/**
 * The hover point of location `i`, anchored at `(px, py)` in overlay px (from the bottom of the
 * figure). Hover and the keyboard stops both build their points here.
 */
export function choroplethHoverPoint(
  calc: ChoroplethCalc,
  trace: FullTrace,
  i: number,
  px: number,
  py: number,
  fullLayout: FullLayout,
): HoverPoint {
  const fields = choroplethPointFields(calc, trace, i);
  const z = calc.z[i] as number;
  const zLabel = geoLabel(fullLayout, z);
  const text = textAt(trace['hovertext'], i) ?? textAt(trace['text'], i);
  const location = fields['location'];
  const loc = location === null ? '' : String(location as string | number);

  // Plotly's `makeHoverInfo`.
  const info = valueAt(trace['hoverinfo'], i);
  const parts: readonly string[] =
    typeof info === 'string' && info !== '' && info !== 'all' ? info.split('+') : FLAGS;
  const hasName = parts.includes('name');
  const hasLocation = parts.includes('location');
  const lines: string[] = [];
  if (hasName && hasLocation) lines.push(loc);
  if (parts.includes('z')) lines.push(zLabel);
  if (parts.includes('text') && text !== undefined) lines.push(text);

  const color = choroplethCssColor(z, choroplethColorMapping(trace, fullLayout));
  return {
    pointIndex: i,
    distance: 0,
    px,
    py,
    ...(text !== undefined ? { text } : {}),
    ...(color !== undefined ? { color } : {}),
    fields,
    labels: {
      z: zLabel,
      ...(calc.elevation ? { elevation: geoLabel(fullLayout, calc.elevation[i] as number) } : {}),
    },
    hoverText: lines.join('<br>'),
    // Without the trace name, the location is what the label is named by.
    ...(!hasName && hasLocation ? { extra: loc } : {}),
  };
}

/**
 * Where the label of location `i` is anchored, in container px (top-left origin): the point of
 * its feature when the subplot draws it, else `undefined`.
 */
export function choroplethAnchor(calc: ChoroplethCalc, i: number): [number, number] | undefined {
  const subplot = calc.subplot;
  const lon = calc.lon?.[i];
  const lat = calc.lat?.[i];
  if (!subplot?.view?.valid || lon === undefined || lat === undefined || Number.isNaN(lon)) {
    return undefined;
  }
  if (subplot.globe) {
    // A region raised from the globe has its label at the top of its prism.
    const top = globeRegionsOf(calc)?.anchor(i);
    if (top !== undefined) return top ?? undefined;
  }
  const p = subplot.view.project(lon, lat);
  if (!p) return undefined;
  const cx = subplot.rect.x + p[0];
  const cy = subplot.rect.y + subplot.rect.height - p[1];
  return subplot.contains(cx, cy) ? [cx, cy] : undefined;
}

export function choroplethHoverPoints(
  calc: ChoroplethCalc,
  trace: FullTrace,
  query: HoverQuery,
  ctx: HoverContext,
): HoverPoint[] {
  const subplot = calc.subplot;
  if (!subplot) return [];
  // Domain queries are in overlay px from the bottom: `py + cy` is the figure height.
  const height = ctx.height ?? (query.cy !== undefined ? query.py + query.cy : 0);
  const cx = query.cx ?? query.px;
  const cy = query.cy ?? height - query.py;
  // Outside the part of the subplot that draws, nothing of the map is under the pointer.
  if (!subplot.contains(cx, cy)) return [];
  if (subplot.globe) {
    // What is drawn there, by a GPU pick: a prism where it stands, nothing behind the globe.
    const i = globeRegionsOf(calc)?.locationAt(cx, cy) ?? -1;
    if (i < 0) return [];
    const [ax, ay] = choroplethAnchor(calc, i) ?? [cx, cy];
    return [choroplethHoverPoint(calc, trace, i, ax, height - ay, ctx.fullLayout)];
  }
  const regions = choroplethRegions(calc);
  if (!regions) return [];
  const [x, y] = subplotFrame(subplot, height).toBase(cx, cy);
  const region = regionAt(regions, x, y);
  if (region < 0) return [];
  const i = regions.drawn.index[region] as number;
  const [ax, ay] = choroplethAnchor(calc, i) ?? [cx, cy];
  return [choroplethHoverPoint(calc, trace, i, ax, height - ay, ctx.fullLayout)];
}
