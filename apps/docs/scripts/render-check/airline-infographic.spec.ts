import { expect, test } from '@playwright/test';

for (const width of [1440, 390]) {
  test(`demos/airline-globe infographic at ${width}px`, async ({ page }, testInfo) => {
    test.setTimeout(150_000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.setViewportSize({ width, height: width > 1000 ? 1400 : 844 });
    await page.goto('demos/airline-globe', { waitUntil: 'load' });
    const article = page.locator('.vp-doc');
    const figures = article.locator('figure.hc-example');
    await expect(figures).toHaveCount(10); // The first network embed contains two charts.
    for (const figure of await figures.all()) {
      await figure.scrollIntoViewIfNeeded();
      await expect(figure.locator('.hc-example-status')).toHaveCount(0, { timeout: 30_000 });
      const size = await figure.boundingBox();
      expect(size!.width).toBeLessThanOrEqual(width);
      expect(size!.x).toBeGreaterThanOrEqual(0);
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    const columns = await page
      .locator('.airline-grid')
      .first()
      .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
    expect(columns).toBe(width > 1000 ? 2 : 1);
    await article.locator('h1').scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`airline-infographic-${width}.png`) });
    expect(errors).toEqual([]);
  });
}
