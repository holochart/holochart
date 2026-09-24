import { createScale } from '@mk7s/holochart-core';
import type { ComponentDrawContext, SubplotInfo } from '@mk7s/holochart-runtime';
import { describe, expect, it } from 'vitest';
import { BELOW_TRACES_ORDER } from './batches.ts';
import { axisAffine, classTransform, clipRect, LayerHost, type LayerRequest } from './layers.ts';

let nextId = 100;

function viewport(rect: { x: number; y: number; width: number; height: number }) {
  const vp = {
    id: nextId++,
    rect: { ...rect },
    disposed: false,
    setRect(r: typeof rect) {
      vp.rect = { ...r };
    },
  };
  return vp;
}

function axis(id: string, start: number, end: number) {
  return { id, start, end };
}

/** Two stacked subplots (xy over xy2) and an overlaying one (xy3 on xy's rect). */
function context(withRoot: boolean) {
  const added: { order: number; rect: unknown }[] = [];
  const removed: unknown[] = [];
  const sp = (id: string, rect: { x: number; y: number; width: number; height: number }) =>
    ({ id, rect, viewport: viewport(rect) }) as unknown as SubplotInfo;
  const subplots = new Map([
    ['xy', sp('xy', { x: 50, y: 20, width: 400, height: 100 })],
    ['xy2', sp('xy2', { x: 50, y: 150, width: 400, height: 100 })],
    ['xy3', sp('xy3', { x: 50, y: 20, width: 400, height: 100 })],
  ]);
  const root = {
    addViewport(opts: { order: number; rect: unknown }) {
      added.push(opts);
      return viewport(opts.rect as { x: number; y: number; width: number; height: number });
    },
    removeViewport(vp: unknown) {
      removed.push(vp);
    },
  };
  const ctx = {
    width: 500,
    height: 300,
    subplots,
    overlay: viewport({ x: 0, y: 0, width: 500, height: 300 }),
    ...(withRoot ? { chart: { destroyed: false, three: { root } } } : {}),
  } as unknown as ComponentDrawContext;
  return { ctx, subplots, added, removed };
}

const req = (r: Partial<LayerRequest>): LayerRequest => ({
  stack: 'upper',
  clipX: undefined,
  clipY: undefined,
  subplot: undefined,
  ...r,
});

describe('LayerHost', () => {
  it('orders below < grid < between inside the subplot, lower under both', () => {
    const { ctx, subplots } = context(true);
    const host = new LayerHost(ctx, 'shapes');
    const images = new LayerHost(ctx, 'images');
    host.begin(ctx);
    images.begin(ctx);
    const xy = subplots.get('xy')!;
    const below = host.place(req({ stack: 'below', subplot: xy }));
    const between = host.place(req({ stack: 'between', subplot: xy }));
    const imgBelow = images.place(req({ stack: 'below', subplot: xy }));
    expect(below).toHaveLength(1);
    expect(below[0]?.viewport).toBe(xy.viewport);
    const lower = host.place(req({ stack: 'lower' }));
    const imgLower = images.place(req({ stack: 'lower' }));
    const inXy = (p: typeof lower) => p.find((q) => q.viewport === xy.viewport)!.order;
    // Plotly: lower images < lower shapes < below shapes < below images < grid < between.
    const orders = [
      inXy(imgLower),
      inXy(lower),
      below[0]!.order,
      imgBelow[0]!.order,
      BELOW_TRACES_ORDER,
      between[0]!.order,
    ];
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);
    expect(between[0]!.order).toBeLessThan(-1e9);
  });

  it('draws the lower layer into an underlay and each distinct subplot rect', () => {
    const { ctx, subplots, added } = context(true);
    const host = new LayerHost(ctx, 'shapes');
    host.begin(ctx);
    const lower = host.place(req({ stack: 'lower' }));
    // Underlay + xy + xy2 (xy3 overlays xy: skipped).
    expect(lower.map((p) => p.viewport)).toEqual([
      expect.anything(),
      subplots.get('xy')!.viewport,
      subplots.get('xy2')!.viewport,
    ]);
    expect(added).toHaveLength(1);
    expect(added[0]?.order).toBeLessThan(0);
    // Clipped along x2 only: subplots inside the clip keep their copy.
    const clipped = host.place(req({ stack: 'lower', clipX: axis('x', 50, 450) as never }));
    expect(clipped).toHaveLength(3);
    const narrow = host.place(req({ stack: 'lower', clipY: axis('y', 120, 20) as never }));
    expect(narrow.map((p) => p.viewport)).toEqual([
      expect.anything(),
      subplots.get('xy')!.viewport,
    ]);
  });

  it('keeps extra viewports while used and removes them after', () => {
    const { ctx, added, removed } = context(true);
    const host = new LayerHost(ctx, 'shapes');
    host.begin(ctx);
    const a = host.place(req({ stack: 'upper' }));
    const b = host.place(req({ stack: 'upper' }));
    expect(a[0]?.viewport).toBe(b[0]?.viewport);
    expect(added[0]?.order).toBeGreaterThan(1e12);
    host.end();
    expect(removed).toHaveLength(0);
    host.begin(ctx);
    host.end();
    expect(removed).toHaveLength(1);
    host.begin(ctx);
    host.place(req({ stack: 'upper' }));
    host.dispose();
    expect(removed).toHaveLength(2);
  });

  it('falls back to the overlay without a chart', () => {
    const { ctx } = context(false);
    const host = new LayerHost(ctx, 'images');
    host.begin(ctx);
    const [p] = host.place(req({ stack: 'upper' }));
    expect(p?.viewport).toBe(ctx.overlay);
  });

  it('places items without a subplot in the lower layer', () => {
    const { ctx } = context(true);
    const host = new LayerHost(ctx, 'shapes');
    host.begin(ctx);
    expect(host.place(req({ stack: 'below' })).length).toBeGreaterThan(1);
  });
});

describe('transforms', () => {
  it('clips to data axes only', () => {
    expect(clipRect(undefined, undefined, 500, 300)).toEqual({
      x: 0,
      y: 0,
      width: 500,
      height: 300,
    });
    expect(clipRect({ start: 50, end: 450 }, { start: 120, end: 20 }, 500, 300)).toEqual({
      x: 50,
      y: 20,
      width: 400,
      height: 100,
    });
  });

  it('composes axis affines with a placement world', () => {
    const scale = createScale({ type: 'linear', range: [0, 10], length: 400 });
    const x = { letter: 'x' as const, scale, start: 50 };
    const y = {
      letter: 'y' as const,
      scale: createScale({ type: 'linear', range: [0, 100], length: 100 }),
      start: 120,
    };
    expect(axisAffine(x)).toEqual({ m: 40, b: 50 });
    expect(axisAffine(y)).toEqual({ m: -1, b: 120 });
    // Overlay-like world: container (cx, cy) → (cx, 300 − cy).
    const t = classTransform(x, y, { scaleX: 1, offsetX: 0, scaleY: -1, offsetY: 300 });
    expect(5 * t.scaleX + t.offsetX).toBe(250);
    expect(50 * t.scaleY + t.offsetY).toBe(230);
    const px = classTransform(undefined, undefined, {
      scaleX: 1,
      offsetX: -50,
      scaleY: -1,
      offsetY: 120,
    });
    expect([7 * px.scaleX + px.offsetX, 20 * px.scaleY + px.offsetY]).toEqual([-43, 100]);
  });
});
