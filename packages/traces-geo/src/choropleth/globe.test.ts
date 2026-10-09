/**
 * `choropleth` on a 3D globe (backlog GEO8, ADR-028): the regions as a mesh on the sphere with a
 * color per vertex, raised into prisms by `elevation`, their outlines, the redraw rules (a
 * rotation builds nothing), GPU picking through a fake picker, hover anchors, event data and the
 * switch between the flat map and the globe.
 *
 * The basemap is a stub with small hand-made layers. The view draws real primitives into real
 * viewports (they need no WebGL until a frame is rendered).
 */
import {
  loadLinesMarkers3D,
  type LazyMeshPrimitive,
  type Line3D,
  type Line3DData,
  type MeshData,
  type PickResult,
  type Primitive,
  type Viewport,
} from '@mk7s/holochart-render';
import type { TraceUpdatePlan } from '@mk7s/holochart-runtime';
import { Matrix4 } from 'three';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBasemap, peekBasemap, type BasemapOptions } from '../basemap/index.ts';
import { loadGlobe, type GlobeModule } from '../geo/globe-loader.ts';
import {
  hasGlobePicker,
  REST_MS,
  setGlobePickerFactory,
  type GlobePicker,
} from '../geo/globe-pick.ts';
import { globeScene } from '../geo/globe-scene.ts';
import { clearLocationData } from '../geo/location-data.ts';
import type { BasemapLayers } from '../geo/types.ts';
import {
  containerPoint,
  FIGURE,
  hoverContext as scattergeoHoverContext,
  hoverQuery,
} from '../scattergeo/__testing__/figure.ts';
import {
  layoutFigure,
  plotContext,
  type LaidOutFigure,
  type PlotHarness,
} from './__testing__/figure.ts';
import { DEFAULT_ELEVATION_SCALE } from './attributes.ts';
import { describeChoropleth } from './describe.ts';
import {
  LINE_LIFT,
  MAX_ELEVATION_SCALE,
  outlineOfMesh,
  regionHeights,
  surfaceIndices,
} from './globe.ts';
import { globeRegionsOf } from './globe-state.ts';
import { choropleth } from './index.ts';
import { CHOROPLETH_LAYER, choroplethOrder } from './plot.ts';

vi.mock('../basemap/index.ts', () => ({
  peekBasemap: vi.fn(),
  loadBasemap: vi.fn(),
}));

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

/** Label points of the stub's features. */
const AT = {
  FRA: [2, 47],
  USA: [-100, 40],
  BRA: [-53, -10],
  JPN: [138, 37],
  RUS: [175, 65],
} as const;

/**
 * The stub basemap: France, Brazil and Japan are squares of 10° around their label points, the
 * USA is a multipolygon (a square around its label point and "Alaska" at −155…−145°, 60…70°),
 * and Russia crosses the antimeridian: 170°E to 170°W, 60° to 70°N.
 */
function basemap(): BasemapLayers {
  const feature = (id: keyof typeof AT, name: string, geometry: object) => ({
    type: 'Feature' as const,
    id,
    properties: { name, ct: [...AT[id]] as [number, number] },
    geometry,
  });
  const around = (id: keyof typeof AT) => ({
    type: 'Polygon' as const,
    coordinates: [square(AT[id][0] - 5, AT[id][1] - 5, 10)],
  });
  return {
    countries: [
      feature('FRA', 'France', around('FRA')),
      feature('USA', 'United States of America', {
        type: 'MultiPolygon',
        coordinates: [[square(-105, 35, 10)], [square(-155, 60, 10)]],
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
    ],
  } as unknown as BasemapLayers;
}

const keyOf = (resolution: number, scope: string, o: BasemapOptions = {}): string =>
  `${resolution}|${scope}|${o.extras ? 1 : 0}|${o.url ?? ''}`;

let globe: GlobeModule;

beforeAll(async () => {
  globe = await loadGlobe();
});

beforeEach(() => {
  clearLocationData();
  const layers = basemap();
  vi.mocked(peekBasemap).mockReset();
  vi.mocked(loadBasemap).mockReset();
  vi.mocked(peekBasemap).mockImplementation((resolution, scope, o) =>
    keyOf(resolution, scope, o) === keyOf(110, 'world') ? layers : undefined,
  );
  vi.mocked(loadBasemap).mockImplementation(() => Promise.resolve(layers));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  setGlobePickerFactory(undefined);
});

/** A globe turned to (0°, 0°): France and Brazil in front, Japan and Russia behind. */
const GLOBE = { projection: { type: 'globe3d' }, fitbounds: false };
const ORTHOGRAPHIC = { projection: { type: 'orthographic' }, fitbounds: false };
/** Blue at the bottom of the domain, red at the top. */
const BLUE_RED = [
  [0, 'rgb(0, 0, 255)'],
  [1, 'rgb(255, 0, 0)'],
];
const ALL = ['FRA', 'USA', 'BRA', 'JPN', 'RUS'];

function figure(trace: Trace, geo: Trace = GLOBE, chart?: object): LaidOutFigure {
  return layoutFigure(
    { data: [{ type: 'choropleth', ...trace }], layout: { geo } } as never,
    chart,
  );
}

const PASS: TraceUpdatePlan = { calc: false, plot: true, style: true, transform: false };
const RECALC: TraceUpdatePlan = { calc: true, plot: true, style: true, transform: false };

const ORDER = choroplethOrder(0);
const PRISM_ORDER = ORDER + (CHOROPLETH_LAYER.fill + CHOROPLETH_LAYER.line) / 2;

function at<P extends Primitive<unknown>>(h: PlotHarness, order: number): P | undefined {
  return [...h.added.keys()].find((p) => Math.abs(p.object.renderOrder - order) < 1e-9) as
    P | undefined;
}

/** Wait for everything the view holds `chart.ready` with: the chunks, then the meshes. */
async function settle(h: PlotHarness): Promise<void> {
  const seen = new Set<unknown>();
  for (;;) {
    const pending = [...h.added.keys()]
      .map((p) => (p as { ready?: unknown }).ready)
      .filter((r) => r instanceof Promise && !seen.has(r));
    if (pending.length === 0) return;
    for (const r of pending) seen.add(r);
    await Promise.all(pending);
  }
}

/** The view of the figure's choropleth on real viewports, drawn, and what it drew. */
async function drawn(f: LaidOutFigure) {
  const h = plotContext(f, 0, { real: true });
  const view = choropleth.plot!.create(h.ctx);
  await settle(h);
  const parts = () => ({
    surface: at<LazyMeshPrimitive>(h, ORDER + CHOROPLETH_LAYER.fill),
    prisms: at<LazyMeshPrimitive>(h, PRISM_ORDER),
    line: at<Line3D>(h, ORDER + CHOROPLETH_LAYER.line),
  });
  const viewport = h.viewports.get('geo-globe') as unknown as Viewport;
  return { h, view, parts, viewport };
}

/** The data a mesh primitive holds. */
const dataOf = (p: LazyMeshPrimitive): Readonly<MeshData> => p.mesh!.data;

/** Longitude and latitude (degrees) of vertex `v` of `positions`, and its radius. */
function lonLatOf(positions: Float32Array, v: number): [number, number, number] {
  const x = positions[3 * v]!;
  const y = positions[3 * v + 1]!;
  const z = positions[3 * v + 2]!;
  const r = Math.hypot(x, y, z);
  return [(Math.atan2(x, z) * 180) / Math.PI, (Math.asin(y / r) * 180) / Math.PI, r];
}

/** The colors of a mesh's vertices by the location they belong to. */
function colorsByLocation(
  f: LaidOutFigure,
  color: Float32Array,
  featureOf: Uint32Array,
): Map<number, Set<string>> {
  const index = f.calcs[0]!.drawn!.index;
  const out = new Map<number, Set<string>>();
  for (let v = 0; v < featureOf.length; v++) {
    const i = index[featureOf[v]!]!;
    const rgba = Array.from(color.subarray(4 * v, 4 * v + 4), (c) => c.toFixed(4)).join(',');
    out.set(i, (out.get(i) ?? new Set()).add(rgba));
  }
  return out;
}

/** The mesh the view built for the figure's regions (the builder is deterministic). */
const meshOf = (f: LaidOutFigure) => globe.buildSphereMesh(f.calcs[0]!.drawn!.features);

describe('the attributes of the globe (Holochart extras)', () => {
  it('coerces elevation, and elevationscale only with it', () => {
    const plain = figure({ locations: ALL, z: [1, 2, 3, 4, 5] }).fullData[0]!;
    expect(plain['elevation']).toBeUndefined();
    expect(plain['elevationscale']).toBeUndefined();
    const raised = figure({ locations: ALL, z: [1, 2, 3, 4, 5], elevation: [1, 2, 3, 4, 5] });
    expect(raised.fullData[0]!['elevationscale']).toBe(DEFAULT_ELEVATION_SCALE);
    expect(Array.from(raised.calcs[0]!.elevation!)).toEqual([1, 2, 3, 4, 5]);
    const scaled = figure({
      locations: ALL,
      z: [1, 2, 3, 4, 5],
      elevation: [1],
      elevationscale: 0.5,
    });
    expect(scaled.fullData[0]!['elevationscale']).toBe(0.5);
  });

  it('gives the largest elevation the scale, capped at one radius, and leaves the rest flat', () => {
    const f = figure({
      locations: ALL,
      z: [1, 2, 3, 4, 5],
      elevation: [10, 5, 0, -3, 'x'],
    });
    const heights = regionHeights(f.calcs[0]!, f.fullData[0]!, f.calcs[0]!.drawn!)!;
    expect(Array.from(heights)).toEqual([0.25, 0.125, 0, 0, 0]);
    const capped = figure({
      locations: ALL,
      z: [1, 2, 3, 4, 5],
      elevation: [4, 1],
      elevationscale: 7,
    });
    expect(
      Array.from(regionHeights(capped.calcs[0]!, capped.fullData[0]!, capped.calcs[0]!.drawn!)!),
    ).toEqual([MAX_ELEVATION_SCALE, MAX_ELEVATION_SCALE / 4, 0, 0, 0]);
    // Nothing above 0: nothing is raised.
    const none = figure({ locations: ALL, z: [1, 2, 3, 4, 5], elevation: [0, -1, null] });
    expect(regionHeights(none.calcs[0]!, none.fullData[0]!, none.calcs[0]!.drawn!)).toBeUndefined();
    const zero = figure({
      locations: ALL,
      z: [1, 2, 3, 4, 5],
      elevation: [1, 2],
      elevationscale: 0,
    });
    expect(regionHeights(zero.calcs[0]!, zero.fullData[0]!, zero.calcs[0]!.drawn!)).toBeUndefined();
  });
});

describe('choropleth on a globe: the surface', () => {
  it('draws one mesh in the globe’s 3D viewport, on the globe, that writes no depth', async () => {
    const f = figure({ locations: ALL, z: [1, 2, 3, 4, 5], colorscale: BLUE_RED });
    const { h, parts, viewport } = await drawn(f);
    const { surface, prisms, line } = parts();
    expect(surface).toBeDefined();
    expect(prisms).toBeUndefined();
    expect(line).toBeDefined();
    expect(viewport.kind).toBe('3d');
    expect(h.added.get(surface!)).toBe(viewport);
    // Under the globe's group, whose matrix the subplot keeps; its own transform is the identity.
    expect(surface!.object.parent).toBe(globeScene(viewport).group);
    expect(line!.object.parent).toBe(globeScene(viewport).group);
    expect(surface!.object.matrix.equals(new Matrix4())).toBe(true);
    const data = dataOf(surface!);
    // On the surface: it tests depth (a prism in front hides it) and writes none.
    expect(data.depthTest).toBe(true);
    expect(data.depthWrite).toBe(false);
    expect(data.depthWrite).toBe(false);
    expect(data.side).toBe('front');
    const mesh = meshOf(f);
    expect(data.positions).toHaveLength(mesh.vertexCount * 3);
    expect(Array.from(data.indices!)).toEqual(Array.from(mesh.indices));
    // The 2D map's primitives are not drawn.
    expect(h.viewports.get('geo')).toBeUndefined();
  });

  it('colors every vertex of a region alike: a multipolygon, a region across the antimeridian', async () => {
    const f = figure({ locations: ALL, z: [1, 2, 3, 4, 5], colorscale: BLUE_RED });
    const { parts } = await drawn(f);
    const data = dataOf(parts().surface!);
    const mesh = meshOf(f);
    const colors = colorsByLocation(f, data.color as Float32Array, mesh.featureOf);
    // z 1…5 on blue → red.
    const expected = [0, 0.25, 0.5, 0.75, 1].map(
      (t) => `${t.toFixed(4)},0.0000,${(1 - t).toFixed(4)},1.0000`,
    );
    for (let i = 0; i < 5; i++) expect([...colors.get(i)!], ALL[i]).toEqual([expected[i]]);
    // The USA's two polygons and Russia's two sides of the antimeridian are in the mesh.
    const lons = (i: number): number[] => {
      const k = Array.from(f.calcs[0]!.drawn!.index).indexOf(i);
      const out: number[] = [];
      for (let v = 0; v < mesh.vertexCount; v++) {
        if (mesh.featureOf[v] === k) out.push(lonLatOf(mesh.positions, v)[0]);
      }
      return out;
    };
    expect(Math.min(...lons(1))).toBeCloseTo(-155, 3);
    expect(Math.max(...lons(1))).toBeCloseTo(-95, 3);
    expect(lons(4).some((lon) => lon > 170 - 1e-3)).toBe(true);
    expect(lons(4).some((lon) => lon < -170 + 1e-3)).toBe(true);
  });

  it('multiplies the region opacity into the alpha, and dims what a selection leaves out', async () => {
    const f = figure({
      locations: ALL,
      z: [1, 2, 3, 4, 5],
      colorscale: BLUE_RED,
      opacity: 0.5,
      marker: { opacity: [1, 0.5, 1, 1, 1] },
    });
    const { h, view, parts } = await drawn(f);
    const mesh = meshOf(f);
    const alpha = (): number[] => {
      const data = dataOf(parts().surface!);
      expect(data.opacity).toBe(0.5);
      const by = colorsByLocation(f, data.color as Float32Array, mesh.featureOf);
      return [0, 1, 2, 3, 4].map((i) => Number([...by.get(i)!][0]!.split(',')[3]));
    };
    expect(alpha()).toEqual([1, 0.5, 1, 1, 1]);
    view.update({ ...h.ctx, selectedPoints: [0, 1] }, { ...PASS, selection: true });
    expect(alpha()).toEqual([1, 0.5, 0.2, 0.2, 0.2]);
  });

  it('draws nothing in a stand-in viewport of a hand-built context', async () => {
    const f = figure({ locations: ALL, z: [1, 2, 3, 4, 5] });
    const h = plotContext(f);
    expect(() => choropleth.plot!.create(h.ctx)).not.toThrow();
    await settle(h);
    expect(h.added.size).toBe(0);
  });
});

describe('choropleth on a globe: the redraw rules', () => {
  it('builds nothing and uploads nothing when the globe turns, zooms or moves', async () => {
    const f = figure({
      locations: ALL,
      z: [1, 2, 3, 4, 5],
      elevation: [3, 1, 2, 0, 0],
    });
    const { h, view, parts, viewport } = await drawn(f);
    const { surface, prisms, line } = parts();
    const builders = (
      ['buildSphereMesh', 'buildPrisms', 'buildSphereLines', 'buildArcs'] as const
    ).map((name) => vi.spyOn(globe, name));
    const updates = [surface!, prisms!, line!].map((p) => vi.spyOn(p, 'update'));
    const transforms = [surface!, prisms!, line!].map((p) => vi.spyOn(p, 'setTransform'));
    const sp = f.subplot();
    const group = globeScene(viewport).group;
    const before = group.matrix.clone();
    const count = h.added.size;

    sp.view!.set({ rotation: { lon: 40, lat: 20 } });
    sp.notify();
    sp.view!.set({ scale: sp.view!.state.scale * 2 });
    sp.notify();
    sp.view!.set({ rotation: { lon: -75, lat: -10, roll: 15 } });
    sp.notify();

    // The globe moved: one matrix.
    expect(group.matrix.equals(before)).toBe(false);
    for (const spy of [...builders, ...updates, ...transforms]) expect(spy).not.toHaveBeenCalled();
    expect(h.added.size).toBe(count);
    expect(parts().surface).toBe(surface);
    expect(h.invalidate.calls).toBeGreaterThan(0);

    // The relayout that ends the gesture: a pass over the same regions writes colors, no geometry.
    f.layout();
    view.update({ ...h.ctx, calc: f.calcs[0]! }, PASS);
    for (const spy of builders) expect(spy).not.toHaveBeenCalled();
    for (const spy of updates.slice(0, 2)) {
      for (const [patch] of spy.mock.calls) {
        expect(Object.keys(patch as object).sort()).toEqual(['color', 'opacity']);
      }
    }
    for (const [patch] of updates[2]!.mock.calls) {
      expect('x' in (patch as object)).toBe(false);
    }
    expect(parts().surface).toBe(surface);
  });

  it('rewrites colors only for a restyle of z, the colorscale or the opacity', async () => {
    const f = figure({ locations: ALL, z: [1, 2, 3, 4, 5], colorscale: BLUE_RED });
    const { h, view, parts } = await drawn(f);
    const surface = parts().surface!;
    const build = vi.spyOn(globe, 'buildSphereMesh');
    const update = vi.spyOn(surface, 'update');
    // New numbers in the same places: a new calc over the same drawn regions.
    const next = figure({ locations: ALL, z: [5, 4, 3, 2, 1], colorscale: BLUE_RED });
    expect(next.calcs[0]!.drawn).toBe(f.calcs[0]!.drawn);
    view.update({ ...h.ctx, trace: next.fullData[0]!, calc: next.calcs[0]! }, RECALC);
    expect(build).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
    expect(Object.keys(update.mock.calls[0]![0]).sort()).toEqual(['color', 'opacity']);
    const mesh = meshOf(next);
    const colors = colorsByLocation(next, dataOf(surface).color as Float32Array, mesh.featureOf);
    expect([...colors.get(0)!]).toEqual(['1.0000,0.0000,0.0000,1.0000']);
    expect([...colors.get(4)!]).toEqual(['0.0000,0.0000,1.0000,1.0000']);
    expect(parts().surface).toBe(surface);
  });

  it('builds the mesh again when other regions are drawn', async () => {
    const f = figure({ locations: ALL, z: [1, 2, 3, 4, 5] });
    const { h, view, parts } = await drawn(f);
    const surface = parts().surface!;
    const build = vi.spyOn(globe, 'buildSphereMesh');
    const next = figure({ locations: ALL, z: [1, null, 3, 4, 5] });
    view.update({ ...h.ctx, trace: next.fullData[0]!, calc: next.calcs[0]! }, RECALC);
    expect(build).toHaveBeenCalledTimes(1);
    expect(parts().surface).toBe(surface);
    expect(dataOf(surface).positions).toHaveLength(meshOf(next).vertexCount * 3);
  });
});

describe('choropleth on a globe: prisms', () => {
  it('raises the regions with an elevation above 0 and leaves the others on the surface', async () => {
    const f = figure({
      locations: ALL,
      z: [1, 2, 3, 4, 5],
      colorscale: BLUE_RED,
      elevation: [4, 2, 0, -1, null],
      elevationscale: 0.4,
    });
    const { parts, viewport } = await drawn(f);
    const { surface, prisms } = parts();
    expect(prisms).toBeDefined();
    expect(prisms!.object.parent).toBe(globeScene(viewport).group);
    const mesh = meshOf(f);
    const data = dataOf(prisms!);
    // A lit mesh that tests and writes depth, front faces only.
    expect(data.depthTest).toBe(true);
    expect(data.depthWrite).toBe(true);
    expect(data.side).toBe('front');
    const built = globe.buildPrisms(mesh, [0.4, 0.2, 0, 0, 0], { raisedOnly: true });
    expect(Array.from(data.positions)).toEqual(Array.from(built.positions));
    expect(Array.from(data.indices!)).toEqual(Array.from(built.indices));
    // The caps are at the heights: France 0.4 radii up, the USA 0.2.
    const raised = new Map<number, Set<string>>();
    for (const v of data.indices!) {
      if (v >= built.capVertexCount) continue;
      const k = built.featureOf[v]!;
      raised.set(k, (raised.get(k) ?? new Set()).add(lonLatOf(data.positions, v)[2].toFixed(4)));
    }
    expect([...raised.keys()].sort()).toEqual([0, 1]);
    expect([...raised.get(0)!]).toEqual(['1.4000']);
    expect([...raised.get(1)!]).toEqual(['1.2000']);
    // Caps and walls in the region's color.
    const colors = colorsByLocation(f, data.color as Float32Array, built.featureOf);
    expect([...colors.get(0)!]).toEqual(['0.0000,0.0000,1.0000,1.0000']);
    expect([...colors.get(1)!]).toEqual(['0.2500,0.0000,0.7500,1.0000']);
    // The surface has the regions that are not raised, and only those.
    const flat = new Set<number>();
    for (const v of dataOf(surface!).indices!) flat.add(mesh.featureOf[v]!);
    expect([...flat].sort()).toEqual([2, 3, 4]);
    expect(Array.from(dataOf(surface!).indices!)).toEqual(
      Array.from(surfaceIndices(mesh, Float64Array.of(0.4, 0.2, 0, 0, 0))),
    );
    // Between the surface and the outlines.
    expect(prisms!.object.renderOrder).toBeGreaterThan(surface!.object.renderOrder);
    expect(prisms!.object.renderOrder).toBeLessThan(parts().line!.object.renderOrder);
  });

  it('builds the prisms again, and nothing else, when the elevation changes', async () => {
    const base = { locations: ALL, z: [1, 2, 3, 4, 5] };
    const f = figure({ ...base, elevation: [4, 2, 0, 0, 0] });
    const { h, view, parts } = await drawn(f);
    const { surface, prisms } = parts();
    const mesh = vi.spyOn(globe, 'buildSphereMesh');
    const build = vi.spyOn(globe, 'buildPrisms');
    const surfaceUpdate = vi.spyOn(surface!, 'update');
    const prismUpdate = vi.spyOn(prisms!, 'update');
    const step = (trace: Trace, plan = RECALC): LaidOutFigure => {
      const next = figure({ ...base, ...trace });
      view.update({ ...h.ctx, trace: next.fullData[0]!, calc: next.calcs[0]! }, plan);
      return next;
    };

    // Other heights for the same regions: new prisms, the surface keeps its index.
    step({ elevation: [1, 2, 0, 0, 0] });
    expect(mesh).not.toHaveBeenCalled();
    expect(build).toHaveBeenCalledTimes(1);
    expect(Object.keys(prismUpdate.mock.calls[0]![0])).toContain('positions');
    expect(Object.keys(surfaceUpdate.mock.calls[0]![0]).sort()).toEqual(['color', 'opacity']);

    // The scale alone.
    step({ elevation: [1, 2, 0, 0, 0], elevationscale: 0.5 }, PASS);
    expect(build).toHaveBeenCalledTimes(2);
    const tallest = Math.max(
      ...Array.from(
        { length: dataOf(prisms!).positions.length / 3 },
        (_, v) => lonLatOf(dataOf(prisms!).positions, v)[2],
      ),
    );
    expect(tallest).toBeCloseTo(1.5, 5);

    // The same elevation again: nothing is built.
    step({ elevation: [1, 2, 0, 0, 0], elevationscale: 0.5 }, PASS);
    expect(build).toHaveBeenCalledTimes(2);

    // Another region rises: the surface gives its triangles up.
    surfaceUpdate.mockClear();
    step({ elevation: [1, 2, 3, 0, 0], elevationscale: 0.5 });
    expect(build).toHaveBeenCalledTimes(3);
    expect(Object.keys(surfaceUpdate.mock.calls[0]![0]).sort()).toEqual([
      'color',
      'indices',
      'opacity',
    ]);
    expect(mesh).not.toHaveBeenCalled();

    // No elevation: the prisms go, the surface has every region again.
    const flat = step({});
    expect(parts().prisms).toBeUndefined();
    expect(mesh).not.toHaveBeenCalled();
    expect(Array.from(dataOf(surface!).indices!)).toEqual(Array.from(meshOf(flat).indices));
  });
});

describe('choropleth on a globe: outlines', () => {
  /** The polylines of a line's geometry as `[lon, lat, radius]` per vertex. */
  function polylines(data: Partial<Line3DData>): [number, number, number][][] {
    const { x, y, z, starts } = data as Required<Pick<Line3DData, 'x' | 'y' | 'z' | 'starts'>>;
    const cuts = [0, ...Array.from(starts as ArrayLike<number>), x.length];
    const out: [number, number, number][][] = [];
    for (let k = 0; k + 1 < cuts.length; k++) {
      const line: [number, number, number][] = [];
      for (let i = cuts[k]!; i < cuts[k + 1]!; i++) {
        const p = Float32Array.of(Number(x[i]), Number(y[i]), Number((z as ArrayLike<number>)[i]));
        line.push(lonLatOf(p, 0));
      }
      out.push(line);
    }
    return out;
  }

  it('chains the boundary of a mesh into closed rings, and leaves the antimeridian out', () => {
    const f = figure({ locations: ALL, z: [1, 2, 3, 4, 5] });
    const mesh = meshOf(f);
    const outline = outlineOfMesh(mesh);
    // Every boundary edge once: a polyline of n edges has n + 1 vertices.
    const lines = outline.starts.length + 1;
    expect(outline.vertexCount - lines).toBe(mesh.boundaryCount);
    const cuts = [0, ...outline.starts, outline.vertexCount];
    let closed = 0;
    let open = 0;
    for (let k = 0; k + 1 < cuts.length; k++) {
      const first = outline.vertex[cuts[k]!]!;
      const last = outline.vertex[cuts[k + 1]! - 1]!;
      if (first === last) closed++;
      else open++;
      // One region per polyline.
      const regions = new Set(outline.region.subarray(cuts[k]!, cuts[k + 1]!));
      expect(regions.size).toBe(1);
    }
    // France, Brazil, Japan and the USA's two polygons are rings. Russia, cut at ±180°, is two
    // open lines: its boundary less the cut.
    expect(closed).toBe(5);
    expect(open).toBe(2);
    for (let v = 0; v + 1 < outline.vertexCount; v++) {
      if (outline.starts.includes(v + 1)) continue;
      const a = lonLatOf(mesh.positions, outline.vertex[v]!);
      const b = lonLatOf(mesh.positions, outline.vertex[v + 1]!);
      const onSeam = (p: number[]) => Math.abs(Math.abs(p[0]!) - 180) < 1e-3;
      expect(onSeam(a) && onSeam(b), `edge ${v} along the antimeridian`).toBe(false);
    }
  });

  it('draws them just above the surface, depth-tested, and on the caps of raised regions', async () => {
    const m3d = await loadLinesMarkers3D();
    const create = vi.spyOn(m3d, 'createLine3D');
    const f = figure({
      locations: ALL,
      z: [1, 2, 3, 4, 5],
      elevation: [2, 0, 0, 0, 0],
      marker: { line: { color: ['red', 'lime', 'blue', 'white', 'black'], width: 2 } },
    });
    const { h, view, parts } = await drawn(f);
    expect(create).toHaveBeenCalledTimes(1);
    const [, data, options] = create.mock.calls[0]!;
    expect(options).toMatchObject({ depthTest: true });
    expect(data!.width).toBe(2);
    const outline = outlineOfMesh(meshOf(f));
    const lines = polylines(data!);
    expect(lines).toHaveLength(outline.starts.length + 1);
    // France's ring is on its cap, the others on the surface.
    const radii = new Map<number, Set<string>>();
    let v = 0;
    for (const line of lines) {
      for (const p of line) {
        const k = outline.region[v++]!;
        radii.set(k, (radii.get(k) ?? new Set()).add(p[2].toFixed(4)));
      }
    }
    expect([...radii.get(0)!]).toEqual([(1 + DEFAULT_ELEVATION_SCALE + LINE_LIFT).toFixed(4)]);
    for (const k of [1, 2, 3, 4]) expect([...radii.get(k)!]).toEqual([(1 + LINE_LIFT).toFixed(4)]);
    // A color per location.
    const color = data!.color as Float32Array;
    expect(color).toHaveLength(outline.vertexCount * 4);
    const first = outline.region.indexOf(0);
    expect(Array.from(color.subarray(4 * first, 4 * first + 4))).toEqual([1, 0, 0, 1]);

    // A restyle of the line: its style, not its geometry.
    const line = parts().line!;
    const update = vi.spyOn(line, 'update');
    const next = figure({
      locations: ALL,
      z: [1, 2, 3, 4, 5],
      elevation: [2, 0, 0, 0, 0],
      marker: { line: { color: 'black', width: 3 } },
    });
    view.update({ ...h.ctx, trace: next.fullData[0]!, calc: next.calcs[0]! }, PASS);
    expect(update).toHaveBeenCalledTimes(1);
    expect('x' in update.mock.calls[0]![0]).toBe(false);
    expect(update.mock.calls[0]![0]).toMatchObject({ width: 3, color: [0, 0, 0, 1] });

    // The elevation changes: the outline follows the cap.
    const flat = figure({ locations: ALL, z: [1, 2, 3, 4, 5], marker: { line: { width: 3 } } });
    view.update({ ...h.ctx, trace: flat.fullData[0]!, calc: flat.calcs[0]! }, RECALC);
    const moved = polylines(update.mock.calls.at(-1)![0]);
    expect(Math.max(...moved.flat().map((p) => p[2]))).toBeCloseTo(1 + LINE_LIFT, 5);

    // No width: no line.
    const none = figure({ locations: ALL, z: [1, 2, 3, 4, 5], marker: { line: { width: 0 } } });
    view.update({ ...h.ctx, trace: none.fullData[0]!, calc: none.calcs[0]! }, PASS);
    expect(parts().line).toBeUndefined();
  });
});

// ---- Picking ------------------------------------------------------------------------------------

/** A picker that answers when the test says so. */
function fakePicker() {
  const added: { id: number; viewport: Viewport; target: unknown; options: object }[] = [];
  const pending: { x: number; y: number; resolve(hits: PickResult[]): void }[] = [];
  let next = 1;
  const picker: GlobePicker & { disposed: boolean; cleared: Viewport[] } = {
    disposed: false,
    cleared: [],
    add(viewport, target, options = {}) {
      const existing = added.find((a) => a.target === target && a.viewport === viewport);
      if (existing) return existing.id;
      const id = next++;
      added.push({ id, viewport, target, options });
      return id;
    },
    remove(id) {
      const i = added.findIndex((a) => a.id === id);
      if (i >= 0) added.splice(i, 1);
      return i >= 0;
    },
    pickIn(_viewport, x, y) {
      return new Promise((resolve) => pending.push({ x, y, resolve }));
    },
    clearViewport(viewport) {
      picker.cleared.push(viewport);
    },
    dispose() {
      picker.disposed = true;
    },
  };
  return { picker, added, pending };
}

/** A hit of vertex `vertex` of the target registered with `key`. */
const hit = (key: number, vertex: number): PickResult => ({
  traceIndex: key,
  pointIndex: vertex,
  kind: 'vertex',
  distance: 0,
});

/** Let the queue's promise chain run. */
const tick = async (): Promise<void> => {
  for (let i = 0; i < 4; i++) await Promise.resolve();
};

describe('choropleth on a globe: hover through GPU picking', () => {
  function chartOf() {
    const root = {};
    return { root, chart: { resize: () => {}, refreshHover: vi.fn(), three: { root } } };
  }

  const hoverAt = (f: LaidOutFigure, cx: number, cy: number) =>
    choropleth.hoverPoints!(
      f.calcs[0]!,
      f.fullData[0]!,
      hoverQuery(cx, cy),
      scattergeoHoverContext(f as never),
    );

  /** A vertex of `featureOf` that belongs to drawn region `k`. */
  const vertexOf = (featureOf: Uint32Array, k: number): number => featureOf.indexOf(k);

  it('registers the meshes and the globe’s body, picks the pixel under the pointer, and hovers when the pick resolves', async () => {
    const fake = fakePicker();
    const made: object[] = [];
    setGlobePickerFactory((root) => {
      made.push(root);
      return fake.picker;
    });
    const { root, chart } = chartOf();
    const f = figure(
      {
        locations: ALL,
        z: [1, 2, 3, 4, 5],
        elevation: [2, 0, 0, 0, 0],
        text: ['a', 'b', 'c', 'd', 'e'],
      },
      GLOBE,
      chart,
    );
    const { parts, viewport } = await drawn(f);
    const { surface, prisms } = parts();
    expect(made).toEqual([root]);
    expect(hasGlobePicker(root)).toBe(true);
    // Both meshes, each with a key of its own; no occluder while the body is not drawn.
    expect(fake.added.map((a) => a.target)).toEqual([surface, prisms]);
    expect(fake.added.every((a) => a.viewport === viewport)).toBe(true);
    const keys = fake.added.map((a) => (a.options as { traceIndex: number }).traceIndex);
    expect(new Set(keys).size).toBe(2);

    // The body arrives (the geo component draws it): an occluder, never a hit.
    const body = new (await import('three')).Mesh();
    globeScene(viewport).body = body;
    const sp = f.subplot();
    const [bx, by] = containerPoint(sp, AT.BRA[0], AT.BRA[1]);
    expect(hoverAt(f, bx, by)).toEqual([]);
    expect(fake.added.at(-1)).toMatchObject({ target: body, options: { occludeOnly: true } });

    // One pick, of the pixel under the pointer; the answer comes later.
    expect(fake.pending).toHaveLength(1);
    expect(fake.pending[0]).toMatchObject({ x: bx, y: by });
    expect(hoverAt(f, bx, by)).toEqual([]);
    expect(fake.pending).toHaveLength(1);

    // Brazil is on the surface: a vertex of the surface mesh names it.
    const mesh = meshOf(f);
    fake.pending.shift()!.resolve([hit(keys[0]!, vertexOf(mesh.featureOf, 2))]);
    await tick();
    expect(chart.refreshHover).toHaveBeenCalledTimes(1);
    const brazil = hoverAt(f, bx, by);
    expect(brazil).toHaveLength(1);
    expect(brazil[0]).toMatchObject({
      pointIndex: 2,
      text: 'c',
      fields: { location: 'BRA', z: 3, elevation: 0 },
    });
    // Anchored at the feature's point, as on a flat map.
    expect(brazil[0]!.px).toBeCloseTo(bx, 6);
    expect(brazil[0]!.py).toBeCloseTo(FIGURE.height - by, 6);
    expect(fake.pending).toHaveLength(0);

    // France is raised: a vertex of the prisms' mesh (a wall's) names it.
    const built = globe.buildPrisms(mesh, [DEFAULT_ELEVATION_SCALE, 0, 0, 0, 0], {
      raisedOnly: true,
    });
    const [fx, fy] = containerPoint(sp, AT.FRA[0], AT.FRA[1]);
    // The answer of the pick before stands until this one resolves: the label does not blink.
    expect(hoverAt(f, fx, fy - 30)).toHaveLength(1);
    expect(fake.pending).toHaveLength(1);
    fake.pending.shift()!.resolve([hit(keys[1]!, built.vertexCount - 1)]);
    await tick();
    const france = hoverAt(f, fx, fy - 30);
    expect(france[0]).toMatchObject({
      pointIndex: 0,
      fields: { location: 'FRA', z: 1, elevation: 2 },
      labels: { z: '1', elevation: '2' },
    });
    // Anchored at the top of the prism: on the line from the globe's centre through the
    // feature's point, a quarter of the way further out.
    const [ox, oy] = containerPoint(sp, 0, 0);
    expect(france[0]!.px).toBeCloseTo(ox + (fx - ox) * (1 + DEFAULT_ELEVATION_SCALE), 4);
    expect(france[0]!.py).toBeCloseTo(
      FIGURE.height - (oy + (fy - oy) * (1 + DEFAULT_ELEVATION_SCALE)),
      4,
    );
    // The keyboard stop of the region is anchored there too.
    const a11y = await choropleth.a11y!();
    const stops = a11y['choropleth']!.keyboardPoints!(
      f.calcs[0]! as never,
      f.fullData[0]!,
      scattergeoHoverContext(f as never),
    ) as { pointIndex: number; px: number; py: number }[];
    const stop = stops.find((p) => p.pointIndex === 0)!;
    expect(stop.px).toBeCloseTo(france[0]!.px, 6);
    expect(stop.py).toBeCloseTo(france[0]!.py, 6);

    // Nothing drawn there: no hover.
    fake.pending.length = 0;
    const [ex, ey] = containerPoint(sp, 20, -40);
    hoverAt(f, ex, ey);
    fake.pending.shift()!.resolve([]);
    await tick();
    expect(hoverAt(f, ex, ey)).toEqual([]);
    // Outside the subplot nothing is asked.
    expect(hoverAt(f, 2, 2)).toEqual([]);
    expect(fake.pending).toHaveLength(0);
  });

  it('keeps one pick in flight, and the latest position waiting', async () => {
    const fake = fakePicker();
    setGlobePickerFactory(() => fake.picker);
    const f = figure({ locations: ALL, z: [1, 2, 3, 4, 5] }, GLOBE, chartOf().chart);
    await drawn(f);
    const sp = f.subplot();
    const [x, y] = containerPoint(sp, 0, 0);
    for (let d = 0; d < 5; d++) hoverAt(f, x + d, y);
    expect(fake.pending).toHaveLength(1);
    fake.pending.shift()!.resolve([]);
    await tick();
    // The newest of those that waited, and none of the ones between.
    expect(fake.pending).toHaveLength(1);
    expect(fake.pending[0]!.x).toBe(x + 4);
  });

  it('drops a pick of a view the globe has left, and asks again when the globe rests', async () => {
    vi.useFakeTimers();
    const fake = fakePicker();
    setGlobePickerFactory(() => fake.picker);
    const { chart } = chartOf();
    const f = figure({ locations: ALL, z: [1, 2, 3, 4, 5] }, GLOBE, chart);
    const { parts, viewport } = await drawn(f);
    const key = (fake.added[0]!.options as { traceIndex: number }).traceIndex;
    expect(fake.added[0]!.target).toBe(parts().surface);
    const mesh = meshOf(f);
    const sp = f.subplot();
    const [x, y] = containerPoint(sp, AT.BRA[0], AT.BRA[1]);
    hoverAt(f, x, y);
    fake.pending.shift()!.resolve([hit(key, mesh.featureOf.indexOf(2))]);
    await tick();
    expect(hoverAt(f, x, y)).toHaveLength(1);
    chart.refreshHover.mockClear();

    // The globe turns: what was picked is of the old view. The label hides at once.
    const version = globeScene(viewport).version;
    sp.view!.set({ rotation: { lon: 60 } });
    sp.notify();
    expect(globeScene(viewport).version).toBeGreaterThan(version);
    expect(chart.refreshHover).toHaveBeenCalledTimes(1);
    expect(hoverAt(f, x, y)).toEqual([]);
    // While it moves nothing is picked.
    sp.view!.set({ rotation: { lon: 70 } });
    sp.notify();
    expect(hoverAt(f, x, y)).toEqual([]);
    expect(fake.pending).toHaveLength(0);

    // At rest hover is run again, and picks the new view.
    vi.advanceTimersByTime(REST_MS);
    expect(chart.refreshHover).toHaveBeenCalledTimes(2);
    expect(hoverAt(f, x, y)).toEqual([]);
    expect(fake.pending).toHaveLength(1);

    // A pick that was in flight when the globe moved is not used.
    sp.view!.set({ rotation: { lon: 80 } });
    sp.notify();
    fake.pending.shift()!.resolve([hit(key, mesh.featureOf.indexOf(2))]);
    await tick();
    vi.advanceTimersByTime(REST_MS);
    expect(hoverAt(f, x, y)).toEqual([]);
    expect(fake.pending).toHaveLength(1);
  });

  it('lets go of the picker with the last globe view, and leaves nothing behind', async () => {
    const fake = fakePicker();
    setGlobePickerFactory(() => fake.picker);
    const { root, chart } = chartOf();
    const f = layoutFigure(
      {
        data: [
          { type: 'choropleth', locations: ['FRA', 'BRA'], z: [1, 2] },
          { type: 'choropleth', locations: ['USA', 'JPN'], z: [1, 2], elevation: [1, 2] },
        ],
        layout: { geo: GLOBE },
      } as never,
      chart,
    );
    const a = plotContext(f, 0, { real: true });
    const b = { ...plotContext(f, 1, { real: true }) };
    // Both traces draw in the one globe viewport, as in a chart.
    b.ctx = { ...b.ctx, subplotViewport: a.ctx.subplotViewport! };
    const first = choropleth.plot!.create(a.ctx);
    const second = choropleth.plot!.create(b.ctx);
    await settle(a);
    await settle(b);
    // One picker for the root; three meshes in it.
    expect(fake.added).toHaveLength(3);
    const viewport = a.viewports.get('geo-globe') as unknown as Viewport;
    globeScene(viewport).body = new (await import('three')).Mesh();
    const [x, y] = containerPoint(f.subplot(), 0, 0);
    choropleth.hoverPoints!(
      f.calcs[0]!,
      f.fullData[0]!,
      hoverQuery(x, y),
      scattergeoHoverContext(f as never),
    );
    expect(fake.added).toHaveLength(4);

    first.dispose?.();
    expect(fake.picker.disposed).toBe(false);
    expect(hasGlobePicker(root)).toBe(true);
    // The first trace's mesh is no longer picked; the second's are.
    expect(fake.added).toHaveLength(3);
    expect(globeRegionsOf(f.calcs[0]!)).toBeUndefined();

    second.dispose?.();
    expect(fake.added).toHaveLength(0);
    expect(fake.picker.cleared).toEqual([viewport]);
    expect(fake.picker.disposed).toBe(true);
    expect(hasGlobePicker(root)).toBe(false);
    // A pick that resolves after the views went is not delivered.
    for (const p of fake.pending) p.resolve([]);
    await tick();
    expect(chart.refreshHover).not.toHaveBeenCalled();
  });

  it('hits nothing for a chart without a render root', async () => {
    const f = figure({ locations: ALL, z: [1, 2, 3, 4, 5] });
    await drawn(f);
    const [x, y] = containerPoint(f.subplot(), AT.BRA[0], AT.BRA[1]);
    expect(hoverAt(f, x, y)).toEqual([]);
  });
});

describe('choropleth on a globe: events, selection and description', () => {
  it('carries the elevation in event data, on any projection', () => {
    for (const geo of [GLOBE, ORTHOGRAPHIC]) {
      const f = figure({ locations: ALL, z: [1, 2, 3, 4, 5], elevation: [7, 'x', 0] }, geo);
      const data = (i: number) => choropleth.eventData!(f.calcs[0]!, f.fullData[0]!, i);
      expect(data(0)).toMatchObject({ location: 'FRA', z: 1, elevation: 7 });
      expect(data(1)).toMatchObject({ location: 'USA', elevation: null });
      expect(data(2)).toMatchObject({ elevation: 0 });
      expect(data(4)).toMatchObject({ elevation: null });
    }
    const plain = figure({ locations: ALL, z: [1, 2, 3, 4, 5] });
    expect('elevation' in choropleth.eventData!(plain.calcs[0]!, plain.fullData[0]!, 0)).toBe(
      false,
    );
  });

  it('selects by the label point, as on the orthographic map', () => {
    const query = {
      kind: 'rect' as const,
      x: [0, FIGURE.width] as [number, number],
      y: [0, FIGURE.height] as [number, number],
    };
    const select = (geo: Trace) => {
      const f = figure({ locations: ALL, z: [1, 2, 3, 4, 5], elevation: [5, 4, 3, 2, 1] }, geo);
      return choropleth.selectPoints!(
        f.calcs[0]!,
        f.fullData[0]!,
        query,
        scattergeoHoverContext(f as never),
      );
    };
    // France and Brazil are on the near side.
    expect(select(GLOBE)).toEqual([0, 2]);
    expect(select(GLOBE)).toEqual(select(ORTHOGRAPHIC));
  });

  it('names the region with the largest elevation, and lists the elevations', () => {
    const f = figure({
      locations: ALL,
      z: [1, 2, 3, 4, 5],
      elevation: [1, 9, 3, 0, null],
      name: 'Index',
    });
    const d = describeChoropleth({
      trace: f.fullData[0]!,
      calc: f.calcs[0]!,
      index: 0,
      fullLayout: f.fullLayout,
      maxRows: 10,
    } as never);
    expect(d.summary).toContain(
      'Regions rise by elevation: highest at United States of America (9).',
    );
    expect(d.table!.columns).toEqual(['location', 'value', 'elevation']);
    expect(d.table!.rows[1]).toEqual(['USA', '2', '9']);
  });
});

describe('choropleth: between the flat map and the globe', () => {
  it('removes what the one drew and draws the other, both ways', async () => {
    const trace = { locations: ALL, z: [1, 2, 3, 4, 5], elevation: [1, 2, 0, 0, 0] };
    const flat = figure(trace, ORTHOGRAPHIC);
    const h = plotContext(flat, 0, { real: true });
    const view = choropleth.plot!.create(h.ctx);
    await settle(h);
    const flatViewport = h.viewports.get('geo');
    expect([...h.added.values()].every((vp) => vp === flatViewport)).toBe(true);
    expect(h.added.size).toBe(2);
    expect(h.viewports.has('geo-globe')).toBe(false);

    // To the globe: the 2D fill and line go, the meshes and the 3D line come.
    const round = figure(trace, GLOBE);
    const disposed = [...h.added.keys()].map((p) => vi.spyOn(p, 'dispose'));
    view.update({ ...h.ctx, trace: round.fullData[0]!, calc: round.calcs[0]! }, RECALC);
    await settle(h);
    for (const spy of disposed) expect(spy).toHaveBeenCalledTimes(1);
    const globeViewport = h.viewports.get('geo-globe');
    expect(h.added.size).toBe(3);
    expect([...h.added.values()].every((vp) => vp === globeViewport)).toBe(true);
    expect(globeRegionsOf(round.calcs[0]!)).toBeDefined();

    // And back.
    const again = figure(trace, ORTHOGRAPHIC);
    const gone = [...h.added.keys()].map((p) => vi.spyOn(p, 'dispose'));
    view.update({ ...h.ctx, trace: again.fullData[0]!, calc: again.calcs[0]! }, RECALC);
    await settle(h);
    for (const spy of gone) expect(spy).toHaveBeenCalledTimes(1);
    expect(h.added.size).toBe(2);
    expect([...h.added.values()].every((vp) => vp === h.viewports.get('geo'))).toBe(true);
    expect(globeRegionsOf(round.calcs[0]!)).toBeUndefined();
    // Hover is the flat map's again: by the polygons, at once.
    const [x, y] = containerPoint(again.subplot(), AT.BRA[0], AT.BRA[1]);
    const points = choropleth.hoverPoints!(
      again.calcs[0]!,
      again.fullData[0]!,
      hoverQuery(x, y),
      scattergeoHoverContext(again as never),
    );
    expect(points[0]).toMatchObject({ pointIndex: 2, fields: { elevation: 0 } });
  });
});

describe('a choropleth whose globe code cannot be loaded', () => {
  afterEach(() => {
    vi.doUnmock('../geo/globe-loader.ts');
    vi.resetModules();
  });

  it('warns once, draws nothing and leaves the chart ready', async () => {
    vi.resetModules();
    vi.doMock('../geo/globe-loader.ts', async (original) => ({
      ...(await original<typeof import('../geo/globe-loader.ts')>()),
      loadGlobe: () => Promise.reject(new Error('offline')),
    }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fresh = await import('./__testing__/figure.ts');
    const { choropleth: module } = await import('./index.ts');
    const draw = async () => {
      const f = fresh.layoutFigure({
        data: [{ type: 'choropleth', locations: ALL, z: [1, 2, 3, 4, 5] }],
        layout: { geo: GLOBE },
      } as never);
      const h = fresh.plotContext(f, 0, { real: true });
      const view = module.plot!.create(h.ctx);
      // The hold is there, and settles.
      expect(h.added.size).toBe(1);
      await settle(h as never);
      return { f, h, view };
    };
    const { f, h, view } = await draw();
    expect(h.added.size).toBe(0);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toMatch(/3D globe \('globe3d'\) could not be loaded/);
    // The next draw tries again, and says nothing more.
    view.update({ ...h.ctx, calc: f.calcs[0]! }, PASS);
    await settle(h as never);
    await draw();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
