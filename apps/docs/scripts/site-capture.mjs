/** Capture the implemented site from a stable production preview; preserve historical baselines. */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createHash } from 'node:crypto';
import { chromium } from '@playwright/test';
import { format } from 'prettier';

const base = process.argv[2] ?? 'http://127.0.0.1:5339/holochart/';
const wave = process.argv[3] ?? 'foundation';
if (!['foundation', 'wave2', 'wave3', 'wave4'].includes(wave))
  throw new Error('Expected foundation, wave2, wave3 or wave4.');
const homeHtml = await (await fetch(base)).text();
if (homeHtml.includes('/@vite/client')) throw new Error('Production preview required.');
const homeHtmlSha256 = createHash('sha256').update(homeHtml).digest('hex');
const output = path.resolve(import.meta.dirname, '../../../docs/site', wave);
const surfaces =
  wave === 'wave4'
    ? [
        ['home', ''],
        ['directory', 'gallery/'],
        ['inventory', 'gallery/all/'],
        ['cookbook', 'cookbook/'],
        ['demos', 'demos/'],
        ['recipe-small-multiples', 'cookbook/small-multiples'],
        ['recipe-linked-views', 'cookbook/linked-views'],
        ['environments', 'python/environments'],
      ]
    : wave !== 'foundation'
      ? [
          ['home', ''],
          ['directory', 'gallery/'],
          ['inventory', 'gallery/all/'],
          ['family', 'gallery/statistical/'],
          ['detail', 'gallery/example/histogram/notebook-starter'],
          ['python-start', 'getting-started/python-jupyter'],
          ['javascript-start', 'getting-started/javascript'],
          ...(wave === 'wave3'
            ? [
                ['chart-guide', 'charts/basic/bar'],
                ['python-api', 'python/api'],
                ['notebook-library', 'python/notebooks/'],
              ]
            : []),
        ]
      : [
          ['home', ''],
          ['gallery', 'gallery/'],
          ['chart', 'charts/basic/scatter'],
          ['notebooks', 'guides/notebooks'],
        ];
const sizes = [
  ['desktop', 1440, 900],
  ['tablet', 820, 1180],
  ['mobile', 390, 844],
];
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
  ],
});
const records = [];
try {
  for (const [size, width, height] of sizes) {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
    for (const [slug, route] of surfaces) {
      console.log(`Capturing ${slug}/${size}: ${route || '/'}`);
      const errors = [];
      const onError = (error) => errors.push(error.message);
      const onResponse = (response) => {
        if (response.url().startsWith(base) && response.status() >= 400)
          errors.push(`${response.status()} ${response.url()}`);
      };
      page.on('pageerror', onError);
      page.on('response', onResponse);
      await page.goto(new URL(route, base).href, { waitUntil: 'domcontentloaded' });
      await page
        .locator(slug === 'home' ? '.hc-home-overview[data-ready="true"]' : 'h1')
        .first()
        .waitFor();
      if (!(await page.title()).includes('Holochart'))
        throw new Error('URL is not the Holochart docs site.');
      if (await page.locator('vite-error-overlay').count())
        throw new Error('Development error overlay present; use a stable preview.');
      if (['gallery', 'directory', 'inventory', 'family'].includes(slug)) {
        await page.locator('.hc-gallery[data-ready="true"]').waitFor({ timeout: 15_000 });
      }
      if (slug === 'cookbook' || slug === 'demos')
        await page
          .locator(`[data-${slug === 'cookbook' ? 'ready' : 'demo-ready'}="true"]`)
          .first()
          .waitFor();
      if (['detail', 'chart-guide'].includes(slug) || slug.startsWith('recipe-')) {
        if (slug === 'chart-guide' || slug.startsWith('recipe-'))
          await page.locator('.hc-example-stage').first().scrollIntoViewIfNeeded();
        await page.locator('.hc-example-stage canvas').first().waitFor({ timeout: 20_000 });
        await page
          .locator('figure .hc-example-status')
          .waitFor({ state: 'detached', timeout: 20_000 });
        await page.evaluate(() => scrollTo(0, 0));
      }
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all(
          [...document.images]
            .filter((img) => img.getBoundingClientRect().top < innerHeight)
            .map((img) => img.decode()),
        );
      });
      await page.screenshot({
        path: path.join(output, `${slug}-${size}.png`),
        animations: 'disabled',
      });
      const metrics = await page.evaluate(() => {
        const grid = document.querySelector(
          '.hc-gallery-grid, .hc-recipe-grid, .hc-demo-directory .hc-card-grid',
        );
        return {
          title: document.title,
          scrollWidth: document.documentElement.scrollWidth,
          viewportWidth: innerWidth,
          cardColumns: grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : null,
          visibleCards: [
            ...document.querySelectorAll('.hc-gallery-card, .hc-recipe-card, .hc-demo-card'),
          ].filter((el) => {
            const rect = el.getBoundingClientRect();
            return rect.top >= 0 && rect.bottom <= innerHeight;
          }).length,
        };
      });
      if (errors.length) throw new Error(`${slug}/${size}: ${errors.join('; ')}`);
      if (metrics.scrollWidth > width) throw new Error(`${slug}/${size}: document overflow.`);
      records.push({
        slug,
        route,
        viewport: { width, height },
        homeHtmlSha256,
        ...metrics,
        errors,
      });
      page.off('pageerror', onError);
      page.off('response', onResponse);
    }
    await page.close();
  }
  await writeFile(
    path.join(output, 'viewports.json'),
    await format(JSON.stringify(records), { parser: 'json' }),
  );
  console.log(`Captured ${records.length} production viewports in docs/site/${wave}.`);
} finally {
  await browser.close();
}
