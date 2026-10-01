import fc from 'fast-check';
import { Object3D } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createResourceManager } from '../resources.ts';
import type { Primitive, RGBA } from '../types.ts';
import {
  arcShapes,
  buildPrisms,
  domainActive,
  domainDepth,
  domainHover,
  domainPointer,
  DomainCamera,
  over,
  paperColor,
  rectShapes,
  syncDomain,
  type DomainHost,
  type ShapeStyle,
} from './extrusion-domain.ts';
import { PrismBuffers } from './extrusion-geometry.ts';
import { loadMeshModule } from './mesh-loader.ts';

/**
 * Domain traces in 2.5D (plan E8.9, E9.12): pie sectors and treemap tiles as prisms, per-item
 * depth, the trace's own tilted camera (pointer inverse mapping), and the capture of a trace
 * view's primitives.
 */

const WHITE: RGBA = [1, 1, 1, 1];

function style(trace: Record<string, unknown>, paper: RGBA = WHITE): ShapeStyle {
  return { trace, bevel: 0, segments: 3, paper };
}

/** Pie-like arc data (world px): one wedge per slice plus an outline rim each (`per` 2). */
function pieArcs(n: number, pull = 0) {
  const x: number[] = [];
  const y: number[] = [];
  const start: number[] = [];
  const end: number[] = [];
  for (let k = 0; k < n; k++) {
    const a0 = (k / n) * 2 * Math.PI;
    const a1 = ((k + 1) / n) * 2 * Math.PI;
    const mid = (a0 + a1) / 2;
    const cx = 200 + (k === 0 ? Math.cos(mid) * pull : 0);
    const cy = 150 + (k === 0 ? Math.sin(mid) * pull : 0);
    // The wedge, then its rim (same center and angles, like the pie's outline rims).
    x.push(cx, cx);
    y.push(cy, cy);
    start.push(a0, a0);
    end.push(a1, a1);
  }
  return {
    x: Float64Array.from(x),
    y: Float64Array.from(y),
    innerRadius: 0,
    outerRadius: 100,
    startAngle: Float32Array.from(start),
    endAngle: Float32Array.from(end),
    fill: [1, 0, 0, 1] as RGBA,
    opacity: 1,
  };
}

describe('domainDepth / domainActive', () => {
  it('reads px, percentages of the shape size and per-item arrays; at least a hair', () => {
    expect(domainDepth(12, 0, 100)).toBe(12);
    expect(domainDepth('20%', 0, 150)).toBeCloseTo(30);
    expect(domainDepth('7', 0, 150)).toBe(7);
    expect(domainDepth([5, 9, 13], 2, 0)).toBe(13);
    expect(domainDepth(0, 0, 100)).toBeGreaterThan(0);
    expect(domainDepth([1, 'x'], 1, 0)).toBeGreaterThan(0);
    expect(domainDepth(-3, 0, 100)).toBeLessThan(0.01);
  });

  it('is on with a tilt or a depth other than 0', () => {
    expect(domainActive({})).toBe(false);
    expect(domainActive({ depth: 0, tilt: 0 })).toBe(false);
    expect(domainActive({ depth: '0%' })).toBe(false);
    expect(domainActive({ tilt: 30 })).toBe(true);
    expect(domainActive({ depth: 10 })).toBe(true);
    expect(domainActive({ depth: '15%' })).toBe(true);
    expect(domainActive({ depth: [0, 0, 4] })).toBe(true);
    expect(domainActive({ depth: [0, 0] })).toBe(false);
  });
});

describe('over / paperColor', () => {
  it('composites translucent colors over what is under them, opaque', () => {
    expect(over([1, 0, 0, 0.5], [0, 0, 1, 1])).toEqual([0.5, 0, 0.5, 1]);
    expect(over([1, 0, 0, 1], [0, 0, 1, 1], 0.25)).toEqual([0.25, 0, 0.75, 1]);
    expect(paperColor('#000000')).toEqual([0, 0, 0, 1]);
    expect(paperColor('rgba(255, 0, 0, 0.2)')).toEqual([1, 0, 0, 1]);
    expect(paperColor(undefined)).toEqual([1, 1, 1, 1]);
    expect(paperColor('transparent')).toEqual([1, 1, 1, 1]);
  });
});

describe('arcShapes', () => {
  it('extrudes one sector per slice, skipping outline rims, with per-slice depth', () => {
    const shapes = arcShapes(pieArcs(4), style({ depth: [10, 20, 30, 40, 50] }), [4, 3, 2, 1]);
    expect(shapes).toHaveLength(4);
    // Slice k reads the depth of its item.
    expect(shapes.map((s) => s.z1)).toEqual([50, 40, 30, 20]);
    expect(shapes.every((s) => s.z0 === 0 && !s.hidden && !s.rect)).toBe(true);
    // Each slice's footprint is its quarter of the disc.
    const [q0] = shapes;
    expect(q0!.box[0]).toBeCloseTo(200);
    expect(q0!.box[1]).toBeCloseTo(150);
    expect(q0!.box[2]).toBeCloseTo(300);
    expect(q0!.box[3]).toBeCloseTo(250);
  });

  it('moves pulled slices with their centers, and opens gaps for outlines', () => {
    const pulled = arcShapes(pieArcs(4, 30), style({ depth: 10 }), [0, 1, 2, 3]);
    const flat = arcShapes(pieArcs(4), style({ depth: 10 }), [0, 1, 2, 3]);
    const d = Math.SQRT1_2 * 30;
    expect(pulled[0]!.box[0] - flat[0]!.box[0]).toBeCloseTo(d);
    expect(pulled[0]!.box[1] - flat[0]!.box[1]).toBeCloseTo(d);
    expect(pulled[1]!.box).toEqual(flat[1]!.box);
    const seam = arcShapes({ ...pieArcs(4), borderWidth: 2 }, style({ depth: 10 }), [0, 1, 2, 3]);
    // Moved out by the half width along the bisector, and narrower at the rim.
    expect(seam[0]!.box[0]).toBeGreaterThan(flat[0]!.box[0] + 1);
    expect(seam[0]!.box[2] - seam[0]!.box[0]).toBeLessThan(flat[0]!.box[2] - flat[0]!.box[0]);
  });

  it('makes annular sectors for donuts', () => {
    const [s] = arcShapes({ ...pieArcs(1), innerRadius: 40 }, style({ depth: 5 }), [0]);
    const r = s!.outline.x.map((x, i) => Math.hypot(x - 200, s!.outline.y[i]! - 150));
    expect(Math.min(...r)).toBeCloseTo(40);
    expect(Math.max(...r)).toBeCloseTo(100);
    const out = new PrismBuffers();
    buildPrisms(out, [s!], 3);
    expect(out.indices.length).toBeGreaterThan(0);
  });

  it('draws translucent slices composited over the paper, hides transparent ones', () => {
    // Per arc (wedges and rims): a half-transparent red slice, a transparent one.
    const fill = Float32Array.from([1, 0, 0, 0.5, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1]);
    const d = { ...pieArcs(2), fill };
    const shapes = arcShapes(d, style({ depth: 5 }, [0, 0, 1, 1]), [0, 1]);
    expect(shapes[0]!.color).toEqual([0.5, 0, 0.5, 1]);
    expect(shapes[1]!.hidden).toBe(true);
    const out = new PrismBuffers();
    buildPrisms(out, shapes, 3);
    expect(new Set(out.items)).toEqual(new Set([0]));
  });
});

describe('rectShapes', () => {
  const tiles = {
    // The root, a branch in it, a leaf in the branch, and a leaf beside the branch.
    x0: [0, 10, 20, 200],
    y0: [0, 10, 20, 10],
    x1: [300, 190, 100, 290],
    y1: [200, 190, 100, 190],
    fill: Float32Array.from([1, 1, 1, 0, 0, 0, 1, 1, 1, 0, 0, 0.5, 0, 1, 0, 1]),
    borderWidth: 2,
    items: [7, 8, 9, 10],
  };

  it('stacks tiles on the tiles they lie in, with per-node depth', () => {
    const depth = [1, 1, 1, 1, 1, 1, 1, 5, 10, 20, 40];
    const shapes = rectShapes(tiles, style({ depth }));
    expect(shapes.map((s) => [s.z0, s.z1])).toEqual([
      [0, 5],
      [5, 15],
      [15, 35],
      [5, 45],
    ]);
    // The root is transparent: not drawn, but stacked on.
    expect(shapes[0]!.hidden).toBe(true);
    // Inset by half the outline width.
    expect(shapes[1]!.box).toEqual([11, 11, 189, 189]);
  });

  it('shows translucent tiles over their parent', () => {
    const shapes = rectShapes(tiles, style({ depth: 3 }));
    // The leaf (half-transparent red) over the branch (blue), itself over the paper (the root is
    // transparent).
    expect(shapes[2]!.color).toEqual([0.5, 0, 0.5, 1]);
  });
});

describe('DomainCamera', () => {
  const rect = { x: 40, y: 30, width: 400, height: 300 };
  const H = 400;

  it('draws the plane where the flat trace is at tilt 0', () => {
    const cam = new DomainCamera(rect, H, 0, 0.5);
    const [x, y] = cam.toScreen(120, H - 200, 0);
    expect(x).toBeCloseTo(120, 6);
    expect(y).toBeCloseTo(H - 200, 6);
    expect(cam.unproject(120, 200)[0]).toBeCloseTo(120, 6);
    expect(cam.unproject(120, 200)[1]).toBeCloseTo(200, 6);
  });

  it('lays the trace back: its near edge comes down, raised points go up', () => {
    const cam = new DomainCamera(rect, H, 40, 0.5);
    const top = cam.toScreen(240, H - 40, 0);
    const bottom = cam.toScreen(240, H - 320, 0);
    const raised = cam.toScreen(240, H - 320, 30);
    // Container y = H − world y: the far (top) edge is foreshortened toward the middle.
    expect(H - top[1]).toBeGreaterThan(40);
    expect(H - raised[1]).toBeLessThan(H - bottom[1]);
    // Nearer points draw with a larger overlay depth (in front).
    expect(raised[2]).toBeGreaterThan(bottom[2]);
    expect(bottom[2]).toBeLessThan(0);
  });

  it('maps the pointer back onto the flat trace through the tops (inverse of project)', () => {
    const tile = rectShapes(
      { x0: [100], y0: [80], x1: [380], y1: [300], fill: [1, 0, 0, 1] },
      style({ depth: 25 }),
    );
    fc.assert(
      fc.property(
        fc.double({ min: -70, max: 70, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 110, max: 370, noNaN: true }),
        fc.double({ min: H - 290, max: H - 90, noNaN: true }),
        (tilt, perspective, x, cy) => {
          const cam = new DomainCamera(rect, H, tilt, perspective);
          cam.shapes = tile;
          const [sx, sy] = cam.project(x, cy);
          const [fx, fy] = cam.unproject(sx, sy);
          expect(fx).toBeCloseTo(x, 3);
          expect(fy).toBeCloseTo(cy, 3);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('maps a pointer on a front wall inside that shape', () => {
    const cam = new DomainCamera(rect, H, 45, 0.5);
    cam.shapes = rectShapes(
      { x0: [100], y0: [200], x1: [300], y1: [300], fill: [1, 0, 0, 1] },
      style({ depth: 40 }),
    );
    // Halfway up the front wall (world y 200): on the plane, below the tile.
    const [sx, sy] = cam.toScreen(200, 200, 20);
    const [fx, fy] = cam.unproject(sx, H - sy);
    expect(fx).toBeCloseTo(200, 3);
    expect(H - fy).toBeGreaterThan(200);
    expect(H - fy).toBeLessThan(201);
  });
});

/** A fake flat primitive that records its updates. */
function fakePrimitive(): Primitive<unknown> & { updates: unknown[] } {
  const p = {
    object: new Object3D(),
    updates: [] as unknown[],
    update(d: unknown) {
      p.updates.push(d);
    },
    setTransform() {},
    setViewport() {},
    dispose() {},
  };
  return p;
}

describe('syncDomain', () => {
  function host(trace: Record<string, unknown>, live: Set<Primitive<unknown>>) {
    const added: Primitive<unknown>[] = [];
    const h: DomainHost & { added: Primitive<unknown>[] } = {
      primitives: { resources: createResourceManager(), invalidate: vi.fn<() => void>() },
      trace,
      calc: {},
      domain: { rect: { x: 0, y: 0, width: 400, height: 300 } },
      viewport: { size: { width: 400, height: 300, pixelRatio: 1 }, primitives: live },
      add: (p) => void added.push(p),
      remove: (p) => void added.splice(added.indexOf(p), 1),
      added,
    };
    return h;
  }

  it('draws captured shapes as prisms, projects labels, and restores them when flat', async () => {
    const mesh = await loadMeshModule();
    const arcs = fakePrimitive();
    const text = fakePrimitive();
    const live = new Set<Primitive<unknown>>([arcs, text]);
    const view = { update: vi.fn() };
    const h = host({ depth: 20, tilt: 40 }, live);
    // Primitives the view made before they were captured: it is asked to draw again.
    view.update.mockImplementation(() => {
      arcs.update(pieArcs(3));
      text.update({ labels: [{ text: 'a', x: 200, y: 150, angle: 30 }] });
    });
    let p = syncDomain(undefined, h, view, [arcs, text], mesh, [0, 1, 2]);
    expect(view.update).toHaveBeenCalledTimes(1);
    expect(p).toBeDefined();
    expect(h.added).toEqual([p]);
    expect(arcs.object.visible).toBe(false);
    // The flat arcs keep their data; the label is projected (and in depth).
    expect(arcs.updates.at(-1)).toMatchObject({ outerRadius: 100 });
    const label = (text.updates.at(-1) as { labels: Record<string, number>[] }).labels[0]!;
    expect(label['y']).not.toBeCloseTo(150, 0);
    expect(label['z']).toBeLessThan(0);
    // Updates of the view are intercepted from now on.
    text.update({ labels: [{ text: 'b', x: 200, y: 150 }] });
    expect((text.updates.at(-1) as { labels: { y: number }[] }).labels[0]!.y).toBeCloseTo(
      label['y']!,
      6,
    );
    // Flat again: the prisms go, the arcs show, the label is back where the flat view has it.
    const flat = { ...h, trace: { depth: 0, tilt: 0 } };
    p = syncDomain(p, flat, view, [arcs, text], mesh);
    expect(p).toBeUndefined();
    expect(h.added).toEqual([]);
    expect(arcs.object.visible).toBe(true);
    expect((text.updates.at(-1) as { labels: { y: number }[] }).labels[0]!.y).toBe(150);
  });

  it('maps hover queries and pointer events onto the flat trace', async () => {
    const mesh = await loadMeshModule();
    const rects = fakePrimitive();
    const live = new Set<Primitive<unknown>>([rects]);
    const view = { update: vi.fn() };
    const h = host({ depth: 20, tilt: 35 }, live);
    const calc = {};
    const tile = { x0: [50], y0: [50], x1: [350], y1: [250], fill: [0, 0, 1, 1] as RGBA };
    view.update.mockImplementation(() => rects.update(tile));
    syncDomain(undefined, { ...h, calc }, view, [rects], mesh);
    // A tile's top point, and where it is drawn.
    const cam = new DomainCamera(h.domain!.rect, 300, 35, 0.5);
    const [sx, sy] = cam.toScreen(200, 150, 20);
    const query = { px: sx, py: sy, cx: sx, cy: 300 - sy };
    const seen: { cx?: number; cy?: number }[] = [];
    const points = domainHover(
      (_c: object, _t: unknown, q: { cx?: number; cy?: number }) => {
        seen.push(q);
        return [{ px: 200, py: 150 }];
      },
      calc,
      {},
      query,
      {},
    )!;
    expect(seen[0]!.cx).toBeCloseTo(200, 3);
    expect(seen[0]!.cy).toBeCloseTo(150, 3);
    // The anchor where the tilted tile draws it.
    expect(points[0]!.px).toBeCloseTo(sx, 3);
    expect(points[0]!.py).toBeCloseTo(sy, 3);
    const e = domainPointer(view, { type: 'click', x: sx, y: 300 - sy })!;
    expect(e.type).toBe('click');
    expect(e.x).toBeCloseTo(200, 3);
    // Flat traces: nothing to map.
    expect(domainPointer({}, { x: 1, y: 2 })).toBeUndefined();
    expect(domainHover(() => [], {}, {}, query, {})).toBeUndefined();
  });
});
