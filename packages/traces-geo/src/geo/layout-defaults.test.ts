/**
 * Defaults of `layout.geo` against plotly.js 4.1.1 (`plots/geo/layout_defaults.js`,
 * `constants.js`): the expected values are written out from Plotly's source, not computed by the
 * port.
 */
import {
  attr,
  createRegistry,
  stripInternal,
  supplyDefaults,
  validate,
  type CoreTraceModule,
  type FigureInput,
  type InferFull,
} from '@mk7s/holochart-core';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { PROJECTION_TYPES } from './constants.ts';
import { geoAttributes, geoLayoutSchema, geoSubplotAttribute } from './layout-attributes.ts';
import {
  fitboundsViewKeys,
  GEO_SUBPLOTS,
  geoFlags,
  geoLayoutOf,
  geoOf,
  geoSubplotIds,
  isGeoTrace,
  supplyGeoLayoutDefaults,
} from './layout-defaults.ts';
import type { FullGeoLayout, GeoScope } from './types.ts';

/** A minimal trace on a geo subplot (scattergeo comes with GEO3). */
const points: CoreTraceModule = {
  type: 'geopoints',
  categories: ['geo'],
  schema: attr.object({ geo: geoSubplotAttribute }),
  layoutSchema: geoLayoutSchema,
  meta: { description: 'Test trace drawn on a geo subplot.' },
  supplyDefaults(_in, _out, ctx) {
    ctx.coerce('geo');
  },
  supplyLayoutDefaults: supplyGeoLayoutDefaults,
};

/** A trace that is not on a geo subplot, though it has a `geo` attribute. */
const other: CoreTraceModule = {
  type: 'notgeo',
  categories: [],
  schema: attr.object({ geo: geoSubplotAttribute }),
  meta: { description: 'Test trace that is not on a geo subplot.' },
  supplyDefaults(_in, _out, ctx) {
    ctx.coerce('geo');
  },
};

const registry = createRegistry().register(points, other);

const trace = { type: 'geopoints' };
const on = (geo: string): Record<string, unknown> => ({ type: 'geopoints', geo });

type Layout = Record<string, unknown>;

function layout(figure: FigureInput): Layout {
  return supplyDefaults(figure, registry, { validate: false }).fullLayout as Layout;
}

/** The defaulted `geo` container of a figure with one geo trace and this `layout.geo`. */
function geoOfLayout(geo: Layout = {}, rest: Layout = {}): FullGeoLayout {
  return layout({ data: [trace], layout: { geo, ...rest } } as FigureInput)['geo'] as FullGeoLayout;
}

/** `fitbounds: false`, so the view attributes are the plain defaults. */
function unfitted(geo: Layout = {}): FullGeoLayout {
  return geoOfLayout({ fitbounds: false, ...geo });
}

const LINE = 'rgb(68, 68, 68)';
const LAND = 'rgb(240, 220, 130)';
const WATER = 'rgb(51, 153, 255)';

describe('geo layout defaults (plotly.js geo/layout_defaults.js)', () => {
  it('defaults a world map', () => {
    expect(stripInternal(geoOfLayout())).toEqual({
      domain: { x: [0, 1], y: [0, 1] },
      fitbounds: 'locations',
      resolution: 110,
      scope: 'world',
      projection: {
        type: 'equirectangular',
        rotation: { lon: 0, lat: 0, roll: 0 },
        scale: 1,
        minscale: 0,
      },
      center: { lon: 0, lat: 0 },
      visible: true,
      showcoastlines: true,
      coastlinecolor: LINE,
      coastlinewidth: 1,
      showland: false,
      landcolor: LAND,
      showocean: false,
      oceancolor: WATER,
      showlakes: false,
      lakecolor: WATER,
      showrivers: false,
      rivercolor: WATER,
      riverwidth: 1,
      showcountries: false,
      countrycolor: LINE,
      countrywidth: 1,
      showsubunits: false,
      subunitcolor: LINE,
      subunitwidth: 1,
      showframe: true,
      framecolor: LINE,
      framewidth: 1,
      bgcolor: 'rgb(255, 255, 255)',
      lonaxis: {
        range: [-180, 180],
        showgrid: false,
        tick0: 0,
        dtick: 30,
        gridcolor: 'rgb(238, 238, 238)',
        gridwidth: 1,
        griddash: 'solid',
      },
      lataxis: {
        range: [-90, 90],
        showgrid: false,
        tick0: 0,
        dtick: 10,
        gridcolor: 'rgb(238, 238, 238)',
        gridwidth: 1,
        griddash: 'solid',
      },
    });
  });

  it('publishes Plotly’s derived flags', () => {
    expect(geoOfLayout()).toMatchObject({
      _isScoped: false,
      _isSatellite: false,
      _isConic: false,
      _isClipped: false,
      _isAlbersUsa: false,
    });
    expect(geoOfLayout({ scope: 'europe' })).toMatchObject({
      _isScoped: true,
      _isConic: true,
      _isClipped: true,
      _isAlbersUsa: false,
    });
    expect(geoOfLayout({ scope: 'usa' })).toMatchObject({
      _isScoped: true,
      _isConic: false,
      _isClipped: false,
      _isAlbersUsa: true,
    });
    expect(geoOfLayout({ projection: { type: 'satellite' } })).toMatchObject({
      _isSatellite: true,
      _isClipped: false,
    });
    // `geoFlags` is the same derivation for hand-built containers.
    expect(geoFlags('world', 'orthographic')).toEqual({
      _isScoped: false,
      _isSatellite: false,
      _isConic: false,
      _isClipped: true,
      _isAlbersUsa: false,
    });
    expect(geoFlags('world', 'albers usa')._isScoped).toBe(true);
    expect(geoFlags('world', 'albers')._isConic).toBe(true);
    // Plotly's test is "the name contains `conic`".
    expect(geoFlags('world', 'polyconic')._isConic).toBe(true);
    // Plotly's clipped projections are the keys of `lonaxisSpan`; the globe is Holochart's.
    const clipped = PROJECTION_TYPES.filter((type) => geoFlags('world', type)._isClipped);
    expect(clipped).toEqual([
      'azimuthal equal area',
      'azimuthal equidistant',
      'conic conformal',
      'globe3d',
      'gnomonic',
      'orthographic',
      'stereographic',
      'transverse mercator',
    ]);
  });

  it("gives 'globe3d' the defaults of 'orthographic' (ADR-028)", () => {
    const cases: Layout[] = [
      {},
      { projection: { rotation: { lon: 40, lat: 25, roll: 10 }, scale: 2 } },
      { scope: 'europe' },
      { fitbounds: 'locations' },
      { fitbounds: 'locations', projection: { rotation: { lat: 10 } } },
      { visible: false },
    ];
    for (const geo of cases) {
      const projection = (geo['projection'] ?? {}) as Layout;
      const globe = geoOfLayout({ ...geo, projection: { ...projection, type: 'globe3d' } });
      const flat = geoOfLayout({ ...geo, projection: { ...projection, type: 'orthographic' } });
      expect(globe.projection.type).toBe('globe3d');
      expect(globe).toEqual({ ...flat, projection: { ...flat.projection, type: 'globe3d' } });
      expect(fitboundsViewKeys(globe)).toEqual(fitboundsViewKeys(flat));
    }
    expect(geoFlags('world', 'globe3d')).toEqual(geoFlags('world', 'orthographic'));
  });

  describe('scopes (plotly.js geo/constants.js scopeDefaults)', () => {
    interface Expected {
      type: string;
      lon: [number, number];
      lat: [number, number];
      rotation: { lon: number; lat: number; roll: number };
      center: { lon: number; lat: number };
      parallels?: [number, number];
    }
    const none = { lon: 0, lat: 0, roll: 0 };
    const scopes: Record<Exclude<GeoScope, 'world'>, Expected> = {
      usa: {
        type: 'albers usa',
        lon: [-180, -50],
        lat: [15, 80],
        rotation: none,
        center: { lon: -96.6, lat: 38.7 },
      },
      europe: {
        type: 'conic conformal',
        lon: [-30, 60],
        lat: [30, 85],
        rotation: { lon: 15, lat: 0, roll: 0 },
        center: { lon: 15, lat: 57.5 },
        parallels: [0, 60],
      },
      asia: {
        type: 'mercator',
        lon: [22, 160],
        lat: [-15, 55],
        rotation: none,
        center: { lon: 91, lat: 20 },
      },
      africa: {
        type: 'mercator',
        lon: [-30, 60],
        lat: [-40, 40],
        rotation: none,
        center: { lon: 15, lat: 0 },
      },
      'north america': {
        type: 'conic conformal',
        lon: [-180, -45],
        lat: [5, 85],
        rotation: { lon: -100, lat: 0, roll: 0 },
        center: { lon: -112.5, lat: 45 },
        parallels: [29.5, 45.5],
      },
      'south america': {
        type: 'mercator',
        lon: [-100, -30],
        lat: [-60, 15],
        rotation: none,
        center: { lon: -65, lat: -22.5 },
      },
      antarctica: {
        type: 'equirectangular',
        lon: [-180, 180],
        lat: [-90, -60],
        rotation: none,
        center: { lon: 0, lat: -75 },
      },
      oceania: {
        type: 'equirectangular',
        lon: [-180, 180],
        lat: [-50, 25],
        rotation: none,
        center: { lon: 0, lat: -12.5 },
      },
    };

    for (const [scope, want] of Object.entries(scopes)) {
      it(`defaults the projection, ranges, rotation and center of '${scope}'`, () => {
        const geo = unfitted({ scope });
        expect(geo.scope).toBe(scope);
        expect(geo.projection.type).toBe(want.type);
        expect(geo.lonaxis.range).toEqual(want.lon);
        expect(geo.lataxis.range).toEqual(want.lat);
        expect(geo.projection.rotation).toEqual(want.rotation);
        expect(geo.center).toEqual(want.center);
        expect(geo.projection.parallels).toEqual(want.parallels);
        expect(geo._isScoped).toBe(true);
        // Scoped maps draw borders instead of coastlines, and have no frame.
        expect(geo.showcoastlines).toBe(false);
        expect(geo.showframe).toBe(false);
        expect(geo.showcountries).toBe(scope !== 'usa');
        expect(geo.showsubunits).toBe(scope === 'usa');
      });
    }

    it('lists the scopes as Plotly does', () => {
      expect(geoAttributes.children.scope.values).toEqual([
        'africa',
        'antarctica',
        'asia',
        'europe',
        'north america',
        'oceania',
        'south america',
        'usa',
        'world',
      ]);
    });
  });

  describe('world and scoped maps', () => {
    it('draws a frame on world maps only', () => {
      expect(geoOfLayout({ showframe: false }).showframe).toBe(false);
      expect(geoOfLayout({ scope: 'asia', showframe: true }).showframe).toBe(false);
    });

    it('lets either kind of map show coastlines and countries', () => {
      expect(geoOfLayout({ showcountries: true }).showcountries).toBe(true);
      expect(geoOfLayout({ scope: 'africa', showcoastlines: true }).showcoastlines).toBe(true);
      expect(geoOfLayout({ scope: 'africa', showcountries: false }).showcountries).toBe(false);
    });

    it('draws subunits for the USA, and for North America at 50m', () => {
      expect(geoOfLayout({ showsubunits: true }).showsubunits).toBe(false);
      expect(geoOfLayout({ scope: 'europe', showsubunits: true }).showsubunits).toBe(false);
      expect(geoOfLayout({ scope: 'north america' }).showsubunits).toBe(false);
      expect(geoOfLayout({ scope: 'north america', resolution: 50 }).showsubunits).toBe(true);
      expect(
        geoOfLayout({ scope: 'north america', resolution: 50, showsubunits: false }).showsubunits,
      ).toBe(false);
      expect(geoOfLayout({ scope: 'usa', showsubunits: false }).showsubunits).toBe(false);
      expect(geoOfLayout({ scope: 'usa', subunitcolor: 'red' }).subunitcolor).toBe(
        'rgb(255, 0, 0)',
      );
    });

    it('takes rotation from the scope, and from the range on a world map', () => {
      // Scoped: the scope's rotation whatever the range; the center follows the range.
      const scoped = unfitted({ scope: 'europe', lonaxis: { range: [0, 40] } });
      expect(scoped.projection.rotation.lon).toBe(15);
      expect(scoped.center.lon).toBe(20);
      // World: the rotation is the middle of the range and the center sits on it.
      const world = unfitted({ lonaxis: { range: [0, 100] }, lataxis: { range: [10, 50] } });
      expect(world.projection.rotation).toEqual({ lon: 50, lat: 0, roll: 0 });
      expect(world.center).toEqual({ lon: 50, lat: 30 });
      const turned = unfitted({ projection: { rotation: { lon: 30, lat: 20, roll: 5 } } });
      expect(turned.lonaxis.range).toEqual([-150, 210]);
      expect(turned.lataxis.range).toEqual([-70, 110]);
      expect(turned.center).toEqual({ lon: 30, lat: 20 });
      expect(turned.projection.rotation.roll).toBe(5);
    });

    it('centers a range that crosses the antimeridian on the side it covers', () => {
      // Plotly's unwrapLonRange: [170, -170] is [170, 190], whose middle is 180.
      const geo = unfitted({ lonaxis: { range: [170, -170] } });
      expect(geo.lonaxis.range).toEqual([170, -170]);
      expect(geo.projection.rotation.lon).toBe(180);
      expect(geo.center.lon).toBe(180);
      expect(unfitted({ scope: 'oceania', lonaxis: { range: [100, -140] } }).center.lon).toBe(160);
    });

    it('gives a scope a projection of its own choosing its scoped defaults', () => {
      const geo = unfitted({ scope: 'africa', projection: { type: 'orthographic' } });
      expect(geo.lonaxis.range).toEqual([-30, 60]);
      expect(geo.projection.rotation).toEqual({ lon: 0, lat: 0, roll: 0 });
      expect(geo).toMatchObject({ _isScoped: true, _isClipped: true });
    });

    it('turns `usa` under another projection to the middle of its range', () => {
      // Plotly throws here (the scope has no `projRotate`).
      const geo = unfitted({ scope: 'usa', projection: { type: 'mercator' } });
      expect(geo.scope).toBe('usa');
      expect(geo.projection.rotation).toEqual({ lon: -115, lat: 0, roll: 0 });
      expect(geo.center).toEqual({ lon: -115, lat: 47.5 });
      expect(geo.showsubunits).toBe(true);
      expect(geo.showcountries).toBe(false);
    });
  });

  describe('albers usa', () => {
    it('is always the `usa` scope, with the ranges of the scope that was asked for', () => {
      // Plotly reads the scope's defaults before it forces the scope.
      const world = geoOfLayout({ projection: { type: 'albers usa' } });
      expect(world.scope).toBe('usa');
      expect(world.lonaxis.range).toEqual([-180, 180]);
      expect(world.lataxis.range).toEqual([-90, 90]);
      expect(world.showsubunits).toBe(true);
      expect(world.showcountries).toBe(false);
      expect(world.showframe).toBe(false);
      const europe = geoOfLayout({ scope: 'europe', projection: { type: 'albers usa' } });
      expect(europe.scope).toBe('usa');
      expect(europe.lonaxis.range).toEqual([-30, 60]);
      expect(europe.projection.parallels).toBeUndefined();
    });

    it('has no rotation, coastlines or ocean, and a fixed default center', () => {
      const geo = geoOfLayout({
        scope: 'usa',
        projection: { rotation: { lon: 40, lat: 10, roll: 3 } },
        showcoastlines: true,
        showocean: true,
        showland: true,
      });
      expect(geo.projection.rotation).toEqual({ lon: 0, lat: 0, roll: 0 });
      expect(geo.showcoastlines).toBe(false);
      expect(geo.showocean).toBe(false);
      expect(geo.showland).toBe(true);
      expect(geo.center).toEqual({ lon: -96.6, lat: 38.7 });
      expect(geoOfLayout({ scope: 'usa', center: { lon: -100 } }).center).toEqual({
        lon: -100,
        lat: 38.7,
      });
    });

    it('cannot be fitted', () => {
      expect(geoOfLayout({ scope: 'usa' }).fitbounds).toBe(false);
      expect(geoOfLayout({ scope: 'usa', fitbounds: 'geojson' }).fitbounds).toBe(false);
    });
  });

  describe('projections', () => {
    it('defaults the ranges of clipped projections to the span they can show', () => {
      // lonaxisSpan / lataxisSpan of plotly.js geo/constants.js, halved around the rotation.
      const spans: Record<string, [lon: number, lat: number]> = {
        orthographic: [90, 90],
        'azimuthal equal area': [180, 90],
        'azimuthal equidistant': [180, 90],
        'conic conformal': [90, 75],
        gnomonic: [80, 90],
        stereographic: [90, 89.75],
        'transverse mercator': [90, 90],
        // Not clipped: the whole sphere.
        mercator: [180, 90],
        'natural earth': [180, 90],
      };
      for (const [type, [lon, lat]] of Object.entries(spans)) {
        const geo = unfitted({ projection: { type } });
        expect(geo.lonaxis.range, type).toEqual([-lon, lon]);
        expect(geo.lataxis.range, type).toEqual([-lat, lat]);
      }
      const turned = unfitted({
        projection: { type: 'orthographic', rotation: { lon: 30, lat: 20 } },
      });
      expect(turned.lonaxis.range).toEqual([-60, 120]);
      expect(turned.lataxis.range).toEqual([-70, 110]);
      expect(turned.center).toEqual({ lon: 30, lat: 20 });
      expect(turned._isClipped).toBe(true);
    });

    it('gives conic projections parallels: the scope’s, or [0, 60]', () => {
      expect(unfitted({ projection: { type: 'albers' } }).projection.parallels).toEqual([0, 60]);
      expect(unfitted({ projection: { type: 'conic equal area' } }).projection.parallels).toEqual([
        0, 60,
      ]);
      expect(
        unfitted({ scope: 'north america', projection: { type: 'albers' } }).projection.parallels,
      ).toEqual([29.5, 45.5]);
      expect(
        unfitted({ projection: { type: 'conic equidistant', parallels: [20, 50] } }).projection
          .parallels,
      ).toEqual([20, 50]);
      // Not conic: none, even when the figure gives some.
      const mercator = unfitted({ projection: { type: 'mercator', parallels: [20, 50] } });
      expect('parallels' in mercator.projection).toBe(false);
    });

    it('gives the satellite projection a tilt and a distance', () => {
      const geo = geoOfLayout({ projection: { type: 'satellite' } });
      expect(geo.projection.tilt).toBe(0);
      expect(geo.projection.distance).toBe(2);
      expect(
        geoOfLayout({ projection: { type: 'satellite', tilt: 25, distance: 1.5 } }).projection,
      ).toMatchObject({ tilt: 25, distance: 1.5 });
      // Inside the globe: back to the default.
      expect(
        geoOfLayout({ projection: { type: 'satellite', distance: 1 } }).projection.distance,
      ).toBe(2);
      const flat = geoOfLayout({ projection: { tilt: 25, distance: 1.5 } });
      expect('tilt' in flat.projection).toBe(false);
      expect('distance' in flat.projection).toBe(false);
    });

    it('limits zooming only when asked', () => {
      const free = geoOfLayout().projection;
      expect(free.minscale).toBe(0);
      expect('maxscale' in free).toBe(false);
      const limited = geoOfLayout({ projection: { minscale: 0.5, maxscale: 4 } }).projection;
      expect(limited).toMatchObject({ minscale: 0.5, maxscale: 4 });
      const bad = geoOfLayout({ projection: { minscale: -1, maxscale: -2 } }).projection;
      expect(bad.minscale).toBe(0);
      expect('maxscale' in bad).toBe(false);
    });

    it('knows every Plotly projection', () => {
      const values = geoAttributes.children.projection.children.type.values;
      expect(values).toBe(PROJECTION_TYPES);
      for (const type of PROJECTION_TYPES) {
        expect(geoOfLayout({ projection: { type } }).projection.type).toBe(type);
      }
    });
  });

  describe('visible', () => {
    it('turns the default of every layer off', () => {
      const world = geoOfLayout({ visible: false });
      expect(world.visible).toBe(false);
      expect(world.showcoastlines).toBe(false);
      expect(world.showframe).toBe(false);
      expect(geoOfLayout({ visible: false, scope: 'europe' }).showcountries).toBe(false);
      expect(geoOfLayout({ visible: false, scope: 'usa' }).showsubunits).toBe(false);
    });

    it('leaves the layers the figure shows', () => {
      const geo = geoOfLayout({
        visible: false,
        showland: true,
        showframe: true,
        lataxis: { showgrid: true },
      });
      expect(geo.showland).toBe(true);
      expect(geo.showframe).toBe(true);
      expect(geo.lataxis.showgrid).toBe(true);
      expect(geo.lonaxis.showgrid).toBe(false);
      expect(geo.showcoastlines).toBe(false);
    });

    it('hides what the template shows (plotly.js issue 4482)', () => {
      const template = {
        layout: {
          geo: {
            showland: true,
            showlakes: true,
            showocean: true,
            showrivers: true,
            showcountries: true,
            lonaxis: { showgrid: true, gridcolor: 'red' },
            lataxis: { showgrid: true },
            landcolor: 'green',
          },
        },
      };
      const shown = geoOfLayout({}, { template });
      expect(shown).toMatchObject({ showland: true, showlakes: true, showcountries: true });
      expect(shown.lonaxis.showgrid).toBe(true);
      const hidden = geoOfLayout({ visible: false }, { template });
      expect(hidden).toMatchObject({
        showland: false,
        showlakes: false,
        showocean: false,
        showrivers: false,
        showcountries: false,
      });
      expect(hidden.lonaxis.showgrid).toBe(false);
      expect(hidden.lataxis.showgrid).toBe(false);
      // Only the layers are overridden; the template's colors stay.
      expect(hidden.landcolor).toBe('rgb(0, 128, 0)');
      expect(hidden.lonaxis.gridcolor).toBe('rgb(255, 0, 0)');
    });

    it('does not override the template when the template is what hides the map', () => {
      // Plotly checks the figure's `visible`, not the coerced one.
      const geo = geoOfLayout(
        {},
        { template: { layout: { geo: { visible: false, showland: true } } } },
      );
      expect(geo.visible).toBe(false);
      expect(geo.showcoastlines).toBe(false);
      expect(geo.showland).toBe(true);
    });
  });

  describe('fitbounds', () => {
    it('is on by default, and keeps the mode asked for', () => {
      expect(geoOfLayout().fitbounds).toBe('locations');
      expect(geoOfLayout({ fitbounds: 'geojson' }).fitbounds).toBe('geojson');
      expect(geoOfLayout({ fitbounds: false }).fitbounds).toBe(false);
      expect(geoOfLayout({ fitbounds: 'everything' }).fitbounds).toBe('locations');
    });

    it('is off when the figure sets a view attribute it would compute', () => {
      const off = (geo: Layout): void =>
        expect(geoOfLayout(geo).fitbounds, JSON.stringify(geo)).toBe(false);
      const stays = (geo: Layout): void =>
        expect(geoOfLayout(geo).fitbounds, JSON.stringify(geo)).toBe('locations');
      // Every kind of map: the center and the scale.
      off({ center: { lon: 10 } });
      off({ center: { lat: 10 } });
      off({ projection: { scale: 2 } });
      off({ scope: 'europe', center: { lat: 50 } });
      // World maps: the rotation about the axis; and the ranges, which are not fitted but say
      // what the view should be.
      off({ projection: { rotation: { lon: 20 } } });
      off({ lonaxis: { range: [0, 90] } });
      off({ lataxis: { range: [0, 45] } });
      stays({ projection: { rotation: { lat: 20 } } });
      stays({ projection: { rotation: { roll: 20 } } });
      // Clipped world maps: both rotations and both ranges.
      off({ projection: { type: 'orthographic', rotation: { lat: 20 } } });
      off({ projection: { type: 'orthographic' }, lonaxis: { range: [0, 90] } });
      off({ projection: { type: 'orthographic' }, lataxis: { range: [0, 45] } });
      stays({ projection: { type: 'orthographic', rotation: { roll: 20 } } });
      // Scoped maps: only the center and scale are fitted. The ranges of a clipped scope
      // (Europe's conic conformal) do not count; those of another scope do.
      stays({ scope: 'europe', lonaxis: { range: [0, 40] } });
      stays({ scope: 'europe', projection: { rotation: { lon: 20, lat: 5 } } });
      off({ scope: 'asia', lonaxis: { range: [60, 120] } });
      stays({ scope: 'asia', projection: { rotation: { lon: 20 } } });
      // `null` is unset.
      stays({ center: { lon: null, lat: null }, projection: { scale: null } });
      // Things that are not view attributes.
      stays({ showland: true, lonaxis: { showgrid: true }, projection: { type: 'mercator' } });
    });

    it('is off for the projections Plotly cannot fit', () => {
      for (const type of ['albers usa', 'craig', 'peirce quincuncial', 'satellite']) {
        expect(geoOfLayout({ projection: { type } }).fitbounds, type).toBe(false);
      }
      expect(geoOfLayout({ projection: { type: 'robinson' } }).fitbounds).toBe('locations');
    });

    it('resets the attributes it computes, so a template cannot set the view', () => {
      // Plotly nulls them; here they hold the automatic values until the view is fitted.
      const template = {
        layout: {
          geo: {
            center: { lon: 40, lat: 12 },
            projection: { scale: 3, rotation: { lon: 30, lat: 10, roll: 7 } },
          },
        },
      };
      const world = geoOfLayout({}, { template });
      expect(world.fitbounds).toBe('locations');
      expect(world.projection.scale).toBe(1);
      // Not clipped: the range (around the template's rotation) and `rotation.lat` are kept.
      expect(world.lonaxis.range).toEqual([-150, 210]);
      expect(world.projection.rotation).toEqual({ lon: 30, lat: 10, roll: 7 });
      expect(world.center).toEqual({ lon: 30, lat: 10 });

      const globe = geoOfLayout({ projection: { type: 'orthographic' } }, { template });
      expect(globe.fitbounds).toBe('locations');
      expect(globe.lonaxis.range).toEqual([-90, 90]);
      expect(globe.lataxis.range).toEqual([-90, 90]);
      expect(globe.projection.rotation).toEqual({ lon: 0, lat: 0, roll: 7 });
      expect(globe.center).toEqual({ lon: 0, lat: 0 });
      expect(globe.projection.scale).toBe(1);

      const scoped = geoOfLayout({ scope: 'africa' }, { template });
      expect(scoped.fitbounds).toBe('locations');
      expect(scoped.center).toEqual({ lon: 15, lat: 0 });
      expect(scoped.projection.scale).toBe(1);
      // A scope's rotation is not fitted, so the template's stays.
      expect(scoped.projection.rotation).toEqual({ lon: 30, lat: 10, roll: 7 });

      // With the fit off the template's view applies.
      const off = geoOfLayout({ fitbounds: false }, { template });
      expect(off.center).toEqual({ lon: 40, lat: 12 });
      expect(off.projection.scale).toBe(3);
    });

    it('names the attributes the fit computes', () => {
      expect(fitboundsViewKeys(geoOfLayout({ scope: 'europe' }))).toEqual([
        'center.lon',
        'center.lat',
        'projection.scale',
      ]);
      expect(fitboundsViewKeys(geoOfLayout())).toEqual([
        'center.lon',
        'center.lat',
        'projection.scale',
        'projection.rotation.lon',
      ]);
      expect(fitboundsViewKeys(geoOfLayout({ projection: { type: 'orthographic' } }))).toEqual([
        'center.lon',
        'center.lat',
        'projection.scale',
        'projection.rotation.lon',
        'projection.rotation.lat',
        'lonaxis.range',
        'lataxis.range',
      ]);
    });
  });

  describe('templates', () => {
    const template = {
      layout: {
        geo: { bgcolor: '#123456', landcolor: '#0a0a0f', showland: true, resolution: 50 },
      },
    };

    it('applies the template’s geo container to every subplot', () => {
      const fl = layout({ data: [trace, on('geo2')], layout: { template } } as FigureInput);
      for (const id of ['geo', 'geo2']) {
        expect(fl[id]).toMatchObject({
          bgcolor: 'rgb(18, 52, 86)',
          landcolor: 'rgb(10, 10, 15)',
          showland: true,
          resolution: 50,
        });
      }
    });

    it('prefers the template’s own container for a numbered subplot', () => {
      const fl = layout({
        data: [trace, on('geo2')],
        layout: {
          template: { layout: { ...template.layout, geo2: { bgcolor: '#fedcba' } } },
        },
      } as FigureInput);
      expect((fl['geo'] as FullGeoLayout).bgcolor).toBe('rgb(18, 52, 86)');
      // As in Plotly, `geo2` in the template replaces `geo`, it is not merged over it.
      expect((fl['geo2'] as FullGeoLayout).bgcolor).toBe('rgb(254, 220, 186)');
      expect((fl['geo2'] as FullGeoLayout).showland).toBe(false);
    });

    it('lets the figure override the template, and skips the template’s invalid values', () => {
      expect(geoOfLayout({ bgcolor: 'black', showland: false }, { template })).toMatchObject({
        bgcolor: 'rgb(0, 0, 0)',
        showland: false,
        resolution: 50,
      });
      const bad = { layout: { geo: { bgcolor: 'nope', scope: 'mars', lonaxis: 3 } } };
      expect(geoOfLayout({}, { template: bad })).toMatchObject({
        bgcolor: 'rgb(255, 255, 255)',
        scope: 'world',
      });
    });

    it('falls back to the template when the figure’s value is invalid', () => {
      expect(geoOfLayout({ bgcolor: 'nope', resolution: 30 }, { template })).toMatchObject({
        bgcolor: 'rgb(18, 52, 86)',
        resolution: 50,
      });
    });
  });

  describe('subplots', () => {
    it('finds the subplots of the visible geo traces, in order of their number', () => {
      const fl = layout({
        data: [on('geo3'), on('geo10'), trace, on('geo2'), on('geo3')],
      } as FigureInput);
      expect(fl[GEO_SUBPLOTS]).toEqual(['geo', 'geo2', 'geo3', 'geo10']);
      expect(geoSubplotIds(fl as never)).toEqual(['geo', 'geo2', 'geo3', 'geo10']);
      for (const id of ['geo', 'geo2', 'geo3', 'geo10']) {
        expect(geoLayoutOf(fl as never, id)?.scope).toBe('world');
      }
      expect(geoLayoutOf(fl as never, 'geo4')).toBeUndefined();
      // Only geo ids name a geo container.
      expect(geoLayoutOf(fl as never, 'font')).toBeUndefined();
      expect(geoLayoutOf(undefined, 'geo')).toBeUndefined();
      expect(geoSubplotIds(undefined)).toEqual([]);
    });

    it('reads `geo1` as `geo` and an invalid id as the default', () => {
      const fl = layout({ data: [on('geo1'), on('map'), on('geo0')] } as FigureInput);
      expect(fl[GEO_SUBPLOTS]).toEqual(['geo']);
    });

    it('makes no subplot for hidden traces, other traces, or without geo traces', () => {
      const hidden = layout({
        data: [trace, { ...on('geo2'), visible: false }, { type: 'notgeo', geo: 'geo3' }],
        layout: { geo2: { scope: 'asia' }, geo3: {} },
      } as FigureInput);
      expect(hidden[GEO_SUBPLOTS]).toEqual(['geo']);
      expect(hidden['geo2']).toBeUndefined();
      expect(hidden['geo3']).toBeUndefined();
      // `legendonly` traces keep their subplot.
      const legendonly = layout({
        data: [{ ...on('geo2'), visible: 'legendonly' }],
      } as FigureInput);
      expect(legendonly[GEO_SUBPLOTS]).toEqual(['geo2']);
      const none = layout({ data: [{ type: 'notgeo' }], layout: { geo: {} } } as FigureInput);
      expect(none['geo']).toBeUndefined();
      expect(geoSubplotIds(none as never)).toEqual([]);
    });

    it('tells geo traces from others, and names their subplot', () => {
      const { fullData } = supplyDefaults(
        { data: [on('geo2'), { type: 'notgeo', geo: 'geo3' }] } as FigureInput,
        registry,
        { validate: false },
      );
      expect(isGeoTrace(fullData[0]!)).toBe(true);
      expect(isGeoTrace(fullData[1]!)).toBe(false);
      expect(geoOf(fullData[0]!)).toBe('geo2');
      expect(geoOf({})).toBe('geo');
      expect(geoOf({ geo: '' })).toBe('geo');
    });

    it('defaults each subplot from its own container', () => {
      const fl = layout({
        data: [trace, on('geo2')],
        layout: { geo: { scope: 'asia' }, geo2: { projection: { type: 'orthographic' } } },
      } as FigureInput);
      expect((fl['geo'] as FullGeoLayout).projection.type).toBe('mercator');
      expect((fl['geo2'] as FullGeoLayout).scope).toBe('world');
      expect((fl['geo2'] as FullGeoLayout)._isClipped).toBe(true);
    });

    it('stacks several subplots from the bottom (Plotly’s `partition: y`)', () => {
      const fl = layout({ data: [trace, on('geo2'), on('geo3'), on('geo4')] } as FigureInput);
      expect((fl['geo'] as FullGeoLayout).domain).toEqual({ x: [0, 1], y: [0, 0.25] });
      expect((fl['geo2'] as FullGeoLayout).domain).toEqual({ x: [0, 1], y: [0.25, 0.5] });
      expect((fl['geo3'] as FullGeoLayout).domain).toEqual({ x: [0, 1], y: [0.5, 0.75] });
      expect((fl['geo4'] as FullGeoLayout).domain).toEqual({ x: [0, 1], y: [0.75, 1] });
    });

    it('takes a domain from the figure, and rejects an empty or reversed one', () => {
      const geo = geoOfLayout({ domain: { x: [0.1, 0.6], y: [0.8, 0.2] } });
      expect(geo.domain).toEqual({ x: [0.1, 0.6], y: [0, 1] });
      expect(geoOfLayout({ domain: { x: [0.5, 0.5] } }).domain.x).toEqual([0, 1]);
      expect(geoOfLayout({ domain: { x: [0, 2] } }).domain.x).toEqual([0, 1]);
    });

    it('places subplots in grid cells', () => {
      const fl = layout({
        data: [trace, on('geo2'), on('geo3')],
        layout: {
          grid: { rows: 2, columns: 2 },
          geo2: { domain: { row: 1, column: 1 } },
          geo3: { domain: { row: 0, column: 1, x: [0.7, 0.9] } },
        },
      } as FigureInput);
      const cells = (fl['grid'] as { _domains: { x: number[][]; y: number[][] } })._domains;
      // Row and column default to 0, as in Plotly: without them a subplot is in the first cell.
      expect((fl['geo'] as FullGeoLayout).domain).toEqual({
        x: cells.x[0],
        y: cells.y[0],
        row: 0,
        column: 0,
      });
      expect((fl['geo2'] as FullGeoLayout).domain).toEqual({
        x: cells.x[1],
        y: cells.y[1],
        row: 1,
        column: 1,
      });
      // The first row is the top one.
      expect(cells.y[1]![1]).toBeLessThan(cells.y[0]![0]!);
      expect(cells.x[1]![0]).toBeGreaterThan(cells.x[0]![1]!);
      // An explicit extent wins over the cell.
      expect((fl['geo3'] as FullGeoLayout).domain).toMatchObject({ x: [0.7, 0.9], y: cells.y[0] });
    });

    it('ignores a row or column outside the grid', () => {
      const fl = layout({
        data: [trace],
        layout: { grid: { rows: 2, columns: 2 }, geo: { domain: { row: 5, column: 7 } } },
      } as FigureInput);
      expect((fl['geo'] as FullGeoLayout).domain).toMatchObject({ x: [0, 1], y: [0, 1] });
    });
  });

  describe('invalid values', () => {
    it('fall back to the defaults', () => {
      const geo = unfitted({
        scope: 'mars',
        resolution: 30,
        projection: { type: 'flat', scale: -1, rotation: { lon: 'east' } },
        center: { lon: 'here', lat: {} },
        visible: 'yes',
        showland: 1,
        landcolor: 'nope',
        coastlinewidth: -1,
        bgcolor: 42,
        lonaxis: { range: 'all', showgrid: 'true', dtick: 'x', gridwidth: -2 },
        lataxis: 7,
      });
      expect(geo.scope).toBe('world');
      expect(geo.resolution).toBe(110);
      expect(geo.projection).toEqual({
        type: 'equirectangular',
        scale: 1,
        minscale: 0,
        rotation: { lon: 0, lat: 0, roll: 0 },
      });
      expect(geo.center).toEqual({ lon: 0, lat: 0 });
      expect(geo.visible).toBe(true);
      expect(geo.showland).toBe(false);
      expect(geo.landcolor).toBe(LAND);
      expect(geo.coastlinewidth).toBe(1);
      expect(geo.bgcolor).toBe('rgb(255, 255, 255)');
      expect(geo.lonaxis).toMatchObject({
        range: [-180, 180],
        showgrid: false,
        dtick: 30,
        gridwidth: 1,
      });
      expect(geo.lataxis).toMatchObject({ range: [-90, 90], dtick: 10 });
    });

    it('accepts numbers given as strings', () => {
      const geo = unfitted({ resolution: '50', projection: { scale: '2' }, center: { lon: '15' } });
      expect(geo.resolution).toBe(50);
      expect(geo.projection.scale).toBe(2);
      expect(geo.center.lon).toBe(15);
    });

    it('fills a partial range or parallels from the default, item by item (Plotly info_array)', () => {
      const geo = unfitted({
        lonaxis: { range: [null, 60] },
        lataxis: { range: ['south', '45'] },
        projection: { type: 'albers', parallels: ['a', 50] },
      });
      expect(geo.lonaxis.range).toEqual([-180, 60]);
      expect(geo.lataxis.range).toEqual([-90, 45]);
      expect(geo.projection.parallels).toEqual([0, 50]);
      // Extra items are dropped.
      expect(unfitted({ lataxis: { range: [10, 20, 30] } }).lataxis.range).toEqual([10, 20]);
    });

    it('defaults a container that is not an object', () => {
      const fl = layout({ data: [trace], layout: { geo: 5 } } as unknown as FigureInput);
      expect((fl['geo'] as FullGeoLayout).scope).toBe('world');
    });
  });

  it('defaults `uirevision` to the layout’s', () => {
    expect('uirevision' in geoOfLayout()).toBe(false);
    expect(geoOfLayout({}, { uirevision: 'keep' }).uirevision).toBe('keep');
    expect(geoOfLayout({ uirevision: 3 }, { uirevision: 'keep' }).uirevision).toBe(3);
  });

  it('validates geoN containers and the `geo` trace attribute', () => {
    const issues = validate(
      [{ type: 'geopoints', geo: 'geo3' }],
      {
        geo3: {
          scope: 'europe',
          resolution: 50,
          fitbounds: false,
          projection: { type: 'conic conformal', parallels: [30, 60], rotation: { lon: 10 } },
          center: { lon: 10, lat: 50 },
          lonaxis: { range: [-10, 40], showgrid: true, dtick: 5, griddash: 'dot' },
          showland: true,
          landcolor: '#222',
          domain: { row: 0, column: 0 },
          uirevision: true,
        },
      },
      registry,
    );
    expect(issues).toEqual([]);
    const bad = validate(
      [{ type: 'geopoints' }],
      { geo: { scope: 'mars', projection: { type: 'flat' } } },
      registry,
    );
    expect(bad.map((issue) => issue.path).sort()).toEqual([
      'layout.geo.projection.type',
      'layout.geo.scope',
    ]);
  });

  it('gives the same output when run on its own output, with the fit off', () => {
    // With the fit on it does not: the reset view attributes read as the figure's own (see
    // `resetFittedView`).
    const figures: Layout[] = [
      {},
      { scope: 'usa' },
      { scope: 'europe' },
      { scope: 'north america', resolution: 50 },
      { projection: { type: 'albers usa' } },
      { projection: { type: 'orthographic', rotation: { lon: 30, lat: 20 } } },
      { projection: { type: 'satellite' }, visible: false },
      { lonaxis: { range: [170, -170], showgrid: true }, showland: true },
    ];
    for (const geo of figures) {
      const once = supplyDefaults(
        { data: [trace], layout: { geo: { fitbounds: false, ...geo } } } as FigureInput,
        registry,
        { validate: false },
      );
      const again = supplyDefaults(
        {
          data: stripInternal(once.fullData),
          layout: stripInternal(once.fullLayout),
        } as FigureInput,
        registry,
        { validate: false },
      );
      expect(again.fullLayout['geo'], JSON.stringify(geo)).toEqual(once.fullLayout['geo']);
    }
  });
});

describe('the defaulted container is a FullGeoLayout', () => {
  type Flags = '_isScoped' | '_isSatellite' | '_isConic' | '_isClipped' | '_isAlbersUsa';
  type Schema = InferFull<typeof geoAttributes>;
  /** A type with every optional or possibly-undefined member present, at every depth. */
  type Complete<T> = T extends readonly unknown[]
    ? T
    : T extends object
      ? { [K in keyof T]-?: Complete<Exclude<T[K], undefined>> }
      : T;

  it('declares the attributes of the type, with the types it promises', () => {
    // The same keys: nothing in the type that the schema lacks, and the other way round.
    expectTypeOf<keyof Schema>().toEqualTypeOf<Exclude<keyof FullGeoLayout, Flags>>();
    expectTypeOf<keyof Schema['projection']>().toEqualTypeOf<keyof FullGeoLayout['projection']>();
    expectTypeOf<keyof Schema['lonaxis']>().toEqualTypeOf<keyof FullGeoLayout['lonaxis']>();
    expectTypeOf<keyof Schema['lataxis']>().toEqualTypeOf<keyof FullGeoLayout['lataxis']>();
    // What the schema can hold, once everything is supplied, is a `FullGeoLayout`.
    expectTypeOf<Complete<Omit<Schema, 'uirevision'>>>().toExtend<
      Omit<FullGeoLayout, Flags | 'uirevision'>
    >();
    expectTypeOf(geoLayoutOf).returns.toEqualTypeOf<FullGeoLayout | undefined>();
    expectTypeOf(geoFlags('world', 'mercator')).toExtend<Pick<FullGeoLayout, Flags>>();
  });

  /** Every key `FullGeoLayout` requires, with the `typeof` of its value. */
  const AXIS = {
    showgrid: 'boolean',
    tick0: 'number',
    dtick: 'number',
    gridcolor: 'string',
    gridwidth: 'number',
    griddash: 'string',
  };
  const REQUIRED: Record<string, string> = {
    fitbounds: 'boolean|string',
    resolution: 'number',
    scope: 'string',
    visible: 'boolean',
    showcoastlines: 'boolean',
    coastlinecolor: 'string',
    coastlinewidth: 'number',
    showland: 'boolean',
    landcolor: 'string',
    showocean: 'boolean',
    oceancolor: 'string',
    showlakes: 'boolean',
    lakecolor: 'string',
    showrivers: 'boolean',
    rivercolor: 'string',
    riverwidth: 'number',
    showcountries: 'boolean',
    countrycolor: 'string',
    countrywidth: 'number',
    showsubunits: 'boolean',
    subunitcolor: 'string',
    subunitwidth: 'number',
    showframe: 'boolean',
    framecolor: 'string',
    framewidth: 'number',
    bgcolor: 'string',
    'projection.type': 'string',
    'projection.rotation.lon': 'number',
    'projection.rotation.lat': 'number',
    'projection.rotation.roll': 'number',
    'projection.scale': 'number',
    'projection.minscale': 'number',
    'center.lon': 'number',
    'center.lat': 'number',
    _isScoped: 'boolean',
    _isSatellite: 'boolean',
    _isConic: 'boolean',
    _isClipped: 'boolean',
    _isAlbersUsa: 'boolean',
    ...Object.fromEntries(
      ['lonaxis', 'lataxis'].flatMap((axis) =>
        Object.entries(AXIS).map(([key, type]) => [`${axis}.${key}`, type]),
      ),
    ),
  };
  const PAIRS = ['domain.x', 'domain.y', 'lonaxis.range', 'lataxis.range'];

  const at = (geo: unknown, path: string): unknown =>
    path.split('.').reduce<unknown>((v, key) => (v as Record<string, unknown>)?.[key], geo);

  const figures: Layout[] = [
    {},
    { fitbounds: false },
    { visible: false },
    { scope: 'usa' },
    { scope: 'usa', projection: { type: 'mercator' } },
    { scope: 'europe' },
    { scope: 'north america', resolution: 50, visible: false },
    { projection: { type: 'albers usa' }, visible: false },
    { projection: { type: 'orthographic' } },
    { projection: { type: 'satellite' } },
    { projection: { type: 'albers' }, fitbounds: 'geojson' },
    { lonaxis: 4, lataxis: null, projection: 'x', center: [] },
  ];

  for (const geoIn of figures) {
    it(`is complete for ${JSON.stringify(geoIn)}`, () => {
      const geo = geoOfLayout(geoIn);
      for (const [path, type] of Object.entries(REQUIRED)) {
        expect(type.split('|'), path).toContain(typeof at(geo, path));
        expect(at(geo, path), path).not.toBeNaN();
      }
      for (const path of PAIRS) {
        const pair = at(geo, path) as unknown[];
        expect(pair, path).toHaveLength(2);
        expect(
          pair.every((v) => typeof v === 'number' && Number.isFinite(v)),
          path,
        ).toBe(true);
      }
    });
  }
});
