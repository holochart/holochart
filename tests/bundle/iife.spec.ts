import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

/**
 * Smoke test for the CDN build: `packages/holochart/dist/holochart.iife.min.js` must be
 * self-contained (three.js bundled, no imports or extra network requests) and expose the full API
 * as `window.Holochart`. Its only other files are the built-in default font's faces in
 * `dist/fonts/` (plan E2.18), fetched next to the script when text first needs them.
 */
const DIST = resolve(dirname(fileURLToPath(import.meta.url)), '../../packages/holochart/dist');
const BUNDLE = 'holochart.iife.min.js';
const ORIGIN = 'http://holochart.test';
/** Served from a subfolder, like a CDN path, so fonts must resolve relative to the script. */
const SCRIPT_PATH = `/cdn/holochart@0/dist/${BUNDLE}`;

test.beforeAll(() => {
  if (!existsSync(resolve(DIST, BUNDLE))) {
    throw new Error(`${BUNDLE} not found in ${DIST}; run \`pnpm test:bundle\` (it builds first).`);
  }
});

const CONTENT_TYPES: Record<string, string> = {
  '.map': 'application/json',
  '.otf': 'font/otf',
  '.txt': 'text/plain',
  '.js': 'text/javascript',
};

/**
 * Serve the page and `dist/` (under {@link SCRIPT_PATH}'s folder) from {@link ORIGIN}; every
 * other request is aborted, so the page has no network access beyond its own files. Returns the
 * errors and requested URLs as they come in.
 */
async function servePage(page: Page): Promise<{ errors: string[]; requests: string[] }> {
  const errors: string[] = [];
  const requests: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('request', (req) => requests.push(req.url()));

  const distURL = SCRIPT_PATH.slice(0, SCRIPT_PATH.lastIndexOf('/') + 1);
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== ORIGIN) {
      await route.abort('internetdisconnected');
      return;
    }
    if (url.pathname === '/') {
      await route.fulfill({
        contentType: 'text/html',
        body: `<!doctype html><html><body><div id="root"></div><script src="${SCRIPT_PATH}"></script></body></html>`,
      });
      return;
    }
    const file = resolve(DIST, `./${url.pathname.slice(distURL.length)}`);
    if (!url.pathname.startsWith(distURL) || !file.startsWith(DIST) || !existsSync(file)) {
      await route.fulfill({ status: 404, body: 'not found' });
      return;
    }
    await route.fulfill({
      contentType: CONTENT_TYPES[extname(file)] ?? 'application/octet-stream',
      body: readFileSync(file),
    });
  });
  return { errors, requests };
}

test('IIFE exposes window.Holochart and renders with the bundled three.js', async ({ page }) => {
  const { errors, requests } = await servePage(page);
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

  // The SDF text engine is behind a dynamic import() (plan E21.5). The IIFE cannot load chunks, so
  // the build inlines it: loading it must work without fetching anything (no chunk is served).
  const engine = await page.evaluate(async () => {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped global from the IIFE */
    await (window as any).Holochart.render.preloadTextEngine();
    return 'loaded';
  });
  expect(engine).toBe('loaded');
  expect(errors).toEqual([]);
  // Self-contained: nothing is fetched beyond the page's own files, and no font without text.
  expect(requests.filter((url) => !url.startsWith(`${ORIGIN}/`))).toEqual([]);
  expect(fontRequests(requests)).toEqual([]);

  // The sourcemap is served next to the bundle and points at TypeScript sources.
  const map = JSON.parse(readFileSync(resolve(DIST, `${BUNDLE}.map`), 'utf8')) as {
    sources: string[];
  };
  expect(map.sources.some((s) => s.endsWith('core/src/defaults/supply-defaults.ts'))).toBe(true);
  expect(map.sources.some((s) => s.includes('/three/'))).toBe(true);
});

/** Font files requested so far, as paths relative to the script's folder. */
const fontRequests = (requests: readonly string[]): string[] =>
  requests
    .filter((url) => url.endsWith('.otf'))
    .map((url) => new URL(url).pathname.slice(SCRIPT_PATH.lastIndexOf('/') + 1));

test('IIFE draws text with the shipped default font, loading only the faces it uses', async ({
  page,
}) => {
  const { errors, requests } = await servePage(page);
  await page.goto(`${ORIGIN}/`);
  const fontFile = (face: string) => `${ORIGIN}${SCRIPT_PATH.replace(BUNDLE, `fonts/${face}`)}`;

  // A chart without any text loads no font.
  await page.evaluate(async () => {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped global from the IIFE */
    const hc = (window as any).Holochart;
    const chart = hc.createChart(document.getElementById('root'), {
      data: [{ x: [1, 2, 3], y: [2, 1, 3], mode: 'markers' }],
      layout: {
        width: 240,
        height: 160,
        showlegend: false,
        xaxis: { visible: false },
        yaxis: { visible: false },
      },
    });
    await chart.ready;
    chart.destroy();
  });
  expect(fontRequests(requests)).toEqual([]);

  // Text in an unregistered Helvetica-style family: drawn and measured with TeX Gyre Heros.
  const drawn = await page.evaluate(async () => {
    /* eslint-disable @typescript-eslint/no-explicit-any -- untyped global and troika internals */
    const hc = (window as any).Holochart;
    const family = "'Helvetica Neue', Helvetica, Arial, sans-serif";
    const chart = hc.createChart(document.getElementById('root'), {
      data: [{ x: [1, 2, 3], y: [2, 1, 3], name: 'Revenue' }],
      layout: { width: 400, height: 300, font: { family }, title: { text: 'Quarterly revenue' } },
    });
    await chart.ready;
    /** Every troika label: its font file and whether it has been typeset. */
    const labels = (): { text: string; font: string; typeset: boolean }[] => {
      const out: { text: string; font: string; typeset: boolean }[] = [];
      for (const viewport of chart.three.viewports) {
        viewport.scene.traverse((object: any) => {
          if (object.name !== 'holochart:text-batch') return;
          for (const text of object._members.keys()) {
            out.push({ text: text.text, font: text.font, typeset: Boolean(text.textRenderInfo) });
          }
        });
      }
      return out;
    };
    const plain = labels();
    // The metrics oracle measures with the loaded shipped face, not a system font.
    const faces = [...(document as any).fonts]
      .filter((f: FontFace) => f.family.replace(/"/g, '') === 'holochart-builtin-default')
      .map((f: FontFace) => `${f.weight} ${f.style} ${f.status}`);
    const ctx = document.createElement('canvas').getContext('2d')!;
    ctx.font = '100px "holochart-builtin-default"';
    const canvasWidth = ctx.measureText('Quarterly revenue').width;
    const oracleWidth = hc.render.measureText('Quarterly revenue', { family, size: 100 }).width;

    await chart.relayout({ 'title.font.weight': 'bold' });
    const bold = labels().filter((l) => l.text === 'Quarterly revenue');
    chart.destroy();
    /* eslint-enable @typescript-eslint/no-explicit-any */
    return { plain, faces, canvasWidth, oracleWidth, bold };
  });

  expect(drawn.plain.length).toBeGreaterThan(3); // title, legend, tick labels
  expect(drawn.plain.map((l) => l.text)).toContain('Quarterly revenue');
  for (const label of drawn.plain) {
    expect(label).toMatchObject({ font: fontFile('texgyreheros-regular.otf'), typeset: true });
  }
  expect(drawn.faces).toEqual(['400 normal loaded']);
  expect(drawn.oracleWidth).toBeCloseTo(drawn.canvasWidth, 3);
  expect(drawn.bold).toEqual([
    { text: 'Quarterly revenue', font: fontFile('texgyreheros-bold.otf'), typeset: true },
  ]);

  // Only the faces used were fetched, from next to the script; nothing else left the page.
  expect([...new Set(fontRequests(requests))].sort()).toEqual([
    'fonts/texgyreheros-bold.otf',
    'fonts/texgyreheros-regular.otf',
  ]);
  expect(requests.filter((url) => !url.startsWith(`${ORIGIN}/`))).toEqual([]);
  expect(errors).toEqual([]);
});
