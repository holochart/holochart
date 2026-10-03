import { defineConfig } from '@playwright/test';
import { browserProject } from '../browsers.ts';

/**
 * Bundle smoke test (plan E0.2, ADR-015): loads the self-contained IIFE build of `@mk7s/holochart`
 * with a classic `<script>` tag in headless Chromium (software GL via SwiftShader) and checks the
 * `window.Holochart` global, and that text draws with the built-in default font from the files
 * next to the script (E2.18); `iife-3d.spec.ts` adds the 3D add-on script after it. `esm-fonts.spec.ts` checks the same font through an app bundler's
 * lazy chunks (needs every package built). Run with `pnpm test:bundle`, which builds the package
 * first.
 *
 * `HOLOCHART_BROWSER=firefox|webkit` runs the suite on that browser instead (tests/browsers.ts,
 * backlog S2.5); the nightly workflow does.
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
  projects: [
    browserProject([
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
    ]),
  ],
});
