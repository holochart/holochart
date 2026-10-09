/** Foundation routes and density, run under both default and versioned HOLOCHART_DOCS_BASE. */
import { expect, test, type Page } from '@playwright/test';

async function galleryReady(page: Page): Promise<void> {
  await expect(page.locator('.hc-gallery')).toHaveAttribute('data-ready', 'true', {
    timeout: 15_000,
  });
  await page.evaluate(() => document.fonts.ready);
}

test('foundation landing pages expose primary navigation and working next steps', async ({
  page,
  baseURL,
}) => {
  await page.goto('getting-started/');
  const nav = page.locator('.VPNavBarMenu');
  for (const name of [
    'Get started',
    'Gallery',
    'Python & Jupyter',
    'Guides',
    'Reference',
    'Demos',
  ]) {
    await expect(nav.getByRole('link', { name, exact: true })).toBeVisible();
  }
  await expect(page.getByRole('heading', { name: 'Get started', exact: true })).toBeVisible();
  await expect(
    page.locator('.hc-breadcrumbs').getByText('Get started', { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator('.vp-doc').getByRole('link', { name: 'Python learning path' }),
  ).toHaveAttribute('href', `${new URL(baseURL!).pathname}python/`);
  for (const [route, title] of [
    ['python/', 'Python & Jupyter'],
    ['charts/', 'Chart types'],
    ['guides/', 'Guides'],
    ['demos/', 'Demos'],
  ] as const) {
    await page.goto(route);
    await expect(page.locator('.NotFound')).toHaveCount(0);
    await expect(page.locator('.vp-doc h1')).toContainText(title);
  }
  await page.goto('guides/notebooks#live-widgets');
  await expect(page.locator('.vp-doc h2').filter({ hasText: 'Live widgets' })).toBeVisible();
  await expect(
    page.locator('.VPSidebar').getByText('Python & Jupyter', { exact: true }),
  ).toBeVisible();
});

test('gallery keeps legacy query/hash links and restores filters on browser history', async ({
  page,
}) => {
  await page.goto('gallery/?category=scatter&q=basic#scatter/basic');
  await galleryReady(page);
  await page.locator('.hc-gallery').evaluate((el) => {
    (el as HTMLElement).dataset.historyMarker = 'mounted';
  });
  const dialog = page.locator('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('figure')).toHaveAttribute('data-example-id', 'scatter/basic');
  await expect(page.getByRole('searchbox')).toHaveValue('basic');
  await expect(page.locator('.hc-gallery-legacy-filters')).toHaveAttribute('open', '');
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(new URL(page.url()).searchParams.get('category')).toBe('scatter');
  expect(new URL(page.url()).searchParams.get('q')).toBe('basic');
  expect(new URL(page.url()).hash).toBe('');
  await page.getByRole('button', { name: 'Reset filters', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Chart family', exact: true })
    .selectOption('time-series');
  await expect(page).toHaveURL(/family=time-series/);
  await page
    .getByRole('combobox', { name: 'Chart family', exact: true })
    .selectOption('relationships');
  await expect(page).toHaveURL(/family=relationships/);
  await page.goBack();
  await expect(page.getByRole('combobox', { name: 'Chart family', exact: true })).toHaveValue(
    'time-series',
  );
  await expect(page).toHaveURL(/family=time-series/);
  await expect(page.locator('.hc-gallery')).toHaveAttribute('data-history-marker', 'mounted');
  const card = page.locator('.hc-gallery-card-link').first();
  const id = (await card.getAttribute('data-example-id'))!;
  const preview = card.locator('..').getByRole('button', { name: 'Quick preview' });
  await preview.click();
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('figure')).toHaveAttribute('data-example-id', id);
  await page.goBack();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Chart family', exact: true })).toHaveValue(
    'time-series',
  );
  await page.goForward();
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('figure')).toHaveAttribute('data-example-id', id);
  await expect(page.locator('.hc-gallery')).toHaveAttribute('data-history-marker', 'mounted');
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(preview).toBeFocused();
  const modifiedClickPrevented = await card.evaluate((el) => {
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true });
    // Cancel only after the component's handler, so this check does not open a second chart.
    const preventNavigation = (e: Event): void => e.preventDefault();
    let prevented = false;
    el.addEventListener(
      'click',
      (e) => {
        prevented = e.defaultPrevented;
      },
      { once: true },
    );
    document.addEventListener('click', preventNavigation, { once: true });
    el.dispatchEvent(event);
    return prevented;
  });
  expect(modifiedClickPrevented).toBe(false);
  await page.locator('.hc-gallery-sidebar a[href$="/charts/"]').click();
  await expect(page.locator('.vp-doc h1')).toContainText('Chart types');
  await page.goBack();
  await galleryReady(page);
  await expect(page.getByRole('combobox', { name: 'Chart family', exact: true })).toHaveValue(
    'time-series',
  );
});

for (const [width, columns] of [
  [1440, 4],
  [1200, 3],
  [820, 2],
  [720, 2], // 1440px viewport at 200% zoom has the same CSS layout width.
  [390, 1],
] as const) {
  test(`gallery responsive grid ${width}px has ${columns} columns and no page overflow`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('gallery/all/');
    await galleryReady(page);
    await expect(page.locator('.hc-gallery-grid')).toBeVisible();
    const metrics = await page.evaluate(() => {
      const grid = document.querySelector('.hc-gallery-grid')!;
      return {
        columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
        scrollWidth: document.documentElement.scrollWidth,
        viewport: innerWidth,
        visibleCards: [...document.querySelectorAll('.hc-gallery-card')].filter((el) => {
          const r = el.getBoundingClientRect();
          return r.top >= 0 && r.bottom <= innerHeight;
        }).length,
      };
    });
    expect(metrics.columns).toBe(columns);
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.viewport);
    if (width === 1440) expect(metrics.visibleCards).toBeGreaterThanOrEqual(8);
    if (width <= 820) {
      await page.getByRole('button', { name: 'mobile navigation', exact: true }).click();
      await expect(
        page.locator('.VPNavScreen').getByRole('link', { name: 'Python & Jupyter', exact: true }),
      ).toBeVisible();
      await expect(
        page.locator('.VPNavScreen').getByRole('link', { name: 'Gallery', exact: true }),
      ).toBeVisible();
    }
  });
}

test('dense example detail splits chart and complete source, then stacks on mobile', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('gallery/example/scatter/basic');
  const detail = page.locator('.hc-example-detail');
  const grid = detail.locator('.hc-example-detail-grid');
  const columns = () =>
    grid.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
  await expect(detail.locator('#hc-complete-source')).toBeVisible();
  expect(await columns()).toBe(2);
  await expect(detail.locator('section.hc-example-preview')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await columns()).toBe(1);
  await detail.getByRole('tab', { name: 'JavaScript', exact: true }).click();
  await expect(detail.getByRole('tab', { name: 'JavaScript', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(detail.locator('#hc-complete-source')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  expect(overflow).toBe(false);
});
