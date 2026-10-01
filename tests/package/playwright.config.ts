import { defineConfig } from '@playwright/test';

/**
 * Pack-and-install smoke test (backlog S1.3): the only test of what users download. The global
 * setup (`global-setup.ts`) packs every publishable package with `pnpm pack`, installs the
 * tarballs into fresh fixture projects outside the workspace (`fixtures/`, `fixtures.ts`) and
 * serves them on `PACKAGE_PORT` (default 5891). The specs then check a Node ESM (and CommonJS)
 * consumer, a strict `tsc --noEmit` project (`bundler` and `node16` resolution), a Vite app and a
 * plain HTML page with the script-tag build, the last two in headless Chromium with software GL
 * (SwiftShader), like the bundle smoke test.
 *
 * Run with `pnpm test:package`, which builds the packages first. Set `HOLOCHART_PACKS` to a
 * directory of tarballs from `pnpm pack` to install those instead of packing, and
 * `PACKAGE_KEEP=1` to keep the fixture directory for debugging.
 */
const CI = Boolean(process.env.CI);

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  outputDir: '../../test-results/package',
  globalSetup: './global-setup.ts',
  timeout: 120_000,
  forbidOnly: CI,
  retries: 0,
  reporter: CI ? [['list'], ['github']] : [['list']],
  use: {
    browserName: 'chromium',
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
});
