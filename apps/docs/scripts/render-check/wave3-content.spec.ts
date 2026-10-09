/** Distribution and SEO checks against the built documents, independent of live chart execution. */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { expect, test } from '@playwright/test';
import { canonicalUrl } from '../../.vitepress/site-seo.ts';
const axeScript = createRequire(import.meta.url).resolve('axe-core/axe.min.js');

for (const [route, container, label] of [
  ['gallery/example/bar/basic', '.hc-example-source', 'detail'],
  ['charts/basic/bar', '.hc-complete-source', 'inline'],
] as const)
  test(`${label} source tab keeps its labelled panel through loading and failure`, async ({
    page,
  }) => {
    let release!: () => void;
    let requested!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      requested = resolve;
    });
    await page.route('**/gallery/sources/bar/basic.js', async (request) => {
      requested();
      await held;
      await request.fulfill({ status: 503, body: 'Source unavailable for regression test.' });
    });
    try {
      await page.goto(route);
      if (label === 'inline')
        await page.getByRole('tab', { name: 'Complete source', exact: true }).click();
      await started;
      const root = page.locator(container);
      await expect(root.getByRole('status')).toHaveText('Loading complete source…');
      const tab = root.getByRole('tab', { selected: true });
      const panelId = await tab.getAttribute('aria-controls');
      expect(panelId).toBeTruthy();
      const panel = page.locator(`[id="${panelId}"]`);
      await expect(panel).toHaveAttribute('role', 'tabpanel');
      await expect(panel).toHaveAttribute('aria-labelledby', (await tab.getAttribute('id'))!);
      await expect(panel).toHaveAttribute('aria-busy', 'true');
      await page.addScriptTag({ path: axeScript });
      const critical = await page.evaluate(async () => {
        const results = await window.axe.run(document);
        return results.violations.filter((violation) => violation.impact === 'critical');
      });
      expect(critical).toEqual([]);
      release();
      await expect(panel.getByRole('alert')).toContainText('503');
      await expect(panel).toHaveAttribute('aria-busy', 'false');
      await expect(tab).toHaveAttribute('aria-controls', panelId!);
    } finally {
      release();
    }
  });

test('production chart blocks hydrate without repairing server markup', async ({ page }) => {
  test.skip(process.env['DOCS_RENDER_SERVER'] !== 'preview', 'Requires server-rendered HTML.');
  const errors: string[] = [];
  page.on('console', (message) => {
    if (/hydration/i.test(message.text())) errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  for (const route of ['charts/3d/', 'charts/', 'charts/basic/bar']) {
    await page.goto(route);
    await expect(page.locator('h1')).toBeVisible();
    await page.waitForFunction(() => '__vue_app__' in document.querySelector('#app')!);
    expect(errors, route).toEqual([]);
  }
  await expect(page.locator('.hc-chart-overview')).toBeVisible();
  await expect(page.locator('.hc-chart-variations')).toBeVisible();
  await expect(page.locator('#example-bar-grouped.hc-example-link')).toHaveCount(1);
});

test('production canonical URLs ignore gallery filters and use the configured base', async ({
  request,
  baseURL,
}) => {
  test.skip(
    process.env['DOCS_RENDER_SERVER'] !== 'preview',
    'Canonical tags are generated during production rendering.',
  );
  const base = new URL(baseURL!).pathname;
  for (const [route, document] of [
    ['', 'index.md'],
    ['gallery/basic/?subtype=bar&q=basic', 'gallery/basic/index.md'],
    ['gallery/example/bar/basic?from=%2Fgallery%2F', 'gallery/example/bar/basic.md'],
    ['python/api', 'python/api.md'],
    ['reference/bar', 'reference/bar.md'],
  ]) {
    const response = await request.get(route!);
    expect(response.ok(), route).toBe(true);
    const html = await response.text();
    expect(html).toContain(`href="${canonicalUrl(document!, base, 'https://mk7s.dev')}"`);
    expect([...html.matchAll(/rel="canonical"/g)]).toHaveLength(1);
    expect(html).toMatch(/<title>[^<]*Holochart[^<]*<\/title>/);
    expect(html).toMatch(/name="description" content="[^"]+"/);
  }
});

test('all notebook and exact Python downloads match their canonical sources', async ({
  request,
}) => {
  const root = path.resolve(import.meta.dirname, '../../../..');
  const manifest = JSON.parse(
    await readFile(path.join(root, 'examples/notebooks/manifest.json'), 'utf8'),
  );
  expect(manifest.notebooks.length).toBeGreaterThanOrEqual(12);
  let variants = 0;
  for (const item of manifest.notebooks) {
    for (const [download, canonical] of [
      [`notebooks/${item.slug}.py`, item.source],
      [`notebooks/${item.slug}.ipynb`, item.notebook],
    ]) {
      const response = await request.get(download);
      expect(response.ok(), download).toBe(true);
      expect(await response.body(), download).toEqual(await readFile(path.join(root, canonical)));
    }
    const preview = await request.get(`notebooks/previews/${item.slug}.png`);
    expect(preview.ok(), item.slug).toBe(true);
    expect(preview.headers()['content-type']).toContain('image/png');
    for (const variant of item.galleryVariants ?? []) {
      variants++;
      const response = await request.get(variant.download.replace(/^\//, ''));
      expect(response.ok(), variant.id).toBe(true);
      expect(await response.body(), variant.id).toEqual(
        await readFile(path.join(root, variant.source)),
      );
    }
  }
  expect(variants).toBeGreaterThanOrEqual(24);
});
