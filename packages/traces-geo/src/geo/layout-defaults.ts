/**
 * Supply-defaults of the geo subplots (backlog GEO2, plan E15.1), following plotly.js
 * `plots/geo/layout_defaults.js` (MIT; with `subplot_defaults.js` and `domain.js`).
 *
 * The subplots are the `geo` ids of the visible geo traces (`'geo'`, `'geo2'`, …). Each gets its
 * `layout.geoN` container, defaulted from the user's container and the template's `geoN` (or
 * `geo`). The ids are listed in `fullLayout._geoSubplots`.
 *
 * Unlike Plotly, a container is complete after defaults (`FullGeoLayout`): where Plotly leaves an
 * attribute out because the map cannot use it, this writes the value that draws the same map
 * (a layer that cannot be shown is `false`, an Albers USA map has zero rotation), and colors and
 * widths are there whether or not their layer shows.
 */
import {
  getIn,
  getNodeAtPath,
  isPlainObject,
  resolveWithTemplate,
  setIn,
  type AttrSpec,
  type FullLayout,
  type FullTrace,
  type LayoutDefaultsContext,
} from '@mk7s/holochart-core';
import { FITBOUNDS_INCOMPATIBLE, LATAXIS_SPAN, LONAXIS_SPAN, SCOPE_DEFAULTS } from './constants.ts';
import { geoAttributes } from './layout-attributes.ts';
import type { FullGeoLayout, GeoScope } from './types.ts';

/** `fullLayout` key of the geo subplot ids, in order of their number. */
export const GEO_SUBPLOTS = '_geoSubplots';

/** The geo subplot ids of a defaulted layout. */
export function geoSubplotIds(fullLayout: FullLayout | undefined): readonly string[] {
  const ids = fullLayout?.[GEO_SUBPLOTS];
  return Array.isArray(ids) ? (ids as string[]) : [];
}

/** Whether a (defaulted) trace is drawn on a geo subplot. */
export function isGeoTrace(trace: FullTrace): boolean {
  return trace._module?.categories.includes('geo') === true;
}

/** The subplot id of a geo trace. */
export function geoOf(trace: Readonly<Record<string, unknown>>): string {
  const s = trace['geo'];
  return typeof s === 'string' && s !== '' ? s : 'geo';
}

const GEO_ID = /^geo([2-9]|[1-9]\d+)?$/;

/** The defaulted container of a geo subplot (`fullLayout.geo`, `fullLayout.geo2`, …). */
export function geoLayoutOf(
  fullLayout: FullLayout | undefined,
  id: string,
): FullGeoLayout | undefined {
  const geo = GEO_ID.test(id) ? fullLayout?.[id] : undefined;
  return isPlainObject(geo) ? (geo as unknown as FullGeoLayout) : undefined;
}

/** What `scope` and `projection.type` decide about a map (the `_is…` keys of `FullGeoLayout`). */
export type GeoFlags = Required<
  Pick<FullGeoLayout, '_isScoped' | '_isSatellite' | '_isConic' | '_isClipped' | '_isAlbersUsa'>
>;

/**
 * Plotly's derived flags. `'conic'` anywhere in the name counts, as in Plotly, so the polyconic
 * projections take `parallels` too (their projections ignore them).
 */
export function geoFlags(scope: GeoScope, projectionType: string): GeoFlags {
  const albersUsa = projectionType === 'albers usa';
  return {
    // No other scope is allowed with Albers USA.
    _isScoped: albersUsa || scope !== 'world',
    _isSatellite: projectionType === 'satellite',
    _isConic: projectionType.includes('conic') || projectionType === 'albers',
    _isClipped: projectionType !== '*' && Object.hasOwn(LONAXIS_SPAN, projectionType),
    _isAlbersUsa: albersUsa,
  };
}

const SCOPED_FIT = ['center.lon', 'center.lat', 'projection.scale'] as const;
const WORLD_FIT = [...SCOPED_FIT, 'projection.rotation.lon'] as const;
const CLIPPED_FIT = [
  ...WORLD_FIT,
  'projection.rotation.lat',
  'lonaxis.range',
  'lataxis.range',
] as const;

/**
 * The view attributes `fitbounds` computes for a map, as paths in its container. The figure
 * setting any of them turns `fitbounds` off; while it is on, the view (`view.ts`) fits them to the
 * data and what the container holds for them is only the automatic default. Resetting to the
 * fitted view is a relayout of these keys to `null`.
 *
 * Scoped maps come first because a scope's projection can be a clipped one, and only its center
 * and scale are fitted.
 */
export function fitboundsViewKeys(
  geo: Pick<FullGeoLayout, '_isScoped' | '_isClipped'>,
): readonly string[] {
  if (geo._isScoped === true) return SCOPED_FIT;
  return geo._isClipped === true ? CLIPPED_FIT : WORLD_FIT;
}

type Container = Record<string, unknown>;
type Pair = readonly [number, number];
type Coerce = (path: string, dflt?: unknown) => unknown;

/** The base layers and graticules a template can show, which `visible: false` hides. */
const LAYER_FLAGS = [
  'showcoastlines',
  'showcountries',
  'showframe',
  'showlakes',
  'showland',
  'showocean',
  'showrivers',
  'showsubunits',
] as const;

/** A template container whose layers and graticules are all off. */
function hideLayers(template: Container | undefined): Container {
  const hidden: Container = { ...template };
  for (const key of LAYER_FLAGS) hidden[key] = false;
  for (const axis of ['lonaxis', 'lataxis']) {
    const a = hidden[axis];
    if (isPlainObject(a)) hidden[axis] = { ...a, showgrid: false };
  }
  return hidden;
}

/**
 * Plotly's `unwrapLonRange`: a longitude range that crosses the antimeridian (`[170, -170]`) with
 * its end moved a turn east, so its middle is on the side the range covers.
 */
function unwrapLon(range: Pair): [number, number] {
  return [range[0], range[0] > range[1] ? range[1] + 360 : range[1]];
}

const middle = (range: Pair): number => (range[0] + range[1]) / 2;

interface GridCells {
  rows: number;
  columns: number;
  _domains: { x: readonly [number, number][]; y: readonly [number, number][] };
}

function validExtent(v: unknown): v is [number, number] {
  return (
    Array.isArray(v) &&
    typeof v[0] === 'number' &&
    typeof v[1] === 'number' &&
    Number.isFinite(v[0]) &&
    Number.isFinite(v[1]) &&
    v[0] < v[1]
  );
}

/** Where Albers USA puts the middle of its composite map; it has no center of its own (Plotly). */
const ALBERS_USA_CENTER = { lon: -96.6, lat: 38.7 } as const;

/** The two axes: container key, rotation it follows, span limits and graticule step. */
const AXES = [
  { axis: 'lonaxis', letter: 'lon', spans: LONAXIS_SPAN, dtick: 30 },
  { axis: 'lataxis', letter: 'lat', spans: LATAXIS_SPAN, dtick: 10 },
] as const;

/**
 * Supply the geo subplots' defaults (the `supplyLayoutDefaults` of the geo trace modules;
 * idempotent, so each geo module may call it).
 */
export function supplyGeoLayoutDefaults(
  layoutIn: Readonly<Record<string, unknown>>,
  layoutOut: FullLayout,
  ctx: LayoutDefaultsContext,
): void {
  const ids: string[] = [];
  for (const trace of ctx.fullData) {
    if (trace.visible === false || !isGeoTrace(trace)) continue;
    const id = geoOf(trace);
    if (!ids.includes(id)) ids.push(id);
  }
  ids.sort((a, b) => (Number(a.slice(3)) || 1) - (Number(b.slice(3)) || 1));
  layoutOut[GEO_SUBPLOTS] = ids;
  const tLayout = isPlainObject(ctx.template?.layout) ? ctx.template.layout : undefined;
  ids.forEach((id, i) => {
    const input = isPlainObject(layoutIn[id]) ? (layoutIn[id] as Container) : {};
    const template = tLayout?.[id] ?? tLayout?.['geo'];
    layoutOut[id] = supplySubplot(
      i,
      ids.length,
      input,
      isPlainObject(template) ? template : undefined,
      layoutOut,
    );
  });
}

function supplySubplot(
  index: number,
  count: number,
  input: Container,
  template: Container | undefined,
  layoutOut: FullLayout,
): Container {
  const out: Container = {};
  // `visible: false` in the figure also hides what the template shows (plotly.js issue 4482).
  const tmpl = input['visible'] === false ? hideLayers(template) : template;
  const spec = (path: string): AttrSpec => getNodeAtPath(geoAttributes, path) as AttrSpec;
  // As Plotly's `coerce`: an `undefined` default means the schema's.
  const coerce: Coerce = (path, dflt) => {
    const s = spec(path);
    const value = resolveWithTemplate(
      s,
      getIn(input, path),
      getIn(tmpl, path),
      dflt !== undefined ? dflt : s.dflt,
    );
    if (value !== undefined) setIn(out, path, value);
    return value;
  };
  // A pair of numbers the way Plotly coerces an `info_array`: item by item, so `[null, 60]` keeps
  // the default start (core rejects the whole array).
  const pair = (path: string, dflt: Pair): [number, number] => {
    const items = spec(path).items as readonly AttrSpec[];
    const from = (v: unknown): [number, number] | undefined =>
      Array.isArray(v)
        ? [
            resolveWithTemplate(items[0]!, v[0], undefined, dflt[0]) as number,
            resolveWithTemplate(items[1]!, v[1], undefined, dflt[1]) as number,
          ]
        : undefined;
    const value = from(getIn(input, path)) ?? from(getIn(tmpl, path)) ?? [dflt[0], dflt[1]];
    setIn(out, path, value);
    return value;
  };

  coerce('uirevision', layoutOut['uirevision']);

  // Domain: a `layout.grid` cell, else stacked from the bottom (plotly.js `handleSubplotDefaults`
  // with `partition: 'y'`).
  let dfltX: [number, number] = [0, 1];
  let dfltY: [number, number] = [index / count, (index + 1) / count];
  const grid = layoutOut['grid'] as GridCells | undefined;
  if (grid?._domains && typeof grid.rows === 'number' && typeof grid.columns === 'number') {
    const column = coerce('domain.column') as number | undefined;
    if (column !== undefined) {
      const cell = column < grid.columns ? grid._domains.x[column] : undefined;
      if (cell) dfltX = [cell[0], cell[1]];
    }
    const row = coerce('domain.row') as number | undefined;
    if (row !== undefined) {
      const cell = row < grid.rows ? grid._domains.y[row] : undefined;
      if (cell) dfltY = [cell[0], cell[1]];
    }
  }
  if (!validExtent(coerce('domain.x', dfltX))) setIn(out, 'domain.x', dfltX);
  if (!validExtent(coerce('domain.y', dfltY))) setIn(out, 'domain.y', dfltY);

  const resolution = coerce('resolution');
  let scope = coerce('scope') as GeoScope;
  // Read before Albers USA forces the scope, as in Plotly: an Albers USA map whose scope is unset
  // takes the world's ranges.
  const scopeParams = SCOPE_DEFAULTS[scope];
  const projType = coerce('projection.type', scopeParams.projType) as string;
  const flags = geoFlags(scope, projType);
  const {
    _isScoped: scoped,
    _isAlbersUsa: albersUsa,
    _isSatellite: satellite,
    _isConic: conic,
  } = flags;
  if (albersUsa) {
    scope = 'usa';
    out['scope'] = scope;
  }
  Object.assign(out, flags);

  const visible = coerce('visible') as boolean;
  // A hidden map turns its layers off by default; `undefined` leaves a layer its own default.
  const hidden = visible ? undefined : false;

  AXES.forEach(({ axis, letter, spans, dtick }, i) => {
    let rangeDflt: Pair;
    if (scoped) {
      rangeDflt = i === 0 ? scopeParams.lonaxisRange : scopeParams.lataxisRange;
    } else {
      // The widest span the projection can show, around the rotation.
      const half = (spans[projType] ?? spans['*'] ?? 360) / 2;
      const rot = coerce(`projection.rotation.${letter}`, scopeParams.projRotate?.[i] ?? 0);
      rangeDflt = [(rot as number) - half, (rot as number) + half];
    }
    pair(`${axis}.range`, rangeDflt);
    coerce(`${axis}.tick0`);
    coerce(`${axis}.dtick`, dtick);
    coerce(`${axis}.showgrid`, hidden);
    coerce(`${axis}.gridcolor`);
    coerce(`${axis}.gridwidth`);
    coerce(`${axis}.griddash`);
    // Plotly also makes a mock axis here (`_ax`) for the autorange of `fitbounds`. The fit is the
    // view's (`view.ts`), from the extents of the subplot's traces.
  });

  const lonRange = getIn(out, 'lonaxis.range') as Pair;
  const latRange = getIn(out, 'lataxis.range') as Pair;
  const centerLon = middle(unwrapLon(lonRange));
  let projLon = 0;

  if (albersUsa) {
    // A composite of three fixed projections, which cannot be rotated. Plotly draws neither
    // coastlines nor the ocean on it.
    setIn(out, 'projection.rotation', { lon: 0, lat: 0, roll: 0 });
    out['showcoastlines'] = false;
    out['showocean'] = false;
  } else {
    // `usa` has no rotation of its own (its projection is Albers USA), and Plotly throws when it
    // is given another projection. Turning to the middle of its range is what a world map does.
    const rotate = (scoped ? scopeParams.projRotate : undefined) ?? [centerLon, 0, 0];
    projLon = coerce('projection.rotation.lon', rotate[0]) as number;
    coerce('projection.rotation.lat', rotate[1]);
    coerce('projection.rotation.roll', rotate[2]);
    coerce('showcoastlines', !scoped && visible);
    coerce('showocean', hidden);
  }
  coerce('coastlinecolor');
  coerce('coastlinewidth');
  coerce('oceancolor');

  coerce('center.lon', albersUsa ? ALBERS_USA_CENTER.lon : scoped ? centerLon : projLon);
  coerce('center.lat', albersUsa ? ALBERS_USA_CENTER.lat : middle(latRange));

  if (satellite) {
    coerce('projection.tilt');
    coerce('projection.distance');
  }
  if (conic) pair('projection.parallels', scopeParams.projParallels ?? [0, 60]);
  coerce('projection.scale');
  coerce('projection.minscale');
  coerce('projection.maxscale');

  coerce('showland', hidden);
  coerce('landcolor');
  coerce('showlakes', hidden);
  coerce('lakecolor');
  coerce('showrivers', hidden);
  coerce('rivercolor');
  coerce('riverwidth');

  coerce('showcountries', scoped && scope !== 'usa' && visible);
  coerce('countrycolor');
  coerce('countrywidth');

  // The map data has subunits for the USA at 110m, and for the USA and Canada at 50m.
  if (scope === 'usa' || (scope === 'north america' && resolution === 50)) {
    coerce('showsubunits', visible);
  } else {
    out['showsubunits'] = false;
  }
  coerce('subunitcolor');
  coerce('subunitwidth');

  // The frame is the outline of the whole globe, which a scope does not show.
  if (scoped) out['showframe'] = false;
  else coerce('showframe', visible);
  coerce('framecolor');
  coerce('framewidth');

  coerce('bgcolor');

  // `fitbounds` computes a set of view attributes that depends on the kind of map. If the figure
  // sets one of them it wants that view, and the fit is off. Axis ranges of a projection that is
  // not clipped are not fitted but say the same thing.
  if (coerce('fitbounds') !== false) {
    const fitted = fitboundsViewKeys(flags);
    const intent = flags._isClipped ? fitted : [...fitted, 'lonaxis.range', 'lataxis.range'];
    const userView = intent.some((path) => {
      const v = getIn(input, path);
      return v !== undefined && v !== null;
    });
    if (userView || FITBOUNDS_INCOMPATIBLE.has(projType)) out['fitbounds'] = false;
    else resetFittedView(out, flags, projType);
  }
  return out;
}

/**
 * Take what a template gave the fitted view attributes back out, leaving their automatic values.
 * Plotly sets them to `null` here and its plot step writes the fit over them; `FullGeoLayout` has
 * numbers, so they hold the unfitted view until `view.ts` fits them (see `fitboundsViewKeys`).
 */
function resetFittedView(out: Container, flags: GeoFlags, projType: string): void {
  if (!flags._isScoped && flags._isClipped) {
    // The projection's whole span around no rotation (the world's `projRotate`).
    const lonHalf = (LONAXIS_SPAN[projType] ?? 360) / 2;
    const latHalf = (LATAXIS_SPAN[projType] ?? LATAXIS_SPAN['*'] ?? 180) / 2;
    setIn(out, 'lonaxis.range', [-lonHalf, lonHalf]);
    setIn(out, 'lataxis.range', [-latHalf, latHalf]);
    setIn(out, 'projection.rotation.lat', 0);
  }
  const lon = middle(unwrapLon(getIn(out, 'lonaxis.range') as Pair));
  if (!flags._isScoped) setIn(out, 'projection.rotation.lon', lon);
  setIn(out, 'center.lon', lon);
  setIn(out, 'center.lat', middle(getIn(out, 'lataxis.range') as Pair));
  setIn(out, 'projection.scale', 1);
}
