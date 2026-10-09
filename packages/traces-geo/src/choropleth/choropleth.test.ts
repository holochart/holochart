/**
 * `choropleth` (backlog GEO4, GEO5, GEO6): defaults, calc, colors, the redraw rules, the level of
 * detail of a rotation, winding, hover, selection, events, color axes, `fitbounds`, descriptions
 * and keyboard stops.
 *
 * The basemap is a stub with small hand-made layers. The view draws real primitives into
 * scattergeo's recording plot context (they need no WebGL until a frame is rendered).
 */
import { supplyDefaults, validate, type FullTrace } from '@mk7s/holochart-core';
import {
  LinePrimitive,
  type FillData,
  type LazyFillPrimitive,
  type LineData,
  type Primitive,
} from '@mk7s/holochart-render';
import {
  formatTemplate,
  type HoverContext,
  type SharesInsight,
  type TraceUpdatePlan,
} from '@mk7s/holochart-runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBasemap, peekBasemap, type BasemapOptions } from '../basemap/index.ts';
import { clearLocationData } from '../geo/location-data.ts';
import { GEO_LAYER_STEP, GEO_ORDER_FOR_CHOROPLETH } from '../geo/order.ts';
import { projectPolygons } from '../geo/sink.ts';
import type { BasemapLayers } from '../geo/types.ts';
import {
  containerPoint,
  FIGURE,
  hoverContext as scattergeoHoverContext,
  hoverQuery,
  PLOT_AREA,
} from '../scattergeo/__testing__/figure.ts';
import {
  layoutFigure,
  plotContext,
  registry,
  type LaidOutFigure,
  type PlotHarness,
} from './__testing__/figure.ts';
import type { ChoroplethCalc } from './calc.ts';
import { choroplethColorMapping, zValues } from './colors.ts';
import { describeChoropleth } from './describe.ts';
import { choropleth } from './index.ts';
import { CHOROPLETH_LAYER, choroplethOrder, outlineOf, quickFeatures } from './plot.ts';
import { buildBoxGrid, choroplethRegions, regionAt } from './regions.ts';

vi.mock('../basemap/index.ts', () => ({
  peekBasemap: vi.fn(),
  loadBasemap: vi.fn(),
}));

// The projections are counted: a pan must not project, a rotation must.
vi.mock('../geo/sink.ts', async (original) => {
  const sink = await original<typeof import('../geo/sink.ts')>();
  return { ...sink, projectPolygons: vi.fn(sink.projectPolygons) };
});

type Trace = Record<string, unknown>;
type Ring = number[][];

/** A square wound for d3 (clockwise): up the west side, east, down, back west. */
const square = (x: number, y: number, s = 2): Ring => [
  [x, y],
  [x, y + s],
  [x + s, y + s],
  [x + s, y],
  [x, y],
];
/** The same square wound the RFC 7946 way (counter-clockwise): what a hole is to d3. */
const reversed = (x: number, y: number, s = 2): Ring => square(x, y, s).reverse();

/** Label points of the stub's features. */
const AT = {
  FRA: [2, 47],
  USA: [-100, 40],
  BRA: [-53, -10],
  JPN: [138, 37],
  RUS: [175, 65],
  ZAF: [22, -27],
  CA: [-120, 37],
  NY: [-75, 43],
} as const;

/**
 * The stub basemap. `detail` is the size of the simple squares, so that two resolutions can be
 * told apart.
 *
 * - France, Brazil and Japan are squares around their label points.
 * - The USA is a multipolygon: a square around its label point and "Alaska" at (−151…−149, 63…65).
 * - Russia crosses the antimeridian: 170°E to 170°W, 60° to 70°N.
 * - South Africa is 20…30°E, 35…25°S, with a hole (Lesotho) at 24…26°E, 31…29°S.
 */
function basemap(extras: boolean, detail = 2): BasemapLayers {
  const feature = (
    id: keyof typeof AT,
    name: string,
    geometry: BasemapLayers['land'] | { type: 'Polygon'; coordinates: Ring[] },
    more: object = {},
  ) => ({
    type: 'Feature' as const,
    id,
    properties: { name, ct: [...AT[id]] as [number, number], ...more },
    geometry: geometry as { type: 'Polygon'; coordinates: Ring[] },
  });
  const around = (id: keyof typeof AT) => ({
    type: 'Polygon' as const,
    coordinates: [square(AT[id][0] - detail / 2, AT[id][1] - detail / 2, detail)],
  });
  return {
    countries: [
      feature('FRA', 'France', around('FRA')),
      feature('USA', 'United States of America', {
        type: 'MultiPolygon',
        coordinates: [[square(-101, 39)], [square(-151, 63)]],
      }),
      feature('BRA', 'Brazil', around('BRA')),
      feature('JPN', 'Japan', around('JPN')),
      feature('RUS', 'Russia', {
        type: 'Polygon',
        coordinates: [
          [
            [170, 60],
            [170, 70],
            [-170, 70],
            [-170, 60],
            [170, 60],
          ],
        ],
      }),
      feature('ZAF', 'South Africa', {
        type: 'Polygon',
        coordinates: [square(20, -35, 10), reversed(24, -31)],
      }),
    ],
    ...(extras
      ? {
          subunits: [
            feature('CA', 'California', around('CA'), { gu: 'USA' }),
            feature('NY', 'New York', around('NY'), { gu: 'USA' }),
          ],
        }
      : {}),
  } as BasemapLayers;
}

/**
 * Districts of a trace's own `geojson`, wound the RFC 7946 way: outer rings counter-clockwise,
 * the hole of `ring` clockwise. `pair` is a multipolygon.
 */
const RFC = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      id: 'd1',
      properties: { name: 'North', code: { short: 'N' } },
      geometry: { type: 'Polygon', coordinates: [reversed(10, 10)] },
    },
    {
      type: 'Feature',
      id: 'd2',
      properties: { name: 'Ring', code: { short: 'R' } },
      geometry: { type: 'Polygon', coordinates: [reversed(30, 20, 10), square(34, 24)] },
    },
    {
      type: 'Feature',
      id: 'd3',
      properties: { name: 'Pair', code: { short: 'P' } },
      geometry: {
        type: 'MultiPolygon',
        coordinates: [[reversed(-60, -40)], [reversed(-50, -40)]],
      },
    },
  ],
};

/** The same districts wound for d3. */
const D3 = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      id: 'd1',
      properties: { name: 'North' },
      geometry: { type: 'Polygon', coordinates: [square(10, 10)] },
    },
    {
      type: 'Feature',
      id: 'd2',
      properties: { name: 'Ring' },
      geometry: { type: 'Polygon', coordinates: [square(30, 20, 10), reversed(34, 24)] },
    },
  ],
};

const keyOf = (resolution: number, scope: string, o: BasemapOptions = {}): string =>
  `${resolution}|${scope}|${o.extras ? 1 : 0}|${o.url ?? ''}`;

let cached: Map<string, BasemapLayers>;
let loads: Map<string, { resolve(layers: BasemapLayers): void }>;

/** Have a basemap loaded before the figure asks for it. */
function loaded(extras = false, resolution = 110, detail = 2, scope = 'world'): BasemapLayers {
  const layers = basemap(extras, detail);
  cached.set(keyOf(resolution, scope, { extras }), layers);
  return layers;
}

beforeEach(() => {
  clearLocationData();
  cached = new Map();
  loads = new Map();
  vi.mocked(peekBasemap).mockReset();
  vi.mocked(loadBasemap).mockReset();
  vi.mocked(peekBasemap).mockImplementation((resolution, scope, o) =>
    cached.get(keyOf(resolution, scope, o)),
  );
  vi.mocked(loadBasemap).mockImplementation((resolution, scope, o) => {
    const key = keyOf(resolution, scope, o);
    const have = cached.get(key);
    if (have) return Promise.resolve(have);
    return new Promise<BasemapLayers>((resolve) => {
      loads.set(key, {
        resolve(layers) {
          cached.set(key, layers);
          resolve(layers);
        },
      });
    });
  });
  vi.mocked(projectPolygons).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** A world map that fills the plot area exactly: 800 × 400 px for 360° × 180°. */
const FLAT = { projection: { type: 'equirectangular' }, fitbounds: false };
/** A globe seen from above (0°, 0°): a disc 400 px across in the middle of the plot area. */
const GLOBE = { projection: { type: 'orthographic' }, fitbounds: false };
/** Blue at the bottom of the domain, red at the top. */
const BLUE_RED = [
  [0, 'rgb(0, 0, 255)'],
  [1, 'rgb(255, 0, 0)'],
];

/** Subplot px (y up) of a longitude and latitude on the {@link FLAT} map. */
const flat = (lon: number, lat: number): [number, number] => [
  ((lon + 180) * 800) / 360,
  ((lat + 90) * 400) / 180,
];

function defaults(trace: Trace): FullTrace {
  return supplyDefaults({ data: [{ type: 'choropleth', ...trace }] }, registry, {
    validate: false,
  }).fullData[0]!;
}

function figure(
  traces: Trace | Trace[],
  geo: Trace = FLAT,
  chart?: object,
  layout: Trace = {},
): LaidOutFigure {
  const data = (Array.isArray(traces) ? traces : [traces]).map((t) => ({
    type: 'choropleth',
    ...t,
  }));
  return layoutFigure({ data, layout: { geo, ...layout } } as never, chart);
}

const hoverContext = (f: LaidOutFigure): HoverContext => scattergeoHoverContext(f as never);

const PASS: TraceUpdatePlan = { calc: false, plot: true, style: true, transform: false };
const RECALC: TraceUpdatePlan = { calc: true, plot: true, style: true, transform: false };

/** The primitive the view drew at `layer` for trace `index`. */
function layerOf<P extends Primitive<unknown>>(
  h: PlotHarness,
  layer: keyof typeof CHOROPLETH_LAYER,
  index = 0,
): P | undefined {
  const order = choroplethOrder(index) + CHOROPLETH_LAYER[layer];
  return [...h.added.keys()].find((p) => Math.abs(p.object.renderOrder - order) < 1e-9) as
    P | undefined;
}

/** The color of each drawn region the fill was last given, by the index of its location. */
function regionColors(
  calc: ChoroplethCalc,
  update: { mock: { calls: unknown[][] } },
): Map<number, number[][]> {
  const call = [...update.mock.calls].reverse().find((c) => (c[0] as Partial<FillData>).color);
  if (!call) throw new Error('the fill was given no colors');
  const color = (call[0] as FillData).color as Float32Array;
  const { polygons, drawn } = choroplethRegions(calc)!;
  expect(color).toHaveLength(polygons.polygonCount * 4);
  const out = new Map<number, number[][]>();
  for (let p = 0; p < polygons.polygonCount; p++) {
    const i = drawn.index[polygons.featureOf![p]!]!;
    const rgba = Array.from(color.subarray(4 * p, 4 * p + 4)).map((v) => Number(v.toFixed(4)));
    out.set(i, [...(out.get(i) ?? []), rgba]);
  }
  return out;
}

/** The geometry of the last `update` that gave a line one, as polylines of `[x, y]`. */
function lastLine(spy: { mock: { calls: unknown[][] } }): [number, number][][] {
  const call = [...spy.mock.calls].reverse().find((c) => (c[0] as Partial<LineData>).x);
  if (!call) throw new Error('no line geometry was uploaded');
  const { x, y, starts } = call[0] as LineData;
  const cuts = [0, ...Array.from(starts ?? []), x.length];
  const lines: [number, number][][] = [];
  for (let k = 0; k + 1 < cuts.length; k++) {
    const line: [number, number][] = [];
    for (let i = cuts[k]!; i < cuts[k + 1]!; i++) line.push([Number(x[i]), Number(y[i])]);
    lines.push(line);
  }
  return lines;
}

/** The view of trace `index`, its fill once loaded, and a spy on the fill's updates. */
async function drawn(f: LaidOutFigure, index = 0) {
  const h = plotContext(f, index);
  const view = choropleth.plot!.create(h.ctx);
  const fill = layerOf<LazyFillPrimitive>(h, 'fill', index)!;
  await fill.ready;
  const update = vi.spyOn(fill, 'update');
  return { h, view, fill, update };
}

function hover(f: LaidOutFigure, lon: number, lat: number, index = 0) {
  const [cx, cy] = containerPoint(f.subplot(String(f.fullData[index]!['geo'])), lon, lat);
  return choropleth.hoverPoints!(
    f.calcs[index]!,
    f.fullData[index]!,
    hoverQuery(cx, cy),
    hoverContext(f),
  );
}

describe('choropleth defaults (plotly.js choropleth/defaults.js)', () => {
  it('needs locations and z, and counts the shorter of the two', () => {
    expect(defaults({ locations: ['FRA'] }).visible).toBe(false);
    expect(defaults({ z: [1] }).visible).toBe(false);
    expect(defaults({ locations: [], z: [1] }).visible).toBe(false);
    const t = defaults({ locations: ['FRA', 'USA', 'BRA'], z: [1, 2] });
    expect(t.visible).toBe(true);
    expect(t['_length']).toBe(2);
    expect(t['geo']).toBe('geo');
    expect(t['locationmode']).toBe('ISO-3');
    expect(t['featureidkey']).toBeUndefined();
  });

  it('takes Plotly’s outline, opacity, colorscale and legend defaults', () => {
    const t = defaults({ locations: ['FRA'], z: [1] });
    expect(t['marker']).toEqual({ line: { width: 1, color: 'rgb(68, 68, 68)' }, opacity: 1 });
    expect(t['zauto']).toBe(true);
    expect(t['zmin']).toBeUndefined();
    expect(t['autocolorscale']).toBe(true);
    expect(t['reversescale']).toBe(false);
    expect(t['showscale']).toBe(true);
    expect((t['colorbar'] as Trace)['thickness']).toBe(30);
    expect(t['showlegend']).toBe(false);
    // A selection keeps the opacity of the selected regions and dims the others to a fifth.
    expect(t['selected']).toEqual({ marker: { opacity: 1 } });
    expect(t['unselected']).toEqual({ marker: { opacity: 0.2 } });
  });

  it('follows the user: bounds turn `zauto` off, a colorscale the automatic one', () => {
    const t = defaults({
      locations: ['FRA'],
      z: [1],
      zmin: 0,
      zmax: 10,
      colorscale: 'Viridis',
      showscale: false,
      showlegend: true,
      marker: { line: { width: 0, color: 'red' }, opacity: 0.5 },
      unselected: { marker: { opacity: 0.1 } },
    });
    expect(t['zauto']).toBe(false);
    expect(t['zmin']).toBe(0);
    expect(t['zmax']).toBe(10);
    expect(t['zmid']).toBeUndefined();
    expect(t['autocolorscale']).toBe(false);
    expect(t['colorbar']).toBeUndefined();
    expect(t['showlegend']).toBe(true);
    // No outline: its color is not coerced.
    expect((t['marker'] as { line: Trace }).line).toEqual({ width: 0 });
    expect(t['selected']).toEqual({ marker: { opacity: 0.5 } });
    expect(t['unselected']).toEqual({ marker: { opacity: 0.1 } });
    // An opacity per region leaves the selection opacities to the view.
    const per = defaults({ locations: ['FRA', 'USA'], z: [1, 2], marker: { opacity: [1, 0.5] } });
    expect(per['selected']).toBeUndefined();
    expect(per['unselected']).toBeUndefined();
  });

  it('makes `geojson` the source of the locations, with its `featureidkey`', () => {
    const t = defaults({ locations: ['N'], z: [1], geojson: RFC, featureidkey: 'properties.name' });
    expect(t['locationmode']).toBe('geojson-id');
    expect(t['featureidkey']).toBe('properties.name');
    expect(defaults({ locations: ['N'], z: [1], geojson: 'x.json' })['featureidkey']).toBe('id');
    // A color axis owns the colorscale attributes.
    const linked = defaults({ locations: ['FRA'], z: [1], coloraxis: 'coloraxis' });
    expect(linked['coloraxis']).toBe('coloraxis');
    expect(linked['zauto']).toBeUndefined();
    expect(linked['showscale']).toBeUndefined();
  });

  it('validates a Plotly choropleth figure', () => {
    const issues = validate(
      [
        {
          type: 'choropleth',
          locations: ['FRA', 'USA'],
          z: [1, 2],
          locationmode: 'ISO-3',
          text: ['France', 'United States'],
          hovertext: ['fr', 'us'],
          hoverinfo: 'location+z',
          hovertemplate: '%{location}: %{z}',
          colorscale: 'Blues',
          reversescale: true,
          zmin: 0,
          zmax: 5,
          zmid: 2,
          zauto: false,
          autocolorscale: false,
          showscale: true,
          colorbar: { title: { text: 'GDP' } },
          marker: { line: { color: 'white', width: 0.5 }, opacity: 0.8 },
          selected: { marker: { opacity: 1 } },
          unselected: { marker: { opacity: 0.3 } },
          geo: 'geo2',
          showlegend: true,
        },
      ],
      { geo2: { scope: 'europe' } },
      registry,
    );
    expect(issues).toEqual([]);
  });
});

describe('choropleth calc', () => {
  it('keeps z as numbers and draws the locations that have a feature and a number', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const layers = loaded();
    const f = figure({
      locations: ['FRA', 'XXX', 'usa', 'BRA', null, 'JPN'],
      z: [1, 2, '3', null, 5, NaN],
      name: 'gdp',
    });
    const calc = f.calcs[0]!;
    expect(Array.from(calc.z)).toEqual([1, 2, 3, NaN, 5, NaN]);
    expect(calc.length).toBe(6);
    expect(calc.unresolved).toBe(false);
    // France and the USA: the unmatched location, the gap and the two without a number are not.
    expect(Array.from(calc.drawn!.index)).toEqual([0, 2]);
    expect(calc.drawn!.features).toEqual([layers.countries![0], layers.countries![1]]);
    expect(calc.drawn!.located.map((x) => x.id)).toEqual(['FRA', 'USA']);
    expect(Array.from(calc.lon!)).toEqual([2, NaN, -100, -53, NaN, 138]);
    // One warning names the unmatched location and the trace.
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toBe(
      '[holochart] choropleth trace 0 "gdp": 1 location matches no country of the base map by ' +
        `its ISO-3 code (locationmode 'ISO-3') and is not drawn: "XXX".`,
    );
    // Later layout passes keep the answer.
    const before = calc.drawn;
    f.layout();
    expect(calc.drawn).toBe(before);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('spans the color domain over the numbers of z, as Plotly does', () => {
    loaded();
    const auto = figure({ locations: ['FRA', 'USA', 'BRA'], z: [2, 'x', 10] });
    expect(choroplethColorMapping(auto.fullData[0]!, auto.fullLayout)).toMatchObject({
      cmin: 2,
      cmax: 10,
    });
    // `zmid` widens the automatic domain to be symmetric around it.
    const mid = figure({ locations: ['FRA', 'USA'], z: [2, 10], zmid: 0 });
    expect(choroplethColorMapping(mid.fullData[0]!, mid.fullLayout)).toMatchObject({
      cmin: -10,
      cmax: 10,
    });
    // Given bounds are the domain.
    const fixed = figure({ locations: ['FRA', 'USA'], z: [2, 10], zmin: 0, zmax: 100 });
    expect(choroplethColorMapping(fixed.fullData[0]!, fixed.fullLayout)).toMatchObject({
      cmin: 0,
      cmax: 100,
    });
    // One value grows to a domain of one unit; no number at all is no mapping.
    const one = figure({ locations: ['FRA'], z: [4] });
    expect(choroplethColorMapping(one.fullData[0]!, one.fullLayout)).toMatchObject({
      cmin: 3.5,
      cmax: 4.5,
    });
    const none = figure({ locations: ['FRA'], z: ['x'] });
    expect(choroplethColorMapping(none.fullData[0]!, none.fullLayout)).toBeUndefined();
    expect(Array.from(none.calcs[0]!.drawn!.index)).toEqual([]);
  });

  it('calcs a trace that has no locations, and forgets regions it can no longer locate', () => {
    const ctx = { fullLayout: {} as never, index: 0, xaxis: undefined, yaxis: undefined };
    // Hand-built, as no defaults leave it: nothing to locate, nothing to fit.
    const bare = choropleth.calc!({ type: 'choropleth', visible: true, z: [1] } as never, ctx);
    expect(bare).toMatchObject({ length: 0, unresolved: true, drawn: undefined });
    expect(bare.locations).toBeUndefined();
    expect(bare.located).toBeUndefined();
    expect(bare.fit).toBeUndefined();
    // A name that is the default one is not quoted in warnings; an empty one neither.
    const label = (name: unknown): string | undefined =>
      choropleth.calc!(
        {
          type: 'choropleth',
          visible: true,
          name,
          locations: ['FRA'],
          z: [1],
          _length: 1,
        } as never,
        ctx,
      ).locations!.label;
    expect(label('trace 0')).toBe('choropleth trace 0');
    expect(label('')).toBe('choropleth trace 0');
    expect(label(undefined)).toBe('choropleth trace 0');
    expect(label('gdp')).toBe('choropleth trace 0 "gdp"');
    // The data it was located with goes away (another basemap is loading): no regions.
    loaded();
    const f = figure({ locations: ['FRA'], z: [1] }, { ...FLAT, fitbounds: 'locations' });
    const calc = f.calcs[0]!;
    expect(calc.drawn).toBeDefined();
    expect(calc.fit!.lon).toHaveLength(5);
    calc.located!(undefined);
    expect(calc).toMatchObject({ unresolved: true, drawn: undefined, features: undefined });
    expect(calc.lon).toBeUndefined();
    expect(calc.fit).toBeUndefined();
  });

  it('caches the numbers of z by the array', () => {
    const z = [1, '2', 'x'];
    expect(zValues(z)).toBe(zValues(z));
    expect(Array.from(zValues(z))).toEqual([1, 2, NaN]);
    const typed = new Float64Array([1, 2]);
    expect(zValues(typed)).toBe(typed);
    expect(zValues(undefined)).toHaveLength(0);
  });

  it('is unresolved while the basemap loads, and draws when it has arrived', async () => {
    const resize = vi.fn();
    const f = figure({ locations: ['FRA'], z: [1] }, FLAT, { resize });
    const calc = f.calcs[0]!;
    expect(calc.unresolved).toBe(true);
    expect(calc.drawn).toBeUndefined();
    expect(f.subplot().loading).toBeDefined();
    const h = plotContext(f);
    const view = choropleth.plot!.create(h.ctx);
    // Nothing is drawn; a hidden primitive holds `chart.ready` until the load has settled.
    expect(layerOf(h, 'fill')).toBeUndefined();
    expect(h.added.size).toBe(1);
    const [hold] = [...h.added.keys()];
    expect(hold!.object.visible).toBe(false);
    expect(
      choropleth.hoverPoints!(calc, f.fullData[0]!, hoverQuery(400, 200), hoverContext(f)),
    ).toEqual([]);

    loads.get(keyOf(110, 'world'))!.resolve(basemap(false));
    await (hold as unknown as { ready: Promise<void> }).ready;
    // The load asked for a new layout pass, which finds the features.
    expect(resize).toHaveBeenCalledTimes(1);
    f.layout();
    view.update(h.ctx, PASS);
    expect(calc.unresolved).toBe(false);
    expect(layerOf(h, 'fill')).toBeDefined();
    expect(layerOf(h, 'line')).toBeDefined();
    expect(h.added.size).toBe(2);
  });
});

describe('choropleth regions and colors', () => {
  it('draws one fill and one outline in the backplot slot of the choropleth order', async () => {
    loaded();
    const line = vi.spyOn(LinePrimitive.prototype, 'update');
    const f = figure([
      { locations: ['FRA', 'BRA'], z: [1, 2] },
      { locations: ['JPN'], z: [3] },
    ]);
    const a = plotContext(f, 0);
    choropleth.plot!.create(a.ctx);
    expect(a.added.size).toBe(2);
    const fill = layerOf<LazyFillPrimitive>(a, 'fill')!;
    const outline = layerOf<LinePrimitive>(a, 'line')!;
    // In the subplot's own viewport, which the view asks for without a background.
    expect(a.added.get(fill)).toBe(a.viewports.get('geo'));
    expect(a.added.get(outline)).toBe(a.viewports.get('geo'));
    expect(a.asked).toEqual([{ kind: '2d', rect: f.subplot().clipRect, background: null }]);
    // Above the frame, under rivers and lakes; the outline above the fill; traces in order.
    const slot = GEO_ORDER_FOR_CHOROPLETH.backplot;
    expect(fill.object.renderOrder).toBeGreaterThan(GEO_ORDER_FOR_CHOROPLETH.frame);
    expect(outline.object.renderOrder).toBeGreaterThan(fill.object.renderOrder);
    expect(outline.object.renderOrder).toBeLessThan(GEO_ORDER_FOR_CHOROPLETH.rivers);
    expect(choroplethOrder(0)).toBe(slot);
    expect(choroplethOrder(1)).toBeGreaterThan(outline.object.renderOrder);
    expect(choroplethOrder(1) - slot).toBeLessThan(GEO_LAYER_STEP);
    // One projection gives both: the outline is the rings of the fill, closed.
    expect(projectPolygons).toHaveBeenCalledTimes(1);
    const rings = lastLine(line);
    expect(rings).toHaveLength(2);
    for (const ring of rings) {
      expect(ring).toHaveLength(5);
      expect(ring[0]).toEqual(ring[4]);
    }
    const [x, y] = flat(1, 46);
    expect(rings[0]!.some((p) => Math.abs(p[0] - x) < 0.01 && Math.abs(p[1] - y) < 0.01)).toBe(
      true,
    );
    // Plotly's default line color, one for the whole outline.
    const style = line.mock.lastCall![0] as LineData;
    expect(style).toMatchObject({ width: 1, opacity: 1, miterLimit: 2 });
    expect(Array.from(style.color as ArrayLike<number>).map((v) => Math.round(v * 255))).toEqual([
      68, 68, 68, 255,
    ]);
  });

  it('colors every polygon of a region with the region’s color', async () => {
    loaded();
    const f = figure({
      // A multipolygon, a region cut by the antimeridian, and a plain one.
      locations: ['USA', 'RUS', 'FRA'],
      z: [0, 5, 10],
      colorscale: BLUE_RED,
    });
    const { view, h, update } = await drawn(f);
    view.update(h.ctx, PASS);
    const { polygons } = choroplethRegions(f.calcs[0]!)!;
    // Two polygons for the USA, two for the halves of Russia, one for France.
    expect(polygons.polygonCount).toBe(5);
    expect(Array.from(polygons.featureOf!.subarray(0, 5))).toEqual([0, 0, 1, 1, 2]);
    const colors = regionColors(f.calcs[0]!, update);
    expect(colors.get(0)).toEqual([
      [0, 0, 1, 1],
      [0, 0, 1, 1],
    ]);
    expect(colors.get(1)).toEqual([
      [0.5, 0, 0.5, 1],
      [0.5, 0, 0.5, 1],
    ]);
    expect(colors.get(2)).toEqual([[1, 0, 0, 1]]);
    // The halves of Russia are on the two sides of the map.
    const xs = Array.from(polygons.x.subarray(0, polygons.vertexCount));
    expect(Math.min(...xs)).toBeCloseTo(0, 1);
    expect(Math.max(...xs)).toBeCloseTo(800, 1);
    // The color update is the colors alone.
    expect(Object.keys(update.mock.lastCall![0]).sort()).toEqual(['color', 'opacity']);
  });

  it('skips a location without a number, and one that matches nothing', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    loaded();
    const f = figure({ locations: ['FRA', 'XXX', 'BRA', 'JPN'], z: [1, 2, null, 4] });
    const { view, h, update } = await drawn(f);
    view.update(h.ctx, PASS);
    expect(projectPolygons).toHaveBeenCalledTimes(1);
    expect(vi.mocked(projectPolygons).mock.lastCall![2]).toHaveLength(2);
    expect([...regionColors(f.calcs[0]!, update).keys()]).toEqual([0, 3]);
    // Brazil has no number: it is not under the pointer either.
    expect(hover(f, -53, -10)).toEqual([]);
    expect(hover(f, 138, 37)).toHaveLength(1);
  });

  it('reverses the scale, and applies `marker.opacity` and the trace opacity', async () => {
    loaded();
    const f = figure({
      locations: ['FRA', 'BRA'],
      z: [0, 10],
      colorscale: BLUE_RED,
      reversescale: true,
      opacity: 0.5,
      marker: { opacity: [1, 0.25], line: { color: ['red', 'blue'], width: [1, 3] } },
    });
    const line = vi.spyOn(LinePrimitive.prototype, 'update');
    const { view, h, update } = await drawn(f);
    view.update(h.ctx, PASS);
    const colors = regionColors(f.calcs[0]!, update);
    expect(colors.get(0)).toEqual([[1, 0, 0, 1]]);
    expect(colors.get(1)).toEqual([[0, 0, 1, 0.25]]);
    expect(update.mock.lastCall![0]).toMatchObject({ opacity: 0.5 });
    // Colors, widths and opacities per location are per vertex of the outline.
    const style = line.mock.lastCall![0] as LineData;
    expect(style.opacity).toBe(0.5);
    expect(Array.from(style.color as Float32Array).slice(0, 4)).toEqual([1, 0, 0, 1]);
    expect(Array.from(style.color as Float32Array).slice(20, 24)).toEqual([0, 0, 1, 0.25]);
    expect(Array.from(style.width as Float32Array)).toEqual([1, 1, 1, 1, 1, 3, 3, 3, 3, 3]);
  });

  it('draws no outline with a width of 0, and adds it when it gets one', async () => {
    loaded();
    const locations = ['FRA', 'BRA'];
    const chart = { resize: () => {} };
    const f = figure({ locations, z: [1, 2], marker: { line: { width: 0 } } }, FLAT, chart);
    const { view, h } = await drawn(f);
    expect(layerOf(h, 'line')).toBeUndefined();
    expect(h.added.size).toBe(1);
    const g = figure(
      { locations, z: [1, 2], marker: { line: { width: 2, color: 'red' } } },
      FLAT,
      chart,
    );
    g.calcs[0] = f.calcs[0];
    const line = vi.spyOn(LinePrimitive.prototype, 'update');
    view.update({ ...h.ctx, trace: g.fullData[0]! }, PASS);
    expect(layerOf(h, 'line')).toBeDefined();
    expect(lastLine(line)).toHaveLength(2);
    expect(line.mock.lastCall![0]).toMatchObject({ color: [1, 0, 0, 1], width: 2 });
    expect(projectPolygons).toHaveBeenCalledTimes(1);
    view.update({ ...h.ctx, trace: f.fullData[0]! }, PASS);
    expect(layerOf(h, 'line')).toBeUndefined();
  });

  it('keeps a hole open: the fill has it, and the outline runs around it', async () => {
    loaded();
    const line = vi.spyOn(LinePrimitive.prototype, 'update');
    const f = figure({ locations: ['ZAF'], z: [1] });
    await drawn(f);
    const { polygons } = choroplethRegions(f.calcs[0]!)!;
    expect(polygons).toMatchObject({ polygonCount: 1, ringCount: 2 });
    // Each ring is closed: one vertex more than the fill has for it.
    const hole = polygons.rings[1]!;
    expect(lastLine(line).map((ring) => ring.length)).toEqual([
      hole + 1,
      polygons.vertexCount - hole + 1,
    ]);
  });

  it('builds the outline of polygons with holes', () => {
    const outline = outlineOf({
      x: new Float64Array([0, 4, 4, 0, 1, 2, 2, 9, 9, 9]),
      y: new Float64Array([0, 0, 4, 4, 1, 1, 2, 9, 9, 9]),
      vertexCount: 7,
      rings: new Uint32Array([0, 4, 9]),
      ringCount: 2,
      polygons: new Uint32Array([0, 9]),
      polygonCount: 1,
      featureOf: new Uint32Array([3]),
    });
    expect(Array.from(outline.x.subarray(0, outline.vertexCount))).toEqual([
      0, 4, 4, 0, 0, 1, 2, 2, 1,
    ]);
    expect(Array.from(outline.starts.subarray(0, outline.startCount))).toEqual([5]);
    expect(Array.from(outline.region.subarray(0, outline.vertexCount))).toEqual(
      new Array(9).fill(3),
    );
    // The buffers are reused when they have the room.
    expect(outlineOf({ ...emptyPolygons(), featureOf: new Uint32Array(0) }, outline)).toBe(outline);
    expect(outline.vertexCount).toBe(0);
  });
});

function emptyPolygons() {
  return {
    x: new Float64Array(0),
    y: new Float64Array(0),
    vertexCount: 0,
    rings: new Uint32Array(0),
    ringCount: 0,
    polygons: new Uint32Array(0),
    polygonCount: 0,
  };
}

describe('choropleth redraw rules (ADR-025)', () => {
  const trace = { locations: ['FRA', 'USA', 'ZAF'], z: [1, 2, 3] };

  it('a pan or a zoom only sets transforms', async () => {
    loaded();
    const f = figure(trace);
    const sp = f.subplot();
    const { h, fill, update } = await drawn(f);
    const move = vi.spyOn(fill, 'setTransform');
    const line = vi.spyOn(LinePrimitive.prototype, 'update');
    const lineMove = vi.spyOn(LinePrimitive.prototype, 'setTransform');
    vi.mocked(projectPolygons).mockClear();
    const version = sp.view!.version;

    sp.view!.set({ scale: 2, translate: [330, 170] });
    sp.notify();

    expect(sp.view!.version).toBe(version);
    const moved = sp.transform;
    expect(moved.scaleX).toBeCloseTo(2, 9);
    expect(update).not.toHaveBeenCalled();
    expect(line).not.toHaveBeenCalled();
    expect(projectPolygons).not.toHaveBeenCalled();
    expect(move).toHaveBeenLastCalledWith(moved);
    expect(lineMove).toHaveBeenLastCalledWith(moved);
    // The preview is drawn at once, with no pipeline run, in the viewport of the last pass.
    expect(h.invalidate.calls).toBe(1);
    expect(h.asked).toHaveLength(1);
  });

  it('a rotation reprojects once, and so does the rebase after a zoom', async () => {
    loaded();
    const f = figure(trace);
    const sp = f.subplot();
    const { update } = await drawn(f);
    const line = vi.spyOn(LinePrimitive.prototype, 'update');
    const before = Array.from(choroplethRegions(f.calcs[0]!)!.polygons.x.subarray(0, 4));
    vi.mocked(projectPolygons).mockClear();

    sp.view!.set({ rotation: { lon: 30 } });
    sp.notify();

    expect(projectPolygons).toHaveBeenCalledTimes(1);
    expect(update.mock.lastCall![0]).toHaveProperty('x');
    expect(update.mock.lastCall![0]).toHaveProperty('color');
    expect(line.mock.lastCall![0]).toHaveProperty('x');
    // 30° east of the centre is now the middle of the map: everything moved 30° west.
    const after = choroplethRegions(f.calcs[0]!)!.polygons.x;
    expect(after[0]).toBeCloseTo(before[0]! - (30 * 800) / 360, 2);
    // Hover shares the projection of the view: asking again projects nothing.
    expect(projectPolygons).toHaveBeenCalledTimes(1);

    // A zoom keeps the geometry; when it settles the subplot rebases and curves are resampled.
    sp.view!.set({ scale: 4 });
    sp.notify();
    expect(projectPolygons).toHaveBeenCalledTimes(1);
    expect(sp.view!.rebase()).toBe(true);
    sp.notify();
    expect(projectPolygons).toHaveBeenCalledTimes(2);
    expect(sp.transform.scaleX).toBe(1);
  });

  it('a restyle of z rewrites only the colors', async () => {
    loaded();
    const chart = { resize: () => {} };
    const locations = ['FRA', 'USA', 'ZAF'];
    const f = figure({ locations, z: [0, 5, 10], colorscale: BLUE_RED }, FLAT, chart);
    const { view, h, update } = await drawn(f);
    const regions = choroplethRegions(f.calcs[0]!);
    const line = vi.spyOn(LinePrimitive.prototype, 'update');
    vi.mocked(projectPolygons).mockClear();

    // A new calc over the same locations: the same regions.
    const g = figure({ locations, z: [10, 5, 0], colorscale: BLUE_RED }, FLAT, chart);
    expect(g.calcs[0]).not.toBe(f.calcs[0]);
    expect(g.calcs[0]!.drawn).toBe(f.calcs[0]!.drawn);
    view.update(
      { ...h.ctx, trace: g.fullData[0]!, calc: g.calcs[0]!, fullLayout: g.fullLayout },
      RECALC,
    );

    expect(projectPolygons).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
    expect(Object.keys(update.mock.calls[0]![0]).sort()).toEqual(['color', 'opacity']);
    for (const call of line.mock.calls) expect(call[0]).not.toHaveProperty('x');
    const colors = regionColors(g.calcs[0]!, update);
    expect(colors.get(0)![0]).toEqual([1, 0, 0, 1]);
    expect(colors.get(2)![0]).toEqual([0, 0, 1, 1]);
    // Hover takes the geometry over for the new calc.
    expect(choroplethRegions(g.calcs[0]!)).toBe(regions);
    expect(projectPolygons).not.toHaveBeenCalled();

    // So does a restyle of the colorscale and of its domain.
    const scaled = figure(
      { locations, z: [10, 5, 0], colorscale: BLUE_RED, zmin: 0, zmax: 20 },
      FLAT,
      chart,
    );
    scaled.calcs[0] = g.calcs[0];
    view.update(
      { ...h.ctx, trace: scaled.fullData[0]!, calc: g.calcs[0]! },
      { ...PASS, plot: false },
    );
    expect(projectPolygons).not.toHaveBeenCalled();
    expect(Object.keys(update.mock.lastCall![0]).sort()).toEqual(['color', 'opacity']);
    expect(regionColors(g.calcs[0]!, update).get(0)![0]).toEqual([0.5, 0, 0.5, 1]);

    // A z that changes which locations have a number is new geometry.
    const fewer = figure({ locations, z: [10, null, 0], colorscale: BLUE_RED }, FLAT, chart);
    expect(fewer.calcs[0]!.drawn).not.toBe(f.calcs[0]!.drawn);
    view.update(
      { ...h.ctx, trace: fewer.fullData[0]!, calc: fewer.calcs[0]!, fullLayout: fewer.fullLayout },
      RECALC,
    );
    expect(projectPolygons).toHaveBeenCalledTimes(1);
    expect(update.mock.lastCall![0]).toHaveProperty('x');
  });

  it('the layout pass that ends a pan projects nothing, and follows the new subplot', async () => {
    loaded();
    const chart = { resize: () => {} };
    const f = figure(trace, FLAT, chart);
    const first = f.subplot();
    const { view, h, update } = await drawn(f);
    first.view!.set({ translate: [330, 170] });
    first.notify();
    expect(h.invalidate.calls).toBe(1);
    // The geo component decided the viewport's background meanwhile.
    first.viewport(h.ctx, [1, 1, 1, 1]);
    const lineMove = vi.spyOn(LinePrimitive.prototype, 'setTransform');
    vi.mocked(projectPolygons).mockClear();
    update.mockClear();

    f.layout();
    const next = f.subplot();
    expect(next).not.toBe(first);
    expect(next.view!.version).toBe(first.view!.version);
    view.update(h.ctx, PASS);

    expect(projectPolygons).not.toHaveBeenCalled();
    // The colors are written once more, the geometry is not.
    for (const call of update.mock.calls) expect(call[0]).not.toHaveProperty('x');
    expect(lineMove).toHaveBeenLastCalledWith(next.transform);
    // The pass asks for the viewport again, and leaves its background as it found it.
    expect(h.asked).toHaveLength(3);
    expect(h.viewports.get('geo')!.background).toEqual([1, 1, 1, 1]);
    // The view listens to the subplot of the latest pass only, and to none once disposed.
    first.notify();
    expect(h.invalidate.calls).toBe(1);
    next.notify();
    expect(h.invalidate.calls).toBe(2);
    view.dispose!();
    next.notify();
    expect(h.invalidate.calls).toBe(2);
  });

  it('geometry projected under a pan and a zoom is still in the base state', async () => {
    loaded();
    const f = figure({ locations: ['FRA'], z: [1] });
    const sp = f.subplot();
    sp.view!.set({ scale: 2, translate: [330, 170] });
    await drawn(f);
    const t = sp.transform;
    expect(t.scaleX).toBeCloseTo(2, 9);
    const { polygons } = choroplethRegions(f.calcs[0]!)!;
    // The south-west corner of France, where the view draws it now, in the viewport's px.
    const clip = sp.clipRect;
    const [cx, cy] = containerPoint(sp, 1, 46);
    expect(polygons.x[0]! * t.scaleX + t.offsetX).toBeCloseTo(cx - clip.x, 6);
    expect(polygons.y[0]! * t.scaleY + t.offsetY).toBeCloseTo(clip.y + clip.height - cy, 6);
  });

  it('restyles a selection: the selected keep their opacity, the others are dimmed', async () => {
    loaded();
    const f = figure({ ...trace, marker: { opacity: 0.8 } });
    const line = vi.spyOn(LinePrimitive.prototype, 'update');
    const { view, h, update } = await drawn(f);
    vi.mocked(projectPolygons).mockClear();
    view.update(
      { ...h.ctx, selectedPoints: [1] },
      { ...PASS, plot: false, style: false, selection: true },
    );
    expect(projectPolygons).not.toHaveBeenCalled();
    const alpha = (i: number): number => regionColors(f.calcs[0]!, update).get(i)![0]![3]!;
    expect(alpha(1)).toBeCloseTo(0.8, 4);
    expect(alpha(0)).toBeCloseTo(0.16, 4);
    expect(alpha(2)).toBeCloseTo(0.16, 4);
    // The outline fades with its region.
    const color = (line.mock.lastCall![0] as LineData).color as Float32Array;
    expect(color[3]).toBeCloseTo(0.16, 4);
    expect((line.mock.lastCall![0] as LineData).opacity).toBe(1);
    // Cleared: every region has its own opacity again, and the outline one color.
    view.update(
      { ...h.ctx, selectedPoints: null },
      { ...PASS, plot: false, style: false, selection: true },
    );
    expect(alpha(0)).toBeCloseTo(0.8, 4);
    expect((line.mock.lastCall![0] as LineData).opacity).toBe(0.8);
    expect((line.mock.lastCall![0] as LineData).color).toHaveLength(4);
    // With opacities given for the selection, those are used.
    const given = figure({
      ...trace,
      selected: { marker: { opacity: 0.9 } },
      unselected: { marker: { opacity: 0.4 } },
    });
    given.calcs[0] = f.calcs[0];
    view.update({ ...h.ctx, trace: given.fullData[0]!, selectedPoints: [0] }, PASS);
    expect(alpha(0)).toBeCloseTo(0.9, 4);
    expect(alpha(1)).toBeCloseTo(0.4, 4);
  });
});

describe('choropleth level of detail while rotating (ADR-025)', () => {
  const trace = { locations: ['FRA', 'USA', 'JPN'], z: [1, 2, 3] };
  const GLOBE50 = { ...GLOBE, resolution: 50 };

  /** A step of a gesture that turns the map: what the geo component does to the subplot. */
  const turn = (f: LaidOutFigure, lon: number): void => {
    const sp = f.subplot();
    sp.gesture = true;
    sp.view!.set({ rotation: { lon } });
    sp.notify();
  };
  /** The end of the gesture: the flag is cleared, and one notification follows. */
  const release = (f: LaidOutFigure): void => {
    f.subplot().gesture = false;
    f.subplot().notify();
  };

  it('projects the 110m features while a gesture turns the map, and the full ones after', async () => {
    const full = loaded(false, 50, 4);
    const quick = loaded(false, 110, 2);
    // The 110m data lacks Japan: it keeps its 50m feature.
    quick.countries = quick.countries!.filter((c) => c.id !== 'JPN');
    const f = figure(trace, GLOBE50);
    const sp = f.subplot();
    // The geo component hands the 110m basemap over once it has loaded it.
    sp.quick = quick;
    const calc = f.calcs[0]!;
    expect(calc.drawn!.features).toEqual([
      full.countries![0],
      full.countries![1],
      full.countries![3],
    ]);
    const { view, h, update } = await drawn(f);
    expect(vi.mocked(projectPolygons).mock.lastCall![2]).toBe(calc.drawn!.features);
    vi.mocked(projectPolygons).mockClear();

    // A rotation: the same regions from the 110m basemap, in the same order.
    turn(f, 5);
    expect(projectPolygons).toHaveBeenCalledTimes(1);
    const coarse = vi.mocked(projectPolygons).mock.lastCall![2];
    expect(coarse).toEqual([quick.countries![0], quick.countries![1], full.countries![3]]);
    expect(coarse).toBe(quickFeatures(calc, calc.drawn!, sp));
    expect(update.mock.lastCall![0]).toHaveProperty('x');
    turn(f, 10);
    expect(vi.mocked(projectPolygons).mock.lastCall![2]).toBe(coarse);
    // A pan in the middle of it keeps what is drawn.
    sp.view!.set({ scale: sp.view!.state.scale * 1.5 });
    sp.notify();
    expect(projectPolygons).toHaveBeenCalledTimes(2);

    // A pipeline pass in the middle of the gesture brings the full geometry back.
    f.layout();
    view.update(h.ctx, PASS);
    expect(projectPolygons).toHaveBeenCalledTimes(3);
    expect(vi.mocked(projectPolygons).mock.lastCall![2]).toBe(calc.drawn!.features);
    // Nothing is left to do when the gesture ends.
    const frames = h.invalidate.calls;
    release(f);
    expect(projectPolygons).toHaveBeenCalledTimes(3);
    expect(h.invalidate.calls).toBe(frames + 1);
    view.dispose!();
  });

  it('returns to the full geometry when the gesture ends, without a pipeline pass or a timer', async () => {
    vi.useFakeTimers();
    loaded(false, 50, 4);
    const quick = loaded(false, 110, 2);
    const f = figure(trace, GLOBE50);
    const sp = f.subplot();
    sp.quick = quick;
    const calc = f.calcs[0]!;
    const { view, h } = await drawn(f);
    vi.mocked(projectPolygons).mockClear();
    turn(f, 5);
    turn(f, 10);
    // A pointer that rests in the middle of the drag keeps the 110m features, however long.
    vi.advanceTimersByTime(60_000);
    expect(projectPolygons).toHaveBeenCalledTimes(2);
    expect(vi.mocked(projectPolygons).mock.lastCall![2]).not.toBe(calc.drawn!.features);
    expect(vi.getTimerCount()).toBe(0);
    const frames = h.invalidate.calls;
    release(f);
    expect(projectPolygons).toHaveBeenCalledTimes(3);
    expect(vi.mocked(projectPolygons).mock.lastCall![2]).toBe(calc.drawn!.features);
    expect(h.invalidate.calls).toBe(frames + 1);
    // Hover is of the full geometry at any time.
    expect(choroplethRegions(calc)!.version).toBe(sp.view!.version);
    expect(projectPolygons).toHaveBeenCalledTimes(3);
    // A later notification (the view moved by a key, a pan) changes nothing of the geometry.
    sp.notify();
    expect(projectPolygons).toHaveBeenCalledTimes(3);
    // A disposed view no longer follows its subplot.
    turn(f, 15);
    expect(projectPolygons).toHaveBeenCalledTimes(4);
    view.dispose!();
    release(f);
    turn(f, 20);
    expect(projectPolygons).toHaveBeenCalledTimes(4);
  });

  it('projects in full when the view turns without a gesture (a view key, an animation)', async () => {
    loaded(false, 50, 4);
    const quick = loaded(false, 110, 2);
    const f = figure(trace, GLOBE50);
    f.subplot().quick = quick;
    const a = await drawn(f);
    f.subplot().view!.set({ rotation: { lon: 5 } });
    f.subplot().notify();
    expect(vi.mocked(projectPolygons).mock.lastCall![2]).toBe(f.calcs[0]!.drawn!.features);
    a.view.dispose!();
  });

  it('projects in full without a quicker copy', async () => {
    // The subplot has no 110m basemap (it is not loaded, or the map is not one that turns).
    loaded(false, 50, 4);
    const waiting = figure(trace, GLOBE50);
    const a = await drawn(waiting);
    turn(waiting, 5);
    expect(vi.mocked(projectPolygons).mock.lastCall![2]).toBe(waiting.calcs[0]!.drawn!.features);
    a.view.dispose!();
    // A map of `resolution: 110` is what a rotation can afford already.
    const hundredTen = loaded(false, 110, 2);
    const coarse = figure(trace, GLOBE);
    coarse.subplot().quick = hundredTen;
    const b = await drawn(coarse);
    turn(coarse, 5);
    expect(vi.mocked(projectPolygons).mock.lastCall![2]).toBe(coarse.calcs[0]!.drawn!.features);
    expect(
      quickFeatures(coarse.calcs[0]!, coarse.calcs[0]!.drawn!, coarse.subplot()),
    ).toBeUndefined();
    b.view.dispose!();
    // A trace's own `geojson` has no coarser copy.
    const own = figure({ locations: ['d1', 'd2'], z: [1, 2], geojson: D3 }, GLOBE50);
    own.subplot().quick = hundredTen;
    const c = await drawn(own);
    turn(own, 5);
    expect(vi.mocked(projectPolygons).mock.lastCall![2]).toBe(own.calcs[0]!.drawn!.features);
    c.view.dispose!();
  });

  it('takes the states of the 110m extras for `USA-states`', () => {
    loaded(true, 50, 4);
    const quick = loaded(true, 110, 2);
    const f = figure(
      { locations: ['CA', 'New York'], z: [1, 2], locationmode: 'USA-states' },
      GLOBE50,
    );
    const calc = f.calcs[0]!;
    // Without the subplot's 110m basemap there is no quicker copy, whatever the loader has.
    expect(quickFeatures(calc, calc.drawn!, f.subplot())).toBeUndefined();
    f.subplot().quick = quick;
    expect(quickFeatures(calc, calc.drawn!, f.subplot())).toEqual(quick.subunits);
  });
});

describe('choropleth with a geojson (GEO5)', () => {
  it('matches `locations` by `featureidkey`', () => {
    const f = figure({
      locations: ['R', 'N', 'X'],
      z: [1, 2, 3],
      geojson: D3,
      featureidkey: 'properties.name',
    });
    // Names, not the short codes: nothing matches.
    expect(Array.from(f.calcs[0]!.drawn!.index)).toEqual([]);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const g = figure({
      locations: ['Ring', 'North', 'Nowhere'],
      z: [1, 2, 3],
      geojson: D3,
      featureidkey: 'properties.name',
    });
    expect(Array.from(g.calcs[0]!.drawn!.index)).toEqual([0, 1]);
    expect(g.calcs[0]!.drawn!.features).toEqual([D3.features[1], D3.features[0]]);
    expect(peekBasemap).not.toHaveBeenCalled();
  });

  it('rewinds rings wound the RFC 7946 way, and says so once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const f = figure({
      locations: ['d1', 'd2', 'd3'],
      z: [1, 2, 3],
      geojson: RFC,
      name: 'districts',
    });
    const calc = f.calcs[0]!;
    await drawn(f);
    // The features are projected rewound; the `geojson` itself is left as it was given.
    expect(calc.drawn!.features[0]).not.toBe(RFC.features[0]);
    expect(RFC.features[0]!.geometry.coordinates[0]).toEqual(reversed(10, 10));
    const { polygons } = choroplethRegions(calc)!;
    // One polygon each for the first two, with the hole of the second, and two for the pair.
    expect(polygons).toMatchObject({ polygonCount: 4, ringCount: 5 });
    expect(Array.from(polygons.featureOf!.subarray(0, 4))).toEqual([0, 1, 2, 2]);
    // The regions are the small squares, not the globe around them.
    const x = Array.from(polygons.x.subarray(0, 4));
    const y = Array.from(polygons.y.subarray(0, 4));
    expect(Math.min(...x)).toBeCloseTo(flat(10, 10)[0], 2);
    expect(Math.max(...x)).toBeCloseTo(flat(12, 12)[0], 2);
    expect(Math.min(...y)).toBeCloseTo(flat(10, 10)[1], 2);
    expect(Math.max(...y)).toBeCloseTo(flat(12, 12)[1], 2);
    // Inside a region, in the hole of the ring, and outside.
    expect(hover(f, 11, 11)[0]!.pointIndex).toBe(0);
    expect(hover(f, 31, 21)[0]!.pointIndex).toBe(1);
    expect(hover(f, 35, 25)).toEqual([]);
    expect(hover(f, -49, -39)[0]!.pointIndex).toBe(2);
    expect(hover(f, 0, 0)).toEqual([]);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toBe(
      '[holochart] choropleth trace 0 "districts": 4 polygons of `geojson` had rings wound the ' +
        'RFC 7946 way (outer rings counter-clockwise) and were rewound: d3-geo fills the inside ' +
        'of clockwise rings.',
    );
    // Not again for the same `geojson`: a new calc, other locations, another trace.
    figure({ locations: ['d1', 'd2', 'd3'], z: [3, 2, 1], geojson: RFC });
    figure([
      { locations: ['d2'], z: [1], geojson: RFC },
      { locations: ['d3', 'd1'], z: [1, 2], geojson: RFC },
    ]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('leaves rings wound for d3 alone', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const f = figure({ locations: ['d1', 'd2'], z: [1, 2], geojson: D3 });
    expect(f.calcs[0]!.drawn!.features).toEqual(D3.features);
    expect(f.calcs[0]!.drawn!.features[1]).toBe(D3.features[1]);
    expect(hover(f, 31, 21)[0]!.pointIndex).toBe(1);
    expect(hover(f, 35, 25)).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('gives hover and events the properties of the feature', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const f = figure({
      locations: ['R', 'N'],
      z: [7, 8],
      geojson: RFC,
      featureidkey: 'properties.code.short',
      hovertemplate: '%{properties.name} (%{location}): %{z}',
    });
    const [p] = hover(f, 31, 21);
    expect(p!.fields).toEqual({
      location: 'R',
      z: 7,
      ct: [...f.calcs[0]!.features![0]!.point],
      properties: RFC.features[1]!.properties,
    });
    expect(choropleth.eventData!(f.calcs[0]!, f.fullData[0]!, 1)).toMatchObject({
      location: 'N',
      z: 8,
      properties: RFC.features[0]!.properties,
    });
    const text = formatTemplate(f.fullData[0]!['hovertemplate'] as string, {
      values: p!.fields!,
      labels: p!.labels!,
      fullData: f.fullData[0]!,
      data: f.fullData[0]!,
      pointIndex: p!.pointIndex,
    });
    expect(text).toBe('Ring (R): 7');
  });
});

describe('choropleth hover (plotly.js choropleth/hover.js)', () => {
  const trace = {
    locations: ['FRA', 'USA', 'ZAF', 'RUS'],
    z: [1.5, 2000, 3, 4],
    text: ['fr', 'us', '', 'ru'],
    colorscale: BLUE_RED,
  };

  it('finds the region under the pointer, and nothing in a hole or outside', () => {
    loaded();
    const f = figure(trace);
    expect(hover(f, 2.5, 47.5)[0]!.pointIndex).toBe(0);
    // Either polygon of a multipolygon, and either half of a region the antimeridian cuts.
    expect(hover(f, -100, 40)[0]!.pointIndex).toBe(1);
    expect(hover(f, -150, 64)[0]!.pointIndex).toBe(1);
    expect(hover(f, 175, 65)[0]!.pointIndex).toBe(3);
    expect(hover(f, -175, 65)[0]!.pointIndex).toBe(3);
    // South Africa, but not Lesotho.
    expect(hover(f, 22, -27)[0]!.pointIndex).toBe(2);
    expect(hover(f, 25, -30)).toEqual([]);
    // The ocean, and outside the subplot.
    expect(hover(f, 0, 0)).toEqual([]);
    expect(
      choropleth.hoverPoints!(f.calcs[0]!, f.fullData[0]!, hoverQuery(5, 5), hoverContext(f)),
    ).toEqual([]);
    // One projection serves every query.
    expect(projectPolygons).toHaveBeenCalledTimes(1);
  });

  it('anchors the label at the point of the region, with its color and fields', () => {
    loaded();
    const f = figure(trace);
    const sp = f.subplot();
    const [p] = hover(f, -150, 64);
    // Hovered over "Alaska": the label is at the label point of the USA, as in Plotly.
    const [cx, cy] = containerPoint(sp, -100, 40);
    expect(p).toMatchObject({ pointIndex: 1, distance: 0, text: 'us' });
    expect(p!.px).toBeCloseTo(cx, 6);
    expect(p!.py).toBeCloseTo(FIGURE.height - cy, 6);
    expect(p!.color).toBe('rgb(255, 0, 0)');
    expect(p!.fields).toEqual({ location: 'USA', z: 2000, ct: [-100, 40] });
    expect(p!.labels).toEqual({ z: '2000' });
    expect(p!.hoverText).toBe('USA<br>2000<br>us');
    expect(p!.extra).toBeUndefined();
    // No text: no line for it.
    expect(hover(f, 22, -27)[0]!.hoverText).toBe('ZAF<br>3');
    // A label point the subplot does not draw: the label is at the pointer.
    const state = sp.view!.state;
    // Panned 650 px east: "Alaska" is still on the map, the label point is past its edge.
    sp.view!.set({ translate: [state.translate[0] + 650, state.translate[1]] });
    const [qx, qy] = containerPoint(sp, -150, 64);
    expect(sp.contains(qx, qy)).toBe(true);
    expect(sp.contains(...containerPoint(sp, -100, 40))).toBe(false);
    const [q] = hover(f, -150, 64);
    expect(q!.pointIndex).toBe(1);
    expect(q!.px).toBeCloseTo(qx, 6);
    expect(q!.py).toBeCloseTo(FIGURE.height - qy, 6);
  });

  it('lists the fields `hoverinfo` names, like Plotly’s makeHoverInfo', () => {
    loaded();
    const text = (hoverinfo: unknown, lon = 2.5, lat = 47.5) => {
      const f = figure({ ...trace, hoverinfo });
      const [p] = hover(f, lon, lat);
      return [p!.hoverText, p!.extra];
    };
    expect(text('all')).toEqual(['FRA<br>1.5<br>fr', undefined]);
    // Without the name, the location is beside the label instead of in it.
    expect(text('location+z')).toEqual(['1.5', 'FRA']);
    expect(text('location')).toEqual(['', 'FRA']);
    expect(text('z+text')).toEqual(['1.5<br>fr', undefined]);
    expect(text('location+name')).toEqual(['FRA', undefined]);
    expect(text(['z', 'text', 'z', 'z'], -100, 40)).toEqual(['us', undefined]);
    // `hovertext` wins over `text`.
    const f = figure({ ...trace, hovertext: ['FR!', '', '', ''] });
    expect(hover(f, 2.5, 47.5)[0]!.text).toBe('FR!');
    expect(hover(f, -100, 40)[0]!.text).toBe('us');
  });

  it('follows a pan and a zoom without projecting again', () => {
    loaded();
    const f = figure(trace);
    const sp = f.subplot();
    hover(f, 2.5, 47.5);
    sp.view!.set({ scale: sp.view!.state.scale * 1.5 });
    expect(hover(f, 2.5, 47.5)[0]!.pointIndex).toBe(0);
    expect(hover(f, 0, 47.5)).toEqual([]);
    expect(projectPolygons).toHaveBeenCalledTimes(1);
    // A rotation projects once more.
    sp.view!.set({ rotation: { lon: 20 } });
    expect(hover(f, 2.5, 47.5)[0]!.pointIndex).toBe(0);
    expect(projectPolygons).toHaveBeenCalledTimes(2);
  });

  it('hides the far side of a globe', () => {
    loaded();
    const f = figure(trace, GLOBE);
    expect(hover(f, 2.5, 47.5)[0]!.pointIndex).toBe(0);
    // Russia at 175°E is behind the globe: the middle of the disc is the ocean off Africa.
    const sp = f.subplot();
    const { x, y, width, height } = sp.rect;
    expect(
      choropleth.hoverPoints!(
        f.calcs[0]!,
        f.fullData[0]!,
        hoverQuery(x + width / 2, y + height / 2),
        hoverContext(f),
      ),
    ).toEqual([]);
    expect(choroplethRegions(f.calcs[0]!)!.polygons.polygonCount).toBe(2);
  });

  it('finds the region drawn on top where two overlap, through the grid of boxes', () => {
    const polygons = {
      // A square of 10, a square of 4 inside it, and a far one.
      x: new Float64Array([0, 10, 10, 0, 3, 7, 7, 3, 100, 101, 101, 100]),
      y: new Float64Array([0, 0, 10, 10, 3, 3, 7, 7, 50, 50, 51, 51]),
      vertexCount: 12,
      rings: new Uint32Array([0, 4, 8]),
      ringCount: 3,
      polygons: new Uint32Array([0, 1, 2]),
      polygonCount: 3,
      featureOf: new Uint32Array([0, 1, 2]),
    };
    const grid = buildBoxGrid(polygons);
    expect(grid).toMatchObject({ columns: 2, rows: 2, x0: 0, y0: 0 });
    expect(Array.from(grid.boxes.subarray(4, 8))).toEqual([3, 3, 7, 7]);
    const regions = { version: 1, drawn: {} as never, polygons, grid: undefined };
    expect(regionAt(regions, 5, 5)).toBe(1);
    expect(regionAt(regions, 1, 1)).toBe(0);
    expect(regionAt(regions, 100.5, 50.5)).toBe(2);
    // On the far edges of the grid, in an empty cell, outside the grid, and nowhere.
    expect(regionAt(regions, 101, 51)).toBe(-1);
    expect(regionAt(regions, 80, 5)).toBe(-1);
    expect(regionAt(regions, -1, 5)).toBe(-1);
    expect(regionAt(regions, 5, 500)).toBe(-1);
    expect(regionAt(regions, NaN, 5)).toBe(-1);
    expect(regions.grid).toBeDefined();
    expect(regionAt({ ...regions, polygons: emptyPolygons(), grid: undefined }, 5, 5)).toBe(-1);
    // One polygon, and polygons on one line, make a grid of one cell or one row.
    const one = buildBoxGrid({ ...polygons, polygonCount: 1 });
    expect(one).toMatchObject({ columns: 1, rows: 1 });
  });
});

describe('choropleth selection and event data (plotly.js select.js, event_data.js)', () => {
  const trace = { locations: ['FRA', 'USA', 'XXX', 'BRA', 'JPN'], z: [1, 2, 3, null, 5] };

  it('selects the regions whose point is inside a box or a lasso, in projected px', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    loaded();
    const f = figure(trace);
    const sp = f.subplot();
    const select = (query: Parameters<NonNullable<typeof choropleth.selectPoints>>[2]) =>
      choropleth.selectPoints!(f.calcs[0]!, f.fullData[0]!, query, hoverContext(f));
    const [fx, fy] = containerPoint(sp, 2, 47);
    const [ux, uy] = containerPoint(sp, -100, 40);
    const box = (x0: number, y0: number, x1: number, y1: number) =>
      select({ kind: 'rect', x: [x0, x1], y: [y0, y1] });
    expect(box(fx - 5, fy - 5, fx + 5, fy + 5)).toEqual([0]);
    expect(box(ux - 5, fy - 5, fx + 5, uy + 5)).toEqual([0, 1]);
    // The whole plot area: every drawn region, and none that is not drawn.
    expect(box(PLOT_AREA.x, PLOT_AREA.y, PLOT_AREA.x + 800, PLOT_AREA.y + 400)).toEqual([0, 1, 4]);
    // A lasso around France inside a box that also holds the USA's point.
    expect(
      select({
        kind: 'lasso',
        x: [ux - 5, fx + 5],
        y: [Math.min(fy, uy) - 5, Math.max(fy, uy) + 5],
        polygon: [
          [fx - 5, fy - 5],
          [fx + 5, fy - 5],
          [fx, fy + 5],
        ],
      }),
    ).toEqual([0]);
    // After a pan the points are where they are drawn now.
    sp.view!.set({ translate: [sp.view!.state.translate[0] + 100, sp.view!.state.translate[1]] });
    expect(box(fx - 5, fy - 5, fx + 5, fy + 5)).toEqual([]);
    expect(box(fx + 95, fy - 5, fx + 105, fy + 5)).toEqual([0]);
  });

  it('selects nothing that the projection hides', () => {
    loaded();
    const f = figure({ locations: ['FRA', 'RUS'], z: [1, 2] }, GLOBE);
    const all = choropleth.selectPoints!(
      f.calcs[0]!,
      f.fullData[0]!,
      { kind: 'rect', x: [0, FIGURE.width], y: [0, FIGURE.height] },
      hoverContext(f),
    );
    expect(all).toEqual([0]);
  });

  it('gives events location, z and the point of the feature', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    loaded();
    const f = figure(trace);
    const data = (i: number) => choropleth.eventData!(f.calcs[0]!, f.fullData[0]!, i);
    expect(data(0)).toEqual({ location: 'FRA', z: 1, ct: [2, 47] });
    // Not drawn: the location as given, and no point.
    expect(data(2)).toEqual({ location: 'XXX', z: 3 });
    expect(data(3)).toEqual({ location: 'BRA', z: null, ct: [-53, -10] });
  });
});

describe('choropleth color axes and colorbar', () => {
  it('gives its colorbar the domain and the stops of its colorscale', () => {
    loaded();
    const f = figure({
      locations: ['FRA', 'USA'],
      z: [2, 10],
      colorscale: BLUE_RED,
      reversescale: true,
      colorbar: { title: { text: 'GDP' } },
    });
    const spec = choropleth.colorbar!(f.fullData[0]!, { fullLayout: f.fullLayout })!;
    expect(spec).toMatchObject({ cmin: 2, cmax: 10 });
    expect(spec.colorscale).toEqual([
      [0, 'rgb(255, 0, 0)'],
      [1, 'rgb(0, 0, 255)'],
    ]);
    expect(spec.coloraxis).toBeUndefined();
    expect((spec.attributes['title'] as Trace)['text']).toBe('GDP');
    // No bar without `showscale`, and none for a hidden trace.
    const off = figure({ locations: ['FRA'], z: [2], showscale: false });
    expect(choropleth.colorbar!(off.fullData[0]!, { fullLayout: off.fullLayout })).toBeNull();
    expect(
      choropleth.colorbar!(
        { ...f.fullData[0]!, visible: 'legendonly' },
        { fullLayout: f.fullLayout },
      ),
    ).toBeNull();
  });

  it('picks the automatic scale of the layout by the sign of the domain', async () => {
    loaded();
    const scales = {
      sequential: BLUE_RED,
      diverging: [
        [0, 'rgb(0, 255, 0)'],
        [1, 'rgb(0, 0, 0)'],
      ],
    };
    const f = figure({ locations: ['FRA', 'USA'], z: [0, 10] }, FLAT, undefined, {
      colorscale: scales,
    });
    expect(choroplethColorMapping(f.fullData[0]!, f.fullLayout)!.colorscale[0]![1]).toEqual([
      0, 0, 1, 1,
    ]);
    const g = figure({ locations: ['FRA', 'USA'], z: [-5, 10] }, FLAT, undefined, {
      colorscale: scales,
    });
    expect(choroplethColorMapping(g.fullData[0]!, g.fullLayout)!.colorscale[0]![1]).toEqual([
      0, 1, 0, 1,
    ]);
  });

  it('shares a color axis with other traces: one domain, one colorbar', async () => {
    loaded();
    const f = layoutFigure({
      data: [
        { type: 'choropleth', locations: ['FRA', 'USA'], z: [10, 20], coloraxis: 'coloraxis' },
        { type: 'choropleth', locations: ['BRA'], z: [40], coloraxis: 'coloraxis' },
        {
          type: 'scattergeo',
          lon: [0, 10],
          lat: [0, 10],
          marker: { color: [0, 100], coloraxis: 'coloraxis' },
        },
      ],
      layout: {
        geo: FLAT,
        coloraxis: { colorscale: BLUE_RED, colorbar: { title: { text: 'shared' } } },
      },
    } as never);
    // The domain spans the values of every trace on the axis.
    for (const i of [0, 1]) {
      expect(choroplethColorMapping(f.fullData[i]!, f.fullLayout)).toMatchObject({
        cmin: 0,
        cmax: 100,
      });
      const spec = choropleth.colorbar!(f.fullData[i]!, { fullLayout: f.fullLayout })!;
      expect(spec).toMatchObject({ cmin: 0, cmax: 100, coloraxis: 'coloraxis' });
      expect((spec.attributes['title'] as Trace)['text']).toBe('shared');
    }
    const { view, h, update } = await drawn(f, 1);
    view.update(h.ctx, PASS);
    // 40 of 0…100, between blue and red.
    expect(regionColors(f.calcs[1]!, update).get(0)![0]).toEqual([0.4, 0, 0.6, 1]);
    // Two choropleths alone span their own values, and the axis' bounds win when given.
    const two = figure(
      [
        { locations: ['FRA'], z: [10], coloraxis: 'coloraxis2' },
        { locations: ['BRA'], z: [30], coloraxis: 'coloraxis2' },
      ],
      FLAT,
    );
    expect(choroplethColorMapping(two.fullData[0]!, two.fullLayout)).toMatchObject({
      cmin: 10,
      cmax: 30,
    });
    const fixed = figure({ locations: ['FRA'], z: [10], coloraxis: 'coloraxis' }, FLAT, undefined, {
      coloraxis: { cmin: 0, cmax: 50 },
    });
    expect(choroplethColorMapping(fixed.fullData[0]!, fixed.fullLayout)).toMatchObject({
      cmin: 0,
      cmax: 50,
    });
  });

  it('draws a swatch of the middle of the scale in the legend', () => {
    loaded();
    const f = figure({
      locations: ['FRA', 'USA'],
      z: [0, 10],
      colorscale: BLUE_RED,
      marker: { line: { color: 'white', width: 2 } },
    });
    expect(choropleth.legendIcon!(f.fullData[0]!, { fullLayout: f.fullLayout })).toEqual({
      kind: 'fill',
      fill: { color: 'rgb(128, 0, 128)', lineColor: 'rgb(255, 255, 255)', lineWidth: 2 },
    });
    const none = figure({ locations: ['FRA'], z: ['x'], marker: { line: { width: 0 } } });
    expect(choropleth.legendIcon!(none.fullData[0]!)).toEqual({
      kind: 'fill',
      fill: { color: '#888', lineWidth: 0 },
    });
  });
});

describe('choropleth fitbounds', () => {
  /** The corners of the box the view shows, in degrees. */
  const shown = (f: LaidOutFigure) => {
    const view = f.subplot().view!;
    const { width, height } = view.size;
    const [west, south] = view.invert(0, 0)!;
    const [east, north] = view.invert(width, height)!;
    return { west, south, east, north };
  };

  it("fits `'locations'` to the bounds of the drawn regions, not to their points", () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    loaded();
    const f = figure(
      { locations: ['FRA', 'ZAF', 'JPN', 'XXX'], z: [1, 2, null, 4] },
      { projection: { type: 'equirectangular' }, fitbounds: 'locations' },
    );
    const box = shown(f);
    // France's north (48°) to South Africa's south (−35°): 83° of latitude fill the height.
    // Japan has no number and is not drawn: it does not count.
    expect(box.north).toBeCloseTo(48, 0);
    expect(box.south).toBeCloseTo(-35, 0);
    expect(box.west).toBeLessThanOrEqual(1 + 1e-6);
    expect(box.east).toBeGreaterThanOrEqual(30 - 1e-6);
    expect(box.east).toBeLessThan(120);
    // The coordinates are computed once per set of drawn regions.
    expect(f.calcs[0]!.fit).toBe(f.calcs[0]!.fit);
    expect(f.calcs[0]!.fit!.lon).toHaveLength(15);
  });

  it('fits regions on both sides of the antimeridian as one group', () => {
    loaded();
    const f = figure(
      { locations: ['RUS'], z: [1] },
      { projection: { type: 'equirectangular' }, fitbounds: 'locations' },
    );
    // 20° of longitude around 180°, not the 340° from 170°W to 170°E.
    const view = f.subplot().view!;
    expect(view.state.rotation.lon).toBeCloseTo(180, 6);
    const box = shown(f);
    expect(box.north).toBeCloseTo(70, 2);
    expect(box.south).toBeCloseTo(60, 2);
  });

  it("fits `'geojson'` to the whole geojson, whatever the locations name", () => {
    const geo = { projection: { type: 'equirectangular' }, fitbounds: 'geojson' };
    const whole = shown(figure({ locations: ['d1'], z: [1], geojson: D3 }, geo));
    // d1 is 10…12°, d2 30…40° east and 20…30° north.
    expect(whole.south).toBeCloseTo(10, 0);
    expect(whole.north).toBeCloseTo(30, 0);
    const own = shown(
      figure({ locations: ['d1'], z: [1], geojson: D3 }, { ...geo, fitbounds: 'locations' }),
    );
    expect(own.south).toBeCloseTo(10, 0);
    expect(own.north).toBeCloseTo(12, 0);
    // A trace without a region to draw has nothing to fit.
    const none = figure(
      { locations: ['d1'], z: ['x'], geojson: D3 },
      { ...geo, fitbounds: 'locations' },
    );
    expect(none.calcs[0]!.fit).toBeUndefined();
  });
});

describe('choropleth subplots', () => {
  it('draws each trace on its own subplot, from the same locations', async () => {
    loaded();
    const locations = ['FRA', 'USA'];
    const f = layoutFigure({
      data: [
        { type: 'choropleth', locations, z: [1, 2] },
        { type: 'choropleth', locations, z: [2, 1], geo: 'geo2' },
      ],
      layout: {
        geo: { ...FLAT, domain: { x: [0, 0.5] } },
        geo2: { ...GLOBE, domain: { x: [0.5, 1] } },
      },
    } as never);
    const a = await drawn(f, 0);
    const b = await drawn(f, 1);
    expect(f.calcs[0]!.subplot!.id).toBe('geo');
    expect(f.calcs[1]!.subplot!.id).toBe('geo2');
    expect(a.h.added.get(a.fill)).toBe(a.h.viewports.get('geo'));
    expect(b.h.added.get(b.fill)).toBe(b.h.viewports.get('geo2'));
    // The traces share what the lookup found, and each has its own projection of it.
    expect(f.calcs[1]!.drawn).toBe(f.calcs[0]!.drawn);
    expect(projectPolygons).toHaveBeenCalledTimes(2);
    const flatRegions = choroplethRegions(f.calcs[0]!)!;
    const globeRegions = choroplethRegions(f.calcs[1]!)!;
    expect(flatRegions).not.toBe(globeRegions);
    expect(flatRegions.polygons.polygonCount).toBe(3);
    // The globe shows France alone: the USA is behind it.
    expect(globeRegions.polygons.polygonCount).toBe(1);
    // Hover is per subplot.
    expect(hover(f, 2, 47, 0)[0]!.pointIndex).toBe(0);
    expect(hover(f, 2, 47, 1)[0]!.pointIndex).toBe(0);
    const [cx, cy] = containerPoint(f.subplot('geo2'), 2, 47);
    expect(
      choropleth.hoverPoints!(f.calcs[0]!, f.fullData[0]!, hoverQuery(cx, cy), hoverContext(f)),
    ).toEqual([]);
    // A rotation of one subplot leaves the other's trace alone.
    vi.mocked(projectPolygons).mockClear();
    a.update.mockClear();
    f.subplot('geo2').view!.set({ rotation: { lon: 10 } });
    f.subplot('geo2').notify();
    expect(projectPolygons).toHaveBeenCalledTimes(1);
    expect(a.update).not.toHaveBeenCalled();
    expect(b.update).toHaveBeenCalledTimes(1);
  });

  it('moves its primitives when the trace moves to another subplot', async () => {
    loaded();
    const layout = { geo: FLAT, geo2: GLOBE };
    const chart = { resize: () => {} };
    const locations = ['FRA'];
    const f = layoutFigure(
      { data: [{ type: 'choropleth', locations, z: [1] }], layout } as never,
      chart,
    );
    const { view, h, fill } = await drawn(f);
    expect(h.added.get(fill)).toBe(h.viewports.get('geo'));
    const g = layoutFigure(
      { data: [{ type: 'choropleth', locations, z: [1], geo: 'geo2' }], layout } as never,
      chart,
    );
    view.update(
      { ...h.ctx, trace: g.fullData[0]!, calc: g.calcs[0]!, fullLayout: g.fullLayout },
      RECALC,
    );
    const moved = layerOf<LazyFillPrimitive>(h, 'fill')!;
    expect(moved).not.toBe(fill);
    expect(h.added.has(fill)).toBe(false);
    expect(h.added.get(moved)).toBe(h.viewports.get('geo2'));
    expect(h.added.get(layerOf(h, 'line')!)).toBe(h.viewports.get('geo2'));
  });

  it('draws nothing for a trace without a region', async () => {
    loaded();
    const f = figure({ locations: ['FRA'], z: ['x'] });
    const h = plotContext(f);
    const view = choropleth.plot!.create(h.ctx);
    expect(h.added.size).toBe(0);
    expect(h.asked).toHaveLength(0);
    // It appears when it has one, and goes when it has none again.
    const g = figure({ locations: ['FRA'], z: [1] });
    view.update(
      { ...h.ctx, trace: g.fullData[0]!, calc: g.calcs[0]!, fullLayout: g.fullLayout },
      RECALC,
    );
    expect(h.added.size).toBe(2);
    view.update(h.ctx, RECALC);
    expect(h.added.size).toBe(0);
  });
});

describe('choropleth description and keyboard stops (GEO6)', () => {
  const describeTrace = (f: LaidOutFigure) =>
    describeChoropleth({
      trace: f.fullData[0]!,
      calc: f.calcs[0]!,
      index: 0,
      fullLayout: f.fullLayout,
      xaxis: undefined,
      yaxis: undefined,
      maxRows: 3,
    });

  it('counts the regions and names the lowest and the highest', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    loaded();
    const f = figure({
      locations: ['FRA', 'USA', 'XXX', 'BRA', 'JPN'],
      z: [12, 30000, 1, 0.5, null],
      text: ['a', 'b', 'c', 'd', 'e'],
      name: 'GDP',
    });
    const d = describeTrace(f);
    expect(d.kind).toBe('choropleth map');
    expect(d.summary).toBe(
      'Choropleth map "GDP": 3 regions. Lowest: Brazil (0.5). Highest: United States of America ' +
        '(30k). 2 locations not drawn.',
    );
    expect(d.table).toMatchObject({
      caption: 'GDP',
      columns: ['location', 'value', 'text'],
      total: 5,
      rows: [
        ['FRA', '12', 'a'],
        ['USA', '30k', 'b'],
        ['XXX', '1', 'c'],
      ],
    });
    expect(d.table!.row!(4)).toEqual(['JPN', '', 'e']);
    // The generated summary (in the chart's language) names the same two, of the drawn regions.
    // (The sentence itself is the runtime's: tests/interaction/keyboard-geo.spec.ts reads it.)
    const insight = d.insight as SharesInsight;
    expect(insight).toMatchObject({ kind: 'shares', part: 'bar', length: 5 });
    const regions = Array.from({ length: 5 }, (_, i) => i).filter((i) => !insight.skip!(i));
    expect(regions).toEqual([0, 1, 3]);
    expect(regions.map((i) => insight.label(i))).toEqual([
      'France',
      'United States of America',
      'Brazil',
    ]);
    expect(regions.map((i) => insight.formatValue(insight.values[i]!))).toEqual([
      '12',
      '30k',
      '0.5',
    ]);
  });

  it('describes one region, equal regions, a geojson and an unresolved trace', () => {
    loaded();
    expect(describeTrace(figure({ locations: ['FRA'], z: [4] })).summary).toBe(
      'Choropleth map "trace 0": 1 region. France (4).',
    );
    expect(describeTrace(figure({ locations: ['FRA', 'BRA'], z: [4, 4] })).summary).toBe(
      'Choropleth map "trace 0": 2 regions. All at 4.',
    );
    // The features of a `geojson` are called what the trace calls them.
    const own = describeTrace(figure({ locations: ['d2', 'd1'], z: [1, 2], geojson: D3 }));
    expect(own.summary).toBe(
      'Choropleth map "trace 0": 2 regions. Lowest: d2 (1). Highest: d1 (2).',
    );
    expect(own.table!.columns).toEqual(['location', 'value']);
    cached.clear();
    const waiting = describeTrace(figure({ locations: ['FRA'], z: [4] }));
    expect(waiting.summary).toBe('Choropleth map "trace 0": 0 regions. Its regions are not drawn.');
    expect(waiting.insight).toBeUndefined();
  });

  it('stops at the regions on the map in the order of `locations`', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    loaded();
    const f = figure(
      { locations: ['JPN', 'FRA', 'XXX', 'RUS', 'BRA', 'ZAF'], z: [5, 1, 2, 3, null, 4] },
      GLOBE,
    );
    const parts = await choropleth.a11y!();
    const stops = () =>
      parts['choropleth']!.keyboardPoints!(
        f.calcs[0]! as never,
        f.fullData[0]!,
        hoverContext(f),
      ) as { pointIndex: number; hoverText: string; px: number; py: number }[];
    // Japan and Russia are behind the globe; the unmatched and the one without a number are not
    // drawn.
    expect(stops().map((p) => p.pointIndex)).toEqual([1, 5]);
    expect(stops().map((p) => p.hoverText)).toEqual(['FRA<br>1', 'ZAF<br>4']);
    const sp = f.subplot();
    const [cx, cy] = containerPoint(sp, 2, 47);
    expect(stops()[0]!.px).toBeCloseTo(cx, 6);
    expect(stops()[0]!.py).toBeCloseTo(FIGURE.height - cy, 6);
    // Turned to the Pacific: Japan and Russia are the stops, in the order of `locations`.
    sp.view!.set({ rotation: { lon: 160, lat: 40 } });
    expect(stops().map((p) => p.pointIndex)).toEqual([0, 3]);
    // Unresolved: no stops.
    expect(
      parts['choropleth']!.keyboardPoints!(
        { ...f.calcs[0]!, drawn: undefined } as never,
        f.fullData[0]!,
        hoverContext(f),
      ),
    ).toEqual([]);
  });
});
