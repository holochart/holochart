import { geoDistance } from 'd3-geo';
import fc from 'fast-check';
import { beforeAll, describe, expect, it } from 'vitest';
import { LATAXIS_SPAN, LONAXIS_SPAN, SCOPE_DEFAULTS } from './constants.ts';
import {
  carryGeoViewState,
  clampGeoView,
  dragGeoView,
  geoRelayout,
  geoResetRelayout,
  GEO_KEY_PAN,
  GEO_KEY_ZOOM,
  geoWheelFactor,
  keyGeoView,
  moveGeoGesture,
  saveGeoViewInitial,
  startGeoGesture,
  zoomGeoView,
} from './interact.ts';
import { loadProjection } from './projections.ts';
import type { FullGeoLayout, GeoScope } from './types.ts';
import { createGeoView, type GeoView } from './view.ts';

beforeAll(async () => {
  await loadProjection('robinson');
});

interface LayoutOptions {
  scope?: GeoScope;
  type?: string;
  rotation?: { lon?: number; lat?: number; roll?: number };
  center?: { lon?: number; lat?: number };
  scale?: number;
  minscale?: number;
  maxscale?: number;
  fitbounds?: FullGeoLayout['fitbounds'];
}

/** A defaulted container by Plotly's rules (see the fuller copy in `view.test.ts`). */
function geoLayout(o: LayoutOptions = {}): FullGeoLayout {
  const scope = o.scope ?? 'world';
  const defaults = SCOPE_DEFAULTS[scope];
  const type = o.type ?? defaults.projType;
  const albersUsa = type === 'albers usa';
  const scoped = scope !== 'world' || albersUsa;
  const rotate = albersUsa ? [0, 0, 0] : (defaults.projRotate ?? [0, 0, 0]);
  const rotation = {
    lon: o.rotation?.lon ?? rotate[0]!,
    lat: o.rotation?.lat ?? rotate[1]!,
    roll: o.rotation?.roll ?? rotate[2]!,
  };
  const lonHalf = (LONAXIS_SPAN[type] ?? 360) / 2;
  const latHalf = (LATAXIS_SPAN[type] ?? 180) / 2;
  const lonRange: [number, number] = scoped
    ? [defaults.lonaxisRange[0], defaults.lonaxisRange[1]]
    : [rotation.lon - lonHalf, rotation.lon + lonHalf];
  const latRange: [number, number] = scoped
    ? [defaults.lataxisRange[0], defaults.lataxisRange[1]]
    : [rotation.lat - latHalf, rotation.lat + latHalf];
  const conic = type.includes('conic') || type === 'albers';
  const axis = { showgrid: false, tick0: 0, dtick: 30, gridcolor: '#eee', gridwidth: 1 };
  return {
    domain: { x: [0, 1], y: [0, 1] },
    fitbounds: o.fitbounds ?? false,
    resolution: 110,
    scope: albersUsa ? 'usa' : scope,
    projection: {
      type,
      rotation,
      scale: o.scale ?? 1,
      minscale: o.minscale ?? 0,
      ...(o.maxscale !== undefined ? { maxscale: o.maxscale } : {}),
      ...(conic ? { parallels: [...(defaults.projParallels ?? [0, 60])] } : {}),
    } as FullGeoLayout['projection'],
    center: {
      lon:
        o.center?.lon ??
        (albersUsa ? -96.6 : scoped ? (lonRange[0] + lonRange[1]) / 2 : rotation.lon),
      lat: o.center?.lat ?? (albersUsa ? 38.7 : (latRange[0] + latRange[1]) / 2),
    },
    visible: true,
    showcoastlines: true,
    coastlinecolor: '#444',
    coastlinewidth: 1,
    showland: false,
    landcolor: '#F0DC82',
    showocean: false,
    oceancolor: '#3399FF',
    showlakes: false,
    lakecolor: '#3399FF',
    showrivers: false,
    rivercolor: '#3399FF',
    riverwidth: 1,
    showcountries: false,
    countrycolor: '#444',
    countrywidth: 1,
    showsubunits: false,
    subunitcolor: '#444',
    subunitwidth: 1,
    showframe: true,
    framecolor: '#444',
    framewidth: 1,
    bgcolor: '#fff',
    lonaxis: { ...axis, range: lonRange, griddash: 'solid' },
    lataxis: { ...axis, range: latRange, dtick: 10, griddash: 'solid' },
  };
}

const SIZE = { width: 700, height: 450 };

function viewOf(o: LayoutOptions = {}): GeoView {
  return createGeoView(geoLayout(o), SIZE);
}

/** The layout a relayout leaves behind: the container with the update's values written in. */
function relaid(layout: FullGeoLayout, update: Record<string, unknown>, id = 'geo'): FullGeoLayout {
  const next = structuredClone(layout) as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(update)) {
    const path = key.split('.');
    expect(path[0]).toBe(id);
    let node = next;
    for (const part of path.slice(1, -1)) node = node[part] as Record<string, unknown>;
    node[path.at(-1)!] = value;
  }
  return next as unknown as FullGeoLayout;
}

/** px distance between where a point is drawn and a pixel. */
function miss(
  view: GeoView,
  lonlat: readonly [number, number],
  px: readonly [number, number],
): number {
  const at = view.projectAt(view.state, lonlat[0], lonlat[1])!;
  return Math.hypot(at[0] - px[0], at[1] - px[1]);
}

const SCOPED: LayoutOptions[] = [
  { scope: 'europe' },
  { scope: 'africa' },
  { scope: 'north america' },
  { type: 'albers usa' },
  { scope: 'asia', scale: 1.5 },
];

describe('a scoped map pans and zooms', () => {
  it.each(SCOPED)('drags the point under the pointer with it: %o', (o) => {
    fc.assert(
      fc.property(
        fc.double({ min: 200, max: 500, noNaN: true }),
        fc.double({ min: 150, max: 300, noNaN: true }),
        fc.double({ min: -150, max: 150, noNaN: true }),
        fc.double({ min: -100, max: 100, noNaN: true }),
        (x, y, dx, dy) => {
          const view = viewOf(o);
          const version = view.version;
          const grabbed = view.invertAt(view.state, x, y)!;
          const result = dragGeoView(view, [x, y], [x + dx, y + dy]);
          expect(result.state.scale).toBe(view.state.scale);
          expect(result.state.rotation).toBe(view.state.rotation);
          view.set(result.state);
          expect(miss(view, grabbed, [x + dx, y + dy])).toBeLessThan(1e-6);
          // A pan is the camera: nothing is reprojected.
          expect(view.version).toBe(version);
          expect(view.transform.scaleX).toBeCloseTo(1, 12);
          expect(view.transform.offsetX).toBeCloseTo(dx, 6);
          expect(view.transform.offsetY).toBeCloseTo(dy, 6);
        },
      ),
      { numRuns: 50 },
    );
  });

  it.each(SCOPED)('zooms about the pointer, which keeps its point: %o', (o) => {
    fc.assert(
      fc.property(
        fc.double({ min: 200, max: 500, noNaN: true }),
        fc.double({ min: 150, max: 300, noNaN: true }),
        fc.double({ min: 0.2, max: 8, noNaN: true }),
        (x, y, factor) => {
          const view = viewOf(o);
          const version = view.version;
          const scale = view.state.scale;
          const under = view.invertAt(view.state, x, y)!;
          const result = zoomGeoView(view, factor, x, y);
          expect(result.state.scale).toBeCloseTo(scale * factor, 9);
          view.set(result.state);
          expect(miss(view, under, [x, y])).toBeLessThan(1e-6);
          expect(view.version).toBe(version);
        },
      ),
      { numRuns: 50 },
    );
  });

  it('emits center and scale, and only what changed', () => {
    const view = viewOf({ scope: 'europe' });
    const drag = dragGeoView(view, [300, 200], [340, 180]);
    expect(drag.changed).toBe(true);
    expect(Object.keys(drag.relayout)).toEqual(['geo.center.lon', 'geo.center.lat']);
    const zoom = zoomGeoView(view, 2, 300, 200);
    expect(Object.keys(zoom.relayout)).toEqual([
      'geo.center.lon',
      'geo.center.lat',
      'geo.projection.scale',
    ]);
    expect(zoom.relayout['geo.projection.scale']).toBe(2);
    // About the middle the translate point stays, so the center is the layout's (to rounding).
    const centred = zoomGeoView(view, 2, view.midPoint[0], view.midPoint[1]);
    expect(centred.state.translate).toEqual(view.state.translate);
    expect(centred.relayout['geo.projection.scale']).toBe(2);
    // Nothing moved: nothing to relayout.
    const still = dragGeoView(view, [300, 200], [300, 200]);
    expect(still.changed).toBe(false);
    expect(still.state).toBe(view.state);
    expect(still.relayout['geo.projection.scale']).toBeUndefined();
  });

  it('prefixes the keys with the subplot id', () => {
    const view = viewOf({ scope: 'africa' });
    const result = moveGeoGesture(view, startGeoGesture(view, 300, 200), 320, 220, 1.5, 'geo3');
    expect(Object.keys(result.relayout)).toEqual([
      'geo3.center.lon',
      'geo3.center.lat',
      'geo3.projection.scale',
    ]);
  });

  it.each(SCOPED)('commits to a layout that draws the same map: %o', (o) => {
    const layout = geoLayout(o);
    const view = createGeoView(layout, SIZE);
    const gesture = startGeoGesture(view, 320, 210);
    const result = moveGeoGesture(view, gesture, 390, 170, 1.8);
    view.set(result.state);
    const next = createGeoView(relaid(layout, result.relayout), SIZE, { previous: view });
    // The center Plotly writes is the point in the middle, which is where the next view puts it.
    for (const [x, y] of [
      [200, 150],
      [350, 225],
      [480, 300],
    ] as const) {
      const lonlat = view.invertAt(view.state, x, y)!;
      expect(miss(next, lonlat, [x, y])).toBeLessThan(1e-3);
    }
    // The relayout that ends a pan and zoom keeps what was projected.
    expect(next.version).toBe(view.version);
    expect(next.transform.scaleX).toBeCloseTo(view.transform.scaleX, 9);
  });

  it('pans Albers USA past its own edge and back without a jump', () => {
    const layout = geoLayout({ type: 'albers usa' });
    const view = createGeoView(layout, SIZE);
    // Far enough that the middle of the subplot is over the Atlantic, outside every clip.
    const out = dragGeoView(view, [350, 225], [-150, 225]);
    view.set(out.state);
    const centre = view.toLayout().center!;
    expect(view.project(centre.lon, centre.lat)).toBeNull();
    const next = createGeoView(relaid(layout, out.relayout), SIZE);
    const chicago: [number, number] = [-87.6, 41.9];
    const a = view.projectAt(view.state, ...chicago)!;
    const b = next.projectAt(next.state, ...chicago)!;
    expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeLessThan(1e-3);
  });
});

describe('scale limits', () => {
  it('holds a zoom inside minscale and maxscale in every mode', () => {
    for (const o of [
      { scope: 'europe' },
      { type: 'natural earth' },
      { type: 'orthographic' },
    ] as LayoutOptions[]) {
      fc.assert(
        fc.property(
          fc.array(fc.double({ min: 0.05, max: 20, noNaN: true }), { minLength: 1, maxLength: 8 }),
          (factors) => {
            const view = viewOf({ ...o, minscale: 0.5, maxscale: 3 });
            for (const factor of factors) {
              const result = zoomGeoView(view, factor, 360, 230);
              expect(result.state.scale).toBeGreaterThanOrEqual(0.5);
              expect(result.state.scale).toBeLessThanOrEqual(3);
              view.set(result.state);
            }
          },
        ),
        { numRuns: 30 },
      );
    }
  });

  it('stops at the limit and says so in the relayout', () => {
    const view = viewOf({ scope: 'africa', minscale: 0.5, maxscale: 3 });
    expect(zoomGeoView(view, 100, 300, 200).relayout['geo.projection.scale']).toBe(3);
    expect(zoomGeoView(view, 0.001, 300, 200).relayout['geo.projection.scale']).toBe(0.5);
    // With the limits the other way round, as Plotly allows.
    const swapped = viewOf({ scope: 'africa', minscale: 3, maxscale: 0.5 });
    expect(zoomGeoView(swapped, 100, 300, 200).state.scale).toBe(3);
    // No maxscale is no upper limit.
    expect(zoomGeoView(viewOf({ scope: 'africa' }), 1e6, 300, 200).state.scale).toBeCloseTo(1e6, 3);
  });

  it('brings a layout scale that is out of range into it, as Plotly does on the first draw', () => {
    for (const o of [
      { scope: 'europe' },
      { type: 'equirectangular' },
      { type: 'orthographic' },
    ] as LayoutOptions[]) {
      const view = viewOf({ ...o, scale: 5, maxscale: 2 });
      const result = clampGeoView(view);
      expect(result.changed).toBe(true);
      expect(result.state.scale).toBe(2);
      expect(result.relayout['geo.projection.scale']).toBe(2);
      // In range there is nothing to do.
      expect(clampGeoView(viewOf({ ...o, scale: 1.5, maxscale: 2 })).changed).toBe(false);
    }
    // Any gesture on a view outside its limits clamps it first.
    const view = viewOf({ scope: 'europe', scale: 5, maxscale: 2 });
    expect(dragGeoView(view, [300, 200], [310, 200]).state.scale).toBe(2);
  });

  it('ignores a factor that is not a positive number', () => {
    const view = viewOf({ scope: 'europe' });
    for (const factor of [0, -2, Number.NaN, Infinity]) {
      expect(zoomGeoView(view, factor, 300, 200).changed, String(factor)).toBe(false);
    }
    expect(moveGeoGesture(view, startGeoGesture(view, 300, 200), Number.NaN, 200).changed).toBe(
      false,
    );
  });

  it('turns a wheel event into the factor d3 uses', () => {
    expect(geoWheelFactor(0)).toBe(1);
    expect(geoWheelFactor(-500)).toBeCloseTo(2, 12);
    expect(geoWheelFactor(500)).toBeCloseTo(0.5, 12);
    // Lines, not pixels.
    expect(geoWheelFactor(-3, 1)).toBeCloseTo(Math.pow(2, 0.72), 12);
  });
});

describe('a world map that shows the whole sphere turns in longitude and moves up and down', () => {
  // Mercator's map is the narrowest of these: 450 px wide in the middle of the rect.
  it.each(['equirectangular', 'mercator', 'miller', 'natural earth', 'robinson', 'sinusoidal'])(
    'drags the point under the pointer with it, exactly where parallels are level: %s',
    (type) => {
      // Both ends of the drag are inside the map, away from the antimeridian at its edges: a
      // point dragged over the edge comes back in on the other side.
      fc.assert(
        fc.property(
          fc.double({ min: 250, max: 450, noNaN: true }),
          fc.double({ min: 120, max: 330, noNaN: true }),
          fc.double({ min: -100, max: 100, noNaN: true }),
          fc.double({ min: -80, max: 80, noNaN: true }),
          (x, y, dx, dy) => {
            const view = viewOf({ type });
            const grabbed = view.invertAt(view.state, x, y)!;
            const t0 = view.state.translate;
            const result = dragGeoView(view, [x, y], [x + dx, y + dy]);
            // Left and right is a rotation; the translate point only moves up and down.
            expect(result.state.translate[0]).toBe(t0[0]);
            expect(result.state.translate[1]).toBeCloseTo(t0[1] + dy, 9);
            expect(result.state.rotation.lat).toBe(0);
            view.set(result.state);
            expect(miss(view, grabbed, [x + dx, y + dy])).toBeLessThan(1e-6);
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  it.each(['aitoff', 'winkel tripel', 'hammer'])(
    'brings the grabbed meridian under the pointer where parallels curve: %s',
    (type) => {
      const view = viewOf({ type });
      const from: [number, number] = [300, 300];
      const to: [number, number] = [420, 250];
      const gesture = startGeoGesture(view, from[0], from[1]);
      const grabbed = gesture.anchor!;
      let last = Infinity;
      // The pointer rests at `to`; each event turns by what is still missing.
      for (let step = 0; step < 8; step++) {
        const result = moveGeoGesture(view, gesture, to[0], to[1]);
        view.set(result.state);
        const off = miss(view, grabbed, to);
        expect(off).toBeLessThanOrEqual(last + 1e-9);
        last = off;
      }
      // The meridian is exact. Up and down the map only translates, so the point itself ends a
      // little above or below the pointer: that much Plotly's maths does not promise.
      const under = view.invertAt(view.state, to[0], to[1])!;
      expect(under[0]).toBeCloseTo(grabbed[0], 6);
      expect(last).toBeLessThan(3);
    },
  );

  it('zooms about the pointer, which keeps its point', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('equirectangular', 'mercator'),
        fc.double({ min: 150, max: 550, noNaN: true }),
        fc.double({ min: 120, max: 330, noNaN: true }),
        // Zooming in: zoomed out, the map can be narrower than the pointer is far from its middle.
        fc.double({ min: 1, max: 6, noNaN: true }),
        (type, x, y, factor) => {
          const view = viewOf({ type });
          const under = view.invertAt(view.state, x, y)!;
          const result = zoomGeoView(view, factor, x, y);
          expect(result.state.scale).toBeCloseTo(factor, 9);
          view.set(result.state);
          expect(miss(view, under, [x, y])).toBeLessThan(1e-6);
        },
      ),
      { numRuns: 50 },
    );
  });

  it('reprojects for a turn and not for a move up, down or about the middle', () => {
    const view = viewOf({ type: 'equirectangular' });
    const version = view.version;
    view.set(dragGeoView(view, [350, 200], [350, 260]).state);
    expect(view.version).toBe(version);
    view.set(zoomGeoView(view, 2, view.midPoint[0], view.midPoint[1]).state);
    expect(view.version).toBe(version);
    view.set(dragGeoView(view, [350, 200], [400, 200]).state);
    expect(view.version).not.toBe(version);
  });

  it('emits rotation.lon, center and scale', () => {
    const view = viewOf({ type: 'natural earth' });
    const result = moveGeoGesture(view, startGeoGesture(view, 300, 220), 360, 250, 1.5);
    expect(Object.keys(result.relayout)).toEqual([
      'geo.projection.rotation.lon',
      'geo.center.lon',
      'geo.center.lat',
      'geo.projection.scale',
    ]);
    expect(result.relayout['geo.projection.rotation.lon']).toBe(result.state.rotation.lon);
    const read = view.toLayout(result.state);
    expect(result.relayout['geo.center.lon']).toBe(read.center!.lon);
    expect(result.relayout['geo.center.lat']).toBe(read.center!.lat);
    expect(result.relayout['geo.projection.scale']).toBe(1.5);
  });

  it('commits to a layout that draws the same map', () => {
    for (const type of ['equirectangular', 'mercator', 'natural earth']) {
      const layout = geoLayout({ type });
      const view = createGeoView(layout, SIZE);
      const result = moveGeoGesture(view, startGeoGesture(view, 300, 220), 380, 260, 1.6);
      view.set(result.state);
      const next = createGeoView(relaid(layout, result.relayout), SIZE);
      for (const [x, y] of [
        [250, 180],
        [350, 225],
        [450, 280],
      ] as const) {
        const lonlat = view.invertAt(view.state, x, y)!;
        expect(miss(next, lonlat, [x, y]), type).toBeLessThan(1e-3);
      }
    }
  });

  it('does nothing when the gesture begins off the map', () => {
    const view = viewOf({ type: 'natural earth' });
    // The corner of the rect is outside the outline of the projection.
    const result = dragGeoView(view, [3, 447], [80, 400]);
    expect(result.changed).toBe(false);
    expect(result.state).toBe(view.state);
    expect(zoomGeoView(view, 2, 3, 447).changed).toBe(false);
  });

  it('keeps longitudes in [-180, 180)', () => {
    const view = viewOf({ type: 'equirectangular', rotation: { lon: 170 } });
    for (let i = 0; i < 5; i++) view.set(dragGeoView(view, [400, 200], [300, 200]).state);
    expect(view.state.rotation.lon).toBeGreaterThanOrEqual(-180);
    expect(view.state.rotation.lon).toBeLessThan(180);
  });
});

/** A pixel of the orthographic disc, by its offset from the middle as a fraction of the radius. */
function onDisc(view: GeoView, u: number, v: number): [number, number] {
  const radius = (view.bounds.x1 - view.bounds.x0) / 2;
  return [view.midPoint[0] + u * radius, view.midPoint[1] + v * radius];
}

const half = fc.double({ min: -0.5, max: 0.5, noNaN: true });

describe('a clipped world map turns in longitude and latitude', () => {
  it('drags the point under the pointer with it and keeps the roll', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('orthographic', 'stereographic', 'azimuthal equal area'),
        fc.constantFrom(0, 25),
        half,
        half,
        half,
        half,
        (type, roll, u0, v0, u1, v1) => {
          const view = viewOf({ type, rotation: { lon: 20, lat: 10, roll } });
          const radius = type === 'orthographic' ? 1 : 0.4;
          const from = onDisc(view, u0 * radius, v0 * radius);
          const to = onDisc(view, u1 * radius, v1 * radius);
          const grabbed = view.invertAt(view.state, from[0], from[1])!;
          const t0 = view.state.translate;
          const result = dragGeoView(view, from, to);
          // The globe stays where it is; only its rotation changes.
          expect(result.state.translate).toEqual(t0);
          expect(result.state.scale).toBe(1);
          expect(result.state.rotation.roll).toBe(roll);
          view.set(result.state);
          // A drag shorter than the rounding of a rotation does not turn the globe.
          expect(miss(view, grabbed, to)).toBeLessThan(1e-5);
        },
      ),
      { numRuns: 120 },
    );
  });

  it('follows the pointer through a whole drag', () => {
    const view = viewOf({ type: 'orthographic' });
    let gesture = startGeoGesture(view, ...onDisc(view, -0.3, 0.1));
    const grabbed = gesture.anchor!;
    const version = view.version;
    for (let step = 1; step <= 12; step++) {
      const to = onDisc(view, -0.3 + 0.05 * step, 0.1 + 0.03 * step);
      const result = moveGeoGesture(view, gesture, to[0], to[1]);
      gesture = result.gesture;
      view.set(result.state);
      expect(miss(view, grabbed, to)).toBeLessThan(1e-6);
    }
    expect(view.version).not.toBe(version);
    // Back where it began, the rotation is the one it began with.
    const home = onDisc(view, -0.3, 0.1);
    const back = moveGeoGesture(view, gesture, home[0], home[1]);
    expect(back.state.rotation.lon).toBeCloseTo(0, 9);
    expect(back.state.rotation.lat).toBeCloseTo(0, 9);
  });

  it('comes as close as it can when the roll cannot be kept', () => {
    // A point near the pole cannot be brought to the edge at the equator without tilting the
    // globe: Plotly's `unRoll` then turns as far as the roll allows.
    const view = viewOf({ type: 'orthographic' });
    const from = onDisc(view, 0, 0.95);
    const to = onDisc(view, 0.9, 0);
    const grabbed = view.invertAt(view.state, from[0], from[1])!;
    const before = miss(view, grabbed, to);
    const result = dragGeoView(view, from, to);
    expect(result.changed).toBe(true);
    expect(result.state.rotation.roll).toBe(0);
    expect(Number.isFinite(result.state.rotation.lon + result.state.rotation.lat)).toBe(true);
    view.set(result.state);
    const after = miss(view, grabbed, to);
    expect(after).toBeGreaterThan(1);
    expect(after).toBeLessThan(before);
  });

  it('turns from the edge when the gesture begins off the globe, as Plotly does', () => {
    // d3's inverse answers off the disc with the nearest point of its edge, so there is always
    // something to hold on to.
    const view = viewOf({ type: 'orthographic' });
    const gesture = startGeoGesture(view, 5, 5);
    expect(gesture.anchor).not.toBeNull();
    const result = moveGeoGesture(view, gesture, 60, 40);
    expect(result.gesture).toBe(gesture);
    expect(result.changed).toBe(true);
    expect(result.state.translate).toEqual(view.state.translate);
  });

  it('zooms about the middle without turning, and about the pointer by turning', () => {
    const view = viewOf({ type: 'orthographic', rotation: { lon: 30, lat: 20 } });
    const version = view.version;
    const centred = zoomGeoView(view, 2, view.midPoint[0], view.midPoint[1]);
    expect(centred.state.rotation).toBe(view.state.rotation);
    expect(Object.keys(centred.relayout)).toEqual(['geo.projection.scale']);
    view.set(centred.state);
    expect(view.version).toBe(version);

    const at = onDisc(view, 0.4, -0.3);
    const under = view.invertAt(view.state, at[0], at[1])!;
    const result = zoomGeoView(view, 1.5, at[0], at[1]);
    expect(result.state.scale).toBeCloseTo(3, 12);
    expect(result.state.translate).toEqual(view.state.translate);
    view.set(result.state);
    expect(miss(view, under, at)).toBeLessThan(1e-6);
  });

  it('emits rotation.lon, rotation.lat and scale, and never center', () => {
    const view = viewOf({ type: 'orthographic' });
    const from = onDisc(view, 0.1, 0.1);
    const to = onDisc(view, 0.4, 0.3);
    const result = moveGeoGesture(view, startGeoGesture(view, from[0], from[1]), to[0], to[1], 1.3);
    expect(Object.keys(result.relayout)).toEqual([
      'geo.projection.rotation.lon',
      'geo.projection.rotation.lat',
      'geo.projection.scale',
    ]);
    expect(result.relayout['geo.projection.rotation.lon']).toBe(result.state.rotation.lon);
    expect(result.relayout['geo.projection.rotation.lat']).toBe(result.state.rotation.lat);
  });

  it('commits to a layout that draws the same globe, when center follows the rotation', () => {
    const layout = geoLayout({ type: 'orthographic' });
    const view = createGeoView(layout, SIZE);
    const from = onDisc(view, 0.1, 0.1);
    const to = onDisc(view, 0.4, 0.3);
    const result = dragGeoView(view, from, to);
    view.set(result.state);
    // The defaults put an unset center at the rotation, and the ranges around it.
    const lon = result.relayout['geo.projection.rotation.lon'] as number;
    const lat = result.relayout['geo.projection.rotation.lat'] as number;
    const next = createGeoView(geoLayout({ type: 'orthographic', rotation: { lon, lat } }), SIZE);
    for (const [u, v] of [
      [0, 0],
      [0.5, 0.2],
      [-0.3, -0.6],
    ] as const) {
      const px = onDisc(view, u, v);
      const lonlat = view.invertAt(view.state, px[0], px[1])!;
      expect(miss(next, lonlat, px)).toBeLessThan(1e-3);
    }
  });

  it('turns a great circle: what was grabbed never leaves the visible side', () => {
    fc.assert(
      fc.property(half, half, half, half, (u0, v0, u1, v1) => {
        const view = viewOf({ type: 'orthographic' });
        const from = onDisc(view, u0, v0);
        const grabbed = view.invertAt(view.state, from[0], from[1])!;
        view.set(dragGeoView(view, from, onDisc(view, u1, v1)).state);
        const centre: [number, number] = [view.state.rotation.lon, view.state.rotation.lat];
        expect(geoDistance(grabbed, centre)).toBeLessThan(Math.PI / 2);
        expect(view.isLonLatOverEdges(grabbed[0], grabbed[1])).toBe(false);
      }),
      { numRuns: 60 },
    );
  });
});

describe('fitbounds and the reset', () => {
  it('turns fitbounds off with the first interaction, and writes the whole view', () => {
    const cases: [LayoutOptions, string[]][] = [
      [{ scope: 'europe' }, ['geo.center.lon', 'geo.center.lat']],
      [
        { type: 'natural earth' },
        ['geo.projection.rotation.lon', 'geo.center.lon', 'geo.center.lat'],
      ],
      [{ type: 'orthographic' }, ['geo.projection.rotation.lon', 'geo.projection.rotation.lat']],
    ];
    for (const [o, keys] of cases) {
      const layout = geoLayout({ ...o, fitbounds: 'locations' });
      const view = createGeoView(layout, SIZE, { fit: { lon: [5, 20], lat: [42, 52] } });
      // Even a gesture that changes nothing commits the fitted view: the layout has none.
      const relayout = geoRelayout(view, view.state);
      expect(Object.keys(relayout)).toEqual([...keys, 'geo.projection.scale', 'geo.fitbounds']);
      expect(relayout['geo.fitbounds']).toBe(false);
      expect(relayout['geo.projection.scale']).toBe(view.state.scale);
      const drag = dragGeoView(view, [340, 220], [360, 230], 'geo2');
      expect(drag.relayout['geo2.fitbounds']).toBe(false);
    }
    // Without fitbounds the key is not written.
    const plain = viewOf({ scope: 'europe' });
    expect('geo.fitbounds' in dragGeoView(plain, [300, 200], [320, 200]).relayout).toBe(false);
  });

  it("saves the keys of Plotly's viewInitial for each mode", () => {
    expect(saveGeoViewInitial(geoLayout({ scope: 'europe', scale: 2 }))).toEqual({
      fitbounds: false,
      'projection.scale': 2,
      'center.lon': 15,
      'center.lat': 57.5,
    });
    expect(
      saveGeoViewInitial(geoLayout({ type: 'orthographic', rotation: { lon: 30, lat: 20 } })),
    ).toEqual({
      fitbounds: false,
      'projection.scale': 1,
      'projection.rotation.lon': 30,
      'projection.rotation.lat': 20,
      'center.lon': 30,
      'center.lat': 20,
    });
    expect(saveGeoViewInitial(geoLayout({ type: 'natural earth', rotation: { lon: 30 } }))).toEqual(
      {
        fitbounds: false,
        'projection.scale': 1,
        'center.lon': 30,
        'center.lat': 0,
        'projection.rotation.lon': 30,
      },
    );
  });

  it('resets a fitted view to the fit, not to the numbers that stood in for it', () => {
    const initial = saveGeoViewInitial(geoLayout({ type: 'orthographic', fitbounds: 'geojson' }));
    expect(initial).toEqual({
      fitbounds: 'geojson',
      'projection.scale': null,
      'projection.rotation.lon': null,
      'projection.rotation.lat': null,
      'center.lon': null,
      'center.lat': null,
    });
    expect(geoResetRelayout(initial, 'geo2')).toEqual({
      'geo2.fitbounds': 'geojson',
      'geo2.projection.scale': null,
      'geo2.projection.rotation.lon': null,
      'geo2.projection.rotation.lat': null,
      'geo2.center.lon': null,
      'geo2.center.lat': null,
    });
  });

  it('resets to the saved view after any interaction', () => {
    const layout = geoLayout({ scope: 'africa' });
    const initial = saveGeoViewInitial(layout);
    const view = createGeoView(layout, SIZE);
    const result = moveGeoGesture(view, startGeoGesture(view, 300, 200), 350, 260, 2);
    const moved = relaid(layout, result.relayout);
    expect(moved.center).not.toEqual(layout.center);
    expect(relaid(moved, geoResetRelayout(initial))).toEqual(layout);
  });
});

describe('a view replaced in the middle of a gesture takes up what the old one showed', () => {
  /** Points spread over what each map shows. */
  const PROBES: Record<string, readonly (readonly [number, number])[]> = {
    world: [
      [0, 0],
      [40, 20],
      [-70, -30],
    ],
    europe: [
      [10, 50],
      [25, 60],
      [-5, 40],
    ],
    usa: [
      [-98, 39],
      [-80, 35],
      [-120, 45],
    ],
  };
  const CASES: readonly (LayoutOptions & { probes: keyof typeof PROBES })[] = [
    { scope: 'europe', probes: 'europe' },
    { type: 'albers usa', probes: 'usa' },
    { type: 'natural earth', probes: 'world' },
    { type: 'robinson', probes: 'world' },
    { type: 'orthographic', probes: 'world' },
    { type: 'orthographic', rotation: { lon: 20, lat: 30, roll: 10 }, probes: 'world' },
  ];

  for (const o of CASES) {
    const name = `${o.scope ?? 'world'} ${o.type ?? ''}`.trim();

    it(`${name}: a view of the same layout draws the same picture`, () => {
      const layout = geoLayout(o);
      const from = createGeoView(layout, SIZE);
      const step = moveGeoGesture(from, startGeoGesture(from, 340, 230), 385, 210, 1.7);
      expect(step.changed).toBe(true);
      from.set(step.state);
      // The pass builds the new view from the layout, which has nothing of the gesture.
      const to = createGeoView(layout, SIZE, { previous: from });
      const carried = carryGeoViewState(from, to, from.state)!;
      expect(carried).not.toBeNull();
      to.set(carried);
      for (const [lon, lat] of PROBES[o.probes]!) {
        const a = from.projectAt(from.state, lon, lat);
        const b = to.projectAt(to.state, lon, lat);
        expect(b === null).toBe(a === null);
        // Robinson's inverse is an interpolation: the middle comes back a hair off.
        if (a && b) expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeLessThan(1e-2);
      }
      // And what the gesture would commit is the same (an inverse may be a rounding away).
      const was = geoRelayout(from, from.state);
      const is = geoRelayout(to, to.state);
      expect(Object.keys(is)).toEqual(Object.keys(was));
      for (const key of Object.keys(was)) expect(is[key]).toBeCloseTo(was[key] as number, 6);
    });

    it(`${name}: a view of the layout the gesture before committed draws the same picture`, () => {
      const layout = geoLayout(o);
      const from = createGeoView(layout, SIZE);
      const zoom = zoomGeoView(from, 1.5, 320, 240);
      from.set(zoom.state);
      // The zoom is committed; a drag has begun before the pass of its relayout.
      // The layout its relayout leaves, by the defaults: axis ranges follow the rotation, and so
      // does a globe's `center`.
      const value = (key: string, fallback: number): number =>
        (zoom.relayout[`geo.${key}`] as number | undefined) ?? fallback;
      const committed = geoLayout({
        ...o,
        rotation: {
          lon: value('projection.rotation.lon', layout.projection.rotation.lon),
          lat: value('projection.rotation.lat', layout.projection.rotation.lat),
          roll: layout.projection.rotation.roll,
        },
        scale: value('projection.scale', layout.projection.scale),
        ...(from.mode !== 'clipped' && {
          center: {
            lon: value('center.lon', layout.center.lon),
            lat: value('center.lat', layout.center.lat),
          },
        }),
      });
      const drag = moveGeoGesture(from, startGeoGesture(from, 340, 230), 370, 215);
      from.set(drag.state);
      const to = createGeoView(committed, SIZE, { previous: from });
      to.set(carryGeoViewState(from, to, from.state)!);
      for (const [lon, lat] of PROBES[o.probes]!) {
        const a = from.projectAt(from.state, lon, lat);
        const b = to.projectAt(to.state, lon, lat);
        // `projection.scale` is carried, and it is relative to the fit of the range box, which a
        // tilted globe's rotation changes by a hair: the picture is the same to a 20th of a px.
        if (a && b) expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeLessThan(0.05);
      }
    });

    it(`${name}: a view of another size shows the same map in its own rect`, () => {
      const layout = geoLayout(o);
      const from = createGeoView(layout, SIZE);
      from.set(moveGeoGesture(from, startGeoGesture(from, 340, 230), 385, 210, 1.7).state);
      const to = createGeoView(layout, { width: 500, height: 400 });
      to.set(carryGeoViewState(from, to, from.state)!);
      const was = from.toLayout();
      const is = to.toLayout();
      expect(is.rotation).toEqual(was.rotation);
      expect(is.scale).toBe(was.scale);
      if (from.mode !== 'clipped') {
        expect(is.center!.lon).toBeCloseTo(was.center!.lon, 6);
        expect(is.center!.lat).toBeCloseTo(was.center!.lat, 6);
      }
    });
  }

  it('has nothing to carry into another kind of map', () => {
    const from = viewOf({ type: 'natural earth' });
    expect(carryGeoViewState(from, viewOf({ type: 'robinson' }), from.state)).toBeNull();
    expect(carryGeoViewState(from, viewOf({ type: 'orthographic' }), from.state)).toBeNull();
    expect(carryGeoViewState(from, viewOf({ scope: 'europe' }), from.state)).toBeNull();
    const empty = createGeoView(geoLayout({ type: 'natural earth' }), { width: 0, height: 0 });
    expect(empty.valid).toBe(false);
    expect(carryGeoViewState(from, empty, from.state)).toBeNull();
    expect(carryGeoViewState(empty, from, empty.state)).toBeNull();
  });
});

describe('view keys (GEO6): a key is the gesture it stands for', () => {
  const RECT = { width: 600, height: 300 };

  it('Shift + arrows pan a scoped map by a tenth of the rect, the view going where the arrow points', () => {
    const view = viewOf({ scope: 'europe' });
    const [x, y] = view.midPoint;
    const middle = view.invertAt(view.state, x, y)!;
    const right = keyGeoView(view, 'panRight', RECT)!;
    expect(right.changed).toBe(true);
    // The same as the drag: what was in the middle is a tenth of the width to the west of it.
    expect(right.state).toEqual(dragGeoView(view, [x, y], [x - 60, y]).state);
    expect(Object.keys(right.relayout).sort()).toEqual(['geo.center.lat', 'geo.center.lon']);
    expect(right.relayout['geo.center.lon']).toBeGreaterThan(middle[0]);
    const up = keyGeoView(view, 'panUp', RECT)!;
    expect(up.state).toEqual(dragGeoView(view, [x, y], [x, y - 30]).state);
    expect(up.relayout['geo.center.lat']).toBeGreaterThan(middle[1]);
    expect(keyGeoView(view, 'panLeft', RECT)!.relayout['geo.center.lon']).toBeLessThan(middle[0]);
    expect(keyGeoView(view, 'panDown', RECT)!.relayout['geo.center.lat']).toBeLessThan(middle[1]);
    // The rotation and the scale are not touched: nothing is projected again.
    expect(right.state.rotation).toBe(view.state.rotation);
    expect(right.state.scale).toBe(view.state.scale);
  });

  it('turn a world map in longitude and move it up and down', () => {
    const view = viewOf({ type: 'natural earth' });
    const right = keyGeoView(view, 'panRight', RECT, 'geo2')!;
    expect(right.changed).toBe(true);
    expect(right.relayout['geo2.projection.rotation.lon']).toBeGreaterThan(0);
    expect(right.state.translate).toEqual(view.state.translate);
    const left = keyGeoView(view, 'panLeft', RECT)!;
    expect(left.relayout['geo.projection.rotation.lon']).toBeCloseTo(
      -(right.relayout['geo2.projection.rotation.lon'] as number),
      6,
    );
    const up = keyGeoView(view, 'panUp', RECT)!;
    expect(up.state.rotation).toEqual(view.state.rotation);
    expect(up.relayout['geo.center.lat']).toBeGreaterThan(0);
    expect(up.relayout).not.toHaveProperty(['geo.projection.rotation.lon']);
  });

  it('turn a globe in longitude and latitude, as far up as sideways', () => {
    const view = viewOf({ type: 'orthographic' });
    const right = keyGeoView(view, 'panRight', RECT)!;
    const up = keyGeoView(view, 'panUp', RECT)!;
    const lon = right.relayout['geo.projection.rotation.lon'] as number;
    const lat = up.relayout['geo.projection.rotation.lat'] as number;
    expect(lon).toBeGreaterThan(1);
    expect(lat).toBeCloseTo(lon, 6);
    expect(right.relayout).not.toHaveProperty(['geo.projection.rotation.lat']);
    expect(right.relayout).not.toHaveProperty(['geo.center.lon']);
    // The step is a tenth of the smaller side, in px: a zoomed globe turns by less.
    const [x, y] = view.midPoint;
    expect(right.state).toEqual(dragGeoView(view, [x, y], [x - GEO_KEY_PAN * 300, y]).state);
    const near = viewOf({ type: 'orthographic', scale: 4 });
    const less = keyGeoView(near, 'panRight', RECT)!.relayout['geo.projection.rotation.lon'];
    expect(less).toBeGreaterThan(0);
    expect(less).toBeLessThan(lon / 3);
  });

  it('+ and - zoom about the middle, inside minscale and maxscale', () => {
    for (const o of [
      { scope: 'europe' },
      { type: 'natural earth' },
      { type: 'orthographic' },
    ] as LayoutOptions[]) {
      const view = viewOf(o);
      const [x, y] = view.midPoint;
      const middle = view.invertAt(view.state, x, y)!;
      const closer = keyGeoView(view, 'zoomIn', RECT)!;
      expect(closer.relayout['geo.projection.scale']).toBeCloseTo(GEO_KEY_ZOOM, 9);
      expect(closer.state).toEqual(zoomGeoView(view, GEO_KEY_ZOOM, x, y).state);
      view.set(closer.state);
      // What was in the middle stays there.
      expect(miss(view, middle, [x, y])).toBeLessThan(1e-6);
      const back = keyGeoView(view, 'zoomOut', RECT)!;
      expect(back.state.scale).toBeCloseTo(1, 9);
    }
    const limited = viewOf({ type: 'natural earth', minscale: 0.9, maxscale: 1.1 });
    expect(keyGeoView(limited, 'zoomIn', RECT)!.relayout['geo.projection.scale']).toBe(1.1);
    expect(keyGeoView(limited, 'zoomOut', RECT)!.relayout['geo.projection.scale']).toBe(0.9);
    limited.set(keyGeoView(limited, 'zoomIn', RECT)!.state);
    // At the limit a key changes nothing.
    expect(keyGeoView(limited, 'zoomIn', RECT)!.changed).toBe(false);
  });

  it('a committed key gives the view it previewed', () => {
    // A globe's range box follows its rotation through the layout defaults, which `relaid` does
    // not run: the browser specs (tests/interaction/keyboard-geo.spec.ts) cover it.
    const cases: LayoutOptions[] = [
      { scope: 'africa' },
      { type: 'robinson' },
      { type: 'mercator' },
    ];
    for (const o of cases) {
      for (const action of ['panLeft', 'panUp', 'zoomIn']) {
        const layout = geoLayout(o);
        const view = createGeoView(layout, SIZE);
        const step = keyGeoView(view, action, SIZE)!;
        expect(step.changed).toBe(true);
        view.set(step.state);
        const next = createGeoView(relaid(layout, step.relayout), SIZE);
        const [lon, lat] = view.invertAt(view.state, 350, 225)!;
        const a = view.projectAt(view.state, lon, lat)!;
        const b = next.projectAt(next.state, lon, lat)!;
        expect(Math.hypot(a[0] - b[0], a[1] - b[1]), `${o.scope ?? o.type} ${action}`).toBeLessThan(
          0.05,
        );
      }
    }
  });

  it('knows no other key, and does nothing on a view that is not valid', () => {
    const view = viewOf({ type: 'natural earth' });
    expect(keyGeoView(view, 'reset', RECT)).toBeUndefined();
    expect(keyGeoView(view, 'left', RECT)).toBeUndefined();
    const empty = createGeoView(geoLayout({ type: 'natural earth' }), { width: 0, height: 0 });
    expect(keyGeoView(empty, 'zoomIn', RECT)).toBeUndefined();
  });
});
