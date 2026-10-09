/** Expansion checks: finished recipes, complete sources, static catalogs and truthful support. */
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { exampleAnchor } from '../../.vitepress/theme/example-anchor.ts';
const axeScript = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const root = path.resolve(import.meta.dirname, '../../../..');
const recipes = [
  ['small-multiples', 'layout/grid-coupled', true],
  ['mixed-line-bar', 'line/with-bars', true],
  ['confidence-bands', 'area/band', false],
  ['sorting-ranking', 'recipes/ranked-bars', false],
  ['missing-data', 'line/gaps', true],
  ['date-axes', 'timeseries/date-formatting', false],
  ['custom-hover', 'scatter/interactive', false],
  ['linked-views', 'axes/linked-axes', false],
  ['themes', 'themes/plotly_white', true],
  ['dashboard-sizing', 'layout/grid-independent', true],
] as const;

function healthy(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.url().startsWith(new URL(page.url()).origin) && response.status() >= 400)
      errors.push(`${response.status()} ${response.url()}`);
  });
  return () => expect(errors).toEqual([]);
}

for (const [slug, id, python] of recipes)
  test(`recipe ${slug} renders its exact chart and downloads complete source`, async ({
    page,
    request,
  }) => {
    const assertHealthy = healthy(page);
    await page.goto(`cookbook/${slug}`);
    await expect(page.locator('h1')).toBeVisible();
    const figure = page.locator(`#${exampleAnchor(id)}`);
    await figure.scrollIntoViewIfNeeded();
    await expect(figure.locator('.hc-example-stage canvas').first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(figure.locator('.hc-example-stage .holochart-a11y table').first()).toBeAttached({
      timeout: 30_000,
    });
    if (!(await figure.locator('.hc-complete-source').isVisible()))
      await figure.getByRole('tab', { name: 'Complete source', exact: true }).click();
    const source = figure.locator('.hc-complete-source');
    await expect(source.getByRole('tab', { name: 'JavaScript', exact: true })).toBeVisible();
    await source.getByRole('tab', { name: 'JavaScript', exact: true }).click();
    await expect(source.getByRole('tabpanel')).toHaveAttribute('aria-busy', 'false');
    const exported = await readFile(
      path.join(root, 'apps/docs/public/gallery/sources', `${id}.js`),
      'utf8',
    );
    await expect(source.locator('pre code')).toHaveText(exported);
    const download = source.getByRole('link', { name: 'Download .js', exact: true });
    const response = await request.get((await download.getAttribute('href'))!);
    expect(response.ok()).toBe(true);
    expect(await response.text()).toBe(exported);
    await expect(source.getByRole('tab', { name: 'Python', exact: true })).toHaveCount(
      python ? 1 : 0,
    );
    const notebookLinks = page.locator('.notebook-links');
    await expect(notebookLinks).toHaveCount(python ? 1 : 0);
    if (python) {
      for (const link of await notebookLinks.getByRole('link').all()) {
        const href = (await link.getAttribute('href'))!;
        const downloaded = await request.get(href);
        expect(downloaded.ok()).toBe(true);
        // URL pathname derives the configured base instead of treating Python files as pages.
        const artifactPath = new URL(href, page.url()).pathname.match(/\/notebooks\/(.+)$/)?.[1];
        expect(artifactPath).toBeTruthy();
        expect(await downloaded.body()).toEqual(
          await readFile(path.join(root, 'apps/docs/public/notebooks', artifactPath!)),
        );
      }
    }
    assertHealthy();
  });

for (const width of [1440, 390])
  for (const route of ['cookbook/', 'demos/'])
    test(`${route} static directory is accessible and reflows at ${width}px`, async ({ page }) => {
      const assertHealthy = healthy(page);
      await page.setViewportSize({ width, height: 900 });
      await page.goto(route);
      await expect(page.locator('h1')).toBeVisible();
      await page.waitForFunction(() => '__vue_app__' in document.querySelector('#app')!);
      await page.evaluate(() => document.fonts.ready);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
      ).toBe(true);
      await expect(page.locator('canvas')).toHaveCount(0);
      const destinations = page.locator('main a[href]');
      expect(await destinations.count()).toBeGreaterThanOrEqual(10);
      await page.addScriptTag({ path: axeScript });
      const violations = await page.evaluate(async () => {
        const result = await window.axe.run(document, {
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
        });
        return result.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          targets: v.nodes.map((n) => n.target),
        }));
      });
      expect(violations).toEqual([]);
      assertHealthy();
    });

test('analytical task search works with history and verified-language boundaries', async ({
  page,
}) => {
  const assertHealthy = healthy(page);
  await page.goto('gallery/');
  await expect(page.locator('.hc-gallery[data-ready="true"]')).toBeVisible();
  const recipeLink = page.locator('.hc-card[href$="/cookbook/"]');
  await expect(recipeLink).toContainText('10 recipes');
  await recipeLink.click();
  await expect(page.locator('.hc-recipe-directory[data-ready="true"]')).toBeVisible();
  await expect(page.locator('.hc-recipe-card')).toHaveCount(10);
  await page.goto('gallery/all/?q=Compare%20category%20totals');
  await expect(page.locator('.hc-gallery-grid .hc-gallery-card')).toHaveCount(1);
  await expect(page.locator('.hc-gallery-grid [data-example-id="bar/basic"]')).toHaveCount(1);
  await page.getByRole('combobox', { name: 'Verified language' }).selectOption('python');
  await expect(page.locator('.hc-gallery-grid .hc-gallery-card')).toHaveCount(1);
  await page
    .getByRole('searchbox', { name: 'Search examples' })
    .fill('Place measured cities on a world map');
  await expect(
    page.getByRole('heading', { name: 'No examples match this combination' }),
  ).toBeVisible();
  await page.getByRole('combobox', { name: 'Verified language' }).selectOption('');
  await expect(page.locator('.hc-gallery-grid .hc-gallery-card')).toHaveCount(1);
  await expect(page.locator('.hc-gallery-grid [data-example-id="scattergeo/basic"]')).toHaveCount(
    1,
  );
  await page.reload();
  await expect(page.getByRole('searchbox', { name: 'Search examples' })).toHaveValue(
    'Place measured cities on a world map',
  );
  await expect(page.locator('.hc-gallery-grid .hc-gallery-card')).toHaveCount(1);
  assertHealthy();
});

for (const width of [1440, 390])
  test(`notebook environment evaluation is accessible at ${width}px and keeps unverified launchers unavailable`, async ({
    page,
  }) => {
    const assertHealthy = healthy(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto('python/environments');
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('main')).toContainText('Colab');
    await expect(page.locator('main')).toContainText('Binder');
    await expect(page.locator('main')).toContainText('VS Code');
    const launchers = page.locator(
      'a[href*="colab.research.google.com/github/"], a[href*="mybinder.org/v2/"]',
    );
    await expect(launchers).toHaveCount(0);
    await expect(page.locator('main a[href$="/python/notebooks/"]').first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
    await expect(
      page.getByRole('region', { name: 'Notebook environment setup comparison', exact: true }),
    ).toHaveAttribute('tabindex', '0');
    await page.addScriptTag({ path: axeScript });
    const violations = await page.evaluate(async () => {
      const result = await window.axe.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
      });
      return result.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        targets: v.nodes.map((n) => n.target),
      }));
    });
    expect(violations).toEqual([]);
    assertHealthy();
  });

test('new directories remain ordinary links and thumbnails without JavaScript', async ({
  browser,
  baseURL,
}) => {
  test.skip(
    process.env['DOCS_RENDER_SERVER'] !== 'preview',
    'Requires server-rendered production HTML.',
  );
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    for (const route of ['cookbook/', 'demos/']) {
      await page.goto(new URL(route, baseURL!).href);
      await expect(page.locator('h1')).toBeVisible();
      expect(await page.locator('main a[href]').count()).toBeGreaterThanOrEqual(10);
      await expect(page.locator('main img').first()).toBeVisible();
      await expect(page.locator('canvas')).toHaveCount(0);
    }
  } finally {
    await context.close();
  }
});
