import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';

/**
 * A page for the script-tag build (ADR-015): serves `packages/holochart/dist/` from a CDN-like
 * path of {@link ORIGIN} and loads the given scripts with classic `<script>` tags. Every other
 * request is aborted, so the page has no network access beyond its own files.
 */
export const DIST = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../packages/holochart/dist',
);
/** The 2D script. */
export const BUNDLE = 'holochart.iife.min.js';
/** The 3D add-on, loaded after {@link BUNDLE}. */
export const BUNDLE_3D = 'holochart-3d.iife.min.js';
export const ORIGIN = 'http://holochart.test';
/** Where `dist/` is served, like a CDN path, so fonts must resolve relative to the script. */
export const DIST_PATH = '/cdn/holochart@0/dist/';
/** Path of the 2D script on the page. */
export const SCRIPT_PATH = `${DIST_PATH}${BUNDLE}`;

const CONTENT_TYPES: Record<string, string> = {
  '.map': 'application/json',
  '.otf': 'font/otf',
  '.txt': 'text/plain',
  '.js': 'text/javascript',
};

/** Throws when a built file is missing. */
export function requireBuilt(...files: string[]): void {
  for (const file of files) {
    if (!existsSync(resolve(DIST, file))) {
      throw new Error(`${file} not found in ${DIST}; run \`pnpm test:bundle\` (it builds first).`);
    }
  }
}

export interface ServedPage {
  /** Page errors and `console.error` messages, as they come in. */
  errors: string[];
  /** `console.warn` messages. */
  warnings: string[];
  /** Requested URLs. */
  requests: string[];
}

/**
 * Serve the page and `dist/` (under {@link DIST_PATH}) from {@link ORIGIN}; the page loads
 * `scripts` (file names in `dist/`, default the 2D script) in order.
 */
export async function servePage(
  page: Page,
  scripts: readonly string[] = [BUNDLE],
): Promise<ServedPage> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const requests: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
    if (msg.type() === 'warning') warnings.push(msg.text());
  });
  page.on('request', (req) => requests.push(req.url()));

  const tags = scripts.map((file) => `<script src="${DIST_PATH}${file}"></script>`).join('');
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== ORIGIN) {
      await route.abort('internetdisconnected');
      return;
    }
    if (url.pathname === '/') {
      await route.fulfill({
        contentType: 'text/html',
        body: `<!doctype html><html><body><div id="root"></div>${tags}</body></html>`,
      });
      return;
    }
    const file = resolve(DIST, `./${url.pathname.slice(DIST_PATH.length)}`);
    if (!url.pathname.startsWith(DIST_PATH) || !file.startsWith(DIST) || !existsSync(file)) {
      await route.fulfill({ status: 404, body: 'not found' });
      return;
    }
    await route.fulfill({
      contentType: CONTENT_TYPES[extname(file)] ?? 'application/octet-stream',
      body: readFileSync(file),
    });
  });
  return { errors, warnings, requests };
}

/** Font files requested so far, as paths relative to `dist/`. */
export const fontRequests = (requests: readonly string[]): string[] =>
  requests
    .filter((url) => url.endsWith('.otf'))
    .map((url) => new URL(url).pathname.slice(DIST_PATH.length));

/** The sources of a built script's sourcemap. */
export function mapSources(file: string): string[] {
  return (JSON.parse(readFileSync(resolve(DIST, `${file}.map`), 'utf8')) as { sources: string[] })
    .sources;
}
