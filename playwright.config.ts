import { defineConfig } from '@playwright/test';

/**
 * Visual regression suite (plan E20.3, ADR-018). Every example is rendered by the dev sandbox in
 * test mode and compared against tests/visual/__baselines__ with pixelmatch.
 *
 *   pnpm test:visual                    run all examples
 *   pnpm test:visual -g _dev/hello-cube run one example (grep on the example id)
 *   pnpm test:visual:update             rewrite baselines (or: pnpm test:visual -u)
 */
const PORT = Number(process.env.VISUAL_PORT ?? 5199);
const HOST = '127.0.0.1';
const CI = Boolean(process.env.CI);

/**
 * Software GL via ANGLE + SwiftShader: identical rasterization regardless of the host GPU, so
 * baselines are stable across machines (plan E0.7 spike E). The remaining flags remove other
 * sources of nondeterminism (color profile, LCD text, font hinting, scrollbars).
 */
const CHROMIUM_ARGS = [
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
  '--force-color-profile=srgb',
  '--disable-lcd-text',
  '--font-render-hinting=none',
  '--hide-scrollbars',
];

export default defineConfig({
  testDir: 'tests/visual',
  testMatch: '**/*.spec.ts',
  outputDir: 'test-results/visual',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: CI,
  retries: 0,
  workers: CI ? 2 : undefined,
  reporter: CI
    ? [['list'], ['github'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: `http://${HOST}:${PORT}`,
    browserName: 'chromium',
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    colorScheme: 'light',
    locale: 'en-US',
    timezoneId: 'UTC',
    trace: 'retain-on-failure',
    launchOptions: { args: CHROMIUM_ARGS },
  },
  projects: [{ name: 'chromium-swiftshader' }],
  webServer: {
    // Vite dev server (not build + preview) so a broken example fails only its own test.
    command: `pnpm --filter @mk7s/holochart-sandbox exec vite --port ${PORT} --strictPort --host ${HOST}`,
    url: `http://${HOST}:${PORT}/`,
    reuseExistingServer: !CI,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
