import { expect, test, type Page } from '@playwright/test';

/**
 * WebGL context loss and restore on `_dev/interaction-context-loss` (plan E2.1, backlog S2.2).
 * The browser takes a context away when the GPU resets, the tab is in the background too long or
 * the page has too many; `WEBGL_lose_context` does the same on demand. A chart must come back
 * with the same frame, without the page doing anything: buffers and textures are uploaded again
 * from their CPU copies, and what only existed on the GPU (the 3D scene's environment map) is
 * drawn again.
 *
 * The example: charts 0 (2D: heatmap, scatter, text) and 1 (3D: lit mesh with an environment,
 * shadows, markers) own a context each; 2 and 3 are the same two on the shared renderer.
 *
 * Maps are not in the full bundle, so they have their own page: geo.spec.ts ("context loss") loses
 * and restores the context of geo figures (base layers at 110m and 50m, a choropleth, markers; on
 * a context of their own and on the shared renderer) and then hovers, drags and wheels them.
 */
const EXAMPLE = '_dev/interaction-context-loss';

interface Hook {
  charts: {
    ready: Promise<unknown>;
    destroy(): void;
    three: {
      root: {
        canvas: HTMLCanvasElement;
        shared: boolean;
        contextLost: boolean;
        capabilities: { maxTextureSize: number; max3DTextureSize: number };
        renderNow(): void;
      };
      renderer: { getContext(): WebGL2RenderingContext };
    };
  }[];
  events: { chart: number; name: string }[];
  target(chart: number): { x: number; y: number };
}

declare global {
  interface Window {
    __contextLoss?: Hook;
    __frames?: Record<string, Uint8ClampedArray>;
    __lose?: WEBGL_lose_context[];
  }
}

async function settle(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await Promise.all(window.__contextLoss!.charts.map((c) => c.ready));
    for (let i = 0; i < 3; i++) await new Promise((r) => requestAnimationFrame(r));
  });
}

/** Keep every chart's current frame under `name`. */
async function capture(page: Page, name: string): Promise<void> {
  await page.evaluate((key) => {
    const frames = (window.__frames ??= {});
    window.__contextLoss!.charts.forEach((chart, i) => {
      const root = chart.three.root;
      if (!root.contextLost) root.renderNow();
      const copy = document.createElement('canvas');
      copy.width = root.canvas.width;
      copy.height = root.canvas.height;
      const ctx = copy.getContext('2d')!;
      ctx.drawImage(root.canvas, 0, 0);
      frames[`${key}:${i}`] = ctx.getImageData(0, 0, copy.width, copy.height).data;
    });
  }, name);
}

/** Fraction of pixels that differ between two captures, per chart. */
async function difference(page: Page, a: string, b: string): Promise<number[]> {
  return page.evaluate(
    ([from, to]) =>
      window.__contextLoss!.charts.map((_, i) => {
        const p = window.__frames![`${from}:${i}`]!;
        const q = window.__frames![`${to}:${i}`]!;
        let n = 0;
        for (let k = 0; k < p.length; k += 4) {
          if (
            Math.abs(p[k]! - q[k]!) > 8 ||
            Math.abs(p[k + 1]! - q[k + 1]!) > 8 ||
            Math.abs(p[k + 2]! - q[k + 2]!) > 8 ||
            Math.abs(p[k + 3]! - q[k + 3]!) > 8
          ) {
            n++;
          }
        }
        return n / (p.length / 4);
      }),
    [a, b] as const,
  );
}

const events = (page: Page, name: string): Promise<number[]> =>
  page.evaluate(
    (n) => window.__contextLoss!.events.filter((e) => e.name === n).map((e) => e.chart),
    name,
  );

/** Lose the context of every renderer (three contexts: charts 0, 1 and the shared one). */
async function lose(page: Page): Promise<void> {
  await page.evaluate(() => {
    const contexts = new Set(
      window.__contextLoss!.charts.map((c) => c.three.renderer.getContext()),
    );
    window.__lose = [...contexts].map((gl) => gl.getExtension('WEBGL_lose_context')!);
    for (const ext of window.__lose) ext.loseContext();
  });
  await expect
    .poll(async () => (await events(page, 'webglcontextlost')).sort())
    .toEqual([0, 1, 2, 3]);
}

async function restore(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const ext of window.__lose!) ext.restoreContext();
  });
  await expect
    .poll(async () => (await events(page, 'webglcontextrestored')).sort())
    .toEqual([0, 1, 2, 3]);
  await settle(page);
}

test.beforeEach(async ({ page }) => {
  await page.goto(`/?example=${EXAMPLE}&size=meta`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__contextLoss !== undefined, undefined, {
    timeout: 30_000,
  });
  await settle(page);
});

test('every chart draws the same frame after its context is lost and restored', async ({
  page,
  browserName,
}) => {
  // Known issues (docs/release/browser-support.md, F1 and F2): the frames match on Firefox, but
  // it logs the mesh program's link warning and, for the shadow map, "Depth texture comparison
  // requests (e.g. `LINEAR`) Filtering, but behavior is implementation-defined".
  test.fixme(browserName === 'firefox', 'F1, F2: shader and shadow-map warnings on Firefox');
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') errors.push(message.text());
  });
  await capture(page, 'before');
  await lose(page);
  expect(
    await page.evaluate(() => window.__contextLoss!.charts.map((c) => c.three.root.contextLost)),
  ).toEqual([true, true, true, true]);
  await restore(page);
  await capture(page, 'after');
  const diff = await difference(page, 'before', 'after');
  for (const fraction of diff) expect(fraction).toBeLessThan(0.002);
  // Capturing twice in a row is the noise floor: the charts are not blank to begin with.
  const blank = await page.evaluate(() =>
    window.__contextLoss!.charts.map((_, i) => {
      const data = window.__frames![`after:${i}`]!;
      const seen = new Set<number>();
      for (let k = 0; k < data.length; k += 4) {
        seen.add((data[k]! << 16) | (data[k + 1]! << 8) | data[k + 2]!);
      }
      return seen.size;
    }),
  );
  for (const colors of blank) expect(colors).toBeGreaterThan(20);
  expect(errors.filter((e) => !/Context (Lost|Restored)/i.test(e))).toEqual([]);
});

test('charts know the GPU limits of their context, before and after a restore', async ({
  page,
}) => {
  const read = (): Promise<{ maxTextureSize: number; max3DTextureSize: number }[]> =>
    page.evaluate(() =>
      window.__contextLoss!.charts.map((c) => ({ ...c.three.root.capabilities })),
    );
  const before = await read();
  for (const caps of before) {
    // What WebGL 2 guarantees; a value read from the context, not the assumed 4096 / 2048 pair.
    expect(caps.maxTextureSize).toBeGreaterThanOrEqual(2048);
    expect(caps.max3DTextureSize).toBeGreaterThanOrEqual(256);
  }
  const actual = await page.evaluate(() => {
    const gl = window.__contextLoss!.charts[0]!.three.renderer.getContext();
    return {
      maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE) as number,
      max3DTextureSize: gl.getParameter(gl.MAX_3D_TEXTURE_SIZE) as number,
    };
  });
  expect(before[0]).toEqual(actual);
  await lose(page);
  await restore(page);
  expect(await read()).toEqual(before);
});

test('charts can be destroyed after a restore', async ({ page }) => {
  const thrown: string[] = [];
  page.on('pageerror', (error) => thrown.push(error.message));
  await lose(page);
  await restore(page);
  // three.js still deletes the old context's objects here, which the browser refuses with a
  // console warning each (INVALID_OPERATION); nothing may throw, and the canvases must go.
  const canvases = await page.evaluate(() => {
    for (const chart of window.__contextLoss!.charts) chart.destroy();
    return document.querySelectorAll('canvas').length;
  });
  expect(canvases).toBe(0);
  expect(thrown).toEqual([]);
});

test('shared charts keep their last frame while the context is lost', async ({ page }) => {
  await capture(page, 'before');
  await lose(page);
  await capture(page, 'lost');
  const diff = await difference(page, 'before', 'lost');
  expect(diff[2]).toBe(0);
  expect(diff[3]).toBe(0);
  await restore(page);
});

test('hover works again after a restore, in 2D and through GPU picking in 3D', async ({ page }) => {
  // Software GL on a CI runner needs a while to upload four charts again and redraw two
  // environment maps; a GPU pick is asynchronous and waits its turn behind that.
  test.setTimeout(180_000);
  await lose(page);
  await restore(page);
  // Reading every chart's frame back is synchronous: it returns once the GPU has caught up.
  await capture(page, 'restored');
  for (const index of [0, 1, 2, 3]) {
    const p = await page.evaluate((i) => window.__contextLoss!.target(i), index);
    // Inside the chart's canvas, so the pointer is over the marker and nothing else.
    const box = await page.evaluate((i) => {
      const r = window.__contextLoss!.charts[i]!.three.root.canvas.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    }, index);
    expect(p.x).toBeGreaterThan(box.left + 12);
    expect(p.x).toBeLessThan(box.right - 12);
    expect(p.y).toBeGreaterThan(box.top + 12);
    expect(p.y).toBeLessThan(box.bottom - 12);
    await page.mouse.move(p.x + 2, p.y + 2);
    await page.mouse.move(p.x, p.y);
    await expect
      .poll(async () => (await events(page, 'hover')).includes(index), {
        message: `chart ${index} hovers after the restore`,
        timeout: 30_000,
      })
      .toBe(true);
  }
});
