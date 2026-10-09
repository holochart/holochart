import { defineConfig } from '@playwright/test';

/**
 * Docs render check (plan E19.4: "every example renders without console errors"). Loads every
 * hand-written docs page in headless Chromium, mounts each `<Example>` embed in turn, and fails a
 * page on console errors, uncaught exceptions, failed same-origin requests, a missing embed or an
 * example that doesn't mount. See `render.spec.ts`.
 *
 *   pnpm --filter @mk7s/holochart-docs check:render                 every page
 *   pnpm --filter @mk7s/holochart-docs check:render -g charts/basic  pages whose file matches
 *
 * The server is the VitePress dev server by default: no 10-minute build, and examples compile on
 * demand, so a broken example fails only its own pages. `DOCS_RENDER_SERVER=preview` checks the
 * built site instead (`pnpm --filter @mk7s/holochart-docs build` first), which also covers the
 * production bundle. `DOCS_PORT` sets the port (default 5181), `HOLOCHART_DOCS_BASE` the base.
 */
const PORT = Number(process.env['DOCS_PORT'] ?? 5181);
const HOST = '127.0.0.1';
const CI = Boolean(process.env['CI']);
const PREVIEW = process.env['DOCS_RENDER_SERVER'] === 'preview';
const BASE_NAME = (process.env['HOLOCHART_DOCS_BASE'] ?? '/holochart/').replace(/^\/+|\/+$/g, '');
const BASE = BASE_NAME ? `/${BASE_NAME}/` : '/';

export default defineConfig({
  testDir: '.',
  testMatch: [
    'render.spec.ts',
    'airline-infographic.spec.ts',
    'foundation.spec.ts',
    'wave2.spec.ts',
    'wave3.spec.ts',
    'wave3-content.spec.ts',
    'wave4.spec.ts',
  ],
  outputDir: '../../../../test-results/docs-render',
  // Per page; the spec extends it by the number of embeds.
  timeout: 60_000,
  fullyParallel: true,
  forbidOnly: CI,
  // The dev server compiles pages and example modules on first request, and may reload a page
  // when it discovers a new dependency to optimize. One retry absorbs that; a real failure fails
  // twice.
  retries: 1,
  workers: CI ? 2 : 4,
  reporter: CI ? [['list'], ['github']] : [['list']],
  use: {
    baseURL: `http://${HOST}:${PORT}${BASE}`,
    browserName: 'chromium',
    viewport: { width: 1280, height: 800 },
    locale: 'en-US',
    timezoneId: 'UTC',
    trace: 'retain-on-failure',
    // Software GL (SwiftShader), like the visual suite: the same WebGL2 on every machine.
    launchOptions: {
      args: [
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        '--ignore-gpu-blocklist',
      ],
    },
  },
  projects: [{ name: 'chromium-swiftshader' }],
  webServer: {
    command: PREVIEW
      ? `pnpm exec vitepress preview --port ${PORT}`
      : `pnpm run gen && node ../../tools/gallery-gen/src/smoke-sources.ts choropleth/basic && pnpm exec vitepress dev --host ${HOST}`,
    cwd: '../..',
    // The docs config reads the dev server's port from DOCS_PORT (`--port` can't override it).
    env: { DOCS_PORT: String(PORT) },
    url: `http://${HOST}:${PORT}${BASE}`,
    reuseExistingServer: !CI,
    timeout: 240_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
