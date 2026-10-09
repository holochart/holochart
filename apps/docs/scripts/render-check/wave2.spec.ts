/** Public navigation, complete examples and shareable gallery state for the Wave 2 site. */
import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

const families = [
  'basic',
  'time-series',
  'relationships',
  'statistical',
  'scientific',
  'hierarchical',
  'financial',
  'polar',
  'maps',
  'networks',
  '3d',
];
const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const collected: string[] = [];
  errors.set(page, collected);
  page.on('pageerror', (error) => collected.push(error.message));
});
test.afterEach(({ page }) => expect(errors.get(page)).toEqual([]));

async function galleryReady(page: Page): Promise<void> {
  await expect(page.locator('.hc-gallery[data-gallery-ready="true"]')).toBeVisible({
    timeout: 15_000,
  });
  await page.evaluate(() => document.fonts.ready);
}
async function homeReady(page: Page): Promise<void> {
  await expect(page.locator('.hc-home-overview')).toHaveAttribute('data-ready', 'true');
  await page.evaluate(() => document.fonts.ready);
}
async function detailReady(page: Page, title: RegExp): Promise<void> {
  await expect(page.locator('.hc-example-detail h1')).toContainText(title);
  await expect(page.locator('#hc-complete-source')).toBeVisible({ timeout: 20_000 });
}
function query(page: Page): URLSearchParams {
  return new URL(page.url()).searchParams;
}

// Ordinary anchors and meaningful text remain useful before enhancement and under custom bases.
test('home exposes six complete first-screen previews, families and three working entry paths', async ({
  page,
  baseURL,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('');
  await homeReady(page);
  await expect(page.locator('.hc-home-preview')).toHaveCount(6);
  await expect(page.locator('.hc-family-tile')).toHaveCount(11);
  await expect(page.locator('canvas')).toHaveCount(0);
  await expect
    .poll(() =>
      page
        .locator('.hc-home-preview img')
        .evaluateAll((images) =>
          images.every(
            (image) =>
              (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0,
          ),
        ),
    )
    .toBe(true);
  const previewMetrics = await page.locator('.hc-home-preview').evaluateAll((cards) =>
    cards.map((card) => {
      const rect = card.getBoundingClientRect();
      const image = card.querySelector('img')!;
      return {
        visible: rect.top >= 0 && rect.bottom <= innerHeight,
        loaded: image.complete && image.naturalWidth > 0,
      };
    }),
  );
  expect(previewMetrics.every((card) => card.visible && card.loaded)).toBe(true);
  for (const family of families)
    await expect(
      page.locator(`.hc-family-tile[href="${new URL(baseURL!).pathname}gallery/${family}/"]`),
    ).toHaveCount(1);
  await expect(page.locator('.hc-home-starts')).toContainText('PyPI:');
  await expect(page.locator('.hc-home-starts')).toContainText('npm:');
  for (const [name, heading] of [
    ['Start in Python / Jupyter →', /Python & Jupyter quick start/],
    ['Start in JavaScript →', /JavaScript & TypeScript quick start/],
    [/Browse chart gallery/, /Find a chart by what it shows/],
  ] as const) {
    await page.getByRole('link', { name, exact: typeof name === 'string' }).click();
    await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
    await page.goto('');
    await homeReady(page);
  }
});

for (const width of [820, 390])
  test(`homepage at ${width}px keeps previews and content within the viewport`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('');
    await homeReady(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await expect(page.locator('.hc-home-preview')).toHaveCount(6);
    await expect(page.locator('.hc-family-tile')).toHaveCount(11);
    await expect(page.locator('canvas')).toHaveCount(0);
  });

test('gallery defaults to eleven linked family sections and offers inventory separately', async ({
  page,
  request,
  baseURL,
}) => {
  await page.goto('gallery/');
  await galleryReady(page);
  await expect(page.locator('.hc-gallery-directory h1')).toContainText(
    'Find a chart by what it shows',
  );
  await expect(page.locator('section[id^="family-"]')).toHaveCount(11);
  await expect(page.locator('.hc-gallery-grid')).toHaveCount(0);
  for (const family of families) {
    const section = page.locator(`#family-${family}`);
    await expect(section.locator('h2 a')).toHaveAttribute(
      'href',
      `${new URL(baseURL!).pathname}gallery/${family}/`,
    );
    expect(await section.locator('.hc-gallery-card-link').count()).toBeGreaterThanOrEqual(3);
    await expect(section.locator('.hc-family-subtypes a').first()).toHaveAttribute(
      'href',
      /\?subtype=/,
    );
  }
  // Dev serves a hydration shell; built preview must contain meaningful SSR text and links.
  if (process.env['DOCS_RENDER_SERVER'] === 'preview') {
    const response = await request.get('gallery/');
    expect(response.ok()).toBe(true);
    const html = await response.text();
    expect(html).toContain('Find a chart by what it shows');
    for (const family of families)
      expect(html).toContain(`href="${new URL(baseURL!).pathname}gallery/${family}/"`);
    expect(html).toContain('gallery/example/bar/basic');
  }
  await page.getByRole('link', { name: /Search all \d+ examples/ }).click();
  await galleryReady(page);
  await expect(page.locator('.hc-gallery-grid')).toBeVisible();
  await expect(page.getByRole('searchbox', { name: 'Search examples' })).toBeVisible();
});

test('family subtype history and combined facets survive sharing and reset', async ({ page }) => {
  await page.goto('gallery/basic/');
  await galleryReady(page);
  await expect(page.locator('.hc-gallery-title')).toContainText('Basic & comparison');
  await page
    .getByRole('navigation', { name: 'Chart subtypes' })
    .getByRole('link', { name: 'Bar', exact: true })
    .click();
  await expect.poll(() => query(page).get('subtype')).toBe('bar');
  await page
    .getByRole('navigation', { name: 'Chart subtypes' })
    .getByRole('link', { name: 'Horizontal bar', exact: true })
    .click();
  await expect.poll(() => query(page).get('subtype')).toBe('horizontal-bar');
  await page.goBack();
  await expect(page.getByRole('combobox', { name: 'Chart subtype', exact: true })).toHaveValue(
    'bar',
  );
  await page
    .locator('summary')
    .filter({ hasText: 'More filters: level, feature, API, dimension and collection' })
    .click();
  for (const [name, value] of [
    ['Verified language', 'typescript'],
    ['Learning level', 'beginner'],
    ['Feature', 'basic'],
    ['API', 'figure'],
    ['Rendering dimension', '2d'],
    ['Collection', 'chart'],
    ['Sort examples', 'alphabetical'],
  ] as const)
    await page.getByRole('combobox', { name, exact: true }).selectOption(value);
  await page.getByRole('searchbox', { name: 'Search examples' }).fill('basic');
  await expect(page.locator('.hc-gallery-grid [data-example-id="bar/basic"]')).toBeVisible();
  const shared = page.url();
  for (const [key, value] of [
    ['q', 'basic'],
    ['subtype', 'bar'],
    ['language', 'typescript'],
    ['level', 'beginner'],
    ['feature', 'basic'],
    ['api', 'figure'],
    ['dimension', '2d'],
    ['kind', 'chart'],
    ['sort', 'alphabetical'],
  ] as const)
    expect(query(page).get(key)).toBe(value);
  await page.goto(shared);
  await galleryReady(page);
  await expect(page.getByRole('searchbox')).toHaveValue('basic');
  await expect(page.getByRole('combobox', { name: 'Sort examples' })).toHaveValue('alphabetical');
  await expect(page.locator('.hc-gallery-grid [data-example-id="bar/basic"]')).toBeVisible();
  await page.getByRole('button', { name: 'Reset filters', exact: true }).click();
  await expect.poll(() => new URL(page.url()).search).toBe('');
  await expect(page.getByRole('searchbox')).toHaveValue('');
  await expect(page.getByRole('combobox', { name: 'Chart subtype', exact: true })).toHaveValue('');
  await expect(page.getByRole('combobox', { name: 'Sort examples' })).toHaveValue('recommended');
  await expect(page.locator('.hc-gallery-title')).toContainText('Basic & comparison');
  await page.goBack();
  await expect(page.getByRole('searchbox')).toHaveValue('basic');
  await expect(page.getByRole('combobox', { name: 'Feature', exact: true })).toHaveValue('basic');
});

test('verified language filters expose the actual notebook histogram and browser choropleth', async ({
  page,
}) => {
  await page.goto('gallery/statistical/?subtype=histogram&language=python');
  await galleryReady(page);
  await expect(
    page.locator('.hc-gallery-grid [data-example-id="histogram/notebook-starter"]'),
  ).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Verified language' })).toHaveValue('python');
  await page.goto('gallery/maps/?subtype=choropleth&language=javascript');
  await galleryReady(page);
  await expect(page.locator('.hc-gallery-grid [data-example-id="choropleth/basic"]')).toBeVisible();
  await expect(page.locator('.hc-gallery-empty')).toHaveCount(0);
});

test('deep example source supports keyboard tabs, copying, downloads and language preference fallback', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('gallery/example/bar/basic');
  await detailReady(page, /Bar: basic/);
  await expect(page).toHaveTitle(/Bar: basic/);
  await expect(page.locator('.hc-example-detail-facts')).toContainText('@mk7s/holochart');
  const ts = page.getByRole('tab', { name: 'TypeScript-compatible bundle', exact: true });
  await ts.focus();
  await ts.press('ArrowRight');
  const js = page.getByRole('tab', { name: 'JavaScript', exact: true });
  await expect(js).toBeFocused();
  await expect(js).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#hc-complete-source')).toHaveAttribute(
    'aria-labelledby',
    'tab-javascript',
  );
  const source = page.locator('#hc-complete-source');
  await expect(source).toContainText('cleanup()');
  const text = await source.textContent();
  expect(text).not.toMatch(/from\s*["'](?:@mk7s\/holochart-examples|\.{1,2}\/)/);
  await page.getByRole('button', { name: 'Copy complete source', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Copied', exact: true })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(text);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download .js', exact: true }).click();
  const download = await downloadPromise;
  expect(await download.failure()).toBeNull();
  expect(await readFile((await download.path())!, 'utf8')).toBe(text);
  await js.press('End');
  const python = page.getByRole('tab', { name: 'Python', exact: true });
  await expect(python).toBeFocused();
  await expect(python).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#hc-complete-source')).toContainText('holochart');
  await expect(page.getByRole('link', { name: 'Download .ipynb', exact: true })).toBeVisible();
  await page.goto('gallery/example/choropleth/basic');
  await detailReady(page, /Choropleth: world/);
  await expect(page.getByRole('tab', { name: 'Python', exact: true })).toHaveCount(0);
  await expect(
    page.getByRole('tab', { name: 'TypeScript-compatible bundle', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.hc-example-detail-facts')).toContainText('@mk7s/holochart');
  await expect(page.locator('#hc-complete-source')).toContainText('@mk7s/holochart/geo');
});

test('detail returns to filtered results and quick previews keep legacy hash history', async ({
  page,
  baseURL,
}) => {
  const from = '/gallery/basic/?subtype=bar&q=basic';
  await page.goto(`gallery/example/bar/basic?from=${encodeURIComponent(from)}`);
  await detailReady(page, /Bar: basic/);
  const returnLink = page.getByRole('link', { name: '← Return to results', exact: true });
  await expect(returnLink).toHaveAttribute(
    'href',
    `${new URL(baseURL!).pathname.slice(0, -1)}${from}`,
  );
  await returnLink.click();
  await galleryReady(page);
  await expect(page.getByRole('searchbox')).toHaveValue('basic');
  const card = page
    .locator('.hc-gallery-grid .hc-gallery-card')
    .filter({ has: page.locator('[data-example-id="bar/basic"]') })
    .getByRole('button', { name: /Quick preview/ });
  await card.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('figure')).toHaveAttribute('data-example-id', 'bar/basic');
  expect(new URL(page.url()).hash).toBe('#bar/basic');
  await page.goBack();
  await expect(dialog).not.toBeVisible();
  await page.goForward();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(card).toBeFocused();
  expect(new URL(page.url()).hash).toBe('');
  await page.goto('gallery/?category=scatter&q=basic#scatter/basic');
  await galleryReady(page);
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog').locator('figure')).toHaveAttribute(
    'data-example-id',
    'scatter/basic',
  );
});
