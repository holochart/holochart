import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

/**
 * Smoke test for the CDN build: `packages/holochart/dist/holochart.iife.min.js` must be
 * self-contained (three.js bundled, no imports or extra network requests) and expose the full API
 * as `window.Holochart`.
 */
const DIST = resolve(dirname(fileURLToPath(import.meta.url)), '../../packages/holochart/dist');
const BUNDLE = 'holochart.iife.min.js';
const ORIGIN = 'http://holochart.test';

test.beforeAll(() => {
  if (!existsSync(resolve(DIST, BUNDLE))) {
    throw new Error(`${BUNDLE} not found in ${DIST}; run \`pnpm test:bundle\` (it builds first).`);
  }
});

test('IIFE exposes window.Holochart and renders with the bundled three.js', async ({ page }) => {
  const errors: string[] = [];
  const requests: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('request', (req) => requests.push(req.url()));

  await page.route(`${ORIGIN}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/') {
      await route.fulfill({
        contentType: 'text/html',
        body: `<!doctype html><html><body><div id="root"></div><script src="/${BUNDLE}"></script></body></html>`,
      });
      return;
    }
    const file = resolve(DIST, `.${path}`);
    if (!file.startsWith(DIST) || !existsSync(file)) {
      await route.fulfill({ status: 404, body: 'not found' });
      return;
    }
    await route.fulfill({
      contentType: file.endsWith('.map') ? 'application/json' : 'text/javascript',
      body: readFileSync(file),
    });
  });

  await page.goto(`${ORIGIN}/`);

  const api = await page.evaluate(() => {
    const hc = (window as unknown as { Holochart?: Record<string, unknown> }).Holochart;
    if (!hc) return null;
    const render = hc.render as Record<string, unknown> | undefined;
    return {
      keys: Object.keys(hc).length,
      supplyDefaults: typeof hc.supplyDefaults,
      validate: typeof hc.validate,
      createRegistry: typeof hc.createRegistry,
      attr: typeof hc.attr,
      createRenderRoot: typeof render?.createRenderRoot,
    };
  });
  expect(api).not.toBeNull();
  expect(api).toMatchObject({
    supplyDefaults: 'function',
    validate: 'function',
    createRegistry: 'function',
    attr: 'object',
    createRenderRoot: 'function',
  });

  // Exercise core (figure pipeline) and render (WebGL through the bundled three.js).
  const result = await page.evaluate(() => {
    /* eslint-disable @typescript-eslint/no-explicit-any -- untyped global from the IIFE */
    const hc = (window as any).Holochart;
    const registry = hc.createRegistry();
    const figure = { data: [], layout: { width: 320, height: 200 } };
    const { fullLayout } = hc.supplyDefaults(figure, registry);
    const issues = hc.validate(figure.data, figure.layout, registry);

    const container = document.getElementById('root')!;
    const root = hc.render.createRenderRoot(container, {
      width: 16,
      height: 16,
      pixelRatio: 1,
      responsive: false,
      background: [1, 0, 0, 1],
      preserveDrawingBuffer: true,
    });
    root.renderNow();
    const probe = document.createElement('canvas');
    probe.width = probe.height = 16;
    const ctx = probe.getContext('2d')!;
    ctx.drawImage(root.canvas, 0, 0);
    const pixel = Array.from(ctx.getImageData(8, 8, 1, 1).data);
    const isWebGL2 = root.renderer.getContext() instanceof WebGL2RenderingContext;
    root.destroy();
    /* eslint-enable @typescript-eslint/no-explicit-any */
    return { width: fullLayout.width, issues: issues.length, pixel, isWebGL2 };
  });

  expect(result).toEqual({ width: 320, issues: 0, pixel: [255, 0, 0, 255], isWebGL2: true });
  expect(errors).toEqual([]);
  // Self-contained: only the page and the bundle itself are fetched.
  expect(requests.filter((url) => !url.startsWith(`${ORIGIN}/`))).toEqual([]);

  // The sourcemap is served next to the bundle and points at TypeScript sources.
  const map = JSON.parse(readFileSync(resolve(DIST, `${BUNDLE}.map`), 'utf8')) as {
    sources: string[];
  };
  expect(map.sources.some((s) => s.endsWith('core/src/defaults/supply-defaults.ts'))).toBe(true);
  expect(map.sources.some((s) => s.includes('/three/'))).toBe(true);
});
