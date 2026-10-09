// @vitest-environment jsdom
/**
 * The geo component in a chart (backlog GEO2): the base layers it draws, when it projects and when
 * it only moves, the lazy basemap, and the drags, wheel, pinch and double-click.
 *
 * The chart draws through a renderer that records nothing and needs no WebGL, on a frame scheduler
 * that runs when stepped. The basemap is a stub with small hand-made layers, and the sinks are
 * wrapped so a test can see what was projected from what.
 */
import { attr, type FigureInput, type FullTrace } from '@mk7s/holochart-core';
import {
  LazyFillPrimitive,
  LazyMeshPrimitive,
  LinePrimitive,
  type FrameScheduler,
  type Line3D,
  type Primitive,
  type Viewport,
} from '@mk7s/holochart-render';
import {
  createChart,
  createChartRegistry,
  type Chart,
  type ChartOptions,
  type ComponentDrawContext,
  type ComponentModule,
  type ComponentPointerEvent,
  type ComponentView,
  type TraceModule,
} from '@mk7s/holochart-runtime';
import { Matrix4, type WebGLRenderer } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { loadBasemap, peekBasemap } from '../basemap/index.ts';
import { SPHERE } from './base-layers.ts';
import { geoComponent } from './component.ts';
import { geoCrossTraceLayout, laidOutGeoSubplots } from './cross-trace.ts';
import { geoSubplotDomain } from './domain.ts';
import { globeBodyColor, globeLineRadius } from './globe-layers.ts';
import { globeModule, loadGlobe, type GlobeModule } from './globe-loader.ts';
import { globeScene } from './globe-scene.ts';
import { geoResetRelayout, saveGeoViewInitial } from './interact.ts';
import { geoLayoutSchema, geoSubplotAttribute } from './layout-attributes.ts';
import { geoLayoutOf, supplyGeoLayoutDefaults } from './layout-defaults.ts';
import { GEO_ORDER, GEO_ORDER_FOR_CHOROPLETH, type GeoLayerName } from './order.ts';
import { projectLines, projectPolygons } from './sink.ts';
import type { GeoSubplot } from './subplot.ts';
import type { BasemapLayers, FullGeoLayout } from './types.ts';

// The globe's chunk, with its builders wrapped so a test can see what was built from what.
vi.mock('./globe-loader.ts', async (importOriginal) => {
  const loader = await importOriginal<typeof import('./globe-loader.ts')>();
  let spied: GlobeModule | undefined;
  const wrap = (globe: GlobeModule): GlobeModule =>
    (spied ??= {
      ...globe,
      buildSphereMesh: vi.fn(globe.buildSphereMesh),
      buildSphereShell: vi.fn(globe.buildSphereShell),
      buildSphereLines: vi.fn(globe.buildSphereLines),
    });
  return {
    ...loader,
    globeModule: vi.fn(() => {
      const globe = loader.globeModule();
      return globe && wrap(globe);
    }),
    loadGlobe: vi.fn(() => loader.loadGlobe().then(wrap)),
  };
});

vi.mock('../basemap/index.ts', () => ({
  peekBasemap: vi.fn(),
  loadBasemap: vi.fn(),
  clearBasemapCache: vi.fn(),
}));

vi.mock('./sink.ts', async (importOriginal) => {
  const sink = await importOriginal<typeof import('./sink.ts')>();
  return {
    ...sink,
    projectPolygons: vi.fn(sink.projectPolygons),
    projectLines: vi.fn(sink.projectLines),
  };
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

/** A `requestAnimationFrame` stand-in that only runs when stepped. */
function manualScheduler(): FrameScheduler & { step(): void } {
  let next = 1;
  let time = 0;
  const queue = new Map<number, (time: number) => void>();
  return {
    request(cb) {
      queue.set(next, cb);
      return next++;
    },
    cancel: (handle) => void queue.delete(handle),
    now: () => time,
    step() {
      time += 16;
      const cbs = [...queue.values()];
      queue.clear();
      for (const cb of cbs) cb(time);
    },
  };
}

/**
 * A geo trace that draws nothing: it only puts its subplot in the figure. With `mode`, it is given
 * by `locations` matched against the subplot's basemap, as a choropleth is.
 */
function geoTrace(type: string, mode?: 'ISO-3' | 'USA-states'): TraceModule {
  const locations = { locations: ['FRA'], locationmode: mode, featureidkey: 'id' };
  return {
    type,
    categories: ['geo'],
    schema: attr.object({ geo: geoSubplotAttribute }),
    layoutSchema: geoLayoutSchema,
    meta: { description: 'Test trace on a geo subplot.' },
    supplyDefaults(_in, _out: FullTrace, ctx) {
      ctx.coerce('geo');
    },
    supplyLayoutDefaults: supplyGeoLayoutDefaults,
    subplotDomain: geoSubplotDomain,
    calc: () => ({
      subplot: undefined,
      ...(mode ? { locations, located: () => undefined } : {}),
    }),
    crossTraceLayout: geoCrossTraceLayout,
    plot: { create: () => ({ update: () => undefined }) },
  } as TraceModule;
}

// ---- The basemap stub -----------------------------------------------------------------------------

/** Hand-made layers; every call makes new objects, so 110m and 50m can be told apart. */
function basemap(): BasemapLayers {
  const square = [
    [0, 0],
    [0, 20],
    [20, 20],
    [20, 0],
    [0, 0],
  ];
  return {
    land: { type: 'MultiPolygon', coordinates: [[square]] },
    coastlines: { type: 'MultiLineString', coordinates: [square] },
    borders: {
      type: 'MultiLineString',
      coordinates: [
        [
          [10, 0],
          [10, 20],
        ],
      ],
    },
    lakes: {
      type: 'MultiPolygon',
      coordinates: [
        [
          [
            [4, 4],
            [4, 6],
            [6, 6],
            [6, 4],
            [4, 4],
          ],
        ],
      ],
    },
    rivers: {
      type: 'MultiLineString',
      coordinates: [
        [
          [2, 2],
          [18, 18],
        ],
      ],
    },
  };
}

interface Deferred {
  resolve(layers: BasemapLayers): void;
  reject(error: Error): void;
}

/** What `peekBasemap` answers, and the loads that have not settled, both by request. */
let cached: Map<string, BasemapLayers>;
let loads: Map<string, Deferred>;
const requestKey = (resolution: number, scope: string, options: { extras?: boolean } = {}) =>
  `${resolution}|${scope}|${options.extras ? 'extras' : 'base'}`;

// ---- The chart under test -------------------------------------------------------------------------

let scheduler: ReturnType<typeof manualScheduler>;
let container: HTMLElement;
let options: ChartOptions;
let charts: Chart[];
/** The component's view and the primitives it has in each viewport. */
let view: ComponentView;
let live: Map<Primitive<unknown>, Viewport>;

/** The component, with its context wrapped to see what it adds and removes. */
const probed: ComponentModule = {
  ...geoComponent,
  draw: {
    create(ctx) {
      const wrap = (c: ComponentDrawContext): ComponentDrawContext => ({
        ...c,
        add(primitive, viewport) {
          const p = primitive as Primitive<unknown>;
          vi.spyOn(p, 'update');
          vi.spyOn(p, 'setTransform');
          live.set(p, viewport ?? c.overlay);
          return c.add(primitive, viewport);
        },
        remove(primitive) {
          live.delete(primitive as Primitive<unknown>);
          c.remove(primitive);
        },
      });
      const inner = geoComponent.draw!.create(wrap(ctx));
      view = {
        update: (c, plan) => inner.update(wrap(c), plan),
        dispose: () => inner.dispose?.(),
        handlePointer: (e) => inner.handlePointer?.(e),
        selectArea: (x, y) => inner.selectArea?.(x, y),
      };
      return view;
    },
  },
};

beforeEach(() => {
  cached = new Map();
  loads = new Map();
  live = new Map();
  charts = [];
  vi.mocked(peekBasemap).mockImplementation((resolution, scope, opts) =>
    cached.get(requestKey(resolution, scope, opts)),
  );
  vi.mocked(loadBasemap).mockImplementation((resolution, scope, opts) => {
    const key = requestKey(resolution, scope, opts);
    const ready = cached.get(key);
    if (ready) return Promise.resolve(ready);
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
  vi.mocked(projectPolygons).mockClear();
  vi.mocked(projectLines).mockClear();
  scheduler = manualScheduler();
  container = document.createElement('div');
  Object.defineProperty(container, 'clientWidth', { value: 800, configurable: true });
  Object.defineProperty(container, 'clientHeight', { value: 500, configurable: true });
  document.body.appendChild(container);
  options = {
    registry: createChartRegistry().register(
      geoTrace('fakegeo'),
      geoTrace('choropleth'),
      geoTrace('located', 'ISO-3'),
      geoTrace('states', 'USA-states'),
      probed,
    ),
    renderRoot: { scheduler, createRenderer: fakeRenderer },
  };
});

afterEach(() => {
  for (const c of charts) c.destroy();
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const MARGIN = { l: 0, r: 0, t: 0, b: 0 };

function create(
  geo: Record<string, unknown> = {},
  figure: { data?: unknown[]; layout?: Record<string, unknown>; config?: unknown } = {},
): Chart {
  const c = createChart(
    container,
    {
      data: figure.data ?? [{ type: 'fakegeo' }],
      // `fitbounds` off: the view is the layout's, and a relayout has the changed keys alone.
      layout: {
        margin: MARGIN,
        dragmode: 'pan',
        geo: { fitbounds: false, ...geo },
        ...figure.layout,
      },
      config: figure.config,
    } as FigureInput,
    options,
  );
  charts.push(c);
  return c;
}

async function chart(
  geo: Record<string, unknown> = {},
  figure: { data?: unknown[]; layout?: Record<string, unknown>; config?: unknown } = {},
): Promise<Chart> {
  const c = create(geo, figure);
  await c.ready;
  return c;
}

const subplot = (c: Chart, id = 'geo'): GeoSubplot =>
  laidOutGeoSubplots(c.fullLayout!)!.get(id) as GeoSubplot;

interface DrawnLayer {
  name: GeoLayerName;
  primitive: Primitive<unknown>;
  update: Mock;
  setTransform: Mock;
}

/** The layers drawn in a subplot's viewport, bottom to top, named by their draw order. */
function drawn(c: Chart, id = 'geo', order = GEO_ORDER): DrawnLayer[] {
  const viewport = c.three.viewports.find((vp) => vp.name === `subplot-${id}`);
  const names = new Map(Object.entries(order).map(([name, o]) => [o, name as GeoLayerName]));
  return [...live]
    .filter(([, vp]) => vp === viewport)
    .map(([primitive]) => ({
      name: names.get(primitive.object.renderOrder) as GeoLayerName,
      primitive,
      update: primitive.update as Mock,
      setTransform: primitive.setTransform as Mock,
    }))
    .sort((a, b) => a.primitive.object.renderOrder - b.primitive.object.renderOrder);
}

const layerOf = (c: Chart, name: GeoLayerName, id = 'geo'): DrawnLayer =>
  drawn(c, id).find((l) => l.name === name) as DrawnLayer;

/** The patches a layer's `update` got that carried geometry. */
const geometryUpdates = (layer: DrawnLayer): unknown[] =>
  layer.update.mock.calls.filter(([patch]) => 'x' in (patch as object));

/** The last style a layer's `update` got. */
function styleOf(layer: DrawnLayer): Record<string, unknown> {
  const patches = layer.update.mock.calls.map(([patch]) => patch as Record<string, unknown>);
  return patches.filter((p) => 'color' in p).pop() as Record<string, unknown>;
}

function pointer(
  type: ComponentPointerEvent['type'],
  x: number,
  y: number,
  native?: Event,
): boolean {
  return (
    view.handlePointer?.({
      type,
      x,
      y,
      button: 0,
      shiftKey: false,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      native,
      cursor: undefined,
    }) === true
  );
}

/** The middle of the rect a subplot draws in, container px. */
function middle(c: Chart, id = 'geo'): [number, number] {
  const r = subplot(c, id).clipRect;
  return [r.x + r.width / 2, r.y + r.height / 2];
}

/** Press in the middle of a subplot, move by `(dx, dy)` in two steps, release. */
function drag(c: Chart, dx: number, dy: number, id = 'geo'): void {
  const [x, y] = middle(c, id);
  expect(pointer('down', x, y)).toBe(true);
  pointer('move', x + dx / 2, y + dy / 2);
  pointer('move', x + dx, y + dy);
  pointer('up', x + dx, y + dy);
}

function wheel(c: Chart, deltaY: number, id = 'geo'): boolean {
  const [x, y] = middle(c, id);
  return pointer('wheel', x, y, new WheelEvent('wheel', { deltaY, cancelable: true }));
}

/** The relayouts the component committed. */
function commits(c: Chart): Record<string, unknown>[] {
  const spy = vi.mocked(c.relayout);
  return spy.mock.calls.map(([update]) => update as Record<string, unknown>);
}

const ALL_LAYERS = {
  showocean: true,
  showland: true,
  showlakes: true,
  showcountries: true,
  showcoastlines: true,
  showrivers: true,
  showframe: true,
  lonaxis: { showgrid: true },
  lataxis: { showgrid: true },
};

// ---- Tests ----------------------------------------------------------------------------------------

describe('geoComponent: base layers', () => {
  beforeEach(() => {
    cached.set(requestKey(110, 'world'), basemap());
    cached.set(requestKey(110, 'world', { extras: true }), basemap());
  });

  it('is the geo counterpart of the polar component', () => {
    expect(geoComponent.name).toBe('geo');
    expect(geoComponent.order).toBe(-10);
  });

  it("draws Plotly's default world map: coastlines and the frame, in a clipped 2D viewport", async () => {
    const c = await chart({ bgcolor: '#ff0000' });
    const viewport = c.three.viewports.find((vp) => vp.name === 'subplot-geo');
    expect(viewport?.kind).toBe('2d');
    expect(viewport?.clip).toBe(true);
    expect(viewport?.rect).toEqual(subplot(c).clipRect);
    expect(viewport?.background).toEqual([1, 0, 0, 1]);
    expect(drawn(c).map((l) => l.name)).toEqual(['coastlines', 'frame']);
    // Nothing asked for the lakes, rivers or subunits.
    expect(loadBasemap).not.toHaveBeenCalled();
    expect(vi.mocked(peekBasemap).mock.calls.every(([, , o]) => o?.extras === false)).toBe(true);
  });

  it('draws each shown layer as one primitive, in layer order', async () => {
    const c = await chart(ALL_LAYERS);
    const layers = drawn(c);
    expect(layers.map((l) => l.name)).toEqual([
      'ocean',
      'land',
      'lakes',
      'countries',
      'coastlines',
      'rivers',
      'lataxis',
      'lonaxis',
      'frame',
    ]);
    expect(layers.map((l) => l.primitive.object.renderOrder)).toEqual([
      100, 200, 300, 500, 600, 700, 800, 900, 1000,
    ]);
    for (const layer of layers) {
      const fill = ['ocean', 'land', 'lakes'].includes(layer.name);
      expect(layer.primitive).toBeInstanceOf(fill ? LazyFillPrimitive : LinePrimitive);
      expect(geometryUpdates(layer)).toHaveLength(1);
    }
    // Every layer is in the subplot's viewport and carries the subplot's transform.
    expect(layers[0]!.setTransform).toHaveBeenLastCalledWith(subplot(c).transform);
  });

  it('puts rivers and lakes above the regions when the subplot has a choropleth', async () => {
    const c = await chart(ALL_LAYERS, { data: [{ type: 'choropleth' }] });
    const layers = drawn(c, 'geo', GEO_ORDER_FOR_CHOROPLETH);
    expect(layers.map((l) => l.name)).toEqual([
      'ocean',
      'land',
      'countries',
      'coastlines',
      'lataxis',
      'lonaxis',
      'frame',
      'rivers',
      'lakes',
    ]);
    expect(layers.map((l) => l.primitive.object.renderOrder)).toEqual([
      100, 200, 400, 500, 600, 700, 800, 1000, 1100,
    ]);
  });

  it('projects the ocean and the frame from the sphere, the rest from the basemap', async () => {
    const c = await chart(ALL_LAYERS);
    const data = cached.get(requestKey(110, 'world', { extras: true })) as BasemapLayers;
    const filled = vi.mocked(projectPolygons).mock.calls.map(([, , geometry]) => geometry);
    expect(filled).toEqual([SPHERE, data.land, data.lakes]);
    const lines = vi.mocked(projectLines).mock.calls.map(([, , geometry]) => geometry);
    // Country borders are interior lines in the basemap: the layer adds the coasts.
    expect(lines[0]).toEqual({
      type: 'GeometryCollection',
      geometries: [data.borders, data.coastlines],
    });
    expect(lines[1]).toBe(data.coastlines);
    expect(lines[2]).toBe(data.rivers);
    expect(lines[5]).toBe(SPHERE);
    // The sinks' arrays can be longer than what is in use: the primitives get views of the part
    // that is.
    const [patch] = geometryUpdates(layerOf(c, 'land'))[0] as [Record<string, ArrayLike<number>>];
    const out = vi.mocked(projectPolygons).mock.results[1]!.value as { vertexCount: number };
    expect(patch['x']!.length).toBe(out.vertexCount);
    expect(patch['rings']!.length).toBe(1);
    expect(patch['polygons']!.length).toBe(1);
  });

  it('styles the layers from their attributes', async () => {
    const c = await chart({
      ...ALL_LAYERS,
      oceancolor: '#0000ff',
      landcolor: 'rgba(0, 255, 0, 0.5)',
      countrycolor: '#ff0000',
      countrywidth: 3,
      coastlinewidth: 2,
      framecolor: '#00ff00',
      framewidth: 4,
      lonaxis: { showgrid: true, gridcolor: '#ffffff', gridwidth: 1.5, griddash: 'dot' },
    });
    expect(styleOf(layerOf(c, 'ocean'))).toEqual({ color: [0, 0, 1, 1] });
    expect(styleOf(layerOf(c, 'land'))).toEqual({ color: [0, 1, 0, 0.5] });
    expect(styleOf(layerOf(c, 'countries'))).toEqual({
      color: [1, 0, 0, 1],
      width: 3,
      dash: 'solid',
      miterLimit: 2,
    });
    expect(styleOf(layerOf(c, 'coastlines'))).toMatchObject({ width: 2, dash: 'solid' });
    expect(styleOf(layerOf(c, 'frame'))).toMatchObject({ color: [0, 1, 0, 1], width: 4 });
    expect(styleOf(layerOf(c, 'lonaxis'))).toEqual({
      color: [1, 1, 1, 1],
      width: 1.5,
      dash: 'dot',
      miterLimit: 4,
    });
  });

  it('restyles without projecting, and drops a layer that is turned off', async () => {
    const c = await chart(ALL_LAYERS);
    const land = layerOf(c, 'land');
    await c.relayout({ 'geo.landcolor': '#000000', 'geo.showrivers': false });
    expect(drawn(c).map((l) => l.name)).not.toContain('rivers');
    expect(layerOf(c, 'land').primitive).toBe(land.primitive);
    expect(styleOf(land)).toEqual({ color: [0, 0, 0, 1] });
    expect(geometryUpdates(land)).toHaveLength(1);
  });

  it('projects a graticule again when its step changes', async () => {
    const c = await chart(ALL_LAYERS);
    const lonaxis = layerOf(c, 'lonaxis');
    const lataxis = layerOf(c, 'lataxis');
    await c.relayout({ 'geo.lonaxis.dtick': 45 });
    expect(geometryUpdates(lonaxis)).toHaveLength(2);
    expect(geometryUpdates(lataxis)).toHaveLength(1);
  });

  it('hides the base layers of `visible: false` and keeps the subplot', async () => {
    const c = await chart({ visible: false });
    expect(drawn(c)).toEqual([]);
    expect(c.three.viewports.some((vp) => vp.name === 'subplot-geo')).toBe(true);
    expect(view.selectArea?.(...middle(c))).toEqual({ id: 'geo', rect: subplot(c).clipRect });
  });

  it('draws a subplot whose only trace is `legendonly`', async () => {
    const c = await chart({}, { data: [{ type: 'fakegeo', visible: 'legendonly' }] });
    expect(laidOutGeoSubplots(c.fullLayout!)?.get('geo')).toBeUndefined();
    expect(drawn(c).map((l) => l.name)).toEqual(['coastlines', 'frame']);
  });

  it('draws several subplots, each in its own viewport, and removes one that goes', async () => {
    const c = await chart(
      {},
      {
        data: [{ type: 'fakegeo' }, { type: 'fakegeo', geo: 'geo2' }],
        layout: { geo2: { fitbounds: false, showland: true, showcoastlines: false } },
      },
    );
    expect(drawn(c, 'geo').map((l) => l.name)).toEqual(['coastlines', 'frame']);
    expect(drawn(c, 'geo2').map((l) => l.name)).toEqual(['land', 'frame']);
    expect(subplot(c, 'geo2').clipRect.y).toBeLessThan(subplot(c, 'geo').clipRect.y);
    await c.deleteTraces(1);
    expect(c.three.viewports.some((vp) => vp.name === 'subplot-geo2')).toBe(false);
    expect([...live.values()].every((vp) => vp.name === 'subplot-geo')).toBe(true);
  });
});

describe('geoComponent: the lazy basemap', () => {
  it('keeps `ready` waiting for the basemap and draws it when it arrives', async () => {
    const c = create({ showland: true });
    let ready = false;
    void c.ready.then(() => (ready = true));
    await vi.waitFor(() => expect(loads.size).toBe(1));
    expect(loadBasemap).toHaveBeenCalledTimes(1);
    expect(loadBasemap).toHaveBeenCalledWith(110, 'world', { extras: false });
    // The layers that need no data are there already.
    expect(drawn(c).map((l) => l.name)).toEqual(['frame']);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(ready).toBe(false);
    loads.get(requestKey(110, 'world'))!.resolve(basemap());
    await c.ready;
    expect(drawn(c).map((l) => l.name)).toEqual(['land', 'coastlines', 'frame']);
    // The placeholder that held `ready` is gone.
    expect([...live.keys()].every((p) => p.object.visible || p instanceof LazyFillPrimitive)).toBe(
      true,
    );
    // A later pass does not load again.
    await c.relayout({ 'geo.landcolor': '#123456' });
    expect(loadBasemap).toHaveBeenCalledTimes(1);
  });

  it('asks for the extras only when lakes, rivers or subunits are shown, and passes the URL', async () => {
    cached.set(requestKey(110, 'world', { extras: true }), basemap());
    await chart({ showrivers: true }, { config: { topojsonURL: 'https://maps.example/' } });
    expect(peekBasemap).toHaveBeenCalledWith(110, 'world', {
      extras: true,
      url: 'https://maps.example/',
    });
    expect(peekBasemap).not.toHaveBeenCalledWith(
      110,
      'world',
      expect.objectContaining({ extras: false }),
    );
  });

  it('draws without the data layers when the basemap fails, warns once and does not hang', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const c = create({ ...ALL_LAYERS, scope: 'africa', showframe: true });
    await vi.waitFor(() => expect(loads.size).toBe(1));
    loads.get(requestKey(110, 'africa', { extras: true }))!.reject(new Error('offline'));
    await c.ready;
    expect(drawn(c).map((l) => l.name)).toEqual(['ocean', 'lataxis', 'lonaxis']);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain('1:110m basemap could not be loaded');
    // Later passes neither load nor warn again.
    await c.relayout({ 'geo.oceancolor': '#000000' });
    expect(loadBasemap).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('draws what a load without its extras brought, and does not ask again', async () => {
    const c = create({ showland: true, showlakes: true });
    await vi.waitFor(() => expect(loads.size).toBe(1));
    // The loader resolves with the base layers alone and caches nothing.
    const { land, coastlines } = basemap();
    const key = requestKey(110, 'world', { extras: true });
    loads.get(key)!.resolve({ land, coastlines } as BasemapLayers);
    cached.delete(key);
    await c.ready;
    expect(drawn(c).map((l) => l.name)).toEqual(['land', 'coastlines', 'frame']);
    await c.relayout({ 'geo.landcolor': '#123456' });
    expect(loadBasemap).toHaveBeenCalledTimes(1);
  });
});

describe('geoComponent: drags', () => {
  beforeEach(() => {
    for (const scope of ['world', 'africa']) cached.set(requestKey(110, scope), basemap());
  });

  it('pans a scoped map with transforms alone and commits its centre', async () => {
    const c = await chart({ scope: 'africa', showland: true });
    const relayouting = vi.fn();
    c.on('relayouting', relayouting);
    vi.spyOn(c, 'relayout');
    const layers = drawn(c);
    const before = { ...subplot(c).transform };
    const version = subplot(c).view!.version;
    drag(c, 40, -20);
    expect(subplot(c).view!.version).toBe(version);
    for (const layer of layers) {
      expect(geometryUpdates(layer)).toHaveLength(1);
      expect(layer.setTransform).toHaveBeenLastCalledWith(subplot(c).transform);
    }
    expect(subplot(c).transform.offsetX).toBeCloseTo(before.offsetX + 40, 6);
    expect(subplot(c).transform.offsetY).toBeCloseTo(before.offsetY + 20, 6);
    expect(relayouting).toHaveBeenCalledTimes(2);
    expect(commits(c)).toHaveLength(1);
    expect(Object.keys(commits(c)[0]!)).toEqual(['geo.center.lon', 'geo.center.lat']);
    expect(relayouting.mock.calls[1]![0]).toEqual(commits(c)[0]);
    expect(vi.mocked(c.relayout).mock.calls[0]![1]).toEqual({ gui: true });
    // The pass of the relayout keeps the base: still nothing is projected again.
    await c.ready;
    expect(geoLayoutOf(c.fullLayout, 'geo')!.center.lon).toBe(commits(c)[0]!['geo.center.lon']);
    for (const layer of layers) expect(geometryUpdates(layer)).toHaveLength(1);
    expect(drawn(c).map((l) => l.primitive)).toEqual(layers.map((l) => l.primitive));
  });

  it('turns a world map in longitude and projects it again', async () => {
    const c = await chart({ showland: true });
    vi.spyOn(c, 'relayout');
    const layers = drawn(c);
    const version = subplot(c).view!.version;
    drag(c, 60, 10);
    expect(subplot(c).view!.mode).toBe('unclipped');
    expect(subplot(c).view!.version).not.toBe(version);
    // One projection per step that turned the map.
    for (const layer of layers) expect(geometryUpdates(layer)).toHaveLength(3);
    expect(commits(c)).toHaveLength(1);
    expect(Object.keys(commits(c)[0]!)).toEqual([
      'geo.projection.rotation.lon',
      'geo.center.lon',
      'geo.center.lat',
    ]);
    expect(commits(c)[0]!['geo.projection.rotation.lon']).toBeLessThan(0);
  });

  it('turns a clipped globe in longitude and latitude', async () => {
    const c = await chart({ projection: { type: 'orthographic' }, showland: true });
    vi.spyOn(c, 'relayout');
    const land = layerOf(c, 'land');
    drag(c, 30, 30);
    expect(subplot(c).view!.mode).toBe('clipped');
    expect(geometryUpdates(land)).toHaveLength(3);
    expect(Object.keys(commits(c)[0]!)).toEqual([
      'geo.projection.rotation.lon',
      'geo.projection.rotation.lat',
    ]);
  });

  it('writes the whole view and turns `fitbounds` off when the view was fitted', async () => {
    const c = await chart({ scope: 'africa', fitbounds: 'locations' });
    vi.spyOn(c, 'relayout');
    drag(c, 20, 0);
    expect(Object.keys(commits(c)[0]!)).toEqual([
      'geo.center.lon',
      'geo.center.lat',
      'geo.projection.scale',
      'geo.fitbounds',
    ]);
    expect(commits(c)[0]!['geo.fitbounds']).toBe(false);
  });

  it("treats `dragmode: 'zoom'` as its pan", async () => {
    const c = await chart({ scope: 'africa' }, { layout: { dragmode: 'zoom' } });
    vi.spyOn(c, 'relayout');
    drag(c, 20, 0);
    expect(Object.keys(commits(c)[0]!)).toEqual(['geo.center.lon']);
  });

  it('commits nothing for a press without a move', async () => {
    const c = await chart({ scope: 'africa' });
    vi.spyOn(c, 'relayout');
    const [x, y] = middle(c);
    expect(pointer('down', x, y)).toBe(true);
    expect(pointer('up', x, y)).toBe(true);
    // The click that follows is not the component's.
    expect(pointer('click', x, y)).toBe(false);
    expect(commits(c)).toEqual([]);
  });

  it('goes back to where the drag started when the gesture is cancelled', async () => {
    const c = await chart({ projection: { type: 'orthographic' } });
    vi.spyOn(c, 'relayout');
    const start = subplot(c).view!.state;
    const [x, y] = middle(c);
    pointer('down', x, y);
    pointer('move', x + 50, y);
    expect(subplot(c).view!.state.rotation.lon).not.toBe(start.rotation.lon);
    pointer('leave', x + 50, y);
    expect(subplot(c).view!.state).toEqual(start);
    expect(commits(c)).toEqual([]);
    // The gesture is over: a move is the chart's again.
    expect(pointer('move', x, y)).toBe(false);
  });

  it('leaves presses outside the subplot, and plain moves, to the chart', async () => {
    const c = await chart({ scope: 'africa', domain: { x: [0, 0.5] } });
    const r = subplot(c).clipRect;
    expect(pointer('down', r.x + r.width + 30, r.y + 5)).toBe(false);
    expect(pointer('move', ...middle(c))).toBe(false);
  });

  it('moves each subplot by its own drags, with its own keys', async () => {
    const c = await chart(
      { scope: 'africa' },
      {
        data: [{ type: 'fakegeo' }, { type: 'fakegeo', geo: 'geo2' }],
        layout: { geo2: { scope: 'africa', fitbounds: false } },
      },
    );
    vi.spyOn(c, 'relayout');
    const first = { ...subplot(c, 'geo').transform };
    const second = { ...subplot(c, 'geo2').transform };
    drag(c, 25, 0, 'geo2');
    expect(subplot(c, 'geo').transform).toEqual(first);
    expect(subplot(c, 'geo2').transform.offsetX).toBeCloseTo(second.offsetX + 25, 6);
    expect(Object.keys(commits(c)[0]!)).toEqual(['geo2.center.lon']);
  });

  it('tells the subplot’s traces about every step, and once more when the drag has ended', async () => {
    const c = await chart({ scope: 'africa' });
    const sp = subplot(c);
    const held: boolean[] = [];
    sp.onChange(() => void held.push(sp.gesture));
    expect(sp.gesture).toBe(false);
    drag(c, 10, 10);
    // Two moves while the gesture holds the view, then the notification of its end.
    expect(held).toEqual([true, true, false]);
  });

  it('holds the subplot from the press to the release, and says so even when nothing moved', async () => {
    const c = await chart({ scope: 'africa' });
    vi.spyOn(c, 'relayout');
    const sp = subplot(c);
    const held: boolean[] = [];
    sp.onChange(() => void held.push(sp.gesture));
    const [x, y] = middle(c);
    pointer('down', x, y);
    expect(sp.gesture).toBe(true);
    expect(held).toEqual([]);
    pointer('up', x, y);
    // Nothing is committed, and the traces still hear that the gesture is over.
    expect(commits(c)).toEqual([]);
    expect(sp.gesture).toBe(false);
    expect(held).toEqual([false]);
    // A cancelled drag: back to the start under the gesture, then its end.
    held.length = 0;
    pointer('down', x, y);
    pointer('move', x + 20, y);
    pointer('leave', x + 20, y);
    expect(held).toEqual([true, true, false]);
    expect(commits(c)).toEqual([]);
  });

  it('does nothing in a static plot', async () => {
    const c = await chart({ scope: 'africa' }, { config: { staticPlot: true } });
    vi.spyOn(c, 'relayout');
    const [x, y] = middle(c);
    expect(pointer('down', x, y)).toBe(false);
    expect(wheel(c, -100)).toBe(false);
    expect(pointer('dblclick', x, y)).toBe(false);
    expect(commits(c)).toEqual([]);
  });

  it('leaves select and lasso drags to the runtime’s selection', async () => {
    const c = await chart({ scope: 'africa' }, { layout: { dragmode: 'select' } });
    const [x, y] = middle(c);
    const before = { ...subplot(c).transform };
    expect(pointer('down', x, y)).toBe(false);
    expect(pointer('move', x + 30, y)).toBe(false);
    expect(wheel(c, -100)).toBe(false);
    expect(subplot(c).transform).toEqual(before);
    expect(view.selectArea?.(x, y)).toEqual({ id: 'geo', rect: subplot(c).clipRect });
    expect(view.selectArea?.(-5, -5)).toBeUndefined();
  });

  it('shows a scale outside its limits at the limit', async () => {
    const c = await chart({ scope: 'africa', projection: { scale: 0.5, minscale: 1 } });
    expect(subplot(c).view!.state.scale).toBe(1);
    // Not while the map cannot be moved.
    const still = await chart(
      { scope: 'africa', projection: { scale: 0.5, minscale: 1 } },
      { layout: { dragmode: 'select' } },
    );
    expect(subplot(still).view!.state.scale).toBe(0.5);
  });
});

describe('geoComponent: wheel, pinch and double-click', () => {
  /**
   * A zoom about the middle of a scoped map changes `projection.scale` alone. The centre is read
   * back from the pixel in the middle, and comes back a rounding error away from the layout's
   * about as often as not, so its keys may be in the relayout too.
   */
  const scaleOnly = (update: Record<string, unknown>): boolean => {
    const keys = Object.keys(update).filter((k) => !k.startsWith('geo.center.'));
    return keys.length === 1 && keys[0] === 'geo.projection.scale';
  };

  beforeEach(() => {
    for (const scope of ['world', 'africa']) cached.set(requestKey(110, scope), basemap());
  });

  it('zooms about the pointer and commits once when the wheel rests', async () => {
    const c = await chart({ scope: 'africa', showland: true });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const relayouting = vi.fn();
    c.on('relayouting', relayouting);
    vi.spyOn(c, 'relayout');
    const land = layerOf(c, 'land');
    const event = new WheelEvent('wheel', { deltaY: -100, cancelable: true });
    expect(pointer('wheel', ...middle(c), event)).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    vi.advanceTimersByTime(150);
    expect(wheel(c, -100)).toBe(true);
    // Zooming is a transform: the pointer is in the middle, so the middle stays where it is.
    expect(subplot(c).view!.state.scale).toBeCloseTo(2 ** 0.4, 10);
    expect(geometryUpdates(land)).toHaveLength(1);
    expect(relayouting).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(150);
    expect(commits(c)).toEqual([]);
    vi.advanceTimersByTime(60);
    expect(commits(c)).toHaveLength(1);
    expect(scaleOnly(commits(c)[0]!)).toBe(true);
    expect(commits(c)[0]!['geo.projection.scale']).toBeCloseTo(2 ** 0.4, 10);
    // The zoom settled: the view was rebased and the layers projected at the new scale.
    expect(subplot(c).view!.transform).toEqual({ scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 });
    expect(geometryUpdates(land)).toHaveLength(2);
    expect(land.setTransform).toHaveBeenLastCalledWith(subplot(c).transform);
    vi.advanceTimersByTime(1000);
    expect(commits(c)).toHaveLength(1);
  });

  it('holds the subplot until the wheel has rested, also at a scale limit', async () => {
    const c = await chart({ scope: 'africa', projection: { scale: 2, maxscale: 2 } });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    vi.spyOn(c, 'relayout');
    const sp = subplot(c);
    const held: boolean[] = [];
    sp.onChange(() => void held.push(sp.gesture));
    // At the limit the wheel changes nothing, and is still a gesture until it rests.
    wheel(c, -100);
    expect(sp.gesture).toBe(true);
    expect(held).toEqual([]);
    vi.advanceTimersByTime(250);
    expect(sp.gesture).toBe(false);
    expect(held).toEqual([false]);
    expect(commits(c)).toEqual([]);
    // A zoom: each step under the gesture; the rest clears it, then commits.
    held.length = 0;
    wheel(c, 100);
    wheel(c, 100);
    expect(held).toEqual([true, true]);
    vi.advanceTimersByTime(250);
    expect(subplot(c).gesture).toBe(false);
    expect(held.at(-1)).toBe(false);
    expect(commits(c)).toHaveLength(1);
  });

  it('keeps the wheel for the page when `scrollZoom` leaves geo out', async () => {
    const c = await chart({ scope: 'africa' }, { config: { scrollZoom: 'cartesian' } });
    const event = new WheelEvent('wheel', { deltaY: -100, cancelable: true });
    expect(pointer('wheel', ...middle(c), event)).toBe(false);
    expect(event.defaultPrevented).toBe(false);
    expect(subplot(c).view!.state.scale).toBe(1);
  });

  it('keeps the wheel from the page while the map is dragged, and does not zoom', async () => {
    const c = await chart({ scope: 'africa' });
    const [x, y] = middle(c);
    pointer('down', x, y);
    pointer('move', x + 20, y);
    const event = new WheelEvent('wheel', { deltaY: -100, cancelable: true });
    expect(pointer('wheel', x + 20, y, event)).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    expect(subplot(c).view!.state.scale).toBe(1);
    pointer('up', x + 20, y);

    // With scroll zoom off for geo the wheel stays the page's, held map or not.
    const off = await chart({ scope: 'africa' }, { config: { scrollZoom: false } });
    pointer('down', ...middle(off));
    const free = new WheelEvent('wheel', { deltaY: -100, cancelable: true });
    pointer('wheel', ...middle(off), free);
    expect(free.defaultPrevented).toBe(false);
    pointer('up', ...middle(off));
  });

  it('commits a wheel zoom before a drag that follows at once', async () => {
    const c = await chart({ scope: 'africa' });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    vi.spyOn(c, 'relayout');
    wheel(c, -100);
    drag(c, 10, 0);
    expect(commits(c)).toHaveLength(2);
    expect(scaleOnly(commits(c)[0]!)).toBe(true);
    expect(Object.keys(commits(c)[1]!)).toContain('geo.center.lon');
    vi.advanceTimersByTime(1000);
    expect(commits(c)).toHaveLength(2);
  });

  it('pinch-zooms about the middle of two fingers', async () => {
    const c = await chart({ scope: 'africa', showland: true });
    vi.spyOn(c, 'relayout');
    const canvas = c.three.root.canvas;
    const land = layerOf(c, 'land');
    const [x, y] = middle(c);
    const touch = (type: string, pointerId: number, px: number, py: number): PointerEvent => {
      const e = new PointerEvent(type, {
        pointerId,
        pointerType: 'touch',
        clientX: px,
        clientY: py,
      });
      canvas.dispatchEvent(e);
      return e;
    };
    // The runtime hands the first finger to the component; the component follows the rest.
    const first = touch('pointerdown', 1, x - 20, y);
    expect(pointer('down', x - 20, y, first)).toBe(true);
    touch('pointerdown', 2, x + 20, y);
    touch('pointermove', 2, x + 60, y);
    touch('pointermove', 1, x - 60, y);
    expect(pointer('move', x - 60, y)).toBe(true);
    expect(subplot(c).view!.state.scale).toBeCloseTo(3, 10);
    expect(commits(c)).toEqual([]);
    touch('pointerup', 2, x + 60, y);
    touch('pointerup', 1, x - 60, y);
    expect(commits(c)).toHaveLength(1);
    expect(scaleOnly(commits(c)[0]!)).toBe(true);
    expect(commits(c)[0]!['geo.projection.scale']).toBeCloseTo(3, 10);
    // Settled like a wheel zoom.
    expect(geometryUpdates(land)).toHaveLength(2);
    // The listeners are gone.
    touch('pointerdown', 3, x, y);
    touch('pointermove', 3, x + 40, y);
    expect(subplot(c).view!.state.scale).toBeCloseTo(3, 10);
  });

  it('resets to the first drawn view on a double-click', async () => {
    const c = await chart({ projection: { type: 'orthographic', rotation: { lon: 30 } } });
    const initial = saveGeoViewInitial(geoLayoutOf(c.fullLayout, 'geo')!);
    drag(c, 40, 20);
    await c.ready;
    expect(geoLayoutOf(c.fullLayout, 'geo')!.projection.rotation.lon).not.toBe(30);
    const doubleclick = vi.fn();
    c.on('doubleclick', doubleclick);
    vi.spyOn(c, 'relayout');
    expect(pointer('dblclick', ...middle(c))).toBe(true);
    expect(doubleclick).toHaveBeenCalledTimes(1);
    // The view saved at the first draw, not the one the drag left.
    expect(commits(c)).toEqual([geoResetRelayout(initial, 'geo')]);
    expect(commits(c)[0]).toMatchObject({ 'geo.projection.rotation.lon': 30 });
    await c.ready;
    expect(subplot(c).view!.state.rotation.lon).toBe(30);
  });
});

describe('geoComponent: the cursor, and taps', () => {
  beforeEach(() => {
    for (const scope of ['world', 'africa']) cached.set(requestKey(110, scope), basemap());
  });

  /** The cursor a plain move at `(x, y)` asks for; the move itself is left to the chart. */
  function cursorAt(x: number, y: number): string | undefined {
    const event: ComponentPointerEvent = {
      type: 'move',
      x,
      y,
      button: 0,
      shiftKey: false,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      native: undefined,
      cursor: undefined,
    };
    expect(view.handlePointer?.(event)).toBe(false);
    return event.cursor;
  }

  it('says what a press on the map starts: a move, or a selection', async () => {
    const c = await chart({ scope: 'africa', domain: { x: [0, 0.5] } });
    const r = subplot(c).clipRect;
    const mid = middle(c);
    expect(cursorAt(...mid)).toBe('move');
    expect(cursorAt(r.x + r.width + 30, r.y + 5)).toBeUndefined();
    await c.relayout({ dragmode: 'zoom' });
    expect(cursorAt(...mid)).toBe('move');
    await c.relayout({ dragmode: 'lasso' });
    expect(cursorAt(...mid)).toBe('crosshair');
    await c.relayout({ dragmode: false });
    expect(cursorAt(...mid)).toBeUndefined();
  });

  it('ends a tap with the finger’s lift, so the tap’s hover and click are the chart’s', async () => {
    const c = await chart({ scope: 'africa' });
    vi.spyOn(c, 'relayout');
    const canvas = c.three.root.canvas;
    const [x, y] = middle(c);
    const touch = (type: string): PointerEvent => {
      const e = new PointerEvent(type, {
        pointerId: 1,
        pointerType: 'touch',
        clientX: x,
        clientY: y,
      });
      canvas.dispatchEvent(e);
      return e;
    };
    expect(pointer('down', x, y, touch('pointerdown'))).toBe(true);
    // The runtime's listener comes before the component's own: it hands the lift over first,
    // then goes on with the tap's hover (a move) and its click.
    const up = new PointerEvent('pointerup', { pointerId: 1, pointerType: 'touch' });
    expect(pointer('up', x, y, up)).toBe(true);
    expect(pointer('move', x, y)).toBe(false);
    expect(pointer('click', x, y)).toBe(false);
    canvas.dispatchEvent(up);
    expect(commits(c)).toEqual([]);
    // The gesture is over and its listeners are gone: a second tap is a new press.
    expect(pointer('down', x, y, touch('pointerdown'))).toBe(true);
    expect(
      pointer('up', x, y, new PointerEvent('pointerup', { pointerId: 1, pointerType: 'touch' })),
    ).toBe(true);
    expect(pointer('dblclick', x, y)).toBe(true);
  });

  it('keeps a pinch when the first finger lifts, and cancels a touch gesture on `leave`', async () => {
    const c = await chart({ scope: 'africa' });
    vi.spyOn(c, 'relayout');
    const canvas = c.three.root.canvas;
    const [x, y] = middle(c);
    const touch = (type: string, pointerId: number, px: number): PointerEvent => {
      const e = new PointerEvent(type, {
        pointerId,
        pointerType: 'touch',
        clientX: px,
        clientY: y,
      });
      canvas.dispatchEvent(e);
      return e;
    };
    expect(pointer('down', x - 20, y, touch('pointerdown', 1, x - 20))).toBe(true);
    touch('pointerdown', 2, x + 20);
    touch('pointermove', 2, x + 60);
    expect(subplot(c).view!.state.scale).toBeCloseTo(2, 10);
    // The first finger lifts: the runtime's `up`, then the same event at the component's listener.
    const up = new PointerEvent('pointerup', { pointerId: 1, pointerType: 'touch' });
    expect(pointer('up', x - 20, y, up)).toBe(true);
    canvas.dispatchEvent(up);
    // Still the component's gesture: the click the runtime sends for an unmoved finger is not
    // a click on the map, and the other finger drags on.
    expect(pointer('click', x - 20, y)).toBe(true);
    expect(commits(c)).toEqual([]);
    const before = subplot(c).transform.offsetX;
    touch('pointermove', 2, x + 90);
    expect(subplot(c).transform.offsetX).toBeCloseTo(before + 30, 6);
    expect(subplot(c).view!.state.scale).toBeCloseTo(2, 10);
    touch('pointerup', 2, x + 90);
    expect(commits(c)).toHaveLength(1);

    // A cancelled touch goes back to where it started, like a cancelled mouse drag.
    await c.ready;
    vi.mocked(c.relayout).mockClear();
    const start = subplot(c).view!.state;
    expect(pointer('down', x, y, touch('pointerdown', 3, x))).toBe(true);
    touch('pointermove', 3, x + 40);
    expect(subplot(c).view!.state).not.toEqual(start);
    expect(pointer('leave', x + 40, y)).toBe(true);
    expect(subplot(c).view!.state).toEqual(start);
    expect(commits(c)).toEqual([]);
    touch('pointermove', 3, x + 80);
    expect(subplot(c).view!.state).toEqual(start);
  });
});

describe('geoComponent: a layout pass in the middle of a gesture', () => {
  beforeEach(() => {
    for (const scope of ['world', 'africa']) cached.set(requestKey(110, scope), basemap());
  });

  /** Where the subplot draws a longitude and latitude now, container px. */
  function drawnAt(c: Chart, lon: number, lat: number): [number, number] {
    const sp = subplot(c);
    const p = sp.view!.project(lon, lat)!;
    return [sp.rect.x + p[0], sp.rect.y + sp.rect.height - p[1]];
  }

  for (const [name, geo] of [
    ['a scoped map', { scope: 'africa' }],
    ['a world map', {}],
    ['a globe', { projection: { type: 'orthographic' } }],
  ] as const) {
    it(`goes on with the drag of ${name} in the new view`, async () => {
      const c = await chart({ showland: true, ...geo });
      vi.spyOn(c, 'relayout');
      const [x, y] = middle(c);
      const sp = subplot(c);
      const [lon, lat] = sp.view!.invert(...sp.toSubplot(x, y))!;
      expect(pointer('down', x, y)).toBe(true);
      pointer('move', x + 30, y + 10);
      const held = subplot(c).view!;
      // Something else changes the figure while the map is held.
      vi.mocked(c.relayout).mockRestore();
      await c.relayout({ 'title.text': 'new data' });
      vi.spyOn(c, 'relayout');
      const view2 = subplot(c).view!;
      expect(view2).not.toBe(held);
      // The new view shows what the old one did: the grabbed point is under the pointer.
      expect(drawnAt(c, lon, lat)[0]).toBeCloseTo(x + 30, 3);
      expect(drawnAt(c, lon, lat)[1]).toBeCloseTo(y + 10, 3);
      for (const layer of drawn(c)) {
        expect(layer.setTransform).toHaveBeenLastCalledWith(subplot(c).transform);
      }
      // And the drag goes on from where it began, not from where the pass found it.
      pointer('move', x + 60, y + 20);
      expect(drawnAt(c, lon, lat)[0]).toBeCloseTo(x + 60, 3);
      expect(drawnAt(c, lon, lat)[1]).toBeCloseTo(y + 20, 3);
      pointer('up', x + 60, y + 20);
      expect(commits(c)).toHaveLength(1);
      await c.ready;
      expect(drawnAt(c, lon, lat)[0]).toBeCloseTo(x + 60, 3);
      expect(drawnAt(c, lon, lat)[1]).toBeCloseTo(y + 20, 3);
    });
  }

  it('carries the view into a rect of another size, and the drag goes on from the pointer', async () => {
    const c = await chart({ projection: { type: 'orthographic' } });
    vi.spyOn(c, 'relayout');
    const [x, y] = middle(c);
    pointer('down', x, y);
    pointer('move', x + 40, y);
    const turned = subplot(c).view!.state.rotation;
    expect(turned.lon).toBeLessThan(-5);
    // The subplot gets narrower: another rect, and another view size.
    vi.mocked(c.relayout).mockRestore();
    await c.relayout({ 'geo.domain.x': [0.25, 1] });
    vi.spyOn(c, 'relayout');
    expect(subplot(c).view!.size.width).toBe(600);
    expect(subplot(c).view!.state.rotation).toEqual(turned);
    // The pointer was at (x + 40, y) of the figure: the globe turns on from there.
    const [lon, lat] = subplot(c).view!.invert(...subplot(c).toSubplot(x + 40, y))!;
    pointer('move', x + 60, y + 10);
    expect(drawnAt(c, lon, lat)[0]).toBeCloseTo(x + 60, 3);
    expect(drawnAt(c, lon, lat)[1]).toBeCloseTo(y + 10, 3);
    pointer('up', x + 60, y + 10);
    expect(commits(c)).toHaveLength(1);
    expect(commits(c)[0]!['geo.projection.rotation.lon']).toBeLessThan(turned.lon);
  });

  it('goes back to the start of a carried drag when it is cancelled', async () => {
    const c = await chart({ scope: 'africa' });
    const [x, y] = middle(c);
    const start = drawnAt(c, 20, 0);
    pointer('down', x, y);
    pointer('move', x + 30, y);
    await c.relayout({ 'title.text': 'new data' });
    pointer('move', x + 50, y);
    expect(drawnAt(c, 20, 0)[0]).toBeCloseTo(start[0] + 50, 3);
    pointer('leave', x + 50, y);
    expect(drawnAt(c, 20, 0)[0]).toBeCloseTo(start[0], 3);
    expect(drawnAt(c, 20, 0)[1]).toBeCloseTo(start[1], 3);

    // Cancelled right after the pass, before another step, as well; and nothing is committed.
    vi.spyOn(c, 'relayout');
    pointer('down', x, y);
    pointer('move', x + 30, y);
    vi.mocked(c.relayout).mockRestore();
    await c.relayout({ 'title.text': 'more data' });
    vi.spyOn(c, 'relayout');
    expect(drawnAt(c, 20, 0)[0]).toBeCloseTo(start[0] + 30, 3);
    pointer('leave', x + 30, y);
    expect(drawnAt(c, 20, 0)[0]).toBeCloseTo(start[0], 3);
    expect(commits(c)).toEqual([]);
  });

  it('keeps a pinch measured from where it was anchored', async () => {
    const c = await chart({ scope: 'africa' });
    vi.spyOn(c, 'relayout');
    const canvas = c.three.root.canvas;
    const [x, y] = middle(c);
    const touch = (type: string, pointerId: number, px: number): PointerEvent => {
      const e = new PointerEvent(type, {
        pointerId,
        pointerType: 'touch',
        clientX: px,
        clientY: y,
      });
      canvas.dispatchEvent(e);
      return e;
    };
    expect(pointer('down', x - 20, y, touch('pointerdown', 1, x - 20))).toBe(true);
    touch('pointerdown', 2, x + 20);
    touch('pointermove', 2, x + 60);
    expect(subplot(c).view!.state.scale).toBeCloseTo(2, 10);
    vi.mocked(c.relayout).mockRestore();
    await c.relayout({ 'title.text': 'new data' });
    vi.spyOn(c, 'relayout');
    // The zoom so far is in the new view, and the next step is measured from the same 40 px.
    expect(subplot(c).view!.state.scale).toBeCloseTo(2, 10);
    touch('pointermove', 1, x - 60);
    expect(subplot(c).view!.state.scale).toBeCloseTo(3, 10);
    touch('pointerup', 1, x - 60);
    touch('pointerup', 2, x + 60);
    expect(commits(c)).toHaveLength(1);
    expect(commits(c)[0]!['geo.projection.scale']).toBeCloseTo(3, 10);
  });

  it('starts the pinch again, span and all, in a view that cannot take it up', async () => {
    const c = await chart({ scope: 'africa' });
    vi.spyOn(c, 'relayout');
    const canvas = c.three.root.canvas;
    const [x, y] = middle(c);
    const touch = (type: string, pointerId: number, px: number): PointerEvent => {
      const e = new PointerEvent(type, {
        pointerId,
        pointerType: 'touch',
        clientX: px,
        clientY: y,
      });
      canvas.dispatchEvent(e);
      return e;
    };
    expect(pointer('down', x - 20, y, touch('pointerdown', 1, x - 20))).toBe(true);
    touch('pointerdown', 2, x + 20);
    touch('pointermove', 2, x + 60);
    expect(subplot(c).view!.state.scale).toBeCloseTo(2, 10);
    // Another projection: nothing of the old picture can be kept.
    vi.mocked(c.relayout).mockRestore();
    await c.relayout({ 'geo.projection.type': 'equirectangular' });
    vi.spyOn(c, 'relayout');
    expect(subplot(c).view!.state.scale).toBe(1);
    // The first move anchors the fingers where they are (80 px apart); the zoom is from there.
    touch('pointermove', 1, x - 20);
    expect(subplot(c).view!.state.scale).toBe(1);
    touch('pointermove', 1, x - 60);
    expect(subplot(c).view!.state.scale).toBeCloseTo(1.5, 10);
    touch('pointerup', 1, x - 60);
    touch('pointerup', 2, x + 60);
  });

  it('keeps a wheel zoom that has not rested yet, and commits it', async () => {
    const c = await chart({ scope: 'africa' });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    wheel(c, -100);
    wheel(c, -100);
    expect(subplot(c).view!.state.scale).toBeCloseTo(2 ** 0.4, 10);
    await c.relayout({ 'title.text': 'new data' });
    expect(subplot(c).view!.state.scale).toBeCloseTo(2 ** 0.4, 10);
    vi.spyOn(c, 'relayout');
    vi.advanceTimersByTime(250);
    expect(commits(c)).toHaveLength(1);
    expect(commits(c)[0]!['geo.projection.scale']).toBeCloseTo(2 ** 0.4, 10);
  });

  it('leaves a view alone that no gesture holds', async () => {
    const c = await chart({ scope: 'africa' });
    drag(c, 30, 0);
    await c.ready;
    const state = subplot(c).view!.state;
    await c.relayout({ 'geo.center.lon': 0, 'geo.projection.scale': 2 });
    expect(subplot(c).view!.state).not.toEqual(state);
    expect(subplot(c).view!.state.scale).toBe(2);
  });
});

describe('geoComponent: 110m while a gesture turns a 50m map (ADR-025)', () => {
  let fifty: BasemapLayers;
  let hundredTen: BasemapLayers;
  const GLOBE = { resolution: 50, projection: { type: 'orthographic' }, showland: true };
  const projectedLand = (): unknown[] =>
    vi.mocked(projectPolygons).mock.calls.map(([, , geometry]) => geometry);
  const projectedLines = (): unknown[] =>
    vi.mocked(projectLines).mock.calls.map(([, , geometry]) => geometry);

  beforeEach(() => {
    fifty = basemap();
    hundredTen = basemap();
    cached.set(requestKey(50, 'world'), fifty);
  });

  it('loads the 110m data without holding `ready`, and projects from 50m until it is there', async () => {
    const c = await chart(GLOBE);
    // Asked for at the first draw of a map that can turn, so the first gesture finds it.
    expect(loadBasemap).toHaveBeenCalledTimes(1);
    expect(loadBasemap).toHaveBeenCalledWith(110, 'world', { extras: false });
    expect(loads.has(requestKey(110, 'world'))).toBe(true);
    expect(projectedLand()).toEqual([fifty.land]);
    const [x, y] = middle(c);
    pointer('down', x, y);
    pointer('move', x + 20, y);
    expect(projectedLand()).toEqual([fifty.land, fifty.land]);
    loads.get(requestKey(110, 'world'))!.resolve(hundredTen);
    await vi.waitFor(() => expect(cached.has(requestKey(110, 'world'))).toBe(true));
    await Promise.resolve();
    pointer('move', x + 40, y);
    expect(projectedLand().pop()).toBe(hundredTen.land);
    pointer('up', x + 40, y);
    expect(loadBasemap).toHaveBeenCalledTimes(1);
  });

  it('does not load the 110m data for a map that cannot turn, or cannot be moved', async () => {
    cached.set(requestKey(50, 'africa'), fifty);
    await chart({ resolution: 50, scope: 'africa', showland: true });
    await chart(GLOBE, { config: { staticPlot: true } });
    await chart({ ...GLOBE, showland: false, showcoastlines: false });
    expect(loadBasemap).not.toHaveBeenCalled();
  });

  it('hands the 110m data to the subplot’s traces, from where the basemap comes from', async () => {
    const c = await chart(GLOBE, { config: { topojsonURL: 'https://maps.example/' } });
    expect(loadBasemap).toHaveBeenCalledWith(110, 'world', {
      extras: false,
      url: 'https://maps.example/',
    });
    expect(subplot(c).quick).toBeUndefined();
    loads.get(requestKey(110, 'world'))!.resolve(hundredTen);
    await vi.waitFor(() => expect(subplot(c).quick).toBe(hundredTen));
    // The subplot of a later pass has it too, and the one of a pass in the middle of a gesture
    // knows that it is held.
    const [x, y] = middle(c);
    pointer('down', x, y);
    pointer('move', x + 20, y);
    await c.relayout({ 'geo.landcolor': '#123456' });
    expect(subplot(c).quick).toBe(hundredTen);
    expect(subplot(c).gesture).toBe(true);
    pointer('up', x + 20, y);
    expect(subplot(c).gesture).toBe(false);
    await c.ready;
    expect(subplot(c).quick).toBe(hundredTen);
    expect(subplot(c).gesture).toBe(false);
  });

  it('loads the 110m data for a trace matched against the basemap when no base layer is shown', async () => {
    const hidden = { ...GLOBE, showland: false, showcoastlines: false };
    const c = await chart(hidden, { data: [{ type: 'located' }] });
    expect(subplot(c).layers).toBe(fifty);
    expect(loadBasemap).toHaveBeenCalledTimes(1);
    expect(loadBasemap).toHaveBeenCalledWith(110, 'world', { extras: false });
    loads.get(requestKey(110, 'world'))!.resolve(hundredTen);
    await vi.waitFor(() => expect(subplot(c).quick).toBe(hundredTen));
    // Nothing of it is drawn, and `ready` did not wait for it.
    expect(drawn(c).map((l) => l.name)).toEqual(['frame']);
  });

  it('asks for the 110m extras when the trace is matched against the states', async () => {
    const states = { ...basemap(), subunits: [] };
    cached.set(requestKey(50, 'world', { extras: true }), states as BasemapLayers);
    const c = await chart(GLOBE, { data: [{ type: 'states' }] });
    expect(subplot(c).layers).toBe(states);
    expect(loadBasemap).toHaveBeenCalledWith(110, 'world', { extras: true });
  });

  it('draws 110m while the globe turns and goes back to 50m a layer per frame, lines first', async () => {
    cached.set(requestKey(110, 'world'), hundredTen);
    const c = await chart(GLOBE);
    vi.spyOn(c, 'relayout');
    expect(drawn(c).map((l) => l.name)).toEqual(['land', 'coastlines', 'frame']);
    vi.mocked(projectPolygons).mockClear();
    vi.mocked(projectLines).mockClear();
    const [x, y] = middle(c);
    pointer('down', x, y);
    pointer('move', x + 20, y);
    pointer('move', x + 40, y + 10);
    expect(projectedLand()).toEqual([hundredTen.land, hundredTen.land]);
    expect(projectedLines()).toEqual([
      hundredTen.coastlines,
      SPHERE,
      hundredTen.coastlines,
      SPHERE,
    ]);
    vi.mocked(projectPolygons).mockClear();
    vi.mocked(projectLines).mockClear();
    pointer('up', x + 40, y + 10);
    // Released: the view is committed, and nothing has been projected yet.
    expect(commits(c)).toHaveLength(1);
    expect(projectedLand()).toEqual([]);
    expect(projectedLines()).toEqual([]);
    scheduler.step();
    expect(projectedLines()).toEqual([fifty.coastlines]);
    expect(projectedLand()).toEqual([]);
    scheduler.step();
    expect(projectedLines()).toEqual([fifty.coastlines]);
    expect(projectedLand()).toEqual([fifty.land]);
    // The relayout's pass and later frames find everything in place.
    await c.ready;
    for (let i = 0; i < 3; i++) scheduler.step();
    expect(projectedLines()).toEqual([fifty.coastlines]);
    expect(projectedLand()).toEqual([fifty.land]);
    expect(layerOf(c, 'land').setTransform).toHaveBeenLastCalledWith(subplot(c).transform);
  });

  it('carries a zoomed 50m map to its new base until each layer is projected again', async () => {
    cached.set(requestKey(50, 'africa'), fifty);
    const c = await chart({
      resolution: 50,
      scope: 'africa',
      showland: true,
      showcoastlines: true,
      showcountries: false,
    });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const land = layerOf(c, 'land');
    const coastlines = layerOf(c, 'coastlines');
    wheel(c, -100);
    const zoomed = { ...subplot(c).transform };
    vi.advanceTimersByTime(250);
    // Rebased: the subplot's transform is the clip offset alone, yet the layers are where they
    // were, and none has been projected.
    expect(subplot(c).view!.transform.scaleX).toBe(1);
    expect(geometryUpdates(land)).toHaveLength(1);
    const carried = land.setTransform.mock.lastCall![0] as Record<string, number>;
    expect(carried['scaleX']).toBeCloseTo(zoomed.scaleX, 10);
    expect(carried['offsetX']).toBeCloseTo(zoomed.offsetX, 8);
    expect(carried['offsetY']).toBeCloseTo(zoomed.offsetY, 8);
    scheduler.step();
    expect(geometryUpdates(coastlines)).toHaveLength(2);
    expect(geometryUpdates(land)).toHaveLength(1);
    scheduler.step();
    expect(geometryUpdates(land)).toHaveLength(2);
    expect(land.setTransform).toHaveBeenLastCalledWith(subplot(c).transform);
  });
});

describe('geoComponent: the 3D globe (GEO8, ADR-028)', () => {
  const GLOBE3D = { projection: { type: 'globe3d' } };
  const ALL_ON_GLOBE = { ...ALL_LAYERS, ...GLOBE3D };
  let world: BasemapLayers;

  beforeEach(() => {
    world = basemap();
    cached.set(requestKey(110, 'world'), world);
    cached.set(requestKey(110, 'world', { extras: true }), world);
    for (const build of builders()) build.mockClear();
  });

  /** The globe chunk's builders, as the component calls them. */
  function builders(): Mock[] {
    const globe = globeModule();
    if (!globe) return [];
    return [globe.buildSphereMesh, globe.buildSphereShell, globe.buildSphereLines] as Mock[];
  }

  const globeViewport = (c: Chart, id = 'geo'): Viewport | undefined =>
    c.three.viewports.find((vp) => vp.name === `subplot-${id}-globe`);

  /** The layers on a subplot's globe (in its 3D viewport), bottom to top. */
  function onGlobe(c: Chart, order = GEO_ORDER, id = 'geo'): DrawnLayer[] {
    const viewport = globeViewport(c, id);
    const names = new Map(Object.entries(order).map(([name, o]) => [o, name as GeoLayerName]));
    return [...live]
      .filter(([, vp]) => vp === viewport)
      .map(([primitive]) => ({
        name: names.get(primitive.object.renderOrder) as GeoLayerName,
        primitive,
        update: primitive.update as Mock,
        setTransform: primitive.setTransform as Mock,
      }))
      .sort((a, b) => a.primitive.object.renderOrder - b.primitive.object.renderOrder);
  }

  const globeLayer = (c: Chart, name: GeoLayerName, order = GEO_ORDER): DrawnLayer =>
    onGlobe(c, order).find((l) => l.name === name) as DrawnLayer;

  const meshOf = (layer: DrawnLayer) => (layer.primitive as unknown as LazyMeshPrimitive).mesh!;
  const lineOf = (layer: DrawnLayer) => layer.primitive as unknown as Line3D;
  const isLine = (layer: DrawnLayer): boolean => layer.primitive.object.name === 'holochart:line3d';

  /** What a builder was called with, as `[geometry, options]`. */
  const built = (build: unknown): unknown[][] => (build as Mock).mock.calls;

  it('draws the layers as sphere meshes and 3D lines on the globe, and the frame as a 2D circle', async () => {
    const c = await chart({ ...ALL_ON_GLOBE, bgcolor: '#ff0000', oceancolor: '#0000ff' });
    const viewport = globeViewport(c)!;
    expect(viewport.kind).toBe('3d');
    // Outside the disc the globe has the background a flat map has; the 2D viewport over it none.
    expect(viewport.background).toEqual([1, 0, 0, 1]);
    const flat = c.three.viewports.find((vp) => vp.name === 'subplot-geo')!;
    expect(flat.background).toBeNull();
    expect(c.three.viewports.indexOf(viewport)).toBeLessThan(c.three.viewports.indexOf(flat));

    const layers = onGlobe(c);
    expect(layers.map((l) => l.name)).toEqual([
      'ocean',
      'land',
      'lakes',
      'countries',
      'coastlines',
      'rivers',
      'lataxis',
      'lonaxis',
    ]);
    expect(layers.map((l) => l.primitive.object.renderOrder)).toEqual([
      100, 200, 300, 500, 600, 700, 800, 900,
    ]);
    const scene = globeScene(viewport);
    for (const layer of layers) {
      const mesh = ['ocean', 'land', 'lakes'].includes(layer.name);
      expect(layer.primitive instanceof LazyMeshPrimitive, layer.name).toBe(mesh);
      expect(isLine(layer), layer.name).toBe(!mesh);
      // In globe coordinates, under the group the subplot turns: no transform of its own.
      expect(layer.primitive.object.parent, layer.name).toBe(scene.group);
      expect(layer.setTransform, layer.name).not.toHaveBeenCalled();
      expect(layer.update, layer.name).not.toHaveBeenCalled();
    }

    // The body: the whole sphere, opaque, the one mesh that writes depth, and the scene's body.
    const body = meshOf(layers[0]!);
    expect(scene.body).toBe(layers[0]!.primitive.object);
    expect(body.data).toMatchObject({ color: [0, 0, 1, 1], side: 'front', opacity: 1 });
    expect(body.material).toMatchObject({ depthTest: true, depthWrite: true, transparent: false });
    expect(body.layout.vertexCount).toBe(10242);
    // Land and lakes lie on it: front faces, no depth test, ordered by `renderOrder`.
    for (const name of ['land', 'lakes'] as const) {
      const mesh = meshOf(globeLayer(c, name));
      expect(mesh.data.side, name).toBe('front');
      expect(mesh.data.sortTriangles, name).toBe(false);
      // On the surface: tested against the body under it and against prisms, never written.
      expect(mesh.material, name).toMatchObject({ depthTest: true, depthWrite: false });
      // A vertex of the unit sphere is its own normal.
      expect(mesh.data.normals, name).toBe(mesh.data.positions);
    }
    expect(meshOf(globeLayer(c, 'land')).material.transparent).toBe(false);
    // Lakes are always drawn with the translucent objects, above whatever is under them.
    expect(meshOf(globeLayer(c, 'lakes')).material.transparent).toBe(true);
    // Every mesh has the globe's light and not the mesh primitive's own.
    expect(body.data.lighting).toMatchObject({ ambient: 0.7, diffuse: 0.3, specular: 0 });
    // Lines test depth against the body, write none, and are blended.
    for (const name of ['countries', 'coastlines', 'rivers', 'lataxis', 'lonaxis'] as const) {
      const line = lineOf(globeLayer(c, name));
      expect(line.material, name).toMatchObject({
        depthTest: true,
        depthWrite: false,
        transparent: true,
      });
    }

    // Built from the layers' geometry in degrees: meshes on the unit sphere, lines above it.
    const globe = globeModule()!;
    expect(built(globe.buildSphereMesh).map(([geometry]) => geometry)).toEqual([
      world.land,
      world.lakes,
    ]);
    expect(
      built(globe.buildSphereLines).map(([geometry, options]) => [
        geometry === world.coastlines ? 'coastlines' : geometry === world.rivers ? 'rivers' : '',
        options,
      ]),
    ).toEqual([
      ['', { densify: 1, radius: globeLineRadius('countries') }],
      ['coastlines', { densify: 1, radius: globeLineRadius('coastlines') }],
      ['rivers', { densify: 1, radius: globeLineRadius('rivers') }],
      ['', { densify: 1, radius: globeLineRadius('lataxis') }],
      ['', { densify: 1, radius: globeLineRadius('lonaxis') }],
    ]);
    expect(globeLineRadius('subunits')).toBeCloseTo(1.0005, 12);
    expect(globeLineRadius('rivers')).toBeCloseTo(1.001, 12);

    // The 2D viewport has the frame alone: the unit circle, placed where the globe is.
    const frame = drawn(c);
    expect(frame.map((l) => l.name)).toEqual(['frame']);
    expect(frame[0]!.primitive).toBeInstanceOf(LinePrimitive);
    const circle = geometryUpdates(frame[0]!)[0] as [{ x: Float64Array; y: Float64Array }];
    expect(geometryUpdates(frame[0]!)).toHaveLength(1);
    expect(circle[0].x).toHaveLength(721);
    expect(Math.hypot(circle[0].x[90]!, circle[0].y[90]!)).toBeCloseTo(1, 12);
    const sp = subplot(c);
    const placed = sp.globeMatrix(new Matrix4()).elements;
    expect(frame[0]!.setTransform).toHaveBeenLastCalledWith({
      scaleX: sp.globeRadius,
      scaleY: sp.globeRadius,
      offsetX: placed[12],
      offsetY: placed[13],
    });
    // Nothing was projected through d3 for the subplot (the meshes cut polygons with its sink).
    expect(projectLines).not.toHaveBeenCalled();
  });

  it('keeps the layer order of a choropleth map: opaque lines under the regions, rivers and lakes above', async () => {
    const c = await chart(ALL_ON_GLOBE, { data: [{ type: 'choropleth' }] });
    const layers = onGlobe(c, GEO_ORDER_FOR_CHOROPLETH);
    expect(layers.map((l) => [l.name, l.primitive.object.renderOrder])).toEqual([
      ['ocean', 100],
      ['land', 200],
      ['countries', 400],
      ['coastlines', 500],
      ['lataxis', 600],
      ['lonaxis', 700],
      ['rivers', 1000],
      ['lakes', 1100],
    ]);
    // Under the regions (900) a line is drawn with the opaque objects, so an opaque region
    // covers it; above them it is blended.
    for (const name of ['countries', 'coastlines', 'lataxis', 'lonaxis'] as const) {
      const line = lineOf(globeLayer(c, name, GEO_ORDER_FOR_CHOROPLETH));
      expect(line.opaque, name).toBe(true);
      expect(line.material, name).toMatchObject({ transparent: false, depthTest: true });
    }
    const rivers = lineOf(globeLayer(c, 'rivers', GEO_ORDER_FOR_CHOROPLETH));
    expect(rivers.material).toMatchObject({ transparent: true, depthWrite: false });
    expect(meshOf(globeLayer(c, 'lakes', GEO_ORDER_FOR_CHOROPLETH)).material.transparent).toBe(
      true,
    );
    // A translucent line color under the regions is blended (and so drawn over opaque regions).
    await c.relayout({ 'geo.coastlinecolor': 'rgba(0, 0, 0, 0.5)' });
    expect(lineOf(globeLayer(c, 'coastlines', GEO_ORDER_FOR_CHOROPLETH)).opaque).toBe(false);

    // Without the choropleth the lines are made anew, blended, from the geometry already built.
    for (const build of builders()) build.mockClear();
    const before = globeLayer(c, 'countries', GEO_ORDER_FOR_CHOROPLETH).primitive;
    await c.react({
      data: [{ type: 'fakegeo' }],
      layout: { margin: MARGIN, dragmode: 'pan', geo: { fitbounds: false, ...ALL_ON_GLOBE } },
    } as FigureInput);
    const after = globeLayer(c, 'countries');
    expect(after.primitive).not.toBe(before);
    expect(before.object.parent).toBeNull();
    expect(lineOf(after).material.transparent).toBe(true);
    expect(after.primitive.object.renderOrder).toBe(500);
    for (const build of builders()) expect(build).not.toHaveBeenCalled();
  });

  it('keeps the body and the land opaque whatever their colors', async () => {
    const translucent = {
      ...GLOBE3D,
      showland: true,
      showocean: true,
      bgcolor: '#ffffff',
      oceancolor: 'rgba(0, 0, 255, 0.5)',
      landcolor: 'rgba(255, 0, 0, 0.5)',
    };
    const c = await chart(translucent);
    // The ocean over the background, and the land over that: drawn opaque, in the opaque pass,
    // so the order of the surface layers does not depend on their alpha.
    const body = meshOf(globeLayer(c, 'ocean'));
    expect(body.data.color).toEqual([0.5, 0.5, 1, 1]);
    expect(body.material).toMatchObject({ transparent: false, depthWrite: true });
    const land = meshOf(globeLayer(c, 'land'));
    expect(land.data.color).toEqual([0.75, 0.25, 0.5, 1]);
    expect(land.material.transparent).toBe(false);
    // Without an ocean the body is still there, in the background's color: it hides the far side.
    await c.relayout({ 'geo.showocean': false, 'geo.bgcolor': '#00ff00' });
    expect(globeLayer(c, 'ocean').primitive).toBe(onGlobe(c)[0]!.primitive);
    expect(meshOf(globeLayer(c, 'ocean')).data.color).toEqual([0, 1, 0, 1]);
    expect(meshOf(globeLayer(c, 'land')).data.color).toEqual([0.5, 0.5, 0, 1]);
    expect(globeViewport(c)!.background).toEqual([0, 1, 0, 1]);
    expect(
      globeBodyColor({ showocean: false, bgcolor: 'rgba(0, 0, 0, 0)' } as FullGeoLayout),
    ).toEqual([1, 1, 1, 1]);
  });

  it('builds nothing and updates no primitive when the globe turns or zooms', async () => {
    const c = await chart(ALL_ON_GLOBE);
    vi.spyOn(c, 'relayout');
    const viewport = globeViewport(c)!;
    const scene = globeScene(viewport);
    const layers = [...onGlobe(c), ...drawn(c)];
    expect(layers).toHaveLength(9);
    const primitives = new Set(layers.map((l) => l.primitive));
    for (const build of builders()) build.mockClear();
    vi.mocked(projectPolygons).mockClear();
    for (const layer of layers) layer.update.mockClear();
    const untouched = (): void => {
      for (const build of builders()) expect(build).not.toHaveBeenCalled();
      expect(projectPolygons).not.toHaveBeenCalled();
      expect(projectLines).not.toHaveBeenCalled();
      for (const layer of layers) expect(layer.update, layer.name).not.toHaveBeenCalled();
      for (const layer of onGlobe(c)) {
        expect(layer.setTransform, layer.name).not.toHaveBeenCalled();
      }
      // The same primitives, none added and none replaced.
      expect(new Set([...onGlobe(c), ...drawn(c)].map((l) => l.primitive))).toEqual(primitives);
    };
    const matches = (): void => {
      expect(scene.group.matrix.elements).toEqual(subplot(c).globeMatrix(new Matrix4()).elements);
    };

    // A drag turns the globe: every step moves the one matrix.
    const turned = scene.version;
    const [x, y] = middle(c);
    pointer('down', x, y);
    pointer('move', x + 30, y + 5);
    expect(scene.version).toBe(turned + 1);
    matches();
    untouched();
    pointer('move', x + 60, y + 10);
    expect(scene.version).toBe(turned + 2);
    untouched();
    pointer('up', x + 60, y + 10);
    expect(commits(c)).toHaveLength(1);
    expect(Object.keys(commits(c)[0]!).sort()).toEqual([
      'geo.projection.rotation.lat',
      'geo.projection.rotation.lon',
    ]);
    // Nothing is queued for later frames, and the pass of the commit finds everything in place.
    for (let i = 0; i < 3; i++) scheduler.step();
    await vi.mocked(c.relayout).mock.results[0]!.value;
    untouched();
    matches();
    expect(subplot(c).view!.state.rotation.lon).not.toBe(0);

    // A wheel zoom scales the matrix; when it rests the view is rebased and committed.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const radius = subplot(c).globeRadius;
    const zoomed = scene.version;
    wheel(c, -100);
    expect(scene.version).toBe(zoomed + 1);
    expect(subplot(c).globeRadius).toBeGreaterThan(radius);
    matches();
    untouched();
    vi.advanceTimersByTime(250);
    vi.useRealTimers();
    expect(commits(c)).toHaveLength(2);
    expect(commits(c)[1]).toHaveProperty(['geo.projection.scale']);
    for (let i = 0; i < 3; i++) scheduler.step();
    await vi.mocked(c.relayout).mock.results[1]!.value;
    untouched();
    matches();
    // The frame follows the zoom by its transform.
    const sp = subplot(c);
    expect(drawn(c)[0]!.setTransform.mock.lastCall![0]).toMatchObject({
      scaleX: sp.globeRadius,
      scaleY: sp.globeRadius,
    });
    expect(geometryUpdates(drawn(c)[0]!)).toHaveLength(0);
  });

  it('restyles by colors and uniforms alone', async () => {
    const c = await chart(ALL_ON_GLOBE);
    const land = globeLayer(c, 'land');
    const body = globeLayer(c, 'ocean');
    const coastlines = globeLayer(c, 'coastlines');
    const lataxis = globeLayer(c, 'lataxis');
    for (const build of builders()) build.mockClear();
    await c.relayout({ 'geo.landcolor': '#00ff00' });
    expect(land.update.mock.calls).toEqual([[{ color: [0, 1, 0, 1], opacity: 1 }]]);
    expect(body.update).not.toHaveBeenCalled();
    await c.relayout({ 'geo.oceancolor': '#000080' });
    expect(body.update).toHaveBeenCalledTimes(1);
    // The land's color does not depend on the body's while it is opaque.
    expect(land.update).toHaveBeenCalledTimes(1);
    await c.relayout({ 'geo.coastlinewidth': 3, 'geo.coastlinecolor': '#ff0000' });
    expect(coastlines.update.mock.calls).toEqual([
      [{ color: [1, 0, 0, 1], width: 3, dash: 'solid', miterLimit: 2 }],
    ]);
    await c.relayout({ 'geo.lataxis.griddash': 'dot' });
    expect(lataxis.update.mock.calls).toEqual([
      [expect.objectContaining({ dash: 'dot', miterLimit: 4 })],
    ]);
    // The same primitives throughout, and nothing built.
    expect(globeLayer(c, 'land').primitive).toBe(land.primitive);
    expect(globeLayer(c, 'coastlines').primitive).toBe(coastlines.primitive);
    for (const build of builders()) expect(build).not.toHaveBeenCalled();
    // A graticule with another step is other geometry: its lines are built and replaced in place.
    await c.relayout({ 'geo.lataxis.dtick': 45 });
    expect(built(globeModule()!.buildSphereLines)).toHaveLength(1);
    expect(lataxis.update).toHaveBeenCalledTimes(2);
    expect(Object.keys(lataxis.update.mock.lastCall![0] as object).sort()).toEqual([
      'starts',
      'x',
      'y',
      'z',
    ]);
    expect(globeLayer(c, 'lataxis').primitive).toBe(lataxis.primitive);
  });

  it('adds and removes layers with their `show…` flags, disposing what goes', async () => {
    const c = await chart({ ...GLOBE3D, showland: true });
    expect(onGlobe(c).map((l) => l.name)).toEqual(['ocean', 'land', 'coastlines']);
    const land = globeLayer(c, 'land');
    const landMesh = meshOf(land);
    const disposed = vi.fn();
    landMesh.object.geometry.addEventListener('dispose', disposed);
    for (const build of builders()) build.mockClear();
    await c.relayout({ 'geo.showland': false, 'geo.showrivers': true, 'geo.showocean': true });
    expect(onGlobe(c).map((l) => l.name)).toEqual(['ocean', 'coastlines', 'rivers']);
    expect(land.primitive.object.parent).toBeNull();
    expect(disposed).toHaveBeenCalledTimes(1);
    // Shown again, the land is a new primitive from the mesh that was built before.
    await c.relayout({ 'geo.showland': true, 'geo.showcoastlines': false });
    expect(onGlobe(c).map((l) => l.name)).toEqual(['ocean', 'land', 'rivers']);
    expect(globeLayer(c, 'land').primitive).not.toBe(land.primitive);
    expect(built(globeModule()!.buildSphereMesh)).toEqual([]);
    expect(built(globeModule()!.buildSphereLines).map(([geometry]) => geometry)).toEqual([
      world.rivers,
    ]);
    // `visible: false` hides every layer; the body stays, which hides the far side of what the
    // traces draw above the globe.
    const hidden = await chart({ ...GLOBE3D, visible: false });
    expect(onGlobe(hidden).map((l) => l.name)).toEqual(['ocean']);
    expect(drawn(hidden)).toEqual([]);
  });

  it('draws the body at once and the basemap layers when the basemap arrives', async () => {
    cached.clear();
    const c = create({ ...GLOBE3D, showland: true, lataxis: { showgrid: true } });
    let ready = false;
    void c.ready.then(() => (ready = true));
    await vi.waitFor(() => expect(loads.size).toBe(1));
    await vi.waitFor(() => expect(onGlobe(c).map((l) => l.name)).toEqual(['ocean', 'lataxis']));
    expect(drawn(c).map((l) => l.name)).toEqual(['frame']);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(ready).toBe(false);
    const body = globeLayer(c, 'ocean').primitive;
    const late = basemap();
    loads.get(requestKey(110, 'world'))!.resolve(late);
    await c.ready;
    expect(onGlobe(c).map((l) => l.name)).toEqual(['ocean', 'land', 'coastlines', 'lataxis']);
    expect(globeLayer(c, 'ocean').primitive).toBe(body);
    expect(built(globeModule()!.buildSphereMesh)).toEqual([[late.land]]);
    // A mesh is drawn as soon as it is made: `ready` has nothing more to wait for.
    expect(meshOf(globeLayer(c, 'land')).layout.triangleCount).toBeGreaterThan(0);
    expect(loadBasemap).toHaveBeenCalledTimes(1);
  });

  it('at resolution 50 draws 50m throughout, with the loaded 110m layers until it arrives', async () => {
    cached.clear();
    const hundredTen = basemap();
    cached.set(requestKey(110, 'world'), hundredTen);
    const c = create({ ...GLOBE3D, resolution: 50, showland: true });
    await vi.waitFor(() => expect(loads.has(requestKey(50, 'world'))).toBe(true));
    await vi.waitFor(() => expect(onGlobe(c).map((l) => l.name)).toContain('land'));
    // The 110m basemap was there, so its layers stand in; it is not asked for.
    const globe = globeModule()!;
    expect(built(globe.buildSphereMesh)).toEqual([[hundredTen.land]]);
    const land = globeLayer(c, 'land');
    const fifty = basemap();
    loads.get(requestKey(50, 'world'))!.resolve(fifty);
    await c.ready;
    expect(built(globe.buildSphereMesh)).toEqual([[hundredTen.land], [fifty.land]]);
    // Replaced in place: the same primitive, with new geometry.
    expect(globeLayer(c, 'land').primitive).toBe(land.primitive);
    expect(land.update).toHaveBeenCalledTimes(1);
    expect(Object.keys(land.update.mock.lastCall![0] as object).sort()).toEqual([
      'indices',
      'normals',
      'positions',
    ]);
    expect(loadBasemap).toHaveBeenCalledTimes(1);
    expect(loadBasemap).toHaveBeenCalledWith(50, 'world', { extras: false });

    // A gesture swaps nothing and loads nothing: the globe turns at 50m.
    for (const build of builders()) build.mockClear();
    land.update.mockClear();
    vi.spyOn(c, 'relayout');
    expect(subplot(c).quick).toBeUndefined();
    drag(c, 50, 10);
    for (let i = 0; i < 3; i++) scheduler.step();
    await vi.mocked(c.relayout).mock.results[0]!.value;
    expect(subplot(c).quick).toBeUndefined();
    for (const build of builders()) expect(build).not.toHaveBeenCalled();
    expect(land.update).not.toHaveBeenCalled();
    expect(loadBasemap).toHaveBeenCalledTimes(1);

    // Back at 110m the mesh built for the stand-in is the layer's.
    await c.relayout({ 'geo.resolution': 110 });
    expect(built(globe.buildSphereMesh)).toEqual([]);
    expect(globeLayer(c, 'land').primitive).toBe(land.primitive);
    expect(land.update).toHaveBeenCalledTimes(1);
  });

  it("switches between 'orthographic' and 'globe3d' both ways, disposing the other mode's primitives", async () => {
    const c = await chart({ ...ALL_LAYERS, projection: { type: 'orthographic' } });
    expect(globeViewport(c)).toBeUndefined();
    const flat = drawn(c);
    expect(flat.map((l) => l.name)).toContain('land');
    const frame = flat.find((l) => l.name === 'frame')!;

    await c.relayout({ 'geo.projection.type': 'globe3d' });
    expect(subplot(c).globe).toBe(true);
    // The flat layers are gone, but the frame: the same line, now the circle.
    expect(drawn(c).map((l) => l.name)).toEqual(['frame']);
    expect(drawn(c)[0]!.primitive).toBe(frame.primitive);
    for (const layer of flat) {
      if (layer !== frame) expect(layer.primitive.object.parent, layer.name).toBeNull();
    }
    const round = onGlobe(c);
    expect(round.map((l) => l.name)).toEqual([
      'ocean',
      'land',
      'lakes',
      'countries',
      'coastlines',
      'rivers',
      'lataxis',
      'lonaxis',
    ]);
    const viewport = globeViewport(c)!;
    const flatViewport = c.three.viewports.find((vp) => vp.name === 'subplot-geo')!;
    // Drawn under the 2D viewport although it is the newer of the two.
    expect(viewport.order).toBeLessThan(flatViewport.order);
    const disposed = vi.fn();
    for (const layer of round) {
      (layer.primitive.object as unknown as Line3D['object']).geometry.addEventListener(
        'dispose',
        disposed,
      );
    }

    vi.mocked(projectPolygons).mockClear();
    await c.relayout({ 'geo.projection.type': 'orthographic' });
    expect(subplot(c).globe).toBe(false);
    // The globe's viewport went with everything on it.
    expect(globeViewport(c)).toBeUndefined();
    expect(viewport.disposed).toBe(true);
    expect([...live.values()].includes(viewport)).toBe(false);
    for (const layer of round) expect(layer.primitive.object.parent, layer.name).toBeNull();
    // Meshes free their geometry; the lines' is one shared quad, freed with the last of them.
    expect(disposed.mock.calls.length).toBeGreaterThanOrEqual(3);
    // And the flat map is projected again, the frame from the sphere's outline.
    expect(drawn(c).map((l) => l.name)).toEqual(flat.map((l) => l.name));
    expect(drawn(c).find((l) => l.name === 'frame')!.primitive).toBe(frame.primitive);
    expect(vi.mocked(projectLines).mock.calls.map(([, , geometry]) => geometry)).toContain(SPHERE);
    expect(vi.mocked(projectPolygons).mock.calls.map(([, , geometry]) => geometry)).toContain(
      world.land,
    );
    expect(frame.setTransform).toHaveBeenLastCalledWith(subplot(c).transform);

    // A globe again: new primitives from the geometry of the first time.
    for (const build of builders()) build.mockClear();
    await c.relayout({ 'geo.projection.type': 'globe3d' });
    expect(onGlobe(c).map((l) => l.name)).toEqual(round.map((l) => l.name));
    expect(onGlobe(c)[1]!.primitive).not.toBe(round[1]!.primitive);
    expect(globeScene(globeViewport(c)!).body).toBe(onGlobe(c)[0]!.primitive.object);
    for (const build of builders()) expect(build).not.toHaveBeenCalled();
    expect(drawn(c).map((l) => l.name)).toEqual(['frame']);
  });

  it('keeps the interactions of the orthographic view: reset, selection area, cursor', async () => {
    const c = await chart(ALL_ON_GLOBE);
    vi.spyOn(c, 'relayout');
    const doubleclick = vi.fn();
    c.on('doubleclick', doubleclick);
    const [x, y] = middle(c);
    expect(view.selectArea?.(x, y)).toEqual({ id: 'geo', rect: subplot(c).clipRect });
    const reset = geoResetRelayout(saveGeoViewInitial(geoLayoutOf(c.fullLayout!, 'geo')!), 'geo');
    drag(c, 40, -20);
    await vi.mocked(c.relayout).mock.results[0]!.value;
    expect(subplot(c).view!.state.rotation.lon).not.toBeCloseTo(0, 3);
    expect(pointer('dblclick', x, y)).toBe(true);
    expect(doubleclick).toHaveBeenCalledTimes(1);
    expect(commits(c)[1]).toEqual(reset);
    await vi.mocked(c.relayout).mock.results[1]!.value;
    expect(subplot(c).view!.state.rotation.lon).toBeCloseTo(0, 9);
    expect(globeScene(globeViewport(c)!).group.matrix.elements).toEqual(
      subplot(c).globeMatrix(new Matrix4()).elements,
    );
    // A static plot takes no gesture.
    const still = await chart(ALL_ON_GLOBE, { config: { staticPlot: true } });
    expect(pointer('down', ...middle(still))).toBe(false);
  });

  describe('when its code cannot be loaded', () => {
    afterEach(() => {
      vi.mocked(globeModule).mockReset();
      vi.mocked(loadGlobe).mockReset();
    });

    it('waits for the code, then warns once, stays ready and draws the flat orthographic map', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      let fail!: (error: Error) => void;
      vi.mocked(globeModule).mockReturnValue(null);
      vi.mocked(loadGlobe).mockReturnValue(
        new Promise<GlobeModule>((_, reject) => (fail = reject)),
      );
      const c = create(ALL_ON_GLOBE);
      let ready = false;
      void c.ready.then(() => (ready = true));
      await new Promise((resolve) => setTimeout(resolve, 20));
      // The code is on its way: `ready` waits, and nothing of the subplot is drawn.
      expect(ready).toBe(false);
      expect(loadGlobe).toHaveBeenCalledTimes(1);
      expect(onGlobe(c)).toEqual([]);
      expect(drawn(c)).toEqual([]);
      fail(new Error('offline'));
      await c.ready;
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]![0]).toContain("3D globe ('globe3d') could not be loaded");
      // The 2D path draws the globe as the orthographic map it also is.
      expect(onGlobe(c)).toEqual([]);
      const flat = drawn(c);
      expect(flat.map((l) => l.name)).toEqual([
        'ocean',
        'land',
        'lakes',
        'countries',
        'coastlines',
        'rivers',
        'lataxis',
        'lonaxis',
        'frame',
      ]);
      expect(flat[0]!.primitive).toBeInstanceOf(LazyFillPrimitive);
      expect(vi.mocked(projectLines).mock.calls.map(([, , geometry]) => geometry)).toContain(
        SPHERE,
      );

      // A later pass tries again, waits for it, and does not warn again; it stays flat meanwhile.
      vi.mocked(loadGlobe).mockRejectedValue(new Error('still offline'));
      await c.relayout({ 'geo.landcolor': '#123456' });
      expect(loadGlobe).toHaveBeenCalledTimes(2);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(drawn(c).map((l) => l.name)).toEqual(flat.map((l) => l.name));

      // The code arrives after all: the next pass draws the globe, and the flat layers go.
      vi.mocked(globeModule).mockReset();
      vi.mocked(loadGlobe).mockReset();
      await c.relayout({ 'geo.landcolor': '#654321' });
      expect(onGlobe(c).map((l) => l.name)).toContain('land');
      expect(drawn(c).map((l) => l.name)).toEqual(['frame']);
      expect(flat[0]!.primitive.object.parent).toBeNull();
      expect(warn).toHaveBeenCalledTimes(1);
    });
  });
});
