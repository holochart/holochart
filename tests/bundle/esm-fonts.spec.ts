import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';

/**
 * The built-in default font through an app bundler (plan E2.18): `@mk7s/holochart`'s ESM build is
 * bundled with code splitting (rolldown, the bundler behind Vite 8, as an app would), and the page
 * must draw text with TeX Gyre Heros from the per-face lazy chunks (`data:` URLs, handed to troika
 * as `blob:` URLs): only the faces its text uses are loaded, and nothing is fetched from anywhere
 * but the page's own chunks. Needs the packages built (`pnpm build`).
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ENTRY = resolve(ROOT, 'packages/holochart/dist/index.js');
const ORIGIN = 'http://holochart.test';

interface OutputChunk {
  type: 'chunk' | 'asset';
  fileName: string;
  code?: string;
  isEntry?: boolean;
}

/** Bundle the full ESM build (three included) into chunks, in memory. */
async function bundleApp(): Promise<Map<string, string>> {
  const vite = realpathSync(fileURLToPath(import.meta.resolve('vite')));
  const rolldown = (await import(pathToFileURL(createRequire(vite).resolve('rolldown')).href)) as {
    rolldown(options: Record<string, unknown>): Promise<{
      generate(options: Record<string, unknown>): Promise<{ output: OutputChunk[] }>;
      close(): Promise<void>;
    }>;
  };
  const build = await rolldown.rolldown({
    input: 'app',
    platform: 'browser',
    logLevel: 'warn',
    plugins: [
      {
        name: 'app-entry',
        resolveId: (id: string) => (id === 'app' ? id : null),
        load: (id: string) =>
          id === 'app'
            ? `import * as Holochart from ${JSON.stringify(ENTRY)}; window.Holochart = Holochart;`
            : null,
      },
    ],
  });
  try {
    const { output } = await build.generate({ format: 'es', entryFileNames: 'app.js' });
    return new Map(output.filter((c) => c.type === 'chunk').map((c) => [c.fileName, c.code ?? '']));
  } finally {
    await build.close();
  }
}

test('ESM: text draws with the default font from per-face lazy chunks', async ({ page }) => {
  test.setTimeout(60_000);
  const chunks = await bundleApp();
  const fontChunks = [...chunks.keys()].filter((name) => name.startsWith('texgyreheros-'));
  expect(fontChunks).toHaveLength(4);

  const errors: string[] = [];
  const requests: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('request', (req) => requests.push(req.url()));
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== ORIGIN) {
      await route.abort('internetdisconnected');
      return;
    }
    if (url.pathname === '/') {
      await route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><html><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>',
      });
      return;
    }
    const code = chunks.get(url.pathname.slice(1));
    if (code === undefined) await route.fulfill({ status: 404, body: 'not found' });
    else await route.fulfill({ contentType: 'text/javascript', body: code });
  });

  await page.goto(`${ORIGIN}/`);
  await page.waitForFunction(() => 'Holochart' in window);
  const loadedChunks = () =>
    requests.filter((url) => url.includes('/texgyreheros-')).map((url) => new URL(url).pathname);

  const drawn = await page.evaluate(async () => {
    /* eslint-disable @typescript-eslint/no-explicit-any -- untyped global and troika internals */
    const hc = (window as any).Holochart;
    const chart = hc.createChart(document.getElementById('root'), {
      data: [{ x: [1, 2, 3], y: [2, 1, 3], name: 'Revenue' }],
      layout: {
        width: 400,
        height: 300,
        font: { family: "'Helvetica Neue', Helvetica, Arial, sans-serif" },
        title: { text: 'Quarterly revenue', font: { style: 'italic' } },
      },
    });
    await chart.ready;
    const labels: { text: string; font: string; typeset: boolean }[] = [];
    for (const viewport of chart.three.viewports) {
      viewport.scene.traverse((object: any) => {
        if (object.name !== 'holochart:text-batch') return;
        for (const text of object._members.keys()) {
          labels.push({ text: text.text, font: text.font, typeset: Boolean(text.textRenderInfo) });
        }
      });
    }
    chart.destroy();
    /* eslint-enable @typescript-eslint/no-explicit-any */
    return labels;
  });

  const title = drawn.filter((l) => l.text === 'Quarterly revenue');
  const others = drawn.filter((l) => l.text !== 'Quarterly revenue');
  expect(title).toHaveLength(1);
  expect(others.length).toBeGreaterThan(2);
  expect(title[0]).toMatchObject({ font: expect.stringMatching(/^blob:/), typeset: true });
  for (const label of others) {
    expect(label).toMatchObject({ font: expect.stringMatching(/^blob:/), typeset: true });
  }
  expect(new Set(others.map((l) => l.font)).size).toBe(1);
  expect(others[0]!.font).not.toBe(title[0]!.font);
  // Regular (ticks, legend) and italic (title) only.
  expect(loadedChunks().sort()).toEqual([
    expect.stringMatching(/^\/texgyreheros-italic-/),
    expect.stringMatching(/^\/texgyreheros-regular-/),
  ]);
  expect(requests.filter((url) => !url.startsWith(`${ORIGIN}/`))).toEqual([]);
  expect(errors).toEqual([]);
});
