import { defineConfig } from '@playwright/test';

/**
 * Bundle smoke test (plan E0.2, ADR-015): loads the self-contained IIFE build of `@mk7s/holochart`
 * with a classic `<script>` tag in headless Chromium (software GL via SwiftShader) and checks the
 * `window.Holochart` global, and that text draws with the built-in default font from the files
 * next to the script (E2.18). `esm-fonts.spec.ts` checks the same font through an app bundler's
 * lazy chunks (needs every package built). Run with `pnpm test:bundle`, which builds the package
 * first.
 */
const CI = Boolean(process.env.CI);

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  outputDir: '../../test-results/bundle',
  timeout: 30_000,
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
