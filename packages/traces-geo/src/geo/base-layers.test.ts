/**
 * The base layers as data, and their draw order (backlog GEO2): which layers a container shows,
 * their styles, what each projects, and the order table trace modules draw by.
 */
import type { FullTrace } from '@mk7s/holochart-core';
import type { MultiLineString, MultiPolygon } from 'geojson';
import { describe, expect, it } from 'vitest';
import {
  baseLayerGeometry,
  baseLayerStyle,
  isDataLayer,
  isFillLayer,
  needsBasemap,
  needsBasemapExtras,
  settleOrder,
  shownBaseLayers,
} from './base-layers.ts';
import { LAYERS, LAYERS_FOR_CHOROPLETH } from './constants.ts';
import {
  GEO_LAYER_STEP,
  GEO_ORDER,
  GEO_ORDER_FOR_CHOROPLETH,
  geoHasChoropleth,
  geoLayers,
  geoOrder,
  geoTraceOrder,
} from './order.ts';
import type { BasemapLayers, FullGeoAxis, FullGeoLayout } from './types.ts';

const AXIS: FullGeoAxis = {
  range: [-180, 180],
  showgrid: false,
  tick0: 0,
  dtick: 30,
  gridcolor: '#eeeeee',
  gridwidth: 1,
  griddash: 'solid',
};

/** A container with every layer off, and the colors and widths the tests read. */
function container(patch: Partial<FullGeoLayout> = {}): FullGeoLayout {
  return {
    scope: 'world',
    resolution: 110,
    showocean: false,
    oceancolor: '#3399ff',
    showland: false,
    landcolor: '#f0dc82',
    showlakes: false,
    lakecolor: '#3399ff',
    showsubunits: false,
    subunitcolor: '#444444',
    subunitwidth: 1,
    showcountries: false,
    countrycolor: '#ff0000',
    countrywidth: 2,
    showcoastlines: false,
    coastlinecolor: '#444444',
    coastlinewidth: 1,
    showrivers: false,
    rivercolor: '#3399ff',
    riverwidth: 1.5,
    showframe: false,
    framecolor: 'rgba(0, 0, 0, 0.5)',
    framewidth: 3,
    lonaxis: AXIS,
    lataxis: AXIS,
    ...patch,
  } as FullGeoLayout;
}

const ALL = container({
  showocean: true,
  showland: true,
  showlakes: true,
  showsubunits: true,
  showcountries: true,
  showcoastlines: true,
  showrivers: true,
  showframe: true,
  lonaxis: { ...AXIS, showgrid: true },
  lataxis: { ...AXIS, showgrid: true },
});

const line = (lon: number): MultiLineString => ({
  type: 'MultiLineString',
  coordinates: [
    [
      [lon, 0],
      [lon, 10],
    ],
  ],
});

const square = (lon: number): MultiPolygon => ({
  type: 'MultiPolygon',
  coordinates: [
    [
      [
        [lon, 0],
        [lon, 10],
        [lon + 10, 10],
        [lon + 10, 0],
        [lon, 0],
      ],
    ],
  ],
});

describe('shownBaseLayers', () => {
  it("lists the layers a container shows, in Plotly's order", () => {
    expect(shownBaseLayers(container(), false)).toEqual([]);
    expect(shownBaseLayers(ALL, false)).toEqual(LAYERS.slice(1, -2));
    expect(shownBaseLayers(ALL, true)).toEqual(
      LAYERS_FOR_CHOROPLETH.filter((n) => n !== 'bg' && n !== 'backplot' && n !== 'frontplot'),
    );
    expect(shownBaseLayers(container({ showland: true, showframe: true }), false)).toEqual([
      'land',
      'frame',
    ]);
    expect(shownBaseLayers(container({ lataxis: { ...AXIS, showgrid: true } }), false)).toEqual([
      'lataxis',
    ]);
  });

  it('knows fills from lines and data layers from the others', () => {
    const names = shownBaseLayers(ALL, false);
    expect(names.filter(isFillLayer)).toEqual(['ocean', 'land', 'lakes']);
    expect(names.filter(isDataLayer)).toEqual([
      'land',
      'lakes',
      'subunits',
      'countries',
      'coastlines',
      'rivers',
    ]);
  });
});

describe('needsBasemap', () => {
  it('asks for data only when a data layer is shown, and for the extras only for their layers', () => {
    const sphere = container({ showocean: true, showframe: true });
    expect(needsBasemap(sphere)).toBe(false);
    expect(needsBasemapExtras(sphere)).toBe(false);
    for (const flag of ['showland', 'showcoastlines', 'showcountries'] as const) {
      expect(needsBasemap(container({ [flag]: true }))).toBe(true);
      expect(needsBasemapExtras(container({ [flag]: true }))).toBe(false);
    }
    for (const flag of ['showlakes', 'showrivers', 'showsubunits'] as const) {
      expect(needsBasemap(container({ [flag]: true }))).toBe(true);
      expect(needsBasemapExtras(container({ [flag]: true }))).toBe(true);
    }
  });
});

describe('baseLayerStyle', () => {
  it('reads a fill’s color', () => {
    const style = baseLayerStyle(ALL, 'land');
    expect(style.color[0]).toBeCloseTo(0xf0 / 255, 10);
    expect(style.color[3]).toBe(1);
    expect(style.width).toBe(0);
  });

  it('reads a line’s color and width, solid with Plotly’s miter limit', () => {
    expect(baseLayerStyle(ALL, 'countries')).toMatchObject({
      color: [1, 0, 0, 1],
      width: 2,
      dash: 'solid',
      miterLimit: 2,
    });
    expect(baseLayerStyle(ALL, 'rivers').width).toBe(1.5);
    expect(baseLayerStyle(ALL, 'frame')).toMatchObject({ color: [0, 0, 0, 0.5], width: 3 });
  });

  it('reads the graticule’s color, width and dash from its axis', () => {
    const layout = container({
      lonaxis: { ...AXIS, gridcolor: '#0000ff', gridwidth: 0.5, griddash: 'dash' },
    });
    expect(baseLayerStyle(layout, 'lonaxis')).toMatchObject({
      color: [0, 0, 1, 1],
      width: 0.5,
      dash: 'dash',
      miterLimit: 4,
    });
    expect(baseLayerStyle(layout, 'lataxis').dash).toBe('solid');
  });

  it('has a key that changes with the style and with nothing else', () => {
    const key = baseLayerStyle(ALL, 'countries').key;
    expect(baseLayerStyle(container({ ...ALL, landcolor: '#000000' }), 'countries').key).toBe(key);
    expect(baseLayerStyle(container({ ...ALL, countrywidth: 5 }), 'countries').key).not.toBe(key);
    expect(baseLayerStyle(container({ ...ALL, countrycolor: 'blue' }), 'countries').key).not.toBe(
      key,
    );
  });

  it('falls back to black for a color it cannot read', () => {
    expect(baseLayerStyle(container({ landcolor: 'no such color' }), 'land').color).toEqual([
      0, 0, 0, 1,
    ]);
  });
});

describe('baseLayerGeometry', () => {
  it('hands out the basemap’s own geometry for land, lakes, coastlines and rivers', () => {
    const basemap: BasemapLayers = {
      land: square(0),
      lakes: square(20),
      coastlines: line(0),
      rivers: line(5),
    };
    expect(baseLayerGeometry('land', basemap)).toBe(basemap.land);
    expect(baseLayerGeometry('lakes', basemap)).toBe(basemap.lakes);
    expect(baseLayerGeometry('coastlines', basemap)).toBe(basemap.coastlines);
    expect(baseLayerGeometry('rivers', basemap)).toBe(basemap.rivers);
    expect(baseLayerGeometry('rivers', {})).toBeUndefined();
  });

  it('draws countries as their borders and the coastlines', () => {
    const basemap: BasemapLayers = { borders: line(10), coastlines: line(0) };
    const countries = baseLayerGeometry('countries', basemap);
    expect(countries).toEqual({
      type: 'GeometryCollection',
      geometries: [basemap.borders, basemap.coastlines],
    });
    // Made once: its identity says whether a primitive still holds it.
    expect(baseLayerGeometry('countries', basemap)).toBe(countries);
    // An island scope has no borders, a landlocked one no coast.
    expect(baseLayerGeometry('countries', { coastlines: basemap.coastlines! })).toBe(
      basemap.coastlines,
    );
    expect(baseLayerGeometry('countries', { borders: basemap.borders! })).toBe(basemap.borders);
    expect(baseLayerGeometry('countries', {})).toBeUndefined();
  });

  it('draws subunits as their borders and the outline of their countries', () => {
    const usa = square(-100);
    const canada = square(-100);
    const mexico = square(-110);
    const feature = <P>(id: string, geometry: MultiPolygon, properties: P) =>
      ({ type: 'Feature', id, geometry, properties }) as const;
    const ct: [number, number] = [0, 0];
    const basemap: BasemapLayers = {
      subunitBorders: line(-95),
      subunits: [
        feature('CA', square(-120), { name: 'California', gu: 'USA', ct }),
        feature('TX', square(-100), { name: 'Texas', gu: 'USA', ct }),
        feature('ON', square(-90), { name: 'Ontario', gu: 'CAN', ct }),
      ],
      countries: [
        feature('MEX', mexico, { name: 'Mexico', ct }),
        feature('USA', usa, { name: 'United States of America', ct }),
        feature('CAN', canada, { name: 'Canada', ct }),
      ],
    };
    expect(baseLayerGeometry('subunits', basemap)).toEqual({
      type: 'GeometryCollection',
      geometries: [basemap.subunitBorders, usa, canada],
    });
    // Without the countries the borders are all there is; without the borders, nothing.
    const { subunitBorders, subunits } = basemap;
    expect(
      baseLayerGeometry('subunits', { subunitBorders: subunitBorders!, subunits: subunits! }),
    ).toBe(subunitBorders);
    expect(
      baseLayerGeometry('subunits', { subunits: subunits!, countries: basemap.countries! }),
    ).toBeUndefined();
  });
});

describe('settleOrder', () => {
  it('puts the lines before the fills, each group in layer order', () => {
    expect(settleOrder(shownBaseLayers(ALL, false))).toEqual([
      'subunits',
      'countries',
      'coastlines',
      'rivers',
      'lataxis',
      'lonaxis',
      'frame',
      'ocean',
      'land',
      'lakes',
    ]);
  });
});

describe('the draw order of a geo subplot', () => {
  it("follows Plotly's layers, a step apart", () => {
    expect(GEO_LAYER_STEP).toBe(100);
    expect(GEO_ORDER).toEqual({
      bg: 0,
      ocean: 100,
      land: 200,
      lakes: 300,
      subunits: 400,
      countries: 500,
      coastlines: 600,
      rivers: 700,
      lataxis: 800,
      lonaxis: 900,
      frame: 1000,
      backplot: 1100,
      frontplot: 1200,
    });
    expect(GEO_ORDER_FOR_CHOROPLETH).toEqual({
      bg: 0,
      ocean: 100,
      land: 200,
      subunits: 300,
      countries: 400,
      coastlines: 500,
      lataxis: 600,
      lonaxis: 700,
      frame: 800,
      backplot: 900,
      rivers: 1000,
      lakes: 1100,
      frontplot: 1200,
    });
    expect(geoOrder(false)).toBe(GEO_ORDER);
    expect(geoOrder(true)).toBe(GEO_ORDER_FOR_CHOROPLETH);
    expect(geoLayers(false)).toBe(LAYERS);
    expect(geoLayers(true)).toBe(LAYERS_FOR_CHOROPLETH);
  });

  it('stacks traces inside a slot in data order, below the next layer', () => {
    expect(geoTraceOrder(GEO_ORDER.frontplot, 0)).toBe(1200);
    expect(geoTraceOrder(GEO_ORDER.frontplot, 3)).toBeCloseTo(1200.03, 10);
    expect(geoTraceOrder(GEO_ORDER.backplot, 1e9)).toBeLessThan(GEO_ORDER.frontplot);
  });

  it('finds a visible choropleth on a subplot', () => {
    const trace = (patch: Record<string, unknown>): FullTrace =>
      ({ type: 'choropleth', visible: true, geo: 'geo', ...patch }) as unknown as FullTrace;
    expect(geoHasChoropleth([trace({})], 'geo')).toBe(true);
    expect(geoHasChoropleth([trace({})], 'geo2')).toBe(false);
    expect(geoHasChoropleth([trace({ geo: 'geo2' })], 'geo2')).toBe(true);
    expect(geoHasChoropleth([trace({ visible: 'legendonly' })], 'geo')).toBe(false);
    expect(geoHasChoropleth([trace({ type: 'scattergeo' })], 'geo')).toBe(false);
  });
});
