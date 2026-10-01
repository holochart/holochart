import { expect, test } from '@playwright/test';
import { checkFixturePage } from './page.ts';
import { runIn } from './run.ts';

/**
 * A Vite app (`fixtures/vite`) with the installed `@mk7s/holochart` and its own Vite: it builds,
 * and the built page, served like any static host, draws a 2D and a 3D chart (the 3D code from
 * lazily loaded chunks) without errors.
 */
test('Vite app: builds, and draws a 2D and a 3D chart', async ({ page }) => {
  runIn('vite', 'vite', ['build']);
  const requests = await checkFixturePage(page, '/vite/dist/index.html');
  // Code splitting worked: the 3D chart loaded chunks beyond the entry.
  expect(requests.filter((url) => url.endsWith('.js')).length).toBeGreaterThan(1);
});
