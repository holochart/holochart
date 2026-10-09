/** Whole-page axe evidence; use the frozen production preview for final reports. */
import process from 'node:process';
import { chromium } from '@playwright/test';
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const base = process.env.SITE_BASE_URL ?? 'http://127.0.0.1:5339/holochart/';
const output = process.env.SITE_REPORT_PATH ?? 'docs/site/wave3/accessibility.json';
const script = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const routes = [
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
];
const html = await (await fetch(base)).text();
if (html.includes('/@vite/client'))
  throw new Error('Production preview required; refusing a development accessibility report.');
const report = {
  checkedAt: new Date().toISOString(),
  base,
  homeHtmlSha256: createHash('sha256').update(html).digest('hex'),
  browser: await browser.version(),
  axe: '4.13.0',
  coverage: 'WCAG2/2.1 A/AA and best practices; no human screen-reader or native zoom claim',
  pages: [],
};
for (const width of [1440, 390])
  for (const route of routes) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const failedLoads = [];
    const pendingRequests = new Map();
    page.on('request', (request) =>
      pendingRequests.set(request, { url: request.url(), type: request.resourceType() }),
    );
    for (const event of ['requestfinished', 'requestfailed'])
      page.on(event, (request) => pendingRequests.delete(request));
    page.on('response', (response) => {
      if (response.url().startsWith(base) && response.status() >= 400)
        failedLoads.push(`${response.status()} ${response.url()}`);
    });
    page.on('pageerror', (error) => failedLoads.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') failedLoads.push(message.text());
    });
    try {
      await page.goto(new URL(route, base).href, { waitUntil: 'load' });
    } catch (error) {
      console.error('Navigation failed:', route, width, 'pending requests:', [
        ...pendingRequests.values(),
      ]);
      console.error('Page errors:', failedLoads);
      throw error;
    }
    await page.evaluate(() => document.fonts.ready);
    if (await page.locator('vite-error-overlay').count())
      throw new Error(`HMR error overlay at ${route}`);
    if (failedLoads.length)
      throw new Error(`Invalid production page ${route}: ${failedLoads.join('; ')}`);
    const hydrated = page.locator('[data-ready]');
    if (await hydrated.count())
      await page.locator('[data-ready="true"]').first().waitFor({ timeout: 30_000 });
    const example = page.locator('.hc-example').first();
    if (await example.count()) {
      await example.scrollIntoViewIfNeeded();
      await example.locator('.hc-example-status').waitFor({ state: 'detached', timeout: 30_000 });
      await example
        .locator('.holochart-a11y table')
        .first()
        .waitFor({ state: 'attached', timeout: 30_000 });
    }
    if (route.startsWith('gallery/example/'))
      await page.locator('#hc-complete-source pre').waitFor({ state: 'visible', timeout: 30_000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    if (failedLoads.length)
      throw new Error(`Invalid production page ${route}: ${failedLoads.join('; ')}`);
    await page.addScriptTag({ path: script });
    const data = await page.evaluate(() =>
      window.axe.run(document, {
        runOnly: {
          type: 'tag',
          values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'],
        },
      }),
    );
    const result = {
      route,
      width,
      violations: data.violations.map((rule) => ({
        id: rule.id,
        impact: rule.impact,
        help: rule.help,
        helpUrl: rule.helpUrl,
        nodes: rule.nodes.map((node) => ({
          target: node.target,
          html: node.html,
          summary: node.failureSummary,
        })),
      })),
      incomplete: data.incomplete.map((rule) => ({
        id: rule.id,
        nodes: rule.nodes.map((node) => ({ target: node.target, summary: node.failureSummary })),
      })),
      passed: data.passes.map((rule) => rule.id),
    };
    report.pages.push(result);
    console.log(
      route || 'home',
      width,
      result.violations.map((rule) => [rule.id, rule.impact, rule.nodes.length]),
    );
    await page.close();
  }
await browser.close();
await writeFile(output, JSON.stringify(report, null, 2) + '\n');
const serious = report.pages.flatMap((page) =>
  page.violations.filter((rule) => rule.impact === 'critical' || rule.impact === 'serious'),
);
console.log(
  `${report.pages.length} page/viewports audited; ${serious.length} critical/serious rules. Report: ${output}`,
);
const unsupportedLabels = report.pages.flatMap((page) =>
  page.incomplete.filter((rule) => rule.id === 'aria-prohibited-attr'),
);
console.log(`${unsupportedLabels.length} incomplete unsupported-ARIA-label rules.`);
if (serious.length || unsupportedLabels.length) process.exitCode = 1;
