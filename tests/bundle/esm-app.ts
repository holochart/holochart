import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Page } from '@playwright/test';

/**
 * Helpers of the ESM bundle smoke tests: `@mk7s/holochart`'s ESM build bundled with code splitting
 * (rolldown, the bundler behind Vite 8, as an app would), served to the page from one origin. Needs
 * the packages built (`pnpm build`).
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ENTRY = resolve(ROOT, 'packages/holochart/dist/index.js');
export const ORIGIN = 'http://holochart.test';

interface OutputChunk {
  type: 'chunk' | 'asset';
  fileName: string;
  code?: string;
  isEntry?: boolean;
}

/** Bundle the full ESM build (three included) into chunks, in memory: file name → code. */
export async function bundleApp(): Promise<Map<string, string>> {
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

/**
 * Serve a page loading `app.js` and every chunk from {@link ORIGIN}; every other request is
 * aborted. Returns the errors and requested URLs as they come in.
 */
export async function serveApp(
  page: Page,
  chunks: ReadonlyMap<string, string>,
): Promise<{ errors: string[]; requests: string[] }> {
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
  return { errors, requests };
}
