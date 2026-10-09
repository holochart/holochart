import { geoOrthographic, geoRotation } from 'd3-geo';
import fc from 'fast-check';
import { Matrix4, Vector3, type OrthographicCamera } from 'three';
import { describe, expect, it } from 'vitest';
import { Viewport, type RGBA } from '@mk7s/holochart-render';
import type { SubplotViewportOptions } from '@mk7s/holochart-runtime';
import { layoutFigure, plotContext, PLOT_AREA } from '../scattergeo/__testing__/figure.ts';
import { scattergeo } from '../scattergeo/index.ts';
import { globePoint, globeRotation } from './globe-frame.ts';
import type { GeoSubplot, GeoViewportSource } from './subplot.ts';

type Layout = Record<string, unknown>;

/** A laid out subplot with one point on it. */
function subplotOf(geo: Layout, lon: number[] = [0], lat: number[] = [0]): GeoSubplot {
  return layoutFigure({
    data: [{ type: 'scattergeo', lon, lat }],
    layout: { geo },
  }).subplot();
}

/** A globe that shows what its layout says: no fit to the one point on it. */
function globe(projection: Layout = {}, geo: Layout = {}): GeoSubplot {
  return subplotOf({ fitbounds: false, ...geo, projection: { ...projection, type: 'globe3d' } });
}

function flatOf(projection: Layout = {}): GeoSubplot {
  return subplotOf({ fitbounds: false, projection: { ...projection, type: 'orthographic' } });
}

const RADIANS = Math.PI / 180;

/** The cosine of a point's latitude after d3's rotation: 0 at the top and bottom of the disc. */
function turnedCosLat(
  rotation: { lon: number; lat: number; roll: number },
  lon: number,
  lat: number,
) {
  const turned = geoRotation([-rotation.lon, -rotation.lat, rotation.roll])([lon, lat]);
  return { cosLat: Math.cos(turned[1] * RADIANS), lon: turned[0], lat: turned[1] };
}

const HOST = { invalidate: () => {}, canvasWidth: 880, canvasHeight: 480, pixelRatio: 1 };

/** What the runtime does for a key: one viewport, its kind fixed by the first call. */
function runtimeViewports(): {
  ctx: GeoViewportSource;
  made: Map<string, Viewport>;
  asked: [string, SubplotViewportOptions][];
} {
  const made = new Map<string, Viewport>();
  const asked: [string, SubplotViewportOptions][] = [];
  const ctx: GeoViewportSource = {
    subplotViewport(key, options) {
      asked.push([key, options]);
      let vp = made.get(key);
      if (!vp) {
        vp = new Viewport(
          HOST,
          options.kind === '2d'
            ? { kind: '2d', clip: true, rect: options.rect }
            : { kind: '3d', projection: options.projection ?? 'perspective', rect: options.rect },
        );
        made.set(key, vp);
      }
      vp.setRect(options.rect);
      if (vp.kind === '3d') vp.setProjection(options.projection ?? 'perspective');
      vp.background = options.background ?? null;
      return vp;
    },
  };
  return { ctx, made, asked };
}

/** A world point as the viewport's camera draws it: px from the rect's bottom-left, and NDC depth. */
function drawn(
  viewport: Viewport,
  x: number,
  y: number,
  z: number,
  clip: { x: number; y: number; width: number; height: number } = viewport.rect,
): [number, number, number] {
  const camera = viewport.camera;
  camera.updateMatrixWorld(true);
  const ndc = new Vector3(x, y, z).project(camera);
  const { width, height } = viewport.rect;
  // A globe's viewport is the subplot's whole domain; its world is px of `clip` (the clip rect).
  const dx = clip.x - viewport.rect.x;
  const dy = viewport.rect.y + height - (clip.y + clip.height);
  return [((ndc.x + 1) / 2) * width - dx, ((ndc.y + 1) / 2) * height - dy, ndc.z];
}

const rotationArb = fc.record({
  lon: fc.double({ min: -180, max: 180, noNaN: true }),
  lat: fc.double({ min: -90, max: 90, noNaN: true }),
  roll: fc.double({ min: -180, max: 180, noNaN: true }),
});
const lonLatArb = fc.tuple(
  fc.double({ min: -180, max: 180, noNaN: true }),
  fc.double({ min: -90, max: 90, noNaN: true }),
);

describe('globe coordinates', () => {
  it('put longitude 0 on the equator in front, east to the right and north up', () => {
    const at = (lon: number, lat: number, r = 1): number[] => globePoint(lon, lat, r, [0, 0, 0]);
    const close = (a: number[], b: number[]): void => {
      a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, 12));
    };
    close(at(0, 0), [0, 0, 1]);
    close(at(90, 0), [1, 0, 0]);
    close(at(0, 90), [0, 1, 0]);
    close(at(180, 0), [0, 0, -1]);
    close(at(-90, 0, 2), [-2, 0, 0]);
    // Writes at an offset, into any array.
    const out = new Float32Array(6);
    expect(globePoint(90, 0, 3, out, 3)).toBe(out);
    expect([...out]).toEqual([0, 0, 0, 3, 0, expect.closeTo(0, 6)]);
  });

  it('are turned by the rotation d3 applies for projection.rotation', () => {
    fc.assert(
      fc.property(rotationArb, lonLatArb, (rotation, [lon, lat]) => {
        const m = globeRotation(rotation, new Matrix4());
        const p = new Vector3(...globePoint(lon, lat, 1, [0, 0, 0])).applyMatrix4(m);
        // d3's rotation of the same point, as globe coordinates. d3 returns a longitude and a
        // latitude, found by `atan2` and `asin`, which lose digits where the turned point is
        // near a pole: there the comparison is as coarse as d3's answer.
        const turned = turnedCosLat(rotation, lon, lat);
        const q = globePoint(turned.lon, turned.lat, 1, [0, 0, 0]);
        const eps = 1e-12 + 1e-15 / Math.max(turned.cosLat, 1e-9);
        expect(Math.abs(p.x - q[0]!)).toBeLessThan(eps);
        expect(Math.abs(p.y - q[1]!)).toBeLessThan(eps);
        expect(Math.abs(p.z - q[2]!)).toBeLessThan(eps);
        // And what d3's orthographic projection draws with that rotation (its y is down).
        const projection = geoOrthographic()
          .rotate([-rotation.lon, -rotation.lat, rotation.roll])
          .scale(1)
          .translate([0, 0]);
        const px = projection([lon, lat])!;
        expect(Math.abs(p.x - px[0])).toBeLessThan(eps);
        expect(Math.abs(p.y + px[1])).toBeLessThan(eps);
        // A rotation: lengths are kept, and it is no mirror.
        expect(p.length()).toBeCloseTo(1, 12);
        expect(m.determinant()).toBeCloseTo(1, 12);
      }),
    );
  });

  it('bring the point the rotation names to the front', () => {
    const m = globeRotation({ lon: 37, lat: -52, roll: 80 }, new Matrix4());
    const p = new Vector3(...globePoint(37, -52, 1, [0, 0, 0])).applyMatrix4(m);
    expect(p.x).toBeCloseTo(0, 12);
    expect(p.y).toBeCloseTo(0, 12);
    expect(p.z).toBeCloseTo(1, 12);
  });
});

describe('GeoSubplot.globe', () => {
  it("is set by projection.type 'globe3d' alone", () => {
    expect(globe().globe).toBe(true);
    expect(globe().view?.mode).toBe('clipped');
    expect(flatOf().globe).toBe(false);
    expect(subplotOf({}).globe).toBe(false);
    // The key of the globe's own viewport; the 2D viewport has the subplot's id.
    expect(globe().viewportKey).toBe('geo-globe');
  });

  it('lays the subplot out as the orthographic projection does', () => {
    for (const projection of [{}, { rotation: { lon: 50, lat: 20, roll: 15 }, scale: 3 }]) {
      const a = globe(projection);
      const b = flatOf(projection);
      expect(a.clipRect).toEqual(b.clipRect);
      expect(a.transform).toEqual(b.transform);
      expect(a.basePoint(10, 20)).toEqual(b.basePoint(10, 20));
    }
  });
});

describe('GeoSubplot.viewport', () => {
  const white: RGBA = [1, 1, 1, 1];

  it("asks for the subplot's 2D viewport by its id, and remembers the background", () => {
    const sp = flatOf();
    const { ctx, asked, made } = runtimeViewports();
    const vp = sp.viewport(ctx, white);
    expect(asked).toEqual([['geo', { kind: '2d', rect: sp.clipRect, background: null }]]);
    expect(vp).toBe(made.get('geo'));
    expect(vp?.kind).toBe('2d');
    expect(vp?.background).toEqual(white);
    // A caller that does not decide the background (a trace) leaves it as it is.
    expect(sp.viewport(ctx)?.background).toEqual(white);
    expect(sp.viewport(ctx, null)?.background).toBeNull();
    expect(sp.globeViewport(ctx)).toBeUndefined();
    // A context without subplot viewports has none to give.
    expect(sp.viewport({})).toBeUndefined();
    expect(globe().viewport({})).toBeUndefined();
    expect(globe().globeViewport({})).toBeUndefined();
  });

  it('gives a globe a 3D viewport with an orthographic camera under its 2D viewport', () => {
    const sp = globe();
    const { ctx, asked, made } = runtimeViewports();
    const flat = sp.viewport(ctx, white)!;
    // The globe's viewport is asked for first, so the runtime draws it first.
    expect(asked).toEqual([
      // The globe's viewport is the whole domain: arcs and prisms rise past the disc's box.
      ['geo-globe', { kind: '3d', projection: 'orthographic', rect: sp.rect, background: null }],
      ['geo', { kind: '2d', rect: sp.clipRect, background: null }],
    ]);
    const vp = made.get('geo-globe')!;
    expect(flat).toBe(made.get('geo'));
    expect(flat.kind).toBe('2d');
    expect(vp.kind).toBe('3d');
    expect((vp.camera as OrthographicCamera).isOrthographicCamera).toBe(true);
    // The background is the globe's viewport's; the 2D one above it has none.
    expect(vp.background).toEqual(white);
    expect(flat.background).toBeNull();
    // The same viewports for the component and for every trace of the subplot.
    expect(sp.globeViewport(ctx)).toBe(vp);
    expect(vp.background).toEqual(white);
    expect(sp.viewport(ctx)).toBe(flat);
  });

  it("draws a globe's 2D viewport after its 3D one, on a clean depth buffer", () => {
    // A flat map first: its 2D viewport is the older of the two, and keeps the depth it finds.
    const { ctx, made } = runtimeViewports();
    const flat = flatOf().viewport(ctx, white)!;
    expect(flat.clearDepth).toBe(false);
    const order = flat.order;
    // The same subplot as a globe: the body writes depth under everything the 2D viewport draws,
    // which tests it, so the depth is cleared in between; and the 2D viewport is drawn second.
    const sp = globe();
    expect(sp.viewport(ctx, white)).toBe(flat);
    const vp = made.get('geo-globe')!;
    expect(flat.clearDepth).toBe(true);
    expect(vp.order).toBe(order);
    expect(flat.order).toBeGreaterThan(vp.order);
    // Flat again: the 2D viewport leaves the depth alone, as every flat map's does.
    expect(flatOf().viewport(ctx, white)).toBe(flat);
    expect(flat.clearDepth).toBe(false);
  });

  it('a flat map and a globe of one subplot share the 2D viewport', () => {
    const { ctx, made } = runtimeViewports();
    const flat = flatOf().viewport(ctx);
    const round = globe().viewport(ctx);
    expect(flat).toBe(round);
    expect(globe().globeViewport(ctx)?.kind).toBe('3d');
    expect([...made.keys()]).toEqual(['geo', 'geo-globe']);
  });

  it('places the camera so that world units are px of the clip rect, y up, z to the viewer', () => {
    for (const geo of [{}, { domain: { x: [0.1, 0.7], y: [0.2, 1] } }]) {
      const sp = globe({ rotation: { lon: 30, lat: 20, roll: 0 }, scale: 1.7 }, geo);
      const vp = sp.globeViewport(runtimeViewports().ctx)!;
      const { width, height } = sp.clipRect;
      expect(vp.size.width).toBe(Math.max(1, sp.rect.width));
      expect(vp.size.height).toBe(Math.max(1, sp.rect.height));
      for (const [x, y, z] of [
        [0, 0, 0],
        [width, height, 0],
        [width / 3, height / 5, 0],
        [12.5, 7.25, sp.globeRadius],
        [12.5, 7.25, -sp.globeRadius],
      ] as const) {
        const at = drawn(vp, x, y, z, sp.clipRect);
        expect(at[0]).toBeCloseTo(x, 9);
        expect(at[1]).toBeCloseTo(y, 9);
      }
      // Nearer to the viewer is a smaller depth.
      expect(drawn(vp, 0, 0, 10)[2]).toBeLessThan(drawn(vp, 0, 0, -10)[2]);
      // The camera stands over the middle of the domain, in px of the clip rect.
      const camera = vp.camera;
      const clip = sp.clipRect;
      expect(camera.position.x).toBeCloseTo(sp.rect.x + sp.rect.width / 2 - clip.x, 9);
      expect(camera.position.y).toBeCloseTo(
        clip.y + clip.height - (sp.rect.y + sp.rect.height / 2),
        9,
      );
      const towards = camera.getWorldDirection(new Vector3());
      expect(towards.distanceTo(new Vector3(0, 0, -1))).toBe(0);
    }
  });

  it('draws what the 2D code positions on the same px as a 2D viewport does', () => {
    const projection = { rotation: { lon: -40, lat: 35, roll: 5 }, scale: 2.2 };
    const round = globe(projection);
    const flat = flatOf(projection);
    const { ctx } = runtimeViewports();
    const vp3 = round.globeViewport(ctx)!;
    const vp2 = flat.viewport(ctx)!;
    // The 2D viewport is the disc's box; the globe's is the whole domain around it.
    expect(vp2.rect).toEqual(flat.clipRect);
    expect(vp3.rect).toEqual(round.rect);
    for (const [lon, lat] of [
      [-40, 35],
      [-60, 10],
      [0, 60],
    ] as const) {
      const base = round.basePoint(lon, lat)!;
      const t = round.transform;
      const x = base[0] * t.scaleX + t.offsetX;
      const y = base[1] * t.scaleY + t.offsetY;
      const a = drawn(vp3, x, y, 0, round.clipRect);
      const b = drawn(vp2, x, y, 0);
      expect(a[0]).toBeCloseTo(b[0], 9);
      expect(a[1]).toBeCloseTo(b[1], 9);
    }
  });

  it('keeps the sphere, and a radius above it, between the near and far planes at any zoom', () => {
    const inside = (vp: Viewport, z: number): boolean => {
      const depth = drawn(vp, 0, 0, z)[2];
      return depth > -1 && depth < 1;
    };
    for (const scale of [0.2, 1, 6, 40, 400]) {
      const sp = globe({ scale, maxscale: 1000 });
      const vp = sp.globeViewport(runtimeViewports().ctx)!;
      const r = sp.globeRadius;
      expect(r).toBeCloseTo(sp.view!.fitScale * scale, 6);
      for (const z of [0, r, -r, 2 * r, -2 * r]) expect(inside(vp, z), `${scale}: ${z}`).toBe(true);
      expect(vp.camera.near).toBeGreaterThan(0);
      // The planes survive a resize, which lays the viewport out again.
      const { near, far } = vp.camera;
      vp.layout();
      vp.setRect({ ...sp.clipRect, width: sp.clipRect.width + 10 });
      expect(vp.camera.near).toBe(near);
      expect(vp.camera.far).toBe(far);
      for (const z of [r, -r, 2 * r, -2 * r]) expect(inside(vp, z)).toBe(true);
    }
    // A radius far past a 3D viewport's default far plane of 1,000.
    expect(globe({ scale: 40, maxscale: 1000 }).globeRadius).toBeGreaterThan(1000);
  });

  it('follows a zoom made between layout passes, on notify', () => {
    const sp = globe({ maxscale: 1000 });
    const vp = sp.globeViewport(runtimeViewports().ctx)!;
    const before = sp.globeRadius;
    // Out of what the camera saw before the zoom.
    expect(drawn(vp, 0, 0, 50 * before)[2]).toBeLessThan(-1);
    let told = 0;
    sp.onChange(() => told++);
    sp.view!.set({ scale: 50 });
    sp.notify();
    expect(told).toBe(1);
    const r = sp.globeRadius;
    expect(r).toBeCloseTo(before * 50, 6);
    for (const z of [r, -r, 2 * r, -2 * r]) {
      const depth = drawn(vp, 0, 0, z)[2];
      expect(depth > -1 && depth < 1, String(z)).toBe(true);
    }
  });

  it('leaves a stand-in viewport of a hand-built context alone', () => {
    const f = layoutFigure({
      data: [{ type: 'scattergeo', lon: [0], lat: [0] }],
      layout: { geo: { projection: { type: 'globe3d' } } },
    });
    const h = plotContext(f);
    expect(() => scattergeo.plot!.create(h.ctx)).not.toThrow();
    expect([...h.viewports.keys()]).toEqual(['geo-globe', 'geo']);
    expect(h.asked[0]).toMatchObject({ kind: '3d', projection: 'orthographic' });
    expect(h.added.size).toBeGreaterThan(0);
    // What the 2D code positions goes in the 2D viewport, on a globe too.
    for (const vp of h.added.values()) expect(vp).toBe(h.viewports.get('geo'));
  });
});

describe('GeoSubplot.globeMatrix', () => {
  it('puts a point of the sphere where the 2D code draws it, the near side in front', () => {
    fc.assert(
      fc.property(
        rotationArb,
        fc.double({ min: 0.2, max: 30, noNaN: true }),
        fc.array(lonLatArb, { minLength: 1, maxLength: 12 }),
        fc.boolean(),
        (rotation, scale, points, zoomed) => {
          // Half of the runs reach the scale by a zoom, so that the view has a transform.
          const sp = globe({ rotation, scale: zoomed ? 1 : scale, maxscale: 100 });
          const view = sp.view!;
          if (zoomed) view.set({ scale });
          const m = sp.globeMatrix(new Matrix4());
          const t = sp.transform;
          const centre = new Vector3(0, 0, 0).applyMatrix4(m);
          expect(centre.z).toBe(0);
          for (const [lon, lat] of points) {
            const p = new Vector3(...globePoint(lon, lat, 1, [0, 0, 0])).applyMatrix4(m);
            // On the sphere of the globe's radius about its centre.
            expect(p.distanceTo(centre) / sp.globeRadius).toBeCloseTo(1, 9);
            const turned = turnedCosLat(rotation, lon, lat);
            const base = sp.basePoint(lon, lat);
            if (base) {
              // d3 finds the turned latitude by `asin`, which loses digits at the top and the
              // bottom of the disc: within a thousandth of a degree of them its own px are
              // coarser than the 1e-6 px asked of every other point.
              const eps = turned.cosLat > 1e-5 ? 1e-6 : 1e-3;
              expect(Math.abs(p.x - (base[0] * t.scaleX + t.offsetX))).toBeLessThan(eps);
              expect(Math.abs(p.y - (base[1] * t.scaleY + t.offsetY))).toBeLessThan(eps);
              expect(p.z).toBeGreaterThan(0);
            } else {
              // Hidden by the clip: the far side, or the rim within the clip's pad of it.
              expect(p.z).toBeLessThan(sp.globeRadius * 1e-4);
            }
            // The far hemisphere, by d3's own rotation, is behind the centre.
            const depth = Math.cos(turned.lon * RADIANS) * turned.cosLat;
            if (depth < -1e-9) expect(p.z).toBeLessThan(0);
            if (depth > 1e-9) expect(p.z).toBeGreaterThan(0);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('follows a subplot whose clip rect is not its domain, and a centre off the rotation', () => {
    // The range box of a narrow range is smaller than the domain, and the centre moves the map.
    const sp = subplotOf({
      fitbounds: false,
      projection: { type: 'globe3d', rotation: { lon: 10, lat: 20 }, scale: 1.5 },
      center: { lon: 25, lat: 30 },
      lonaxis: { range: [-20, 40] },
      lataxis: { range: [0, 45] },
    });
    expect(sp.clipRect).not.toEqual({ ...PLOT_AREA });
    const m = sp.globeMatrix(new Matrix4());
    const t = sp.transform;
    for (const [lon, lat] of [
      [10, 20],
      [25, 30],
      [-15, 5],
      [38, 44],
    ] as const) {
      const base = sp.basePoint(lon, lat)!;
      const p = new Vector3(...globePoint(lon, lat, 1, [0, 0, 0])).applyMatrix4(m);
      expect(Math.abs(p.x - (base[0] * t.scaleX + t.offsetX))).toBeLessThan(1e-6);
      expect(Math.abs(p.y - (base[1] * t.scaleY + t.offsetY))).toBeLessThan(1e-6);
      expect(p.z).toBeGreaterThan(0);
    }
  });

  it('changes with a rotation and a zoom and with nothing else', () => {
    const sp = globe({ rotation: { lon: 10, lat: 20, roll: 0 } });
    const a = sp.globeMatrix(new Matrix4()).clone();
    expect(sp.globeMatrix(new Matrix4()).equals(a)).toBe(true);
    sp.view!.set({ rotation: { lon: 60 } });
    const b = sp.globeMatrix(new Matrix4()).clone();
    expect(b.equals(a)).toBe(false);
    sp.view!.set({ scale: 2 });
    const c = sp.globeMatrix(new Matrix4());
    expect(c.getMaxScaleOnAxis() / b.getMaxScaleOnAxis()).toBeCloseTo(2, 9);
    // The identity while there is nothing to draw.
    const empty = subplotOf({ projection: { type: 'globe3d' }, domain: { x: [0.5, 0.5] } });
    if (!empty.view?.valid) {
      expect(empty.globeMatrix(new Matrix4()).equals(new Matrix4())).toBe(true);
      expect(empty.globeRadius).toBe(0);
    }
  });
});
