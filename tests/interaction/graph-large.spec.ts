/**
 * Large graphs in a real browser (backlog G7), on `_dev/interaction-graph-large`: a layout that
 * runs in the layout worker and is drawn while it settles, the level of detail a zoom brings
 * back, bundled links under the pointer, a chart that goes away in the middle of its layout, and
 * image export of a figure whose layout is still to come.
 *
 * What Node cannot show is checked here: that the trace starts the worker Vite serves, that the
 * page goes on drawing while the layout runs, and that the picture at the end is the one a
 * layout on the main thread gives.
 */
import { expect, test, type Page } from '@playwright/test';
import pixelmatch from 'pixelmatch';
import pngjs from 'pngjs';
import { openInteraction, toPage } from './helpers.ts';

const { PNG } = pngjs;
type Png = ReturnType<typeof PNG.sync.read>;

const EXAMPLE = '_dev/interaction-graph-large';

/** Mirrors `Ask` of the example. */
interface Ask {
  nodes?: number;
  links?: number;
  arrangement?: 'force' | 'preset' | 'circular' | 'layered';
  worker?: boolean | 'auto';
  bundle?: 'none' | 'auto' | 'hierarchical' | 'force';
  lod?: boolean | 'auto';
  arrows?: boolean;
  labels?: boolean;
  ticks?: number;
  simulate?: boolean;
  staticPlot?: boolean;
  reducedMotion?: boolean;
}

interface Route {
  points: Record<number, number> & { length: number };
  kind: 'polyline' | 'spline';
}

interface Hook {
  chart: {
    ready: Promise<unknown>;
    toImage(o: object): Promise<string>;
    relayout(update: Record<string, unknown>): Promise<unknown>;
    getCalcdata(i: number): {
      x: Float64Array;
      y: Float64Array;
      routes?: (Route | undefined)[];
      model: { source: Int32Array; target: Int32Array; group: Int32Array; links: number };
      pending?: unknown;
    };
  };
  events: { name: string; payload: { points?: Record<string, unknown>[] } | undefined }[];
  show(ask: Ask): void;
  settled: boolean;
  drawn: number;
  longestBlock: number;
  took: number;
  positions(): { x: number[]; y: number[]; pending: boolean };
  positionsOf(ask: Ask): Promise<{ x: number[]; y: number[] }>;
  abandon(ask: Ask, after: number): Promise<void>;
  pending(): number;
  objects(): number;
  warnings: string[];
}
type HookWindow = Window & { __interaction: Hook };

const hook = <T>(page: Page, run: (h: Hook) => T | Promise<T>): Promise<T> =>
  page.evaluate((source) => {
    const fn = new Function('h', `return (${source})(h)`) as (h: Hook) => T | Promise<T>;
    return fn((window as unknown as HookWindow).__interaction);
  }, run.toString());

/** Draw `ask` on the page's chart and wait until the chart is ready. */
async function show(page: Page, ask: Ask, timeout = 60_000): Promise<void> {
  await page.evaluate((a) => (window as unknown as HookWindow).__interaction.show(a), ask);
  await page.waitForFunction(
    () => (window as unknown as HookWindow).__interaction.settled,
    undefined,
    { timeout },
  );
}

async function screenshot(page: Page): Promise<Png> {
  const canvas = page.locator('canvas').first();
  const box = (await canvas.boundingBox())!;
  return PNG.sync.read(await page.screenshot({ clip: box }));
}

function difference(a: Png, b: Png): number {
  expect([a.width, a.height]).toEqual([b.width, b.height]);
  return (
    pixelmatch(a.data, b.data, undefined, a.width, a.height, { threshold: 0.1 }) /
    (a.width * a.height)
  );
}

function decodePng(url: string): Png {
  return PNG.sync.read(Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
}

// Software GL draws these graphs slowly: one at a time, in this order.
test.describe.configure({ mode: 'default' });

const hoverPoints = (page: Page): Promise<Record<string, unknown>[]> =>
  hook(page, (h) => h.events.filter((e) => e.name === 'hover').at(-1)?.payload?.points ?? []);

test('a 10,000-node force layout is drawn while it settles and ends on the synchronous picture', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await openInteraction(page, EXAMPLE, { idle: '1' });
  // More ticks than the default 90 for this size: software GL takes a few hundred ms for a
  // frame of 60,000 primitives, and the layout should last for several of them.
  const ask: Ask = { nodes: 10_000, links: 50_000, labels: false, ticks: 300 };
  // Two frames after the figure was given, the chart is on screen and waits for its layout.
  const early = await page.evaluate(async (a) => {
    const h = (window as unknown as HookWindow).__interaction;
    h.show(a);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return { pending: h.positions().pending, settled: h.settled, drawn: h.drawn };
  }, ask);
  expect(early).toMatchObject({ pending: true, settled: false });
  await page.waitForFunction(
    () => (window as unknown as HookWindow).__interaction.settled,
    undefined,
    { timeout: 120_000 },
  );
  const report = await hook(page, (h) => ({ block: h.longestBlock, took: h.took, drawn: h.drawn }));
  // Drawn again and again while the layout ran: a layout on the main thread draws once, at the
  // end.
  expect(report.drawn).toBeGreaterThanOrEqual(3);
  // The page was never held for the length of the layout: it ran elsewhere. (Drawing 60,000
  // primitives with software GL takes its share of every frame, hence the room.)
  expect(report.block).toBeLessThan(Math.max(1500, report.took / 2));
  expect(await hook(page, (h) => h.warnings)).toEqual([]);

  // The same figure laid out on the main thread: the same positions, bit for bit.
  const streamed = await hook(page, (h) => h.positions());
  expect(streamed.pending).toBe(false);
  expect(streamed.x).toHaveLength(10_000);
  const sync = await page.evaluate(
    (a) => (window as unknown as HookWindow).__interaction.positionsOf({ ...a, worker: false }),
    ask,
  );
  expect(streamed.x).toEqual(sync.x);
  expect(streamed.y).toEqual(sync.y);
});

test('hover finds a node once the layout is there', async ({ page }) => {
  test.setTimeout(120_000);
  await openInteraction(page, EXAMPLE, { idle: '1' });
  await show(page, { nodes: 3000, links: 6000 });
  // The node farthest to the right has nothing over it on that side.
  const node = await hook(page, (h) => {
    const { x, y } = h.positions();
    let i = 0;
    for (let k = 1; k < x.length; k++) if (x[k]! > x[i]!) i = k;
    return { i, x: x[i]!, y: y[i]! };
  });
  // The glide to the result takes a third of a second.
  await page.waitForTimeout(1000);
  const at = await toPage(page, node.x, node.y);
  await page.mouse.move(at.x - 30, at.y);
  await page.mouse.move(at.x, at.y, { steps: 3 });
  await expect.poll(() => hoverPoints(page)).toHaveLength(1);
  expect((await hoverPoints(page))[0]).toMatchObject({ kind: 'node', pointNumber: node.i });
});

test('labels and arrowheads come back on a zoom into a large graph', async ({ page }) => {
  test.setTimeout(120_000);
  await openInteraction(page, EXAMPLE, { idle: '1' });
  // Given positions, short links: this is about the zoom, not the layout.
  await show(page, { nodes: 4000, links: 4000, arrangement: 'preset', arrows: true });
  // Fitted to the plot: the links and the nodes, nothing else.
  expect(await hook(page, (h) => h.objects())).toBe(2);
  const zoom = (factor: number) =>
    page.evaluate(async (f) => {
      const h = (window as unknown as HookWindow).__interaction;
      const { x, y } = h.positions();
      let x0 = Infinity;
      let x1 = -Infinity;
      let y0 = Infinity;
      let y1 = -Infinity;
      for (let i = 0; i < x.length; i++) {
        x0 = Math.min(x0, x[i]!);
        x1 = Math.max(x1, x[i]!);
        y0 = Math.min(y0, y[i]!);
        y1 = Math.max(y1, y[i]!);
      }
      const w = (x1 - x0) / f / 2;
      const hgt = (y1 - y0) / f / 2;
      await h.chart.relayout({
        'xaxis.range': [x[0]! - w, x[0]! + w],
        'yaxis.range': [y[0]! - hgt, y[0]! + hgt],
      });
    }, factor);
  await zoom(40);
  // Arrowheads and labels too (the labels of a graph this size wait for the zoom to settle).
  await expect.poll(() => hook(page, (h) => h.objects()), { timeout: 15_000 }).toBe(4);
  // And go again on the way out (below the thresholds, which have two sides).
  await zoom(0.5);
  await expect.poll(() => hook(page, (h) => h.objects()), { timeout: 15_000 }).toBe(2);
});

/** The point of a route at the middle of its length, in linear coordinates. */
function middle(route: { points: number[]; kind: string }): [number, number] {
  const p = route.points;
  if (route.kind !== 'spline') {
    const i = 2 * Math.floor(p.length / 4);
    return [p[i]!, p[i + 1]!];
  }
  // The middle of the middle cubic piece.
  const pieces = (p.length / 2 - 1) / 3;
  const at = 6 * Math.floor(pieces / 2);
  const t = pieces % 2 === 0 ? 0 : 0.5;
  const u = 1 - t;
  const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
  let x = 0;
  let y = 0;
  for (let j = 0; j < 4; j++) {
    x += w[j]! * p[at + 2 * j]!;
    y += w[j]! * p[at + 2 * j + 1]!;
  }
  return [x, y];
}

test('a bundled link is hovered on its curve, not on the line between its ends', async ({
  page,
}) => {
  await openInteraction(page, EXAMPLE, { idle: '1' });
  await show(page, {
    nodes: 60,
    links: 150,
    arrangement: 'circular',
    bundle: 'hierarchical',
    worker: false,
  });
  // The links between two groups, with their routes.
  const links = await hook(page, (h) => {
    const calc = h.chart.getCalcdata(0);
    const out: { k: number; a: number; b: number; points: number[]; kind: string }[] = [];
    for (let k = 0; k < calc.model.links; k++) {
      const a = calc.model.source[k]!;
      const b = calc.model.target[k]!;
      const route = calc.routes?.[k];
      if (!route || calc.model.group[a] === calc.model.group[b]) continue;
      out.push({
        k,
        a,
        b,
        points: Array.from(route.points as ArrayLike<number>),
        kind: route.kind,
      });
    }
    return {
      out,
      x: Array.from(calc.x),
      y: Array.from(calc.y),
      routed: calc.routes?.filter(Boolean).length ?? 0,
      total: calc.model.links,
    };
  });
  // Every link has a route, and the bundles are splines.
  expect(links.routed).toBe(links.total);
  expect(links.out.length).toBeGreaterThan(3);
  expect(links.out.every((l) => l.kind === 'spline')).toBe(true);

  // The link whose curve is farthest from the line between its ends.
  let pick = links.out[0]!;
  let bow = 0;
  let onCurve: [number, number] = [0, 0];
  let onChord: [number, number] = [0, 0];
  for (const link of links.out) {
    const m = middle(link);
    const c: [number, number] = [
      (links.x[link.a]! + links.x[link.b]!) / 2,
      (links.y[link.a]! + links.y[link.b]!) / 2,
    ];
    const d = Math.hypot(m[0] - c[0], m[1] - c[1]);
    if (d > bow) {
      bow = d;
      pick = link;
      onCurve = m;
      onChord = c;
    }
  }
  // Bundled for real: tens of px between the curve and the chord.
  expect(bow).toBeGreaterThan(30);

  const curve = await toPage(page, onCurve[0], onCurve[1]);
  await page.mouse.move(curve.x - 40, curve.y - 40);
  await page.mouse.move(curve.x, curve.y, { steps: 4 });
  await expect.poll(() => hoverPoints(page)).toHaveLength(1);
  const hit = (await hoverPoints(page))[0]!;
  expect(hit['kind']).toBe('link');
  // Links of one bundle lie on each other in the middle: the link under the pointer joins the
  // same two groups as the one picked.
  const groups = await hook(page, (h) => Array.from(h.chart.getCalcdata(0).model.group));
  const pair = (a: number, b: number): string => [groups[a], groups[b]].sort().join('-');
  expect(pair(hit['source'] as number, hit['target'] as number)).toBe(pair(pick.a, pick.b));

  // On the chord, where the link would be without bundling, it is not.
  const chord = await toPage(page, onChord[0], onChord[1]);
  await page.mouse.move(chord.x, chord.y, { steps: 4 });
  await page.waitForTimeout(300);
  const there = (await hoverPoints(page))[0];
  const still = await hook(page, (h) => h.events.at(-1)?.name);
  if (still === 'hover' && there?.['kind'] === 'link') {
    expect([there['source'], there['target']]).not.toEqual([pick.a, pick.b]);
  }
});

test('force-directed bundles are computed after the layout and routed in the worker', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openInteraction(page, EXAMPLE, { idle: '1' });
  await show(page, { nodes: 300, links: 1500, bundle: 'force', worker: 'auto', labels: false });
  const calc = await hook(page, (h) => {
    const c = h.chart.getCalcdata(0);
    return {
      pending: c.pending !== undefined,
      routed: c.routes?.filter(Boolean).length ?? 0,
      kinds: [...new Set(c.routes?.filter(Boolean).map((r) => r!.kind))],
      links: c.model.links,
    };
  });
  expect(calc.pending).toBe(false);
  expect(calc.links).toBeGreaterThanOrEqual(1000);
  expect(calc.routed).toBeGreaterThan(calc.links / 2);
  expect(calc.kinds).toEqual(['polyline']);
  expect(await hook(page, (h) => h.warnings)).toEqual([]);
});

test('a chart that is removed in the middle of its layout leaves nothing running', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openInteraction(page, EXAMPLE, { idle: '1' });
  // Warm the worker, so that the charts below go while it computes, not while it loads.
  await show(page, { nodes: 1200, links: 2400, ticks: 10 });
  for (let round = 0; round < 4; round++) {
    await page.evaluate(
      (after) =>
        (window as unknown as HookWindow).__interaction.abandon(
          { nodes: 5000, links: 15_000, ticks: 600 },
          after,
        ),
      [0, 30, 120, 400][round]!,
    );
  }
  // Every request was cancelled: the worker has nothing left to answer, and stays so.
  await expect.poll(() => hook(page, (h) => h.pending())).toBe(0);
  await page.waitForTimeout(500);
  expect(await hook(page, (h) => h.pending())).toBe(0);
  expect(errors).toEqual([]);
  expect(await hook(page, (h) => h.warnings)).toEqual([]);
  // And the worker still serves the chart that is left.
  await show(page, { nodes: 1500, links: 3000, ticks: 20 });
  expect((await hook(page, (h) => h.positions())).pending).toBe(false);
});

test('an image export waits for the layout and shows what the chart shows in the end', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openInteraction(page, EXAMPLE, { idle: '1' });
  const ask: Ask = { nodes: 1500, links: 3000, labels: false };
  await page.evaluate((a) => (window as unknown as HookWindow).__interaction.show(a), ask);
  // Asked for while the chart on screen is still waiting for its layout.
  const early = await hook(page, (h) => ({ pending: h.positions().pending }));
  const image = decodePng(await hook(page, (h) => h.chart.toImage({})));
  expect(early.pending).toBe(true);
  expect([image.width, image.height]).toEqual([800, 600]);
  await page.waitForFunction(() => (window as unknown as HookWindow).__interaction.settled);
  const canvas = page.locator('canvas').first();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width + 100, box.y + box.height + 100);
  // The chart glides to the layout; the export is where it ends.
  await expect
    .poll(async () => difference(await screenshot(page), image), { timeout: 20_000 })
    .toBeLessThan(0.004);
});
