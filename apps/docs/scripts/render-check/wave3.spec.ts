/** Accessibility and lifecycle checks for site templates; production is required for no-JS SSR. */
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import type { AxeResults } from 'axe-core';
const axeScript = createRequire(import.meta.url).resolve('axe-core/axe.min.js');

declare global {
  interface Window {
    axe: typeof import('axe-core');
    __siteGL: {
      created: number;
      active: number;
      maximum: number;
      disposed: number;
      chartCreated: number;
      chartActive: number;
      sharedActive: number;
    };
    __siteReadGL(): Window['__siteGL'];
  }
}
async function ready(page: Page): Promise<void> {
  await expect(page.locator('main')).toBeVisible();
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  const hydrated = page.locator('[data-ready]');
  if (await hydrated.count()) await expect(hydrated.first()).toHaveAttribute('data-ready', 'true');
}
async function renderedExampleReady(page: Page): Promise<void> {
  const example = page.locator('.hc-example').first();
  if (!(await example.count())) return;
  await example.scrollIntoViewIfNeeded();
  await example.locator('.hc-example-status').waitFor({ state: 'detached', timeout: 30_000 });
  // Audit the native data mirror after rendering, not only the initial canvas shell.
  await expect(example.locator('.holochart-a11y table').first()).toBeAttached({ timeout: 30_000 });
  if (await page.locator('#hc-complete-source').count())
    await expect(page.locator('#hc-complete-source pre')).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => window.scrollTo(0, 0));
}
async function audit(page: Page): Promise<AxeResults> {
  await page.addScriptTag({ path: axeScript });
  return page.evaluate(() =>
    window.axe.run(document, {
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'],
      },
    }),
  );
}
async function trackContexts(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__siteGL = {
      created: 0,
      active: 0,
      maximum: 0,
      disposed: 0,
      chartCreated: 0,
      chartActive: 0,
      sharedActive: 0,
    };
    const records: {
      context: WeakRef<WebGLRenderingContext>;
      canvas: WeakRef<HTMLCanvasElement>;
      kind?: 'chart' | 'shared';
      disposed: boolean;
    }[] = [];
    window.__siteReadGL = () => {
      for (const record of records) {
        const context = record.context.deref();
        const canvas = record.canvas.deref();
        if (canvas)
          record.kind = canvas.getAttribute('data-engine')?.startsWith('three.js')
            ? 'chart'
            : 'shared';
        if (!record.disposed && (!context || context.isContextLost())) record.disposed = true;
      }
      window.__siteGL.active = records.filter((record) => !record.disposed).length;
      window.__siteGL.disposed = records.filter((record) => record.disposed).length;
      window.__siteGL.chartCreated = records.filter((record) => record.kind === 'chart').length;
      window.__siteGL.chartActive = records.filter(
        (record) => record.kind === 'chart' && !record.disposed,
      ).length;
      window.__siteGL.sharedActive = records.filter(
        (record) => record.kind !== 'chart' && !record.disposed,
      ).length;
      return window.__siteGL;
    };
    const canvas = HTMLCanvasElement.prototype as unknown as {
      getContext(type: string, ...args: unknown[]): RenderingContext | null;
    };
    const original = canvas.getContext;
    const seen = new WeakSet<object>();
    canvas.getContext = function (type, ...args) {
      const context = original.call(this, type, ...args);
      if (context && /^webgl/.test(type) && !seen.has(context)) {
        seen.add(context);
        window.__siteGL.created++;
        window.__siteGL.active++;
        window.__siteGL.maximum = Math.max(window.__siteGL.maximum, window.__siteGL.active);
        const record = {
          context: new WeakRef(context as WebGLRenderingContext),
          canvas: new WeakRef(this as unknown as HTMLCanvasElement),
          disposed: false,
        };
        records.push(record);
        (this as unknown as HTMLCanvasElement).addEventListener('webglcontextlost', () => {
          if (!record.disposed) {
            record.disposed = true;
            window.__siteGL.active--;
            window.__siteGL.disposed++;
          }
        });
      }
      return context;
    };
  });
}

for (const [route, title] of [
  ['', 'home'],
  ['gallery/', 'directory'],
  ['gallery/all/', 'inventory'],
  ['gallery/basic/', 'family'],
  ['gallery/example/bar/basic', 'detail'],
  ['getting-started/', 'chooser'],
  ['getting-started/javascript', 'JavaScript quick start'],
  ['getting-started/html', 'HTML quick start'],
  ['getting-started/python-jupyter', 'notebook quick start'],
  ['python/', 'Python hub'],
  ['guides/notebooks', 'notebook guide'],
  ['charts/basic/bar', 'chart guide'],
] as const)
  test(`${title} has no critical or serious automated accessibility violations`, async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(route);
    await ready(page);
    await renderedExampleReady(page);
    const results = await audit(page);
    expect(errors).toEqual([]);
    await testInfo.attach('axe-results', {
      contentType: 'application/json',
      body: JSON.stringify(
        {
          route,
          violations: results.violations,
          incomplete: results.incomplete,
          passed: results.passes.map((rule) => rule.id),
        },
        null,
        2,
      ),
    });
    expect(results.passes.length).toBeGreaterThan(10);
    // Axe reports unsupported labels on generic elements as incomplete, not violations.
    expect(results.incomplete.filter((rule) => rule.id === 'aria-prohibited-attr')).toEqual([]);
    expect(
      results.violations
        .filter((rule) => rule.impact === 'critical' || rule.impact === 'serious')
        .map((rule) => ({ id: rule.id, nodes: rule.nodes.map((node) => node.target) })),
    ).toEqual([]);
  });

test('sidebar toggles with Space and Enter, without nested controls', async ({ page }) => {
  await page.goto('getting-started/');
  await ready(page);
  const toggle = page.locator('.VPSidebar .item[role="button"]').first();
  await expect(toggle).toHaveAttribute('aria-controls', /hc-sidebar-/);
  await expect(toggle.locator('a,button,[role="button"]')).toHaveCount(0);
  const initial = await toggle.getAttribute('aria-expanded');
  await toggle.focus();
  await toggle.press('Space');
  await expect(toggle).toHaveAttribute('aria-expanded', initial === 'true' ? 'false' : 'true');
  await expect(toggle).toBeFocused();
  await toggle.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', initial!);
});

test('gallery announces full-pool matches while incrementally showing cards', async ({
  page,
  request,
}) => {
  await page.goto('gallery/all/');
  await ready(page);
  const cards = page.locator('.hc-gallery-grid .hc-gallery-card');
  const language = page.getByRole('combobox', { name: 'Verified language' });
  const sourcesResponse = await request.get('gallery/sources.json');
  expect(sourcesResponse.ok()).toBe(true);
  const sources = await sourcesResponse.json();
  const renderedSources = Object.values(
    sources.examples as Record<string, { verification: string }>,
  ).filter((source) => source.verification === 'rendered').length;
  const expectedLanguageOptions = [
    ['typescript', 'TypeScript (786)'],
    ['javascript', `JavaScript (${renderedSources})`],
    ['python', 'Python / Jupyter (24)'],
  ] as const;
  for (const [value, label] of expectedLanguageOptions)
    await expect(language.locator(`option[value="${value}"]`)).toHaveText(label);
  await language.selectOption('python');
  await expect(page.locator('.hc-gallery-status [aria-live="polite"]')).toContainText('24 of 786');
  await expect(cards).toHaveCount(24);
  // A selected language excludes itself from its option counts, so alternatives remain discoverable.
  for (const [value, label] of expectedLanguageOptions)
    await expect(language.locator(`option[value="${value}"]`)).toHaveText(label);
  await page.getByRole('button', { name: 'Reset filters', exact: true }).first().click();
  await expect(cards).toHaveCount(48);
  const status = page.locator('.hc-gallery-status [aria-live="polite"]');
  await expect(status).toHaveAttribute('aria-atomic', 'true');
  await expect(status).toContainText('Showing 48');
  await page.getByRole('button', { name: 'Show 48 more examples', exact: true }).click();
  await expect(cards).toHaveCount(96);
  await expect(status).toContainText('Showing 96');
  await page.getByRole('searchbox', { name: 'Search examples' }).fill('nothing-matches-this-query');
  await expect(status).toContainText('0 of');
  await expect(
    page.getByRole('heading', { name: 'No examples match this combination' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Reset filters', exact: true }).first().click();
  await expect(cards).toHaveCount(48);
});

for (const width of [720, 390])
  test(`catalogs reflow at ${width}px with visible focus and touch targets`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const route of ['', 'gallery/', 'gallery/all/', 'gallery/basic/']) {
      await page.goto(route);
      await ready(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      if (width === 390) {
        const bad = await page.locator('main').evaluate((root) =>
          [
            ...root.querySelectorAll<HTMLElement>(
              '.hc-home-action,.hc-home-browse,.hc-home-code-bar button,.hc-gallery-preview-button,.hc-gallery-filters input,.hc-gallery-filters select,.hc-gallery-more-filters summary,.hc-gallery-subtypes a,.hc-family-jump a,.hc-directory-actions a',
            ),
          ]
            .filter((el) => {
              const r = el.getBoundingClientRect();
              return r.width > 0 && r.height > 0 && r.height < 44;
            })
            .map((el) => ({
              tag: el.tagName,
              text: el.textContent?.slice(0, 70),
              height: el.getBoundingClientRect().height,
            })),
        );
        expect(bad).toEqual([]);
      }
      const link = page.locator('main a').first();
      await link.focus();
      await expect(link).toBeFocused();
      expect(await link.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe('none');
      const card = page.locator('.hc-gallery-card-link').first();
      if (await card.count()) {
        await card.hover();
        expect(await card.evaluate((el) => getComputedStyle(el).transform)).toBe('none');
      }
    }
  });

test('static catalogs create no WebGL contexts and previews dispose each context before reuse', async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(120_000);
  await trackContexts(page);
  await page.goto('gallery/all/');
  await ready(page);
  expect(await page.evaluate(() => window.__siteGL.created)).toBe(0);
  await expect(page.locator('canvas')).toHaveCount(0);
  const button = page
    .locator('.hc-gallery-grid .hc-gallery-card')
    .filter({ has: page.locator('[data-example-id="bar/basic"]') })
    .getByRole('button', { name: /Quick preview/ });
  for (let i = 0; i < 16; i++) {
    await button.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.locator('canvas').first()).toBeVisible();
    await expect(dialog.locator('.hc-example-status')).toHaveCount(0, { timeout: 15_000 });
    expect((await page.evaluate(() => window.__siteReadGL())).chartActive).toBe(1);
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect.poll(() => page.evaluate(() => window.__siteReadGL().chartActive)).toBe(0);
    await expect(button).toBeFocused();
  }
  const stats = await page.evaluate(() => window.__siteReadGL());
  await testInfo.attach('WebGL-lifecycle', {
    body: JSON.stringify(stats),
    contentType: 'application/json',
  });
  if (process.env['SITE_LIFECYCLE_REPORT'])
    await writeFile(
      process.env['SITE_LIFECYCLE_REPORT'],
      JSON.stringify(
        {
          checkedAt: new Date().toISOString(),
          browser: browser.version(),
          context:
            'Sixteen sequential bar/basic quick previews; WebGL states sampled using weak references',
          stats,
        },
        null,
        2,
      ) + '\n',
    );
  expect(stats.chartCreated).toBe(16);
  expect(stats.disposed).toBeGreaterThanOrEqual(16);
  expect(stats.chartActive).toBe(0);
  expect(stats.sharedActive).toBeLessThanOrEqual(1);
  expect(stats.maximum).toBeLessThanOrEqual(2);
});

test('WebGL-unavailable embeds retain static previews, source downloads and recovery help', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const proto = HTMLCanvasElement.prototype as unknown as {
      getContext(type: string, ...args: unknown[]): RenderingContext | null;
    };
    const original = proto.getContext;
    proto.getContext = function (type, ...args) {
      return /^webgl/.test(type) ? null : original.call(this, type, ...args);
    };
  });
  test.setTimeout(90_000);
  for (const route of [
    'gallery/example/bar/basic',
    'charts/basic/bar',
    'getting-started/javascript',
    'getting-started/html',
  ]) {
    await page.goto(route);
    await ready(page);
    const example = page.locator('.hc-example').first();
    await example.scrollIntoViewIfNeeded();
    await expect(example.locator('.hc-example-status[role="alert"]')).toContainText(
      /WebGL|graphics|browser/i,
      { timeout: 20_000 },
    );
    await expect(example.locator('.hc-example-static-preview')).toBeVisible();
    await expect(example.getByRole('link', { name: 'WebGL troubleshooting' })).toBeVisible();
    if (route.startsWith('gallery/example/'))
      await expect(page.getByRole('link', { name: 'Download .js', exact: true })).toBeVisible();
    else {
      await example.getByRole('button', { name: 'Open complete source', exact: true }).click();
      await expect(example.getByRole('link', { name: 'Download .js', exact: true })).toBeVisible();
    }
  }
});

test('production without JavaScript exposes navigation, chart thumbnails and download links', async ({
  browser,
  baseURL,
}) => {
  test.skip(
    process.env['DOCS_RENDER_SERVER'] !== 'preview',
    'Development serves a hydration shell; SSR is checked against production preview.',
  );
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  for (const route of [
    '',
    'gallery/',
    'gallery/all/',
    'gallery/basic/',
    'gallery/example/bar/basic',
    'getting-started/',
    'getting-started/javascript',
    'getting-started/html',
    'getting-started/python-jupyter',
    'python/',
    'guides/notebooks',
    'charts/basic/bar',
  ]) {
    await page.goto(new URL(route, baseURL).href);
    await expect(
      page.getByRole('navigation', { name: 'Navigation without JavaScript' }),
    ).toBeVisible();
    await expect(page.locator('main h1')).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(0);
    if (route.startsWith('gallery/example/'))
      await expect(page.getByRole('link', { name: 'Download .js', exact: true })).toBeVisible();
    if (route === '' || route === 'gallery/')
      expect(await page.locator('main img').count()).toBeGreaterThanOrEqual(6);
  }
  await context.close();
});
