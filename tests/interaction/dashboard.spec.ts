import { expect, test, type Page } from '@playwright/test';

/**
 * 40 charts on one page, `_dev/interaction-dashboard` (plan E2.16, ADR-023). A browser keeps about
 * 16 WebGL contexts and drops the oldest beyond that; the charts must stay within a budget of
 * four contexts of their own plus one shared renderer, however many there are, and exports must
 * not add to it. The text engine (troika) keeps one more context per page to generate glyphs.
 *
 * The example: an 8×5 grid of 150 px charts. Charts 0–3 own a context, 4–39 share one. Every tenth
 * chart (9, 19, 29, 39) is a `scatter3d`, the rest are one identical scatter.
 */
const EXAMPLE = '_dev/interaction-dashboard';
const COUNT = 40;
const DEDICATED = 4;
/** Contexts on the page: the dedicated ones, the shared renderer and the glyph generator. */
const CONTEXTS = DEDICATED + 2;

interface Hook {
  charts: {
    ready: Promise<unknown>;
    three: {
      root: { canvas: HTMLCanvasElement; shared: boolean; renderNow(): void };
      renderer: { info: { memory: { geometries: number; textures: number } } };
    };
    toImage(options?: object): Promise<string>;
    destroy(): void;
  }[];
  events: { chart: number; name: string; points: { pointNumber: number }[] }[];
  lost: number[];
  point(chart: number, i: number): { x: number; y: number };
}

declare global {
  interface Window {
    __dashboard?: Hook;
    __contexts?: { created: number; live(): number };
  }
}

/** Count WebGL contexts as they are created, and how many are still alive. */
async function countContexts(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const contexts: WebGL2RenderingContext[] = [];
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...rest: unknown[]
    ) {
      const context = (getContext as (...args: unknown[]) => unknown).call(this, type, ...rest);
      if (/^webgl/.test(type) && context && !contexts.includes(context as WebGL2RenderingContext)) {
        contexts.push(context as WebGL2RenderingContext);
      }
      return context;
    } as typeof getContext;
    window.__contexts = {
      get created() {
        return contexts.length;
      },
      live: () => contexts.filter((gl) => !gl.isContextLost()).length,
    };
  });
}

async function open(page: Page): Promise<void> {
  await countContexts(page);
  await page.goto(`/?example=${EXAMPLE}&size=meta`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__dashboard !== undefined, undefined, {
    timeout: 30_000,
  });
  await page.evaluate(async () => {
    await Promise.all(window.__dashboard!.charts.map((c) => c.ready));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
}

/** Fraction of a chart's canvas that is not transparent. */
async function inked(page: Page): Promise<number[]> {
  return page.evaluate(() =>
    window.__dashboard!.charts.map((chart) => {
      const root = chart.three.root;
      // A canvas with its own context only holds the frame until the browser presents it.
      root.renderNow();
      const { width, height } = root.canvas;
      const copy = document.createElement('canvas');
      copy.width = width;
      copy.height = height;
      const ctx = copy.getContext('2d')!;
      ctx.drawImage(root.canvas, 0, 0);
      const data = ctx.getImageData(0, 0, width, height).data;
      let n = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) n++;
      return n / (width * height);
    }),
  );
}

test.beforeEach(async ({ page }) => {
  await open(page);
});

test('draws 40 charts within the context budget and loses none', async ({ page }) => {
  const state = await page.evaluate(() => ({
    shared: window.__dashboard!.charts.map((c) => c.three.root.shared),
    created: window.__contexts!.created,
    live: window.__contexts!.live(),
    lost: window.__dashboard!.lost,
    canvases: document.querySelectorAll('canvas').length,
  }));
  expect(state.shared).toEqual(Array.from({ length: COUNT }, (_, i) => i >= DEDICATED));
  expect(state.created).toBe(CONTEXTS);
  expect(state.live).toBe(CONTEXTS);
  expect(state.lost).toEqual([]);
  expect(state.canvases).toBe(COUNT);
  // Every chart has drawn its paper, axes and trace.
  for (const fraction of await inked(page)) expect(fraction).toBeGreaterThan(0.9);
});

test('a chart on the shared renderer draws the same pixels as one with its own context', async ({
  page,
}) => {
  const diff = await page.evaluate(() => {
    const pixels = (index: number): Uint8ClampedArray => {
      const root = window.__dashboard!.charts[index]!.three.root;
      root.renderNow();
      const copy = document.createElement('canvas');
      copy.width = root.canvas.width;
      copy.height = root.canvas.height;
      const ctx = copy.getContext('2d')!;
      ctx.drawImage(root.canvas, 0, 0);
      return ctx.getImageData(0, 0, copy.width, copy.height).data;
    };
    // Charts 0 (own context) and 5, 38 (shared) draw the same figure.
    const own = pixels(0);
    return [5, 38].map((index) => {
      const shared = pixels(index);
      if (shared.length !== own.length) return -1;
      let n = 0;
      for (let i = 0; i < own.length; i++) if (own[i] !== shared[i]) n++;
      return n;
    });
  });
  expect(diff).toEqual([0, 0]);
});

test('every chart hovers: own context, shared renderer, 2D and 3D', async ({ page }) => {
  for (let index = 0; index < COUNT; index++) {
    // Point 3 is a corner of the 3D cube and (3, 4) of the scatter.
    const p = await page.evaluate((i) => window.__dashboard!.point(i, 3), index);
    await page.mouse.move(p.x + 1, p.y + 1);
    await page.mouse.move(p.x, p.y);
    await expect
      .poll(
        () =>
          page.evaluate(
            (i) =>
              window.__dashboard!.events.filter((e) => e.chart === i && e.name === 'hover').at(-1)
                ?.points[0]?.pointNumber,
            index,
          ),
        { message: `chart ${index} hovers point 3` },
      )
      .toBe(3);
  }
  await expect(page.locator('.holochart-hoverlabel').filter({ visible: true })).toHaveCount(1);
  expect(await page.evaluate(() => window.__dashboard!.lost)).toEqual([]);
  expect(await page.evaluate(() => window.__contexts!.live())).toBe(CONTEXTS);
});

test('exports from every chart at once without another context', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const hook = window.__dashboard!;
    const urls = await Promise.all(hook.charts.map((c) => c.toImage({ scale: 2 })));
    const sizes = await Promise.all(
      [urls[0]!, urls[39]!].map(async (url) => {
        const img = new Image();
        img.src = url;
        await img.decode();
        return [img.naturalWidth, img.naturalHeight];
      }),
    );
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return {
      png: urls.every((url) => url.startsWith('data:image/png;base64,') && url.length > 1000),
      sizes,
      created: window.__contexts!.created,
      lost: hook.lost,
      canvases: document.querySelectorAll('canvas').length,
    };
  });
  expect(result).toEqual({
    png: true,
    sizes: [
      [300, 300],
      [300, 300],
    ],
    created: CONTEXTS,
    lost: [],
    canvases: COUNT,
  });
  // The live charts still show their frames after the shared buffer was resized for the exports.
  for (const fraction of await inked(page)) expect(fraction).toBeGreaterThan(0.9);
});

test('destroying shared charts frees their GPU resources and, with the last, the context', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const hook = window.__dashboard!;
    const memory = (): { geometries: number; textures: number } => ({
      ...hook.charts[4]!.three.renderer.info.memory,
    });
    const before = memory();
    // Charts 5–39 share chart 4's renderer.
    for (const chart of hook.charts.slice(5)) chart.destroy();
    const after = memory();
    const liveBefore = window.__contexts!.live();
    hook.charts[4]!.destroy();
    return { before, after, liveBefore, liveAfter: window.__contexts!.live(), lost: hook.lost };
  });
  // 35 of the 36 charts are gone: so is most of what they held.
  expect(result.after.geometries).toBeLessThan(result.before.geometries / 10);
  expect(result.after.textures).toBeLessThan(result.before.textures / 4);
  expect(result.liveBefore).toBe(CONTEXTS);
  expect(result.liveAfter).toBe(CONTEXTS - 1);
  expect(result.lost).toEqual([]);
});
