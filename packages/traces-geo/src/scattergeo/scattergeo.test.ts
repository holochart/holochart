import { supplyDefaults, validate, type FullTrace } from '@mk7s/holochart-core';
import {
  LinePrimitive,
  MarkerSet,
  type LazyFillPrimitive,
  type LineData,
  type Primitive,
} from '@mk7s/holochart-render';
import { formatTemplate, type TraceUpdatePlan } from '@mk7s/holochart-runtime';
import { geoArea } from 'd3-geo';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VIEW_TEMPLATE } from '../a11y.ts';
import { dragGeoView, geoResetRelayout, saveGeoViewInitial } from '../geo/interact.ts';
import { geoSubplotIds } from '../geo/layout-defaults.ts';
import { GEO_LAYER_STEP, GEO_ORDER, GEO_ORDER_FOR_CHOROPLETH } from '../geo/order.ts';
import { loadProjection } from '../geo/projections.ts';
import { projectLines, projectPolygons } from '../geo/sink.ts';
import {
  containerPoint,
  FIGURE,
  hoverContext,
  hoverQuery,
  layoutFigure,
  PLOT_AREA,
  plotContext,
  registry,
  type LaidOutFigure,
  type PlotHarness,
} from './__testing__/figure.ts';
import type { ScattergeoCalc } from './calc.ts';
import { describeScattergeo } from './describe.ts';
import { geoHoverText, geoLabel } from './hover.ts';
import { scattergeo } from './index.ts';
import { geoPath, lineCoords } from './lines.ts';
import { SCATTERGEO_LAYER, scattergeoOrder } from './plot.ts';
import { geoPositions, subplotFrame } from './positions.ts';

// The projections are counted: a pan must not project, a rotation must.
vi.mock('../geo/sink.ts', async (original) => {
  const sink = await original<typeof import('../geo/sink.ts')>();
  return {
    ...sink,
    projectLines: vi.fn(sink.projectLines),
    projectPolygons: vi.fn(sink.projectPolygons),
  };
});

// troika typesets in a worker with browser globals; the view tests only need its object graph.
// Mocked by path, like the scatter tests: this package does not depend on troika, render does.
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

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(projectLines).mockClear();
  vi.mocked(projectPolygons).mockClear();
});

type Trace = Record<string, unknown>;

/** A world map that fills the plot area exactly: 800 × 400 px for 360° × 180°. */
const FLAT = { projection: { type: 'equirectangular' }, fitbounds: false };
/** A globe seen from above (0°, 0°): a disc 400 px across in the middle of the plot area. */
const GLOBE = { projection: { type: 'orthographic' }, fitbounds: false };

function defaults(trace: Trace): FullTrace {
  return supplyDefaults({ data: [{ type: 'scattergeo', ...trace }] }, registry, {
    validate: false,
  }).fullData[0]!;
}

function figure(traces: Trace | Trace[], geo: Trace = FLAT, layout: Trace = {}): LaidOutFigure {
  const data = (Array.isArray(traces) ? traces : [traces]).map((t) => ({
    type: 'scattergeo',
    ...t,
  }));
  return layoutFigure({ data, layout: { geo, ...layout } } as never);
}

const PASS: TraceUpdatePlan = { calc: false, plot: true, style: true, transform: false };

/** The primitive the view drew at `layer` for trace `index`. */
function layerOf<P extends Primitive<unknown>>(
  h: PlotHarness,
  layer: keyof typeof SCATTERGEO_LAYER,
  index = 0,
): P | undefined {
  const order = scattergeoOrder(index) + SCATTERGEO_LAYER[layer];
  return [...h.added.keys()].find((p) => Math.abs(p.object.renderOrder - order) < 1e-9) as
    P | undefined;
}

/** Base-state positions of the marker instances; NaN for hidden ones. */
function markerPositions(markers: MarkerSet): [number, number][] {
  const p = markers.positionArray!;
  const o = markers.origin;
  const out: [number, number][] = [];
  for (let i = 0; i < markers.count; i++) {
    // Hidden instances are parked far outside every view.
    out.push(p[i * 3]! >= 1e38 ? [NaN, NaN] : [p[i * 3]! + o[0], p[i * 3 + 1]! + o[1]]);
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

describe('scattergeo defaults (plotly.js scattergeo/defaults.js)', () => {
  it('hides traces without data and counts points like Plotly', () => {
    expect(defaults({}).visible).toBe(false);
    expect(defaults({ lon: [1, 2, 3] }).visible).toBe(false);
    expect(defaults({ lon: [1, 2, 3], lat: [0, 1] })['_length']).toBe(2);
  });

  it("defaults `mode` to 'markers' whatever the point count, on subplot `geo`", () => {
    const many = defaults({ lon: new Array(30).fill(0), lat: new Array(30).fill(0) });
    expect(many['mode']).toBe('markers');
    expect(many['geo']).toBe('geo');
    expect(many['marker']).toMatchObject({ size: 6, symbol: 'circle', opacity: 1 });
    // Attributes of modes that are off stay out, and so do scatter's own.
    expect(many['line']).toBeUndefined();
    expect(many['connectgaps']).toBeUndefined();
    expect(many['textfont']).toBeUndefined();
    for (const key of ['x', 'y', 'error_y', 'stackgroup', 'hoveron', 'zorder', 'fillpattern']) {
      expect(many[key]).toBeUndefined();
    }
    expect((many['marker'] as Trace)['maxdisplayed']).toBeUndefined();
  });

  it('takes scatter’s line, text and fill defaults', () => {
    const lines = defaults({ lon: [0, 1], lat: [0, 1], mode: 'lines' });
    expect(lines['line']).toMatchObject({ width: 2, dash: 'solid' });
    expect((lines['line'] as Trace)['shape']).toBeUndefined();
    expect(lines['connectgaps']).toBe(false);
    expect(lines['marker']).toBeUndefined();
    const text = defaults({ lon: [0], lat: [0], mode: 'markers+text', text: ['a'] });
    expect(text['textposition']).toBe('middle center');
    expect(text['textfont']).toMatchObject({ size: 12 });
    const filled = defaults({ lon: [0, 1, 1], lat: [0, 0, 1], fill: 'toself' });
    expect(filled['fill']).toBe('toself');
    expect(typeof filled['fillcolor']).toBe('string');
    // Scatter's other fills are not scattergeo's.
    expect(defaults({ lon: [0, 1], lat: [0, 1], fill: 'tozeroy' })['fill']).toBe('none');
  });

  it('coerces `locations` before `lon` / `lat`, with the `geojson` rules', () => {
    const iso = defaults({ locations: ['FRA', 'USA'], lon: [1], lat: [2] });
    expect(iso['_length']).toBe(2);
    expect(iso['locationmode']).toBe('ISO-3');
    expect(iso['featureidkey']).toBeUndefined();
    expect(iso['lon']).toBeUndefined();
    const custom = defaults({ locations: ['a'], geojson: { type: 'FeatureCollection' } });
    expect(custom['locationmode']).toBe('geojson-id');
    expect(custom['featureidkey']).toBe('id');
    // An empty `locations` is none.
    const empty = defaults({ locations: [], lon: [1], lat: [2] });
    expect(empty['locations']).toBeUndefined();
    expect(empty['_length']).toBe(1);
  });

  it('validates a Plotly scattergeo figure', () => {
    const data = [
      {
        type: 'scattergeo',
        locations: ['FRA'],
        locationmode: 'country names',
        geojson: 'https://example.com/a.json',
        featureidkey: 'properties.name',
        mode: 'markers+text',
        text: ['Paris'],
        hoverinfo: 'location+text',
        marker: { size: [10], sizemode: 'area', color: [1], colorscale: 'Viridis' },
        geo: 'geo2',
      },
      { type: 'scattergeo', lon: [0], lat: [0], hoverinfo: 'lon+lat', fill: 'toself' },
    ];
    expect(validate(data, { geo2: { scope: 'europe' } }, registry)).toEqual([]);
    expect(validate([{ type: 'scattergeo', hoverinfo: 'x+y' }], {}, registry)).toHaveLength(1);
  });

  it('declares the geo layout for its subplots only', () => {
    const { fullLayout } = supplyDefaults(
      {
        data: [
          { type: 'scattergeo', lon: [0], lat: [0], visible: false },
          { type: 'scattergeo', lon: [0], lat: [0], geo: 'geo2' },
        ],
      } as never,
      registry,
      { validate: false },
    );
    expect(geoSubplotIds(fullLayout)).toEqual(['geo2']);
    expect(fullLayout['geo']).toBeUndefined();
    expect(fullLayout['geo2']).toMatchObject({ fitbounds: 'locations' });
  });
});

describe('scattergeo calc', () => {
  it('keeps lon / lat as typed arrays, with a gap where either is missing', () => {
    const f = figure({ lon: [10, '20', null, 40, 50], lat: [1, 2, 3, 'x', 5.5] });
    const calc = f.calcs[0]!;
    expect(calc.lon).toBeInstanceOf(Float64Array);
    expect(Array.from(calc.lon)).toEqual([10, 20, NaN, NaN, 50]);
    expect(Array.from(calc.lat)).toEqual([1, 2, NaN, NaN, 5.5]);
    expect(calc.length).toBe(5);
    expect(calc.unresolved).toBe(false);
    expect(calc.subplot?.id).toBe('geo');
  });

  it('gives `fitbounds` its coordinates and half the largest marker as padding', () => {
    const plain = figure({ lon: [0, 10], lat: [0, 10] }).calcs[0]!;
    expect(plain.fit).toMatchObject({ pad: 3 });
    expect(plain.fit!.lon).toBe(plain.lon);
    expect(plain.fit!.lat).toBe(plain.lat);
    const bubbles = figure({ lon: [0, 10], lat: [0, 10], marker: { size: [10, 30] } }).calcs[0]!;
    expect(Array.from(bubbles.markerSize as Float32Array)).toEqual([10, 30]);
    expect(bubbles.fit!.pad).toBe(15);
    expect(figure({ lon: [0, 10], lat: [0, 10], mode: 'lines' }).calcs[0]!.fit!.pad).toBe(0);
  });

  it('zooms a default map to its data (Plotly 4: `fitbounds` is on)', () => {
    const f = figure(
      { lon: [-10, 30], lat: [35, 60] },
      { projection: { type: 'equirectangular' } },
    );
    const sp = f.subplot();
    const pad = f.calcs[0]!.fit!.pad!;
    const [left, bottom] = containerPoint(sp, -10, 35);
    const [right, top] = containerPoint(sp, 30, 60);
    // 40° × 25° in 800 × 400 px: the latitudes fill the height, less the room for the markers,
    // and the longitudes are centred.
    expect(top - PLOT_AREA.y).toBeGreaterThanOrEqual(pad);
    expect(top - PLOT_AREA.y).toBeLessThan(pad + 1);
    expect(PLOT_AREA.y + PLOT_AREA.height - bottom).toBeGreaterThanOrEqual(pad);
    expect(PLOT_AREA.y + PLOT_AREA.height - bottom).toBeLessThan(pad + 1);
    expect((left + right) / 2).toBeCloseTo(PLOT_AREA.x + PLOT_AREA.width / 2, 1);
    expect(right - left).toBeCloseTo(((bottom - top) * 40) / 25, 1);
  });
});

describe('scattergeo positions', () => {
  it('projects to the plot area and caches by view version', () => {
    const f = figure({ lon: [0, 90, -180], lat: [0, 45, -90] });
    const sp = f.subplot();
    const at = geoPositions(f.calcs[0]!, sp)!;
    // 800 × 400 px for 360° × 180°, y up (the fit leaves a thousandth of a degree at the edges).
    expect(Array.from(at.x)).toEqual([400, 600, 0].map((v) => expect.closeTo(v, 1)));
    expect(Array.from(at.y)).toEqual([200, 300, 0].map((v) => expect.closeTo(v, 1)));
    expect(at.scatter.x).toBe(at.x);
    // A pan and a zoom keep the version: the same positions, the same object.
    sp.view!.set({ scale: 2, translate: [300, 150] });
    expect(geoPositions(f.calcs[0]!, sp)).toBe(at);
    sp.view!.set({ rotation: { lon: 20 } });
    const turned = geoPositions(f.calcs[0]!, sp)!;
    expect(turned).not.toBe(at);
    expect(turned.x).not.toBe(at.x);
  });

  it.each([
    ['orthographic', {}],
    ['azimuthal equal area', {}],
    ['stereographic', {}],
    ['mercator', {}],
    ['natural earth', {}],
    ['albers usa', { scope: 'usa' }],
  ])('agrees with GeoSubplot.basePoint on a %s map, also panned and zoomed', (type, more) => {
    const n = 2000;
    const lon: number[] = [];
    const lat: number[] = [];
    let seed = 7;
    const random = (): number => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let i = 0; i < n; i++) {
      lon.push(random() * 360 - 180);
      lat.push((Math.asin(random() * 2 - 1) * 180) / Math.PI);
    }
    lon[5] = NaN;
    const geo = {
      projection: { type, rotation: { lon: 30, lat: 20, roll: 10 } },
      fitbounds: false,
      ...more,
    };
    const check = (f: LaidOutFigure): number => {
      const sp = f.subplot();
      const at = geoPositions(f.calcs[0]!, sp)!;
      let shown = 0;
      for (let i = 0; i < n; i++) {
        const p = Number.isNaN(lon[i]!) ? null : sp.basePoint(lon[i]!, lat[i]!);
        if (!p) {
          expect(at.x[i]).toBeNaN();
          expect(at.y[i]).toBeNaN();
        } else {
          shown++;
          expect(at.x[i]).toBeCloseTo(p[0], 8);
          expect(at.y[i]).toBeCloseTo(p[1], 8);
        }
      }
      return shown;
    };
    const shown = check(figure({ lon, lat }, geo));
    expect(shown).toBeGreaterThan(0);
    expect(shown).toBeLessThan(n);
    // Projected while the view is away from its base state: still base-state geometry.
    const chart = { resize: () => {} };
    const first = layoutFigure(
      { data: [{ type: 'scattergeo', lon, lat }], layout: { geo } } as never,
      chart,
    );
    const state = first.subplot().view!.state;
    first.subplot().view!.set({
      scale: state.scale * 3,
      translate: [state.translate[0] + 37, state.translate[1] - 21],
    });
    const later = layoutFigure(
      { data: [{ type: 'scattergeo', lon, lat }], layout: { geo } } as never,
      chart,
    );
    later.subplot().view!.set({
      scale: state.scale * 3,
      translate: [state.translate[0] + 37, state.translate[1] - 21],
    });
    expect(later.subplot().transform.scaleX).toBeCloseTo(3, 6);
    check(later);
  });
});

describe('scattergeo markers', () => {
  it('draws into the subplot’s viewport, above the base layers, in trace order', () => {
    const f = figure([
      { lon: [0, 90], lat: [0, 45], mode: 'lines+markers', fill: 'toself' },
      { lon: [10], lat: [10] },
    ]);
    const h = plotContext(f);
    scattergeo.plot!.create(h.ctx);
    const vp = h.viewports.get('geo')!;
    expect(h.asked[0]).toMatchObject({ kind: '2d', rect: f.subplot().clipRect });
    expect(h.added.size).toBe(3);
    for (const where of h.added.values()) expect(where).toBe(vp);
    const fill = layerOf(h, 'fill')!;
    const line = layerOf<LinePrimitive>(h, 'line')!;
    const markers = layerOf<MarkerSet>(h, 'markers')!;
    expect(line).toBeInstanceOf(LinePrimitive);
    expect(markers).toBeInstanceOf(MarkerSet);
    // In the subplot's `frontplot` slot, whichever of the two layer orders is in use.
    expect(GEO_ORDER_FOR_CHOROPLETH.frontplot).toBe(GEO_ORDER.frontplot);
    expect(fill.object.renderOrder).toBeGreaterThan(GEO_ORDER.frontplot);
    expect(fill.object.renderOrder).toBeLessThan(line.object.renderOrder);
    expect(line.object.renderOrder).toBeLessThan(markers.object.renderOrder);
    // The next trace is above all of it.
    const second = plotContext(f, 1);
    scattergeo.plot!.create(second.ctx);
    const above = layerOf<MarkerSet>(second, 'markers', 1)!;
    expect(above.object.renderOrder).toBeGreaterThan(markers.object.renderOrder);
    expect(above.object.renderOrder).toBeLessThan(GEO_ORDER.frontplot + GEO_LAYER_STEP);
  });

  it('places markers at their projected positions, with the subplot’s transform', () => {
    const f = figure({ lon: [0, 90, null], lat: [0, 45, 10] });
    const set = vi.spyOn(MarkerSet.prototype, 'setTransform');
    const h = plotContext(f);
    scattergeo.plot!.create(h.ctx);
    const at = markerPositions(layerOf<MarkerSet>(h, 'markers')!);
    expect(at[0]).toEqual([expect.closeTo(400, 1), expect.closeTo(200, 1)]);
    expect(at[1]).toEqual([expect.closeTo(600, 1), expect.closeTo(300, 1)]);
    expect(at[2]![0]).toBeNaN();
    expect(set).toHaveBeenLastCalledWith(f.subplot().transform);
  });

  it('hides markers on the far side of an orthographic view, from hover and selection too', () => {
    const f = figure({ lon: [0, 180, 60, -120], lat: [0, 0, 30, -30] }, GLOBE);
    const sp = f.subplot();
    const h = plotContext(f);
    scattergeo.plot!.create(h.ctx);
    const at = markerPositions(layerOf<MarkerSet>(h, 'markers')!);
    expect(at.map((p) => Number.isNaN(p[0]))).toEqual([false, true, false, true]);
    // The globe is a disc 400 px across in the middle of the 800 px plot area.
    expect(sp.clipRect.x).toBeCloseTo(PLOT_AREA.x + 200, 3);
    expect(sp.clipRect.width).toBeCloseTo(400, 3);
    expect(at[0]).toEqual([expect.closeTo(400, 3), expect.closeTo(200, 3)]);
    const everything = { kind: 'rect', x: [0, FIGURE.width], y: [0, FIGURE.height] } as const;
    const ctx = hoverContext(f);
    expect(scattergeo.selectPoints!(f.calcs[0]!, f.fullData[0]!, everything, ctx)).toEqual([0, 2]);
    // The antipode of the centre is drawn nowhere, so the pointer on the centre finds point 0.
    const [cx, cy] = containerPoint(sp, 0, 0);
    const found = scattergeo.hoverPoints!(f.calcs[0]!, f.fullData[0]!, hoverQuery(cx, cy), ctx);
    expect(found.map((p) => p.pointIndex)).toEqual([0]);
    // Turned half way round, the other two points are the visible ones.
    sp.view!.set({ rotation: { lon: 180 } });
    sp.notify();
    const turned = markerPositions(layerOf<MarkerSet>(h, 'markers')!);
    expect(turned.map((p) => Number.isNaN(p[0]))).toEqual([true, false, true, false]);
  });

  it('hides text labels of hidden points, and fills `texttemplate` from lon / lat', () => {
    const f = figure(
      {
        lon: [0, 180],
        lat: [0, 12.34],
        mode: 'markers+text',
        text: ['near', 'far'],
        texttemplate: '%{text} %{lat:.1f}',
      },
      GLOBE,
    );
    const h = plotContext(f);
    scattergeo.plot!.create(h.ctx);
    const text = layerOf(h, 'text')!;
    expect(h.added.get(text)).toBe(h.viewports.get('geo'));
    const update = vi.spyOn(text, 'update');
    const labels = (): string[] =>
      (update.mock.lastCall![0] as { labels: { text: string }[] }).labels.map((l) => l.text);
    f.subplot().view!.set({ rotation: { lon: 1 } });
    f.subplot().notify();
    expect(labels()).toEqual(['near 0.0']);
    f.subplot().view!.set({ rotation: { lon: 179 } });
    f.subplot().notify();
    expect(labels()).toEqual(['far 12.3']);
  });
});

describe('scattergeo lines', () => {
  it('builds the path like calcTraceToLineCoords', () => {
    const calc = figure({ lon: [0, 10, null, 20, 30, null], lat: [0, 1, 2, 3, 4, 5] }).calcs[0]!;
    expect(lineCoords(calc, false)).toEqual([
      [
        [0, 0],
        [10, 1],
      ],
      [
        [20, 3],
        [30, 4],
      ],
    ]);
    expect(lineCoords(calc, true)).toHaveLength(1);
    expect(geoPath(calc, false, false).polygons).toBeUndefined();
    expect(geoPath(calc, false, false)).toBe(geoPath(calc, false, false));
  });

  it('cuts a line at the antimeridian into two polylines', () => {
    const update = vi.spyOn(LinePrimitive.prototype, 'update');
    const f = figure({ lon: [170, -170], lat: [0, 0], mode: 'lines' });
    scattergeo.plot!.create(plotContext(f).ctx);
    const lines = lastLine(update);
    expect(lines).toHaveLength(2);
    // One piece runs to the right edge of the map, the other from the left edge.
    const ends = lines.map((l) => [l[0]![0], l[l.length - 1]![0]]);
    expect(ends).toContainEqual([expect.closeTo(800 - 800 / 36, 1), expect.closeTo(800, 1)]);
    expect(ends).toContainEqual([expect.closeTo(0, 1), expect.closeTo(800 / 36, 1)]);
  });

  it('follows the great circle: New York to London bows north on a flat map', () => {
    const update = vi.spyOn(LinePrimitive.prototype, 'update');
    const f = figure({ lon: [-74.006, -0.1278], lat: [40.7128, 51.5074], mode: 'lines' });
    scattergeo.plot!.create(plotContext(f).ctx);
    const [line, ...rest] = lastLine(update);
    expect(rest).toHaveLength(0);
    expect(line!.length).toBeGreaterThan(2);
    const north = Math.max(...line!.map((p) => p[1]));
    // y is up: the highest vertex is north of both ends, by more than a degree (2.2 px).
    expect(north).toBeGreaterThan(Math.max(line![0]![1], line![line!.length - 1]![1]) + 3);
  });

  it('splits lines at gaps unless `connectgaps`', () => {
    const update = vi.spyOn(LinePrimitive.prototype, 'update');
    const trace = { lon: [0, 10, null, 20, 30], lat: [0, 0, 0, 0, 0], mode: 'lines' };
    scattergeo.plot!.create(plotContext(figure(trace)).ctx);
    expect(lastLine(update)).toHaveLength(2);
    update.mockClear();
    scattergeo.plot!.create(plotContext(figure({ ...trace, connectgaps: true })).ctx);
    const [joined, ...rest] = lastLine(update);
    expect(rest).toHaveLength(0);
    expect(joined![0]![0]).toBeCloseTo(400, 1);
    expect(joined![joined!.length - 1]![0]).toBeCloseTo(400 + (30 * 800) / 360, 1);
  });

  it('draws lines with the trace’s style and Plotly’s miter limit', () => {
    const update = vi.spyOn(LinePrimitive.prototype, 'update');
    const f = figure({
      lon: [0, 10],
      lat: [0, 0],
      mode: 'lines',
      opacity: 0.5,
      line: { color: '#ff0000', width: 3, dash: 'dot' },
    });
    scattergeo.plot!.create(plotContext(f).ctx);
    expect(update.mock.lastCall![0]).toMatchObject({
      color: [1, 0, 0, 1],
      width: 3,
      dash: 'dot',
      miterLimit: 2,
      opacity: 0.5,
    });
  });
});

describe("scattergeo fill: 'toself'", () => {
  const triangle = { lon: [0, 20, 10], lat: [0, 0, 15], fill: 'toself', mode: 'lines' };

  it('closes each run and fills the smaller side, whichever way the path runs', () => {
    const one = geoPath(figure(triangle).calcs[0]!, false, true);
    const other = geoPath(
      figure({ ...triangle, lon: [10, 20, 0], lat: [15, 0, 0] }).calcs[0]!,
      false,
      true,
    );
    for (const path of [one, other]) {
      const ring = path.polygons!.coordinates[0]![0]!;
      expect(ring).toHaveLength(4);
      expect(ring[0]).toEqual(ring[3]);
      expect(geoArea(path.polygons!)).toBeLessThan(0.1);
      // The line is closed as well, as Plotly strokes the polygon.
      expect(path.lines.coordinates[0]).toHaveLength(4);
    }
    // A run that is already closed gets no extra point; two points bound nothing.
    const closed = figure({ lon: [0, 20, 10, 0, null, 5, 6], lat: [0, 0, 15, 0, 0, 1, 1] });
    const path = geoPath(closed.calcs[0]!, false, true);
    expect(path.polygons!.coordinates).toHaveLength(1);
    expect(path.polygons!.coordinates[0]![0]).toHaveLength(4);
    expect(path.lines.coordinates).toHaveLength(2);
  });

  it('draws one fill under the line, with `fillcolor`', async () => {
    const update = vi.spyOn(LinePrimitive.prototype, 'update');
    const f = figure({ ...triangle, fillcolor: 'rgba(0, 0, 255, 0.25)' });
    const h = plotContext(f);
    const view = scattergeo.plot!.create(h.ctx);
    expect(projectPolygons).toHaveBeenCalledTimes(1);
    const out = vi.mocked(projectPolygons).mock.results[0]!.value;
    expect(out).toMatchObject({ polygonCount: 1, ringCount: 1 });
    // The closed outline: a first vertex and a last one in the same place.
    const [outline] = lastLine(update);
    expect(outline![0]![0]).toBeCloseTo(outline![outline!.length - 1]![0], 6);
    expect(outline![0]![1]).toBeCloseTo(outline![outline!.length - 1]![1], 6);
    const fill = layerOf<LazyFillPrimitive>(h, 'fill')!;
    expect(h.added.get(fill)).toBe(h.viewports.get('geo'));
    await fill.ready;
    expect(fill.fill).not.toBeNull();
    // A pass that changes no geometry recolors the fill and projects nothing.
    const restyle = vi.spyOn(fill, 'update');
    view.update(h.ctx, PASS);
    expect(restyle).toHaveBeenCalledWith({ color: [0, 0, 1, 0.25], opacity: 1 });
    expect(projectPolygons).toHaveBeenCalledTimes(1);
  });

  it('fills without a line, and drops the fill when it is turned off', () => {
    const f = figure({ ...triangle, mode: 'markers' });
    const h = plotContext(f);
    const view = scattergeo.plot!.create(h.ctx);
    expect(layerOf(h, 'fill')).toBeDefined();
    expect(layerOf(h, 'line')).toBeUndefined();
    const off = figure({ ...triangle, mode: 'markers', fill: 'none' });
    off.calcs[0] = f.calcs[0];
    view.update({ ...h.ctx, trace: off.fullData[0]! }, PASS);
    expect(layerOf(h, 'fill')).toBeUndefined();
    expect(h.added.size).toBe(1);
  });
});

describe('scattergeo redraw rules (ADR-025)', () => {
  const trace = { lon: [0, 20, 10], lat: [0, 0, 15], fill: 'toself', mode: 'lines+markers' };

  function spies() {
    return {
      line: vi.spyOn(LinePrimitive.prototype, 'update'),
      lineMove: vi.spyOn(LinePrimitive.prototype, 'setTransform'),
      markers: vi.spyOn(MarkerSet.prototype, 'update'),
      markersMove: vi.spyOn(MarkerSet.prototype, 'setTransform'),
    };
  }

  it('a pan or a zoom only sets transforms', () => {
    const f = figure(trace);
    const sp = f.subplot();
    const h = plotContext(f);
    scattergeo.plot!.create(h.ctx);
    const fill = layerOf<LazyFillPrimitive>(h, 'fill')!;
    const fillUpdate = vi.spyOn(fill, 'update');
    const fillMove = vi.spyOn(fill, 'setTransform');
    const s = spies();
    vi.mocked(projectLines).mockClear();
    vi.mocked(projectPolygons).mockClear();
    const version = sp.view!.version;

    sp.view!.set({ scale: 2, translate: [330, 170] });
    sp.notify();

    expect(sp.view!.version).toBe(version);
    const moved = sp.transform;
    expect(moved.scaleX).toBeCloseTo(2, 9);
    expect(s.line).not.toHaveBeenCalled();
    expect(s.markers).not.toHaveBeenCalled();
    expect(fillUpdate).not.toHaveBeenCalled();
    expect(projectLines).not.toHaveBeenCalled();
    expect(projectPolygons).not.toHaveBeenCalled();
    expect(s.lineMove).toHaveBeenLastCalledWith(moved);
    expect(s.markersMove).toHaveBeenLastCalledWith(moved);
    expect(fillMove).toHaveBeenLastCalledWith(moved);
    // The preview is drawn at once, with no pipeline run, in the viewport of the last pass.
    expect(h.invalidate.calls).toBe(1);
    expect(h.asked).toHaveLength(1);
  });

  it('a rotation reprojects, and so does the rebase after a zoom', () => {
    const f = figure(trace);
    const sp = f.subplot();
    const h = plotContext(f);
    scattergeo.plot!.create(h.ctx);
    const fill = layerOf<LazyFillPrimitive>(h, 'fill')!;
    const fillUpdate = vi.spyOn(fill, 'update');
    const before = markerPositions(layerOf<MarkerSet>(h, 'markers')!);
    const s = spies();
    vi.mocked(projectLines).mockClear();
    vi.mocked(projectPolygons).mockClear();

    sp.view!.set({ rotation: { lon: 30 } });
    sp.notify();

    expect(projectLines).toHaveBeenCalledTimes(1);
    expect(projectPolygons).toHaveBeenCalledTimes(1);
    expect(s.line.mock.lastCall![0]).toHaveProperty('x');
    expect(fillUpdate.mock.lastCall![0]).toHaveProperty('x');
    // Only the markers' positions are uploaded, not their styles again.
    expect(s.markers).toHaveBeenCalledTimes(1);
    expect(Object.keys(s.markers.mock.lastCall![0]).sort()).toEqual(['x', 'y']);
    const after = markerPositions(layerOf<MarkerSet>(h, 'markers')!);
    // 30° east of the centre is now the middle of the map: everything moved 30° west.
    expect(after[0]![0]).toBeCloseTo(before[0]![0] - (30 * 800) / 360, 1);

    // A zoom keeps the geometry; when it settles the subplot rebases and curves are resampled.
    sp.view!.set({ scale: 4 });
    sp.notify();
    expect(projectLines).toHaveBeenCalledTimes(1);
    expect(sp.view!.rebase()).toBe(true);
    sp.notify();
    expect(projectLines).toHaveBeenCalledTimes(2);
    expect(s.lineMove).toHaveBeenLastCalledWith(sp.transform);
    expect(sp.transform.scaleX).toBe(1);
  });

  it('geometry projected under a pan and a zoom is still in the base state', () => {
    const chart = { resize: () => {} };
    const input = {
      data: [{ type: 'scattergeo', lon: [0, 20], lat: [0, 10], mode: 'lines+markers' }],
      layout: { geo: FLAT },
    } as never;
    const f = layoutFigure(input, chart);
    const sp = f.subplot();
    sp.view!.set({ scale: 2, translate: [330, 170] });
    const update = vi.spyOn(LinePrimitive.prototype, 'update');
    const h = plotContext(f);
    scattergeo.plot!.create(h.ctx);
    const t = sp.transform;
    expect(t.scaleX).toBeCloseTo(2, 9);
    const world = (p: readonly [number, number]): [number, number] => [
      p[0] * t.scaleX + t.offsetX,
      p[1] * t.scaleY + t.offsetY,
    ];
    // Where the view draws (0°, 0°) and (20°, 10°) now, in the viewport's px.
    const clip = sp.clipRect;
    const expected = [
      [0, 0],
      [20, 10],
    ].map(([lon, lat]) => {
      const [cx, cy] = containerPoint(sp, lon!, lat!);
      return [cx - clip.x, clip.y + clip.height - cy];
    });
    const [line] = lastLine(update);
    const ends = [world(line![0]!), world(line![line!.length - 1]!)];
    const markers = markerPositions(layerOf<MarkerSet>(h, 'markers')!).map(world);
    for (const got of [ends, markers]) {
      expect(got[0]![0]).toBeCloseTo(expected[0]![0]!, 2);
      expect(got[0]![1]).toBeCloseTo(expected[0]![1]!, 2);
      expect(got[1]![0]).toBeCloseTo(expected[1]![0]!, 2);
      expect(got[1]![1]).toBeCloseTo(expected[1]![1]!, 2);
    }
  });

  it('the layout pass that ends a pan projects nothing, and follows the new subplot', () => {
    const chart = { resize: () => {} };
    const f = layoutFigure(
      { data: [{ type: 'scattergeo', ...trace }], layout: { geo: FLAT } } as never,
      chart,
    );
    const first = f.subplot();
    const h = plotContext(f);
    const view = scattergeo.plot!.create(h.ctx);
    const positions = geoPositions(f.calcs[0]!, first);
    first.view!.set({ translate: [330, 170] });
    first.notify();
    expect(h.invalidate.calls).toBe(1);
    // The geo component decided the viewport's background meanwhile.
    first.viewport(h.ctx, [1, 1, 1, 1]);
    const s = spies();
    vi.mocked(projectLines).mockClear();
    vi.mocked(projectPolygons).mockClear();

    f.layout();
    const next = f.subplot();
    expect(next).not.toBe(first);
    expect(next.view!.version).toBe(first.view!.version);
    view.update(h.ctx, PASS);

    expect(geoPositions(f.calcs[0]!, next)).toBe(positions);
    expect(projectLines).not.toHaveBeenCalled();
    expect(projectPolygons).not.toHaveBeenCalled();
    // The line is restyled, not rebuilt.
    for (const call of s.line.mock.calls) expect(call[0]).not.toHaveProperty('x');
    expect(s.lineMove).toHaveBeenLastCalledWith(next.transform);
    // The pass asks for the viewport again, and leaves its background as it found it.
    expect(h.asked).toHaveLength(3);
    expect(h.viewports.get('geo')!.background).toEqual([1, 1, 1, 1]);
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

  it('a new calc reprojects, and a selection restyles', () => {
    const f = figure(trace);
    const h = plotContext(f);
    const view = scattergeo.plot!.create(h.ctx);
    const s = spies();
    vi.mocked(projectLines).mockClear();
    view.update({ ...h.ctx, selectedPoints: [1] }, { ...PASS, plot: false, selection: true });
    expect(projectLines).not.toHaveBeenCalled();
    expect(s.markers).toHaveBeenCalled();
    const moved = figure({ ...trace, lon: [5, 25, 15] });
    view.update(
      { ...h.ctx, trace: moved.fullData[0]!, calc: moved.calcs[0]! },
      {
        calc: true,
        plot: true,
        style: true,
        transform: false,
      },
    );
    expect(projectLines).toHaveBeenCalledTimes(1);
    const at = markerPositions(layerOf<MarkerSet>(h, 'markers')!);
    expect(at[0]![0]).toBeCloseTo(400 + (5 * 800) / 360, 1);
  });
});

describe('scattergeo hover (plotly.js scattergeo/hover.js)', () => {
  const cities = {
    lon: [-73.9857, 2.3522, 151.2093],
    lat: [40.7484, 48.8566, -33.8688],
    text: ['New York', 'Paris', 'Sydney'],
    marker: { size: 10 },
  };

  it('formats coordinates like Plotly’s formatLabels', () => {
    const { fullLayout } = figure(cities);
    expect(geoLabel(fullLayout, -73.9857)).toBe('−73.9857');
    expect(geoLabel(fullLayout, 48.85661234)).toBe('48.85661');
    expect(geoLabel(fullLayout, 0)).toBe('0');
    expect(geoLabel(fullLayout, NaN)).toBe('');
  });

  it('lists the coordinates and the text by `hoverinfo`', () => {
    const { fullLayout } = figure(cities);
    const labels = { lon: '2.3522', lat: '48.8566' };
    const text = (hoverinfo: unknown, location: unknown = null): string =>
      geoHoverText({ hoverinfo } as unknown as FullTrace, 1, labels, 'Paris', location, fullLayout);
    expect(text('all')).toBe('(48.8566°, 2.3522°)<br>Paris');
    expect(text(undefined)).toBe('(48.8566°, 2.3522°)<br>Paris');
    expect(text('lon')).toBe('lon: 2.3522°');
    expect(text('lat+text')).toBe('lat: 48.8566°<br>Paris');
    expect(text('text+name')).toBe('Paris');
    expect(text(['all', 'lon+lat'])).toBe('(48.8566°, 2.3522°)');
    expect(text('all', 'FRA')).toBe('FRA<br>Paris');
  });

  it('reports the point under the pointer with lon / lat fields and labels', () => {
    const f = figure(cities);
    const sp = f.subplot();
    const [cx, cy] = containerPoint(sp, 2.3522, 48.8566);
    const points = scattergeo.hoverPoints!(
      f.calcs[0]!,
      f.fullData[0]!,
      hoverQuery(cx + 2, cy - 1),
      hoverContext(f),
    );
    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({
      pointIndex: 1,
      text: 'Paris',
      fields: { lon: 2.3522, lat: 48.8566, location: null },
      labels: { lon: '2.3522', lat: '48.8566' },
      hoverText: '(48.8566°, 2.3522°)<br>Paris',
    });
    // The label is anchored at the point, in overlay px from the bottom of the figure.
    expect(points[0]!.px).toBeCloseTo(cx, 6);
    expect(points[0]!.py).toBeCloseTo(FIGURE.height - cy, 6);
    expect(points[0]!.x).toBeUndefined();
    expect(points[0]!.y).toBeUndefined();
    // Far from every point: nothing within the hover distance.
    const [ox, oy] = containerPoint(sp, -150, -60);
    expect(
      scattergeo.hoverPoints!(f.calcs[0]!, f.fullData[0]!, hoverQuery(ox, oy), hoverContext(f)),
    ).toEqual([]);
  });

  it('gives `hovertemplate` its variables', () => {
    const f = figure({ ...cities, hovertemplate: '%{text}: %{lat}, %{lon:.1f}' });
    const [cx, cy] = containerPoint(f.subplot(), 151.2093, -33.8688);
    const [p] = scattergeo.hoverPoints!(
      f.calcs[0]!,
      f.fullData[0]!,
      hoverQuery(cx, cy),
      hoverContext(f),
    );
    // As the runtime fills a template: the point's fields are its values.
    const filled = formatTemplate(String(f.fullData[0]!['hovertemplate']), {
      values: { ...p!.fields, text: p!.text },
      labels: p!.labels!,
      fullData: f.fullData[0]!,
      pointIndex: p!.pointIndex,
    });
    expect(filled).toBe('Sydney: −33.8688, 151.2');
  });

  it('follows a pan and a zoom, and ignores what the subplot does not draw', () => {
    const f = figure(cities, GLOBE);
    const sp = f.subplot();
    const ctx = hoverContext(f);
    const hover = (cx: number, cy: number): number[] =>
      scattergeo.hoverPoints!(f.calcs[0]!, f.fullData[0]!, hoverQuery(cx, cy), ctx).map(
        (p) => p.pointIndex,
      );
    const before = containerPoint(sp, 2.3522, 48.8566);
    expect(hover(...before)).toEqual([1]);
    const state = sp.view!.state;
    sp.view!.set({ scale: 1.2, translate: [state.translate[0] - 60, state.translate[1] - 40] });
    const after = containerPoint(sp, 2.3522, 48.8566);
    expect(Math.hypot(after[0] - before[0], after[1] - before[1])).toBeGreaterThan(30);
    expect(hover(...after)).toEqual([1]);
    const [p] = scattergeo.hoverPoints!(f.calcs[0]!, f.fullData[0]!, hoverQuery(...after), ctx);
    expect(p!.px).toBeCloseTo(after[0], 6);
    expect(p!.py).toBeCloseTo(FIGURE.height - after[1], 6);
    // Beside the disc's square the subplot draws nothing: no hover there.
    const clip = sp.clipRect;
    expect(hover(clip.x - 5, clip.y + clip.height / 2)).toEqual([]);
  });

  it('hovers the vertices of a line', () => {
    const f = figure({ lon: [0, 30], lat: [0, 10], mode: 'lines' });
    const [cx, cy] = containerPoint(f.subplot(), 30, 10);
    const points = scattergeo.hoverPoints!(
      f.calcs[0]!,
      f.fullData[0]!,
      hoverQuery(cx, cy),
      hoverContext(f),
    );
    expect(points.map((p) => p.pointIndex)).toEqual([1]);
  });
});

describe('scattergeo selection and event data (plotly.js select.js, event_data.js)', () => {
  const trace = { lon: [-100, 0, 100, 0], lat: [0, 0, 0, 60] };

  it('selects the points inside a box or a lasso, in projected px', () => {
    const f = figure(trace);
    const sp = f.subplot();
    const ctx = hoverContext(f);
    const [x0, y0] = containerPoint(sp, -10, -10);
    const [x1, y1] = containerPoint(sp, 110, 10);
    const box = { kind: 'rect', x: [x0, x1], y: [y1, y0] } as const;
    expect(scattergeo.selectPoints!(f.calcs[0]!, f.fullData[0]!, box, ctx)).toEqual([1, 2]);
    // A triangle around (0°, 60°) and (0°, 0°).
    const polygon = [
      containerPoint(sp, -20, -10),
      containerPoint(sp, 20, -10),
      containerPoint(sp, 0, 80),
    ];
    const lasso = {
      kind: 'lasso',
      x: [Math.min(...polygon.map((p) => p[0])), Math.max(...polygon.map((p) => p[0]))],
      y: [Math.min(...polygon.map((p) => p[1])), Math.max(...polygon.map((p) => p[1]))],
      polygon,
    } as const;
    const picked = scattergeo.selectPoints!(f.calcs[0]!, f.fullData[0]!, lasso, ctx);
    expect([...picked].sort()).toEqual([1, 3]);
  });

  it('selects where the points are after a pan and a zoom', () => {
    const f = figure(trace, GLOBE);
    const sp = f.subplot();
    const state = sp.view!.state;
    sp.view!.set({ scale: 1.4, translate: [state.translate[0] + 40, state.translate[1] - 30] });
    const [cx, cy] = containerPoint(sp, 0, 60);
    const box = { kind: 'rect', x: [cx - 4, cx + 4], y: [cy - 4, cy + 4] } as const;
    expect(scattergeo.selectPoints!(f.calcs[0]!, f.fullData[0]!, box, hoverContext(f))).toEqual([
      3,
    ]);
  });

  it('selects nothing from a bare line', () => {
    const f = figure({ ...trace, mode: 'lines' });
    const all = { kind: 'rect', x: [0, FIGURE.width], y: [0, FIGURE.height] } as const;
    expect(scattergeo.selectPoints!(f.calcs[0]!, f.fullData[0]!, all, hoverContext(f))).toEqual([]);
  });

  it('gives events lon, lat and location', () => {
    const f = figure(trace);
    expect(scattergeo.eventData!(f.calcs[0]!, f.fullData[0]!, 3)).toEqual({
      lon: 0,
      lat: 60,
      location: null,
    });
  });
});

describe('scattergeo subplots', () => {
  it('leaves hidden traces out', () => {
    const f = figure([
      { lon: [0], lat: [0], visible: false },
      { lon: [10], lat: [10], visible: 'legendonly' },
      { lon: [20], lat: [20] },
    ]);
    expect(f.calcs.map((c) => c !== undefined)).toEqual([false, false, true]);
    // The hidden traces take no part in the fit: the view is centred on the one that is drawn.
    const fitted = layoutFigure({
      data: [
        { type: 'scattergeo', lon: [-120], lat: [-40], visible: false },
        { type: 'scattergeo', lon: [20, 40], lat: [20, 30] },
      ],
      layout: { geo: { projection: { type: 'equirectangular' } } },
    } as never);
    const [cx, cy] = containerPoint(fitted.subplot(), 30, 25);
    expect(cx).toBeCloseTo(PLOT_AREA.x + PLOT_AREA.width / 2, 3);
    expect(cy).toBeCloseTo(PLOT_AREA.y + PLOT_AREA.height / 2, 3);
  });

  it('draws each trace on its own subplot (`geo: "geo2"`)', () => {
    const f = layoutFigure({
      data: [
        { type: 'scattergeo', lon: [0], lat: [0] },
        { type: 'scattergeo', lon: [0], lat: [0], geo: 'geo2' },
      ],
      layout: {
        geo: { ...FLAT, domain: { x: [0, 0.5] } },
        geo2: { ...FLAT, domain: { x: [0.5, 1] } },
      },
    } as never);
    const left = f.subplot('geo');
    const right = f.subplot('geo2');
    expect(left).not.toBe(right);
    expect(f.calcs[1]!.subplot).toBe(right);
    expect(right.rect.x).toBeCloseTo(PLOT_AREA.x + PLOT_AREA.width / 2, 6);
    const h = plotContext(f, 1);
    scattergeo.plot!.create(h.ctx);
    expect([...h.viewports.keys()]).toEqual(['geo2']);
    expect(h.asked[0]!.rect).toEqual(right.clipRect);
    // Each trace is hovered in its own subplot.
    const ctx = hoverContext(f);
    const hover = (index: number, at: [number, number]): number =>
      scattergeo.hoverPoints!(f.calcs[index]!, f.fullData[index]!, hoverQuery(...at), ctx).length;
    const onLeft = containerPoint(left, 0, 0);
    const onRight = containerPoint(right, 0, 0);
    expect(onRight[0] - onLeft[0]).toBeCloseTo(PLOT_AREA.width / 2, 6);
    expect([hover(0, onLeft), hover(0, onRight)]).toEqual([1, 0]);
    expect([hover(1, onLeft), hover(1, onRight)]).toEqual([0, 1]);
    // A view change of one subplot redraws its traces only.
    const other = plotContext(f, 0);
    scattergeo.plot!.create(other.ctx);
    right.view!.set({ translate: [10, 10] });
    right.notify();
    expect([h.invalidate.calls, other.invalidate.calls]).toEqual([1, 0]);
  });

  it('moves its primitives when the trace moves to another subplot', () => {
    const layout = {
      geo: { ...FLAT, domain: { x: [0, 0.5] } },
      geo2: { ...FLAT, domain: { x: [0.5, 1] } },
    };
    const trace = { type: 'scattergeo', lon: [0, 10], lat: [0, 10], mode: 'lines+markers' };
    const other = { type: 'scattergeo', lon: [0], lat: [0], geo: 'geo2' };
    const f = layoutFigure({ data: [trace, other], layout } as never);
    const h = plotContext(f);
    const view = scattergeo.plot!.create(h.ctx);
    const first = [...h.added.keys()];
    expect(first).toHaveLength(2);
    const moved = layoutFigure({ data: [{ ...trace, geo: 'geo2' }, other], layout } as never);
    view.update(
      { ...h.ctx, trace: moved.fullData[0]!, calc: moved.calcs[0]! },
      { calc: true, plot: true, style: true, transform: false },
    );
    expect(h.added.size).toBe(2);
    for (const [p, where] of h.added) {
      expect(first).not.toContain(p);
      expect(where).toBe(h.viewports.get('geo2'));
    }
  });

  it('draws nothing while the projection’s code loads, then draws', async () => {
    const chart = { resize: vi.fn() };
    const f = layoutFigure(
      {
        data: [{ type: 'scattergeo', lon: [0, 10], lat: [0, 10], mode: 'lines+markers' }],
        layout: { geo: { projection: { type: 'robinson' }, fitbounds: false } },
      } as never,
      chart,
    );
    expect(f.subplot().view).toBeUndefined();
    const h = plotContext(f);
    const view = scattergeo.plot!.create(h.ctx);
    expect(h.added.size).toBe(0);
    const [cx, cy] = [PLOT_AREA.x + 400, PLOT_AREA.y + 200];
    expect(
      scattergeo.hoverPoints!(f.calcs[0]!, f.fullData[0]!, hoverQuery(cx, cy), hoverContext(f)),
    ).toEqual([]);
    await loadProjection('robinson');
    f.layout();
    view.update(h.ctx, PASS);
    expect(h.added.size).toBe(2);
    // And back to nothing when the subplot goes away.
    f.calcs[0]!.subplot = undefined;
    view.update(h.ctx, PASS);
    expect(h.added.size).toBe(0);
  });
});

describe('scattergeo legend, colorbar and description', () => {
  it('gets its legend icon and colorbar from scatter', () => {
    const f = figure({
      lon: [0, 10],
      lat: [0, 10],
      mode: 'lines+markers',
      marker: { color: [1, 2], colorscale: 'Viridis', showscale: true, symbol: 'square' },
    });
    const trace = f.fullData[0]!;
    const icon = scattergeo.legendIcon!(trace, { fullLayout: f.fullLayout });
    expect(icon).toMatchObject({ kind: 'lines+markers', marker: { symbol: 'square' } });
    expect(scattergeo.colorbar!(trace, { fullLayout: f.fullLayout })).not.toBeNull();
    const plain = figure({ lon: [0], lat: [0] });
    expect(scattergeo.colorbar!(plain.fullData[0]!, { fullLayout: plain.fullLayout })).toBeNull();
  });

  it('describes the kind, the point count and the extent', () => {
    const f = figure({
      name: 'Cities',
      lon: [-73.9857, 2.3522, null],
      lat: [40.7484, 48.8566, 1],
      text: ['New York', '<b>Paris</b>', 'nowhere'],
    });
    const d = describeScattergeo({
      trace: f.fullData[0]!,
      calc: f.calcs[0]!,
      index: 0,
      fullLayout: f.fullLayout,
      xaxis: undefined,
      yaxis: undefined,
      maxRows: 2,
    });
    expect(d.kind).toBe('map scatter');
    expect(d.summary).toBe(
      'Map scatter "Cities": 3 points. Longitude −73.9857° to 2.3522°, latitude 40.7484° to 48.8566°. 1 point without a position.',
    );
    expect(d.table).toMatchObject({
      caption: 'Cities',
      columns: ['longitude', 'latitude', 'text'],
      rows: [
        ['−73.9857°', '40.7484°', 'New York'],
        ['2.3522°', '48.8566°', 'Paris'],
      ],
      total: 3,
    });
    expect(d.table!.row!(2)).toEqual(['', '', 'nowhere']);
    const kind = (trace: Trace): string | undefined =>
      scattergeo.describe!({
        trace: trace as never,
        calc: { lon: new Float64Array(0), lat: new Float64Array(0), length: 0 } as ScattergeoCalc,
        index: 0,
        fullLayout: f.fullLayout,
        xaxis: undefined,
        yaxis: undefined,
        maxRows: 10,
      })?.kind;
    expect(kind({ mode: 'lines' })).toBe('map line');
    expect(kind({ mode: 'lines', fill: 'toself' })).toBe('map area');
  });
});

describe('scattergeo keyboard stops (TraceModule.a11y)', () => {
  it('visits the points on the map in data order', async () => {
    const f = figure(
      {
        lon: [60, 180, 0, null, 0, -60],
        lat: [0, 0, 30, 0, 30, -20],
        text: ['a', 'far', 'b', 'gap', 'c', 'd'],
      },
      GLOBE,
    );
    const parts = await scattergeo.a11y!();
    const stops = parts['scattergeo']!.keyboardPoints!(
      f.calcs[0]! as never,
      f.fullData[0]!,
      hoverContext(f),
    ) as { pointIndex: number; hoverText: string; px: number; py: number }[];
    // Two points share a spot: each is still a stop, with its own label.
    expect(stops.map((p) => p.pointIndex)).toEqual([0, 2, 4, 5]);
    expect(stops.map((p) => p.hoverText)).toEqual([
      '(0°, 60°)<br>a',
      '(30°, 0°)<br>b',
      '(30°, 0°)<br>c',
      '(−20°, −60°)<br>d',
    ]);
    const [cx, cy] = containerPoint(f.subplot(), 60, 0);
    expect(stops[0]!.px).toBeCloseTo(cx, 6);
    expect(stops[0]!.py).toBeCloseTo(FIGURE.height - cy, 6);
    // Points panned out of the part of the subplot that draws are not stops.
    const sp = f.subplot();
    const state = sp.view!.state;
    sp.view!.set({ scale: 3, translate: [state.translate[0] - 500, state.translate[1]] });
    const visible = parts['scattergeo']!.keyboardPoints!(
      f.calcs[0]! as never,
      f.fullData[0]!,
      hoverContext(f),
    ) as { pointIndex: number }[];
    expect(visible.map((p) => p.pointIndex)).toEqual([0]);
    expect(subplotFrame(sp, FIGURE.height).transform.scaleX).toBeCloseTo(3, 9);
  });
});

describe('scattergeo view keys (TraceModule.a11y, GEO6)', () => {
  const keys = async (f: LaidOutFigure, index = 0) => {
    const parts = (await scattergeo.a11y!())['scattergeo']!;
    const trace = f.fullData[index]!;
    return (action: string) => {
      const update = parts.keyboardView!(trace, hoverContext(f), action);
      return {
        update,
        say: update && parts.keyboardViewSay!(trace, hoverContext(f), action, update),
      };
    };
  };

  it('pans, turns and zooms with the relayout of the gesture, and says where the view is', async () => {
    const points = { lon: [0, 20], lat: [0, 10] };
    // A scoped map pans: the centre moves, a tenth of the rect per press.
    const europe = figure(points, { scope: 'europe', fitbounds: false });
    const pan = (await keys(europe))('panRight');
    expect(Object.keys(pan.update!).sort()).toEqual(['geo.center.lat', 'geo.center.lon']);
    const sp = europe.subplot();
    const [x, y] = sp.view!.midPoint;
    expect(pan.update).toEqual(
      dragGeoView(sp.view!, [x, y], [x - sp.clipRect.width / 10, y]).relayout,
    );
    expect(pan.say![0]).toBe(VIEW_TEMPLATE);
    const centre = pan.update as Record<string, number>;
    expect(pan.say![1]).toEqual({
      lon: geoLabel(europe.fullLayout, Math.round(centre['geo.center.lon']! * 10) / 10),
      lat: geoLabel(europe.fullLayout, Math.round(centre['geo.center.lat']! * 10) / 10),
      scale: '1',
    });
    // A world map turns in longitude.
    const world = figure(points, FLAT);
    const turn = (await keys(world))('panLeft');
    // A tenth of 800 px for 360°; the range box is clipped a hair inside the sphere.
    const turned = turn.update as Record<string, number>;
    expect(turned['geo.projection.rotation.lon']).toBeCloseTo(-36, 2);
    expect(turned['geo.center.lon']).toBe(turned['geo.projection.rotation.lon']);
    expect(turn.say![1]).toEqual({ lon: '−36', lat: '0', scale: '1' });
    // A globe turns in longitude and latitude, and is centered on its rotation.
    const globe = figure(points, GLOBE);
    const up = (await keys(globe))('panUp');
    expect(Object.keys(up.update!)).toEqual(['geo.projection.rotation.lat']);
    const lat = (up.update as Record<string, number>)['geo.projection.rotation.lat']!;
    expect(lat).toBeGreaterThan(5);
    expect(up.say![1]).toEqual({
      lon: '0',
      lat: geoLabel(globe.fullLayout, Math.round(lat * 10) / 10),
      scale: '1',
    });
    // `+` and `-` zoom about the middle.
    const zoom = (await keys(world))('zoomIn');
    expect(zoom.update).toEqual({ 'geo.projection.scale': 1.25 });
    expect(zoom.say![1]).toEqual({ lon: '0', lat: '0', scale: '1.25' });
    expect((await keys(world))('zoomOut').update).toEqual({ 'geo.projection.scale': 0.8 });
  });

  it('keeps the scale inside minscale and maxscale, and does nothing at the limit', async () => {
    const f = figure(
      { lon: [0], lat: [0] },
      { ...FLAT, projection: { type: 'equirectangular', scale: 2, maxscale: 2 } },
    );
    const press = await keys(f);
    expect(press('zoomIn')).toEqual({ update: undefined, say: undefined });
    expect(press('zoomOut').update).toEqual({ 'geo.projection.scale': 1.6 });
  });

  it('resets to the view the geo component saved, with the keys of a double-click', async () => {
    const f = figure(
      { lon: [0], lat: [0] },
      { ...GLOBE, projection: { type: 'orthographic', rotation: { lon: 30 } } },
    );
    const press = await keys(f);
    // Not drawn yet: there is no first view to go back to.
    expect(press('reset').update).toBeUndefined();
    const sp = f.subplot();
    sp.initial = saveGeoViewInitial(sp.layout);
    const reset = press('reset');
    expect(reset.update).toEqual(geoResetRelayout(sp.initial));
    expect(reset.update).toMatchObject({
      'geo.projection.rotation.lon': 30,
      'geo.fitbounds': false,
    });
    // The runtime's "View reset.": what the first view was is known when it is drawn again.
    expect(reset.say).toBeUndefined();
  });

  it('moves the subplot of its trace, with that subplot’s keys', async () => {
    const f = figure(
      [
        { lon: [0], lat: [0] },
        { lon: [0], lat: [0], geo: 'geo2' },
      ],
      { ...FLAT, domain: { x: [0, 0.5] } },
      { geo2: { ...GLOBE, domain: { x: [0.5, 1] } } },
    );
    expect(Object.keys((await keys(f, 1))('panRight').update!)).toEqual([
      'geo2.projection.rotation.lon',
    ]);
    expect(Object.keys((await keys(f, 0))('zoomIn').update!)).toEqual(['geo.projection.scale']);
    // Another key, or a subplot without a view: nothing.
    expect((await keys(f))('left').update).toBeUndefined();
  });
});
