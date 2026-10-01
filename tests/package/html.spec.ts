import { expect, test } from '@playwright/test';
import { checkFixturePage } from './page.ts';

/**
 * A plain HTML page (`fixtures/html`) loading the script-tag build from the installed tarball,
 * `dist/holochart.iife.min.js` then the 3D add-on `dist/holochart-3d.iife.min.js`: it draws a 2D
 * and a 3D chart without errors, fetching nothing but the two scripts and the font faces.
 */
test('script tags: the IIFE and the 3D add-on draw a 2D and a 3D chart', async ({ page }) => {
  const requests = await checkFixturePage(page, '/html/index.html');
  const scripts = requests.filter((url) => url.endsWith('.js')).map((url) => url.split('/').pop());
  expect(scripts).toEqual(['holochart.iife.min.js', 'holochart-3d.iife.min.js']);
});
