// @vitest-environment jsdom
/**
 * `scattergeo` traces given by `locations` (backlog GEO3): where they are drawn, what follows from
 * that (the view fit, hover, events, selection, text, lines, the description and keyboard stops),
 * and the basemap, `geojson` file or name table that arrives late or not at all, in a real chart.
 *
 * The basemap is a stub with small hand-made layers; `fetch` is stubbed per test. The chart draws
 * through a renderer that needs no WebGL.
 */
import type { FigureInput } from '@mk7s/holochart-core';
import { MarkerSet, type FrameScheduler, type Primitive } from '@mk7s/holochart-render';
import {
  createChart,
  createChartRegistry,
  formatTemplate,
  type Chart,
  type ChartOptions,
  type TraceUpdatePlan,
} from '@mk7s/holochart-runtime';
import type { WebGLRenderer } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBasemap, peekBasemap, type BasemapOptions } from '../basemap/index.ts';
import { laidOutGeoSubplots } from '../geo/cross-trace.ts';
import { clearLocationData } from '../geo/location-data.ts';
import type { GeoSubplot } from '../geo/subplot.ts';
import type { BasemapLayers } from '../geo/types.ts';
import {
  containerPoint,
  FIGURE,
  hoverContext,
  hoverQuery,
  layoutFigure,
  plotContext,
  type LaidOutFigure,
  type PlotHarness,
} from './__testing__/figure.ts';
import { describeScattergeo } from './describe.ts';
import { scattergeo } from './index.ts';
import { geoPath } from './lines.ts';
import { SCATTERGEO_LAYER, scattergeoOrder } from './plot.ts';

vi.mock('../basemap/index.ts', () => ({
  peekBasemap: vi.fn(),
  loadBasemap: vi.fn(),
}));

// troika typesets in a worker with browser globals; the view tests only need its object graph.
vi.mock('../../../render/node_modules/troika-three-text', async () => {
  const { Object3D } = await import('three');
  type Node = InstanceType<typeof Object3D>;
  const noopDispose = (o: object): void => {
    Object.assign(o, { dispose: (): void => {} });
  };
  class Text extends Object3D {
    constructor() {
      super();
      noopDispose(this);
    }
  }
  class BatchedText extends Object3D {
    material: unknown = null;
    addText(text: Node): void {
      this.add(text);
    }
    removeText(text: Node): void {
      this.remove(text);
    }
    constructor() {
      super();
      noopDispose(this);
    }
    sync(callback?: () => void): void {
      callback?.();
    }
  }
  return { Text, BatchedText, configureTextBuilder: () => {}, preloadFont: () => {} };
});

type Trace = Record<string, unknown>;

const square = (x: number, y: number, s = 2): number[][][] => [
  [
    [x, y],
    [x, y + s],
    [x + s, y + s],
    [x + s, y],
    [x, y],
  ],
];

/** Label points of the stub's features. */
const AT = {
  FRA: [2, 47],
  USA: [-100, 40],
  BRA: [-53, -10],
  JPN: [138, 37],
  CA: [-120, 37],
  NY: [-75, 43],
} as const;

function basemap(extras: boolean): BasemapLayers {
  const country = (id: keyof typeof AT, name: string) => ({
    type: 'Feature' as const,
    id,
    properties: { name, ct: [...AT[id]] as [number, number] },
    geometry: { type: 'Polygon' as const, coordinates: square(AT[id][0] - 1, AT[id][1] - 1) },
  });
  const state = (id: keyof typeof AT, name: string) => ({
    type: 'Feature' as const,
    id,
    properties: { name, gu: 'USA', ct: [...AT[id]] as [number, number] },
    geometry: { type: 'Polygon' as const, coordinates: square(AT[id][0] - 1, AT[id][1] - 1) },
  });
  return {
    countries: [
      country('FRA', 'France'),
      country('USA', 'United States of America'),
      country('BRA', 'Brazil'),
      country('JPN', 'Japan'),
    ],
    ...(extras ? { subunits: [state('CA', 'California'), state('NY', 'New York')] } : {}),
  };
}

/** Three districts; the trace names two of them. Their vertex means are (11, 11), (31, 21), (−59, −39). */
const DISTRICTS = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      id: 'd1',
      properties: { name: 'North', code: { short: 'N' } },
      geometry: { type: 'Polygon', coordinates: square(10, 10) },
    },
    {
      type: 'Feature',
      id: 'd2',
      properties: { name: 'East', code: { short: 'E' } },
      geometry: { type: 'Polygon', coordinates: square(30, 20) },
    },
    {
      type: 'Feature',
      id: 'd3',
      properties: { name: 'Far', code: { short: 'F' } },
      geometry: { type: 'Polygon', coordinates: square(-60, -40) },
    },
  ],
};

const keyOf = (resolution: number, scope: string, o: BasemapOptions = {}): string =>
  `${resolution}|${scope}|${o.extras ? 1 : 0}|${o.url ?? ''}`;

let cached: Map<string, BasemapLayers>;
let loads: Map<string, { resolve(layers: BasemapLayers): void; reject(e: Error): void }>;

/** Have the basemap loaded before the figure asks for it. */
function loaded(extras = false, scope = 'world'): BasemapLayers {
  const layers = basemap(extras);
  cached.set(keyOf(110, scope, { extras }), layers);
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
    return new Promise<BasemapLayers>((resolve, reject) => {
      loads.set(key, {
        resolve(layers) {
          cached.set(key, layers);
          resolve(layers);
        },
        reject,
      });
    });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** A world map that fills the plot area exactly: 800 × 400 px for 360° × 180°. */
const FLAT = { projection: { type: 'equirectangular' }, fitbounds: false };

function figure(traces: Trace | Trace[], geo: Trace = FLAT, chart?: object): LaidOutFigure {
  const data = (Array.isArray(traces) ? traces : [traces]).map((t) => ({
    type: 'scattergeo',
    ...t,
  }));
  return layoutFigure({ data, layout: { geo } } as never, chart);
}

const PASS: TraceUpdatePlan = { calc: false, plot: true, style: true, transform: false };

function layerOf<P extends Primitive<unknown>>(
  h: PlotHarness,
  layer: keyof typeof SCATTERGEO_LAYER,
): P | undefined {
  const order = scattergeoOrder(0) + SCATTERGEO_LAYER[layer];
  return [...h.added.keys()].find((p) => Math.abs(p.object.renderOrder - order) < 1e-9) as
    P | undefined;
}

/** Base-state positions of the marker instances (32-bit floats); NaN for hidden ones. */
function markerPositions(markers: MarkerSet): [number, number][] {
  const p = markers.positionArray!;
  const o = markers.origin;
  const out: [number, number][] = [];
  for (let i = 0; i < markers.count; i++) {
    out.push(p[i * 3]! >= 1e38 ? [NaN, NaN] : [p[i * 3]! + o[0], p[i * 3 + 1]! + o[1]]);
  }
  return out;
}

describe('scattergeo locations: where they are drawn', () => {
  it('draws at the points of the matched features; unmatched locations are gaps', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const layers = loaded();
    const f = figure({ locations: ['FRA', 'XXX', 'usa', null], name: 'visits' });
    const calc = f.calcs[0]!;
    expect(calc.unresolved).toBe(false);
    expect(Array.from(calc.lon)).toEqual([2, NaN, -100, NaN]);
    expect(Array.from(calc.lat)).toEqual([47, NaN, 40, NaN]);
    expect(calc.features!.map((x) => x?.feature)).toEqual([
      layers.countries![0],
      undefined,
      layers.countries![1],
      undefined,
    ]);
    expect(f.subplot().layers).toBe(layers);
    expect(f.subplot().loading).toBeUndefined();
    expect(loadBasemap).not.toHaveBeenCalled();

    const h = plotContext(f);
    scattergeo.plot!.create(h.ctx);
    const sp = f.subplot();
    const at = markerPositions(layerOf<MarkerSet>(h, 'markers')!);
    expect(at[0]![0]).toBeCloseTo(sp.basePoint(2, 47)![0], 3);
    expect(at[0]![1]).toBeCloseTo(sp.basePoint(2, 47)![1], 3);
    expect(at[2]![0]).toBeCloseTo(sp.basePoint(-100, 40)![0], 3);
    expect(Number.isNaN(at[1]![0])).toBe(true);
    expect(Number.isNaN(at[3]![0])).toBe(true);
    // Nothing waits: the only primitive is the marker set.
    expect(h.added.size).toBe(1);

    // One warning names the unmatched location and the trace; the gap is not one.
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toBe(
      '[holochart] scattergeo trace 0 "visits": 1 location matches no country of the base map by ' +
        `its ISO-3 code (locationmode 'ISO-3') and is not drawn: "XXX".`,
    );
    // Later layout passes neither match nor warn again.
    const before = calc.lon;
    f.layout();
    f.layout();
    expect(calc.lon).toBe(before);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('lets `locations` win over `lon` / `lat`, as Plotly does', () => {
    loaded();
    const f = figure({ locations: ['FRA', 'USA'], lon: [100, 110], lat: [-10, -20] });
    expect(Array.from(f.calcs[0]!.lon)).toEqual([2, -100]);
    expect(Array.from(f.calcs[0]!.lat)).toEqual([47, 40]);
    // An empty `locations` is none.
    const g = figure({ locations: [], lon: [100, 110], lat: [-10, -20] });
    expect(g.calcs[0]!.locations).toBeUndefined();
    expect(Array.from(g.calcs[0]!.lon)).toEqual([100, 110]);
  });

  it("asks for the basemap's extras for 'USA-states' and draws the states", () => {
    loaded(true);
    const f = figure({ locations: ['CA', 'New York'], locationmode: 'USA-states' });
    expect(peekBasemap).toHaveBeenCalledWith(110, 'world', { extras: true });
    expect(Array.from(f.calcs[0]!.lon)).toEqual([-120, -75]);
    expect(Array.from(f.calcs[0]!.lat)).toEqual([37, 43]);
  });

  it('draws the features of a `geojson` at their vertex means, by a nested `featureidkey`', () => {
    const f = figure({
      locations: ['E', 'N'],
      geojson: DISTRICTS,
      featureidkey: 'properties.code.short',
    });
    // `geojson` makes the mode 'geojson-id'; the basemap is not asked for.
    expect(f.fullData[0]!['locationmode']).toBe('geojson-id');
    expect(peekBasemap).not.toHaveBeenCalled();
    expect(loadBasemap).not.toHaveBeenCalled();
    expect(Array.from(f.calcs[0]!.lon)).toEqual([31, 11]);
    expect(Array.from(f.calcs[0]!.lat)).toEqual([21, 11]);
    expect(f.calcs[0]!.features![0]!.feature).toBe(DISTRICTS.features[1]);
  });

  it('joins the locations with lines along great circles, split at unmatched ones', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    loaded();
    const f = figure({ locations: ['FRA', 'USA', 'XXX', 'BRA', 'JPN'], mode: 'lines' });
    expect(geoPath(f.calcs[0]!, false, false).lines.coordinates).toEqual([
      [
        [2, 47],
        [-100, 40],
      ],
      [
        [-53, -10],
        [138, 37],
      ],
    ]);
    const h = plotContext(f);
    scattergeo.plot!.create(h.ctx);
    expect(layerOf(h, 'line')).toBeDefined();
  });
});

describe('scattergeo locations: fitbounds', () => {
  /** The state of the view of a figure, rounded. */
  const viewOf = (f: LaidOutFigure): unknown => {
    const { scale, translate, rotation } = f.subplot().view!.state;
    return {
      scale: Number(scale.toFixed(6)),
      translate: translate.map((v) => Number(v.toFixed(6))),
      rotation,
    };
  };

  it('fits a default map to the matched locations', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    loaded();
    // Plotly 4: `fitbounds` defaults to 'locations'.
    const located = figure({ locations: ['FRA', 'XXX', 'USA', 'BRA'] }, {});
    expect(located.fullLayout['geo']).toMatchObject({ fitbounds: 'locations' });
    const byCoordinates = figure({ lon: [2, -100, -53], lat: [47, 40, -10] }, {});
    expect(viewOf(located)).toEqual(viewOf(byCoordinates));
    const world = figure({ locations: ['FRA', 'USA', 'BRA'] }, { fitbounds: false });
    expect(viewOf(located)).not.toEqual(viewOf(world));
  });

  it("fits to the whole `geojson` with `fitbounds: 'geojson'`, not to the locations drawn", () => {
    const trace = { locations: ['d1', 'd2'], geojson: DISTRICTS };
    const whole = figure(trace, { fitbounds: 'geojson' });
    const drawn = figure(trace, { fitbounds: 'locations' });
    expect(viewOf(whole)).not.toEqual(viewOf(drawn));
    // The third district, which no location names, is in view; its far corner is at an edge.
    const view = whole.subplot().view!;
    const { width, height } = view.size;
    const corners = [
      view.project(-60, -40)!,
      view.project(32, 22)!,
      view.project(-60, 22)!,
      view.project(32, -40)!,
    ];
    const xs = corners.map((p) => p[0]);
    const ys = corners.map((p) => p[1]);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(-1e-6);
    expect(Math.max(...xs)).toBeLessThanOrEqual(width + 1e-6);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(-1e-6);
    expect(Math.max(...ys)).toBeLessThanOrEqual(height + 1e-6);
    const fills = Math.max(
      (Math.max(...xs) - Math.min(...xs)) / width,
      (Math.max(...ys) - Math.min(...ys)) / height,
    );
    expect(fills).toBeGreaterThan(0.95);
    // With 'locations', the far district is outside.
    const out = drawn.subplot().view!.project(-60, -40);
    expect(!out || out[0] < 0 || out[1] < 0).toBe(true);
  });
});

describe('scattergeo locations: hover, events, selection, text', () => {
  it('shows the location in hover labels and gives it to `hovertemplate`', () => {
    loaded();
    const f = figure({ locations: ['FRA', 'USA'], text: ['Paris', 'Washington'] });
    const [calc, trace] = [f.calcs[0]!, f.fullData[0]!];
    const [cx, cy] = containerPoint(f.subplot(), -100, 40);
    const [p] = scattergeo.hoverPoints!(calc, trace, hoverQuery(cx, cy), hoverContext(f));
    expect(p!.pointIndex).toBe(1);
    // `hoverinfo: 'all'` has `location`, which stands in for the coordinates (Plotly).
    expect(p!.hoverText).toBe('USA<br>Washington');
    expect(p!.fields).toMatchObject({ location: 'USA', lon: -100, lat: 40 });
    expect(p!.fields).not.toHaveProperty('properties');
    expect(
      formatTemplate('%{location}: %{text} at %{lat:.0f}', {
        values: { ...p!.fields, text: p!.text },
      }),
    ).toBe('USA: Washington at 40');

    const coordinates = figure({ locations: ['FRA', 'USA'], hoverinfo: 'lon+lat' });
    const [q] = scattergeo.hoverPoints!(
      coordinates.calcs[0]!,
      coordinates.fullData[0]!,
      hoverQuery(cx, cy),
      hoverContext(coordinates),
    );
    expect(q!.hoverText).toBe('(40°, −100°)');
  });

  it('gives events the location, and the properties of a `geojson` feature', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    loaded();
    const f = figure({ locations: ['FRA', 'XXX'] });
    expect(scattergeo.eventData!(f.calcs[0]!, f.fullData[0]!, 0)).toEqual({
      lon: 2,
      lat: 47,
      location: 'FRA',
    });
    expect(scattergeo.eventData!(f.calcs[0]!, f.fullData[0]!, 1)).toEqual({
      lon: NaN,
      lat: NaN,
      location: 'XXX',
    });

    const g = figure({ locations: ['d2', 'd1'], geojson: DISTRICTS });
    const data = scattergeo.eventData!(g.calcs[0]!, g.fullData[0]!, 0);
    expect(data).toEqual({
      lon: 31,
      lat: 21,
      location: 'd2',
      properties: DISTRICTS.features[1]!.properties,
    });
    const [cx, cy] = containerPoint(g.subplot(), 31, 21);
    const [p] = scattergeo.hoverPoints!(
      g.calcs[0]!,
      g.fullData[0]!,
      hoverQuery(cx, cy),
      hoverContext(g),
    );
    expect(
      formatTemplate('%{location} is %{properties.name} (%{properties.code.short})', {
        values: p!.fields!,
      }),
    ).toBe('d2 is East (E)');
  });

  it('selects the locations inside a box', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    loaded();
    const f = figure({ locations: ['FRA', 'USA', 'XXX', 'BRA'] });
    const ctx = hoverContext(f);
    const [x, y] = containerPoint(f.subplot(), -100, 40);
    const box = { kind: 'rect', x: [x - 5, x + 5], y: [y - 5, y + 5] } as const;
    expect(scattergeo.selectPoints!(f.calcs[0]!, f.fullData[0]!, box, ctx)).toEqual([1]);
    const all = { kind: 'rect', x: [0, FIGURE.width], y: [0, FIGURE.height] } as const;
    expect(scattergeo.selectPoints!(f.calcs[0]!, f.fullData[0]!, all, ctx)).toEqual([0, 1, 3]);
  });

  it('fills `texttemplate` with the location and where it is drawn', () => {
    loaded();
    const f = figure({
      locations: ['FRA', 'USA'],
      mode: 'markers+text',
      text: ['a', 'b'],
      texttemplate: '%{location} %{text} %{lat:.1f}/%{lon}',
    });
    const h = plotContext(f);
    const view = scattergeo.plot!.create(h.ctx);
    const text = layerOf(h, 'text')!;
    const update = vi.spyOn(text, 'update');
    view.update(h.ctx, PASS);
    const labels = (update.mock.lastCall![0] as { labels: { text: string }[] }).labels;
    expect(labels.map((l) => l.text)).toEqual(['FRA a 47.0/2', 'USA b 40.0/-100']);
  });

  it('describes the locations, and visits them with the keyboard', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    loaded();
    const f = figure({ locations: ['FRA', 'XXX', 'USA'], text: ['a', 'b', 'c'], name: 'visits' });
    const d = describeScattergeo({
      trace: f.fullData[0]!,
      calc: f.calcs[0]!,
      index: 0,
      fullLayout: f.fullLayout,
      xaxis: undefined,
      yaxis: undefined,
      maxRows: 10,
    })!;
    expect(d.summary).toBe(
      'Map scatter "visits": 3 points. Longitude −100° to 2°, latitude 40° to 47°. 1 point without a position.',
    );
    expect(d.table!.columns).toEqual(['location', 'longitude', 'latitude', 'text']);
    expect(d.table!.rows).toEqual([
      ['FRA', '2°', '47°', 'a'],
      ['XXX', '', '', 'b'],
      ['USA', '−100°', '40°', 'c'],
    ]);

    const parts = await scattergeo.a11y!();
    const stops = parts['scattergeo']!.keyboardPoints!(
      f.calcs[0]! as never,
      f.fullData[0]!,
      hoverContext(f),
    ) as { pointIndex: number; hoverText: string }[];
    expect(stops.map((p) => [p.pointIndex, p.hoverText])).toEqual([
      [0, 'FRA<br>a'],
      [2, 'USA<br>c'],
    ]);
  });
});

describe('scattergeo locations: a basemap that arrives late (the view)', () => {
  it('holds readiness with a hidden primitive, draws nothing, then draws', async () => {
    const chart = { resize: vi.fn() };
    const f = figure(
      [{ locations: ['FRA', 'USA'] }, { lon: [10], lat: [10] }],
      { projection: { type: 'equirectangular' } },
      chart,
    );
    const calc = f.calcs[0]!;
    expect(calc.unresolved).toBe(true);
    expect(calc.fit).toBeUndefined();
    expect(Array.from(calc.lon)).toEqual([NaN, NaN]);
    const loading = f.subplot().loading;
    expect(loading).toBeInstanceOf(Promise);
    const h = plotContext(f);
    const view = scattergeo.plot!.create(h.ctx);
    // Only the placeholder, in no subplot viewport.
    expect(h.added.size).toBe(1);
    const [pending] = [...h.added.keys()] as [Primitive<unknown> & { ready?: Promise<void> }];
    expect(pending.ready).toBe(loading);
    expect(pending.object.visible).toBe(false);
    expect(h.asked).toHaveLength(0);
    const ctx = hoverContext(f);
    const [cx, cy] = containerPoint(f.subplot(), 10, 10);
    expect(scattergeo.hoverPoints!(calc, f.fullData[0]!, hoverQuery(cx, cy), ctx)).toEqual([]);
    const all = { kind: 'rect', x: [0, FIGURE.width], y: [0, FIGURE.height] } as const;
    expect(scattergeo.selectPoints!(calc, f.fullData[0]!, all, ctx)).toEqual([]);
    expect(
      describeScattergeo({
        trace: f.fullData[0]!,
        calc,
        index: 0,
        fullLayout: f.fullLayout,
        xaxis: undefined,
        yaxis: undefined,
        maxRows: 10,
      })!.summary,
    ).toMatch(/Its locations are not drawn\.$/);
    // The trace given by coordinates is drawn as usual, and holds nothing.
    const second = plotContext(f, 1);
    scattergeo.plot!.create(second.ctx);
    expect([...second.added.keys()].map((p) => p.constructor)).toEqual([MarkerSet]);
    const fittedToOne = f.subplot().view!.state.scale;

    loads.get(keyOf(110, 'world'))!.resolve(basemap(false));
    await loading;
    // The layout pass was asked for; it locates the trace and fits the view to all three points.
    expect(chart.resize).toHaveBeenCalledTimes(1);
    f.layout();
    expect(calc.unresolved).toBe(false);
    expect(Array.from(calc.lon)).toEqual([2, -100]);
    expect(f.subplot().loading).toBeUndefined();
    expect(f.subplot().view!.state.scale).toBeLessThan(fittedToOne);
    view.update(h.ctx, PASS);
    expect(h.added.has(pending)).toBe(false);
    const markers = layerOf<MarkerSet>(h, 'markers')!;
    const sp = f.subplot();
    expect(markerPositions(markers)[1]![0]).toBeCloseTo(sp.basePoint(-100, 40)![0], 3);
    expect(h.added.get(markers)).toBe(h.viewports.get('geo'));
  });
});

// ---- A chart without WebGL ------------------------------------------------------------------------

function fakeRenderer(): WebGLRenderer {
  return {
    domElement: document.createElement('canvas'),
    autoClear: true,
    info: { autoReset: true, reset: vi.fn() },
    renderLists: { dispose: vi.fn() },
    setPixelRatio: vi.fn(),
    setSize: vi.fn(),
    setDrawingBufferSize: vi.fn(),
    setRenderTarget: vi.fn(),
    setClearColor: vi.fn(),
    clear: vi.fn(),
    setScissor: vi.fn(),
    setScissorTest: vi.fn(),
    setViewport: vi.fn(),
    render: vi.fn(),
    dispose: vi.fn(),
    forceContextLoss: vi.fn(),
  } as unknown as WebGLRenderer;
}

function manualScheduler(): FrameScheduler {
  let next = 1;
  const queue = new Map<number, (time: number) => void>();
  return {
    request(cb) {
      queue.set(next, cb);
      return next++;
    },
    cancel: (handle) => void queue.delete(handle),
    now: () => 0,
  };
}

describe('scattergeo locations: in a chart', () => {
  let container: HTMLElement;
  let charts: Chart[];
  let options: ChartOptions;

  beforeEach(() => {
    charts = [];
    container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 800, configurable: true });
    Object.defineProperty(container, 'clientHeight', { value: 500, configurable: true });
    document.body.appendChild(container);
    options = {
      registry: createChartRegistry().register(scattergeo),
      renderRoot: { scheduler: manualScheduler(), createRenderer: fakeRenderer },
    };
  });

  afterEach(() => {
    for (const c of charts) c.destroy();
    container.remove();
  });

  function create(trace: Trace, geo: Trace = {}, config?: Trace): Chart {
    const c = createChart(
      container,
      {
        data: [{ type: 'scattergeo', ...trace }],
        layout: { margin: { l: 0, r: 0, t: 0, b: 0 }, geo },
        config,
      } as FigureInput,
      options,
    );
    charts.push(c);
    return c;
  }

  /** Resolves to whether `c.ready` is still pending after the event loop has turned. */
  async function stillWaiting(c: Chart): Promise<boolean> {
    let ready = false;
    void c.ready.then(
      () => (ready = true),
      () => (ready = true),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    return !ready;
  }

  /** The marker sets drawn for trace 0. */
  const markersOf = (c: Chart): unknown[] =>
    c.getTraceObjects(0).filter((o) => o.visible && o.type !== 'Object3D');

  const subplotOf = (c: Chart): GeoSubplot => laidOutGeoSubplots(c.fullLayout!)!.get('geo')!;

  it('keeps `ready` waiting for the basemap, then draws at the locations and fits the view', async () => {
    const c = create({ locations: ['FRA', 'USA'] });
    await vi.waitFor(() => expect(loads.size).toBe(1));
    expect(loadBasemap).toHaveBeenCalledTimes(1);
    expect(loadBasemap).toHaveBeenCalledWith(110, 'world', { extras: false });
    expect(await stillWaiting(c)).toBe(true);
    expect(markersOf(c)).toHaveLength(0);
    const before = subplotOf(c);
    expect(before.loading).toBeInstanceOf(Promise);
    const world = before.view!.state.scale;

    loads.get(keyOf(110, 'world'))!.resolve(basemap(false));
    await c.ready;
    const after = subplotOf(c);
    expect(after.loading).toBeUndefined();
    expect(after.layers).toBe(cached.get(keyOf(110, 'world')));
    expect(markersOf(c)).toHaveLength(1);
    // The placeholder is gone, and the view is zoomed to the two countries.
    expect(c.getTraceObjects(0).every((o) => o.visible)).toBe(true);
    expect(after.view!.state.scale).toBeGreaterThan(world);
    const usa = after.view!.project(-100, 40)!;
    expect(usa[0]).toBeGreaterThan(0);
    expect(usa[0]).toBeLessThan(after.rect.width / 4);
    // A later pass neither loads nor waits again.
    await c.relayout({ 'geo.bgcolor': '#eee' });
    expect(loadBasemap).toHaveBeenCalledTimes(1);
    expect(markersOf(c)).toHaveLength(1);
  });

  it('passes `config.topojsonURL` to the basemap loader', async () => {
    cached.set(keyOf(110, 'usa', { extras: true, url: 'https://maps.example/' }), basemap(true));
    const c = create(
      { locations: ['CA'], locationmode: 'USA-states' },
      { scope: 'usa' },
      { topojsonURL: 'https://maps.example/' },
    );
    await c.ready;
    expect(peekBasemap).toHaveBeenCalledWith(110, 'usa', {
      extras: true,
      url: 'https://maps.example/',
    });
    expect(loadBasemap).not.toHaveBeenCalled();
    expect(markersOf(c)).toHaveLength(1);
  });

  it('is ready with nothing drawn, and one warning, when the basemap cannot be loaded', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const c = create({ locations: ['FRA', 'USA'] });
    await vi.waitFor(() => expect(loads.size).toBe(1));
    expect(await stillWaiting(c)).toBe(true);
    loads.get(keyOf(110, 'world'))!.reject(new Error('offline'));
    await c.ready;
    expect(markersOf(c)).toHaveLength(0);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toMatch(/the 1:110m basemap could not be loaded/);
    // Updates stay ready and quiet; the load is not tried again by this chart.
    await c.relayout({ 'geo.bgcolor': '#eee' });
    await c.restyle({ 'marker.size': 12 });
    expect(loadBasemap).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(subplotOf(c).loading).toBeUndefined();
  });

  it('fetches a `geojson` URL before drawing, and `ready` waits for it', async () => {
    let answer!: (response: unknown) => void;
    const fetchMock = vi.fn(
      (_url: string) =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const url = 'https://data.example/districts.json';
    const c = create({ locations: ['d1', 'd3'], geojson: url }, { fitbounds: 'geojson' });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0]![0]).toBe(url);
    expect(await stillWaiting(c)).toBe(true);
    expect(markersOf(c)).toHaveLength(0);
    answer({ ok: true, status: 200, json: () => Promise.resolve(DISTRICTS) });
    await c.ready;
    expect(markersOf(c)).toHaveLength(1);
    expect(loadBasemap).not.toHaveBeenCalled();
    // Fitted to the whole file: the district no location names is in view.
    const sp = subplotOf(c);
    const far = sp.view!.project(31, 21)!;
    expect(far[0]).toBeGreaterThan(0);
    expect(far[0]).toBeLessThan(sp.rect.width);
    await c.relayout({ 'geo.bgcolor': '#eee' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('is ready with nothing drawn, and one warning, when the `geojson` cannot be fetched', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchMock = vi.fn(() => Promise.resolve({ ok: false, status: 500, json: vi.fn() }));
    vi.stubGlobal('fetch', fetchMock);
    const c = create({ locations: ['d1'], geojson: 'https://data.example/gone.json' });
    await c.ready;
    expect(markersOf(c)).toHaveLength(0);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toMatch(
      /the GeoJSON at "https:\/\/data\.example\/gone\.json" could not be loaded/,
    );
    await c.relayout({ 'geo.bgcolor': '#eee' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("loads the name table for 'country names', and `ready` waits for it", async () => {
    cached.set(keyOf(110, 'world'), basemap(false));
    const c = create({
      locations: ['France', 'United States', 'Brasil'],
      locationmode: 'country names',
    });
    await c.ready;
    expect(markersOf(c)).toHaveLength(1);
    expect(loadBasemap).not.toHaveBeenCalled();
    // Fitted to the three countries: Brazil, the southernmost, is in view.
    const sp = subplotOf(c);
    const brazil = sp.view!.project(-53, -10)!;
    expect(brazil[1]).toBeGreaterThan(0);
    expect(brazil[1]).toBeLessThan(sp.rect.height / 4);
  });
});
