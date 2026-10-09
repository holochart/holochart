/**
 * `scattergeo` on a 3D globe (backlog GEO8, ADR-028): the line as arcs lifted above the sphere,
 * the `toself` fill as a mesh on it, both built once and untouched by a rotation; markers on the
 * 2D path, on the pixel of their place on the sphere; `line.lift`; the switch between the flat
 * map and the globe; and hover, selection and `fitbounds`, which are the orthographic map's.
 *
 * The view draws real primitives into real viewports (they need no WebGL until a frame is
 * rendered).
 */
import {
  LinePrimitive,
  loadLinesMarkers3D,
  MarkerSet,
  type LazyMeshPrimitive,
  type Line3D,
  type Line3DData,
  type Primitive,
  type Viewport,
} from '@mk7s/holochart-render';
import type { TraceUpdatePlan } from '@mk7s/holochart-runtime';
import { Matrix4, Vector3 } from 'three';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { globePoint } from '../geo/globe-frame.ts';
import { loadGlobe, type GlobeModule } from '../geo/globe-loader.ts';
import { globeScene } from '../geo/globe-scene.ts';
import {
  FIGURE,
  hoverContext,
  hoverQuery,
  layoutFigure,
  plotContext,
  type LaidOutFigure,
  type PlotHarness,
} from './__testing__/figure.ts';
import { DEFAULT_LINE_LIFT } from './attributes.ts';
import { liftOf, MAX_LINE_LIFT, SURFACE_LIFT } from './globe.ts';
import { scattergeo } from './index.ts';
import { geoPath } from './lines.ts';
import { SCATTERGEO_LAYER, scattergeoOrder } from './plot.ts';
import { geoPositions } from './positions.ts';

type Trace = Record<string, unknown>;

let globe: GlobeModule;

beforeAll(async () => {
  globe = await loadGlobe();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** A globe turned to (0°, 0°). */
const GLOBE = { projection: { type: 'globe3d' }, fitbounds: false };
const ORTHOGRAPHIC = { projection: { type: 'orthographic' }, fitbounds: false };

/** New York, London, a gap, Dakar, São Paulo. */
const LON = [-74, 0, null, -17, -46];
const LAT = [41, 51, null, 15, -23];

function figure(trace: Trace, geo: Trace = GLOBE): LaidOutFigure {
  return layoutFigure({
    data: [{ type: 'scattergeo', lon: LON, lat: LAT, ...trace }],
    layout: { geo },
  } as never);
}

const PASS: TraceUpdatePlan = { calc: false, plot: true, style: true, transform: false };
const RECALC: TraceUpdatePlan = { calc: true, plot: true, style: true, transform: false };

const ORDER = scattergeoOrder(0);

function at<P extends Primitive<unknown>>(h: PlotHarness, layer: keyof typeof SCATTERGEO_LAYER) {
  const order = ORDER + SCATTERGEO_LAYER[layer];
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

async function drawn(f: LaidOutFigure) {
  const m3d = await loadLinesMarkers3D();
  const create = vi.spyOn(m3d, 'createLine3D');
  const h = plotContext(f, 0, { real: true });
  const view = scattergeo.plot!.create(h.ctx);
  await settle(h);
  const viewport = h.viewports.get('geo-globe') as unknown as Viewport;
  return { h, view, viewport, create };
}

/** The radius of each vertex of a line's geometry, and its polylines' lengths. */
function radii(data: Partial<Line3DData>): number[] {
  const { x, y, z } = data as { x: Float32Array; y: Float32Array; z: Float32Array };
  return Array.from(x, (_, i) => Math.hypot(x[i]!, y[i]!, z[i]!));
}

describe('scattergeo attributes of the globe (a Holochart extra)', () => {
  it('coerces line.lift with a line, to the lift of the globe’s arcs', () => {
    expect(DEFAULT_LINE_LIFT).toBe(globe.DEFAULT_LIFT);
    const line = figure({ mode: 'lines' }).fullData[0]!;
    expect((line['line'] as Trace)['lift']).toBe(DEFAULT_LINE_LIFT);
    const given = figure({ mode: 'lines+markers', line: { lift: 0.05 } }).fullData[0]!;
    expect((given['line'] as Trace)['lift']).toBe(0.05);
    const markers = figure({ mode: 'markers', line: { lift: 0.05 } }).fullData[0]!;
    expect((markers['line'] as Trace | undefined)?.['lift']).toBeUndefined();
    // Not below 0.
    const negative = figure({ mode: 'lines', line: { lift: -1 } }).fullData[0]!;
    expect((negative['line'] as Trace)['lift']).toBe(DEFAULT_LINE_LIFT);
  });

  it('caps the lift at an arc of one radius to the antipode, and keeps a filled trace down', () => {
    expect(liftOf(figure({ mode: 'lines' }).fullData[0]!)).toBe(DEFAULT_LINE_LIFT);
    expect(liftOf(figure({ mode: 'lines', line: { lift: 0 } }).fullData[0]!)).toBe(0);
    expect(liftOf(figure({ mode: 'lines', line: { lift: 5 } }).fullData[0]!)).toBe(MAX_LINE_LIFT);
    expect(MAX_LINE_LIFT * Math.PI).toBeCloseTo(1, 12);
    expect(liftOf(figure({ mode: 'lines', fill: 'toself' }).fullData[0]!)).toBe(0);
  });
});

describe('scattergeo on a globe: the line', () => {
  it('draws arcs in the globe’s 3D viewport, on the globe, depth-tested, and markers in the 2D one', async () => {
    const f = figure({ mode: 'lines+markers', line: { color: 'red', width: 3, dash: 'dash' } });
    const build = vi.spyOn(globe, 'buildArcs');
    const { h, viewport, create } = await drawn(f);
    expect(build).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
    const line = at<Line3D>(h, 'line')!;
    expect(h.added.get(line)).toBe(viewport);
    expect(viewport.kind).toBe('3d');
    expect(line.object.parent).toBe(globeScene(viewport).group);
    expect(line.object.matrix.equals(new Matrix4())).toBe(true);
    const [, data, options] = create.mock.calls[0]!;
    expect(options).toMatchObject({ depthTest: true });
    expect(data).toMatchObject({ color: [1, 0, 0, 1], width: 3, dash: 'dash', opacity: 1 });
    // No 2D line.
    expect([...h.added.keys()].some((p) => p instanceof LinePrimitive)).toBe(false);
    // The markers are scatter's, in the 2D viewport over the globe.
    const markers = [...h.added.keys()].find((p) => p instanceof MarkerSet)!;
    expect(h.added.get(markers)).toBe(h.viewports.get('geo'));

    // Two runs (a gap between them), each one arc that starts and ends on the surface.
    const expected = globe.buildArcs([-74, 0, NaN, -17, -46], [41, 51, NaN, 15, -23], {
      lift: DEFAULT_LINE_LIFT,
      radius: 1 + SURFACE_LIFT,
    });
    expect(expected.lineCount).toBe(2);
    expect(Array.from(data!.x as Float32Array)).toEqual(Array.from(expected.x));
    expect(Array.from(data!.starts as Uint32Array)).toEqual(Array.from(expected.starts));
    const r = radii(data!);
    const second = expected.starts[0]!;
    for (const end of [0, second - 1, second, r.length - 1]) {
      expect(r[end]).toBeCloseTo(1 + SURFACE_LIFT, 6);
    }
    // New York to London is 50° of arc: 0.15 × 0.87 rad = 0.13 radii up in the middle.
    const top = Math.max(...r.slice(0, second));
    expect(top / (1 + SURFACE_LIFT)).toBeCloseTo(1 + DEFAULT_LINE_LIFT * 0.8727, 2);
  });

  it('starts and ends its arcs where the markers are, at every rotation', async () => {
    const f = figure({ mode: 'lines+markers' });
    const { create } = await drawn(f);
    const data = create.mock.calls[0]![1]!;
    const { x, y, z } = data as { x: Float32Array; y: Float32Array; z: Float32Array };
    const sp = f.subplot();
    const calc = f.calcs[0]!;
    const matrix = new Matrix4();
    const check = (): number => {
      const positions = geoPositions(calc, sp)!;
      const t = sp.transform;
      sp.globeMatrix(matrix);
      let seen = 0;
      // The line's first vertex is New York (point 0), its last São Paulo (point 4).
      for (const [vertex, point] of [
        [0, 0],
        [x.length - 1, 4],
      ] as const) {
        const world = new Vector3(x[vertex], y[vertex], z[vertex]).applyMatrix4(matrix);
        // The surface point under the arc's end, by the globe's matrix…
        const surface = new Vector3(
          ...globePoint(calc.lon[point]!, calc.lat[point]!, 1, [0, 0, 0]),
        ).applyMatrix4(matrix);
        expect(world.distanceTo(surface)).toBeLessThan(SURFACE_LIFT * sp.globeRadius + 1e-3);
        if (Number.isNaN(positions.x[point]!)) {
          // …is behind the globe when the 2D path hides the marker.
          expect(surface.z).toBeLessThan(0);
          continue;
        }
        // …is the pixel the 2D path draws the marker at.
        expect(positions.x[point]! * t.scaleX + t.offsetX).toBeCloseTo(surface.x, 3);
        expect(positions.y[point]! * t.scaleY + t.offsetY).toBeCloseTo(surface.y, 3);
        expect(surface.z).toBeGreaterThan(0);
        seen++;
      }
      return seen;
    };
    expect(check()).toBe(2);
    for (const rotation of [
      { lon: -60, lat: 30 },
      { lon: 100, lat: -20, roll: 25 },
      { lon: -30, lat: 10 },
    ]) {
      sp.view!.set({ rotation });
      sp.notify();
      check();
    }
    sp.view!.set({ scale: sp.view!.state.scale * 3 });
    sp.notify();
    check();
  });

  it('builds the arcs once: a rotation and the pass that ends it touch nothing', async () => {
    const f = figure({ mode: 'lines', fill: 'toself', lon: [0, 20, 10], lat: [0, 0, 20] });
    const { h, view, viewport } = await drawn(f);
    const line = at<Line3D>(h, 'line')!;
    const fill = at<LazyMeshPrimitive>(h, 'fill')!;
    const builders = (['buildArcs', 'buildSphereMesh', 'buildSphereLines'] as const).map((name) =>
      vi.spyOn(globe, name),
    );
    const updates = [line, fill].map((p) => vi.spyOn(p, 'update'));
    const transforms = [line, fill].map((p) => vi.spyOn(p, 'setTransform'));
    const sp = f.subplot();
    const before = globeScene(viewport).group.matrix.clone();
    sp.view!.set({ rotation: { lon: 50, lat: -25 } });
    sp.notify();
    sp.view!.set({ scale: sp.view!.state.scale * 1.5 });
    sp.notify();
    expect(globeScene(viewport).group.matrix.equals(before)).toBe(false);
    for (const spy of [...builders, ...updates, ...transforms]) expect(spy).not.toHaveBeenCalled();

    // The relayout that ends the gesture: the style once more, no geometry.
    f.layout();
    view.update({ ...h.ctx, calc: f.calcs[0]! }, PASS);
    for (const spy of builders) expect(spy).not.toHaveBeenCalled();
    for (const spy of updates) {
      for (const [patch] of spy.mock.calls) {
        expect('x' in (patch as object) || 'positions' in (patch as object)).toBe(false);
      }
    }
    expect(at<Line3D>(h, 'line')).toBe(line);
  });

  it('restyles the line without building it, and builds it for another lift or connectgaps', async () => {
    const f = figure({ mode: 'lines' });
    const { h, view } = await drawn(f);
    const line = at<Line3D>(h, 'line')!;
    const build = vi.spyOn(globe, 'buildArcs');
    const update = vi.spyOn(line, 'update');
    const restyled = (line_: Trace, more: Trace = {}) =>
      ({ ...h.ctx.trace, ...more, line: { ...(h.ctx.trace['line'] as Trace), ...line_ } }) as never;

    view.update({ ...h.ctx, trace: restyled({ color: 'blue', width: 5, dash: 'dot' }) }, PASS);
    expect(build).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
    expect('x' in update.mock.calls[0]![0]).toBe(false);
    expect(update.mock.calls[0]![0]).toMatchObject({ color: [0, 0, 1, 1], width: 5, dash: 'dot' });

    // On the surface.
    view.update({ ...h.ctx, trace: restyled({ lift: 0 }) }, PASS);
    expect(build).toHaveBeenCalledTimes(1);
    expect(build.mock.calls[0]![2]).toMatchObject({ lift: 0 });
    for (const r of radii(update.mock.calls.at(-1)![0])) expect(r).toBeCloseTo(1 + SURFACE_LIFT, 6);

    // Twice as high.
    view.update({ ...h.ctx, trace: restyled({ lift: 0.3 }) }, PASS);
    expect(build).toHaveBeenCalledTimes(2);
    const high = radii(update.mock.calls.at(-1)![0]);
    expect(Math.max(...high) / (1 + SURFACE_LIFT)).toBeCloseTo(1 + 0.3 * 0.8727, 2);

    // Across the gap: one line of four points, where there were two.
    expect((update.mock.calls.at(-1)![0].starts as Uint32Array).length).toBe(1);
    view.update({ ...h.ctx, trace: restyled({ lift: 0.3 }, { connectgaps: true }) }, PASS);
    expect(build).toHaveBeenCalledTimes(3);
    expect((update.mock.calls.at(-1)![0].starts as Uint32Array).length).toBe(0);

    // No line any more.
    view.update({ ...h.ctx, trace: restyled({}, { mode: 'markers' }) }, PASS);
    expect(at<Line3D>(h, 'line')).toBeUndefined();
  });
});

describe('scattergeo on a globe: the toself fill', () => {
  it('is a mesh on the surface, under the line, of the rings the flat map fills', async () => {
    const f = figure({
      mode: 'lines',
      fill: 'toself',
      fillcolor: 'rgba(0, 128, 255, 0.5)',
      lon: [0, 20, 10],
      lat: [0, 0, 20],
    });
    const { h, viewport, create } = await drawn(f);
    const fill = at<LazyMeshPrimitive>(h, 'fill')!;
    const line = at<Line3D>(h, 'line')!;
    expect(h.added.get(fill)).toBe(viewport);
    expect(fill.object.parent).toBe(globeScene(viewport).group);
    expect(fill.object.renderOrder).toBeLessThan(line.object.renderOrder);
    const data = fill.mesh!.data;
    // On the surface: it tests depth (a prism in front hides it) and writes none.
    expect(data.depthTest).toBe(true);
    expect(data.depthWrite).toBe(false);
    expect(data.depthWrite).toBe(false);
    expect(data.side).toBe('front');
    expect(Array.from(data.color as ArrayLike<number>)).toEqual([0, 128 / 255, 1, 0.5]);
    const path = geoPath(f.calcs[0]!, false, true);
    const mesh = globe.buildSphereMesh(path.polygons!);
    expect(mesh.triangleCount).toBeGreaterThan(0);
    expect(Array.from(data.positions)).toEqual(Array.from(mesh.positions));
    expect(Array.from(data.indices!)).toEqual(Array.from(mesh.indices));
    // Its line is its outline: closed, and on the surface.
    const r = radii(create.mock.calls[0]![1]!);
    for (const value of r) expect(value).toBeCloseTo(1 + SURFACE_LIFT, 6);
    const { x, y, z } = create.mock.calls[0]![1] as {
      x: Float32Array;
      y: Float32Array;
      z: Float32Array;
    };
    const n = x.length - 1;
    expect([x[n], y[n], z[n]]).toEqual([x[0], y[0], z[0]]);
  });

  it('recolors without building, and goes with the fill', async () => {
    const f = figure({ mode: 'none', fill: 'toself', lon: [0, 20, 10], lat: [0, 0, 20] });
    const { h, view } = await drawn(f);
    const fill = at<LazyMeshPrimitive>(h, 'fill')!;
    expect(at<Line3D>(h, 'line')).toBeUndefined();
    const build = vi.spyOn(globe, 'buildSphereMesh');
    const update = vi.spyOn(fill, 'update');
    view.update({ ...h.ctx, trace: { ...h.ctx.trace, fillcolor: 'red' } as never }, PASS);
    expect(build).not.toHaveBeenCalled();
    expect(Object.keys(update.mock.calls[0]![0]).sort()).toEqual(['color', 'opacity']);
    view.update({ ...h.ctx, trace: { ...h.ctx.trace, fill: 'none' } as never }, PASS);
    expect(at<LazyMeshPrimitive>(h, 'fill')).toBeUndefined();
  });
});

describe('scattergeo: between the flat map and the globe', () => {
  it('removes the one kind of line and fill and draws the other, both ways', async () => {
    const trace = { mode: 'lines+markers', fill: 'toself', lon: [0, 20, 10], lat: [0, 0, 20] };
    const flat = figure(trace, ORTHOGRAPHIC);
    const h = plotContext(flat, 0, { real: true });
    const view = scattergeo.plot!.create(h.ctx);
    await settle(h);
    const flatViewport = h.viewports.get('geo');
    const line2d = at<LinePrimitive>(h, 'line')!;
    const fill2d = at<Primitive<unknown>>(h, 'fill')!;
    expect(line2d).toBeInstanceOf(LinePrimitive);
    expect(h.added.get(line2d)).toBe(flatViewport);
    expect(h.viewports.has('geo-globe')).toBe(false);
    const markers = [...h.added.keys()].find((p) => p instanceof MarkerSet)!;

    // To the globe.
    const round = figure(trace, GLOBE);
    const gone = [line2d, fill2d].map((p) => vi.spyOn(p, 'dispose'));
    view.update({ ...h.ctx, trace: round.fullData[0]!, calc: round.calcs[0]! }, RECALC);
    await settle(h);
    for (const spy of gone) expect(spy).toHaveBeenCalledTimes(1);
    const globeViewport = h.viewports.get('geo-globe');
    const line3d = at<Line3D>(h, 'line')!;
    const fill3d = at<LazyMeshPrimitive>(h, 'fill')!;
    expect(line3d).not.toBeInstanceOf(LinePrimitive);
    expect(h.added.get(line3d)).toBe(globeViewport);
    expect(h.added.get(fill3d)).toBe(globeViewport);
    // The markers stay where they were: scatter's, in the 2D viewport.
    expect([...h.added.keys()].find((p) => p instanceof MarkerSet)).toBe(markers);
    expect(h.added.get(markers)).toBe(flatViewport);

    // And back.
    const again = figure(trace, ORTHOGRAPHIC);
    const left = [line3d, fill3d].map((p) => vi.spyOn(p, 'dispose'));
    view.update({ ...h.ctx, trace: again.fullData[0]!, calc: again.calcs[0]! }, RECALC);
    await settle(h);
    for (const spy of left) expect(spy).toHaveBeenCalledTimes(1);
    expect(at<LinePrimitive>(h, 'line')).toBeInstanceOf(LinePrimitive);
    expect(h.added.get(at<LinePrimitive>(h, 'line')!)).toBe(flatViewport);
    expect(h.added.get(at<Primitive<unknown>>(h, 'fill')!)).toBe(flatViewport);
  });
});

describe('scattergeo on a globe: what stays the orthographic map’s', () => {
  const POINTS = { mode: 'markers', lon: [10, 60, -60, 120, 175], lat: [10, 30, 40, -30, 0] };

  it('hovers and selects the same points, and hides the far side', () => {
    const round = figure(POINTS, GLOBE);
    const flat = figure(POINTS, ORTHOGRAPHIC);
    const positions = geoPositions(round.calcs[0]!, round.subplot())!;
    expect(Array.from(positions.x)).toEqual(
      Array.from(geoPositions(flat.calcs[0]!, flat.subplot())!.x),
    );
    // 120° and 175° east are behind the globe.
    expect(Array.from(positions.x, Number.isNaN)).toEqual([false, false, false, true, true]);
    for (let cx = 250; cx <= 650; cx += 50) {
      for (let cy = 60; cy <= 420; cy += 40) {
        const ask = (f: LaidOutFigure) =>
          scattergeo.hoverPoints!(
            f.calcs[0]!,
            f.fullData[0]!,
            hoverQuery(cx, cy, 60),
            hoverContext(f),
          ).map((p) => [p.pointIndex, p.px, p.py, p.hoverText]);
        expect(ask(round)).toEqual(ask(flat));
      }
    }
    const box = {
      kind: 'rect' as const,
      x: [0, FIGURE.width] as [number, number],
      y: [0, FIGURE.height] as [number, number],
    };
    const select = (f: LaidOutFigure) =>
      scattergeo.selectPoints!(f.calcs[0]!, f.fullData[0]!, box, hoverContext(f));
    expect(select(round)).toEqual([0, 1, 2]);
    expect(select(round)).toEqual(select(flat));
  });

  it('fits the view to the data as the orthographic map does', () => {
    const fit = (type: string) =>
      layoutFigure({
        data: [{ type: 'scattergeo', lon: [100, 140], lat: [-40, -10] }],
        layout: { geo: { projection: { type }, fitbounds: 'locations' } },
      } as never)
        .subplot()
        .view!.toLayout();
    expect(fit('globe3d')).toEqual(fit('orthographic'));
    expect(fit('globe3d').rotation.lon).toBeCloseTo(120, 6);
  });
});

describe('a scattergeo whose globe code cannot be loaded', () => {
  afterEach(() => {
    vi.doUnmock('../geo/globe-loader.ts');
    vi.resetModules();
  });

  it('warns once, draws the markers alone and leaves the chart ready', async () => {
    vi.resetModules();
    vi.doMock('../geo/globe-loader.ts', async (original) => ({
      ...(await original<typeof import('../geo/globe-loader.ts')>()),
      loadGlobe: () => Promise.reject(new Error('offline')),
    }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fresh = await import('./__testing__/figure.ts');
    const { scattergeo: module } = await import('./index.ts');
    const draw = async (mode: string) => {
      const f = fresh.layoutFigure({
        data: [{ type: 'scattergeo', lon: [0, 20], lat: [0, 10], mode }],
        layout: { geo: GLOBE },
      } as never);
      const h = fresh.plotContext(f, 0, { real: true });
      module.plot!.create(h.ctx);
      // The stand-in primitive of a `LoadingHold`: invisible, with the load as its `ready`.
      const held = [...h.added.keys()].filter(
        (p) => (p as { ready?: unknown }).ready && !p.object.visible,
      );
      await settle(h as never);
      return { h, held };
    };
    const lines = await draw('lines+markers');
    // The hold was there, and went; the markers are drawn, no line.
    expect(lines.held).toHaveLength(1);
    expect(lines.h.added.size).toBe(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toMatch(/3D globe \('globe3d'\) could not be loaded/);
    await draw('lines');
    expect(warn).toHaveBeenCalledTimes(1);
    // Markers alone need none of it: nothing is loaded, nothing is held.
    expect((await draw('markers')).held).toHaveLength(0);
  });
});
