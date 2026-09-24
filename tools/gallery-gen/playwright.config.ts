import './src/port.ts';
import { defineConfig } from '@playwright/test';
import visualConfig from '../../playwright.config.ts';

/**
 * Gallery thumbnails (plan E19.5): the visual suite's Playwright setup (same Chromium flags,
 * SwiftShader, viewport, locale and sandbox dev server; see the root `playwright.config.ts`) with
 * the gallery spec instead of the visual spec. `src/teardown.ts` merges the per-example records
 * into `apps/docs/public/gallery/manifest.json` after the run.
 *
 *   pnpm gallery                       render every example that is a visual test
 *   pnpm gallery -g scatter/           re-render a subset (other entries are kept)
 */
export default defineConfig({
  ...visualConfig,
  testDir: 'src',
  testMatch: 'gallery.spec.ts',
  outputDir: '../../test-results/gallery',
  // The sandbox is a Vite dev server: editing a source file while the gallery runs reloads open
  // pages. One retry absorbs that; a real failure still fails twice.
  retries: 1,
  workers: process.env['CI'] ? 2 : 4,
  reporter: [['list']],
  globalTeardown: './src/teardown.ts',
});
