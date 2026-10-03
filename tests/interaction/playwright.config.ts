import { defineConfig } from '@playwright/test';
import { browserProject } from '../browsers.ts';

/**
 * Interaction tests (plan E20.4): scripted pointer scenarios (hover, box zoom, pan, lasso, click,
 * double-click, GPU pick sweeps) against examples served by the dev sandbox, asserting on chart
 * events, axis ranges and hover-label DOM. Same browser setup as the visual suite
 * (playwright.config.ts): headless Chromium with software GL (ANGLE + SwiftShader), never a real
 * or embedded GPU browser.
 *
 *   pnpm test:interaction                 run all scenarios
 *   pnpm test:interaction -g hover        run matching scenarios
 *
 * In CI (the `interaction` job of .github/workflows/ci.yml) a failed test is retried once: one
 * that passes on the retry counts as flaky, does not fail the job, and is listed in the job
 * summary by `node tests/interaction/report.ts` (from the JSON report written here). Locally
 * there are no retries, so a flake shows up as a failure.
 *
 * `HOLOCHART_BROWSER=firefox|webkit` runs the suite on that browser instead (tests/browsers.ts,
 * backlog S2.5); the nightly workflow does. `LEAK_CYCLES` shortens leak.spec.ts for a quick run.
 */
const PORT = Number(process.env.INTERACTION_PORT ?? 5198);
const HOST = '127.0.0.1';
const CI = Boolean(process.env.CI);

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
  testDir: '.',
  testMatch: '**/*.spec.ts',
  outputDir: '../../test-results/interaction',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  // Software GL is CPU-heavy: keep heavy runs few at a time.
  workers: 2,
  reporter: CI
    ? [
        ['list'],
        ['github'],
        ['html', { open: 'never', outputFolder: '../../playwright-report/interaction' }],
        ['json', { outputFile: '../../playwright-report/interaction.json' }],
      ]
    : [['list']],
  use: {
    baseURL: `http://${HOST}:${PORT}`,
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    colorScheme: 'light',
    locale: 'en-US',
    timezoneId: 'UTC',
    trace: 'retain-on-failure',
  },
  projects: [browserProject(CHROMIUM_ARGS)],
  webServer: {
    command: `pnpm --filter @mk7s/holochart-sandbox exec vite --port ${PORT} --strictPort --host ${HOST}`,
    url: `http://${HOST}:${PORT}/`,
    reuseExistingServer: !CI,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
