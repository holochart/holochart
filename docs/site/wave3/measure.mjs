/** Repeatable production measurements. Run from repository root with Node 22+. */
import { chromium } from '@playwright/test';
import { cpus, totalmem, platform, arch, loadavg } from 'node:os';
import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const base = process.env.SITE_BASE_URL ?? 'http://127.0.0.1:5339/holochart/';
const output = process.env.SITE_REPORT_PATH ?? 'docs/site/wave3/performance.json';
const samples = Number(process.env.SITE_SAMPLES ?? 5);
const desktopOnly = process.env.SITE_DESKTOP_ONLY === '1';
const routes = (process.env.SITE_ROUTES ?? ',gallery/,gallery/all/,gallery/basic/').split(',');
let browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const profile = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  cpuSlowdown: 4,
  latencyMs: 150,
  downloadBytesPerSecond: 200_000,
  uploadBytesPerSecond: 93_750,
  compositor: 'forced SwiftShader GPU compositing; same launch flags as frozen mobile baseline',
  cache: 'disabled, new context per run',
  serviceWorkers: 'blocked',
  settle: 'network idle + fonts ready; metrics frozen before any input',
};
const report = {
  checkedAt: new Date().toISOString(),
  runScope: desktopOnly ? 'desktop only' : 'mobile and desktop',
  base,
  browser: await browser.version(),
  host: {
    cpu: cpus()[0]?.model,
    cores: cpus().length,
    memoryGiB: Math.round(totalmem() / 1024 ** 3),
    platform: platform(),
    arch: arch(),
    loadAverageAtStart: loadavg(),
  },
  profile: desktopOnly ? { mobile: 'not measured in this run' } : profile,
  pages: [],
  filters: null,
};
const html = await (await fetch(base)).text();
if (html.includes('/@vite/client'))
  throw new Error('Production preview required; refusing development timings.');
report.homeHtmlSha256 = createHash('sha256').update(html).digest('hex');
function guardPage(page) {
  const failures = [];
  page.on('response', (response) => {
    if (response.url().startsWith(base) && response.status() >= 400)
      failures.push(`${response.status()} ${response.url()}`);
  });
  page.on('pageerror', (error) => failures.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') failures.push(message.text());
  });
  return () => {
    if (failures.length) throw new Error(`Invalid production sample: ${failures.join('; ')}`);
  };
}
const percentile = (values, fraction) =>
  [...values].sort((a, b) => a - b)[Math.ceil(values.length * fraction) - 1];
for (const route of desktopOnly ? [] : routes) {
  const runs = [];
  for (let run = 0; run < samples; run++) {
    const context = await browser.newContext({
      viewport: profile.viewport,
      deviceScaleFactor: profile.deviceScaleFactor,
      isMobile: true,
      hasTouch: true,
      serviceWorkers: 'block',
    });
    const page = await context.newPage();
    const assertHealthy = guardPage(page);
    const session = await context.newCDPSession(page);
    await session.send('Network.enable');
    await session.send('Network.setCacheDisabled', { cacheDisabled: true });
    await session.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: profile.latencyMs,
      downloadThroughput: profile.downloadBytesPerSecond,
      uploadThroughput: profile.uploadBytesPerSecond,
    });
    await session.send('Emulation.setCPUThrottlingRate', { rate: profile.cpuSlowdown });
    const transfers = [];
    const requests = new Map();
    session.on('Network.responseReceived', (e) =>
      requests.set(e.requestId, { url: e.response.url, mime: e.response.mimeType }),
    );
    session.on('Network.loadingFinished', (e) =>
      transfers.push({ ...requests.get(e.requestId), bytes: e.encodedDataLength }),
    );
    await page.addInitScript(() => {
      window.__siteMetrics = { lcp: 0, cls: 0, webglContexts: 0 };
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) window.__siteMetrics.lcp = entry.startTime;
      }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries())
          if (!entry.hadRecentInput) window.__siteMetrics.cls += entry.value;
      }).observe({ type: 'layout-shift', buffered: true });
      const original = HTMLCanvasElement.prototype.getContext;
      const seen = new WeakSet();
      HTMLCanvasElement.prototype.getContext = function (type, ...args) {
        const result = original.call(this, type, ...args);
        if (result && /^webgl/.test(type) && !seen.has(result)) {
          seen.add(result);
          window.__siteMetrics.webglContexts++;
        }
        return result;
      };
    });
    await page.goto(new URL(route, base).href, { waitUntil: 'networkidle', timeout: 120_000 });
    await page
      .locator(
        route === 'demos/' ? '.hc-demo-directory[data-ready="true"]' : 'main[data-ready="true"]',
      )
      .waitFor({ timeout: 30_000 });
    await page.evaluate(() => document.fonts.ready);
    const metrics = await page.evaluate(() => ({
      ...window.__siteMetrics,
      domContentLoaded: performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd,
      load: performance.getEntriesByType('navigation')[0].loadEventEnd,
      canvases: document.querySelectorAll('canvas').length,
      images: [...document.images].filter((i) => i.complete && i.naturalWidth).length,
    }));
    assertHealthy();
    if (!(metrics.lcp > 0)) throw new Error(`No LCP observation for ${route || 'home'}`);
    const totals = {
      wireBytes: transfers.reduce((n, t) => n + t.bytes, 0),
      requests: transfers.length,
      jsBytes: transfers
        .filter((t) => t.mime?.includes('javascript'))
        .reduce((n, t) => n + t.bytes, 0),
      imageBytes: transfers
        .filter((t) => t.mime?.startsWith('image/'))
        .reduce((n, t) => n + t.bytes, 0),
    };
    runs.push({ ...metrics, ...totals });
    console.log(route || 'home', run + 1, JSON.stringify(runs.at(-1)));
    await context.close();
  }
  report.pages.push({
    route,
    runs,
    p75LcpMs: percentile(
      runs.map((r) => r.lcp),
      0.75,
    ),
    maxCls: Math.max(...runs.map((r) => r.cls)),
    medianWireBytes: percentile(
      runs.map((r) => r.wireBytes),
      0.5,
    ),
    lcpBudgetMs: 2500,
    clsBudget: 0.1,
  });
}
// Isolate the desktop phase from mobile-context churn and the forced SwiftShader compositor.
await browser.close();
browser = await chromium.launch();
const browserSession = await browser.newBrowserCDPSession();
const systemInfo = await browserSession.send('SystemInfo.getInfo');
// Desktop UI latency includes Vue DOM updates and two rendering frames, excluding RPC overhead.
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const assertHealthy = guardPage(page);
const desktopSession = await context.newCDPSession(page);
await desktopSession.send('Emulation.setCPUThrottlingRate', { rate: 1 });
await page.goto(new URL('gallery/all/', base).href, { waitUntil: 'networkidle' });
await page.locator('.hc-gallery[data-gallery-ready="true"]').waitFor();
await page.evaluate(() => document.fonts.ready);
const inventoryStatus = await page.locator('.hc-gallery-status [aria-live]').textContent();
const inventoryMatch = inventoryStatus?.match(/(\d+) of (\d+)/);
if (!inventoryMatch || inventoryMatch[1] !== inventoryMatch[2])
  throw new Error(`Full inventory required for filter measurements: ${inventoryStatus}`);
const inventorySize = Number(inventoryMatch[2]);
const latencies = await page.evaluate(async () => {
  const input = document.querySelector('#hc-gallery-search');
  const samples = [];
  const queries = [
    'basic',
    '',
    'radar',
    '',
    'candles',
    '',
    'histogram',
    '',
    'nothing-matches-this-query',
    '',
    'error band',
    '',
    'line',
    '',
    'map',
    '',
    'bar',
    '',
    'surface',
    '',
  ];
  for (let round = 0; round < 3; round++)
    for (const value of queries) {
      const start = performance.now();
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      samples.push({
        query: value,
        ms: performance.now() - start,
        result: document.querySelector('.hc-gallery-status [aria-live]')?.textContent,
      });
    }
  return samples;
});
assertHealthy();
if (
  !latencies.some(
    (sample) => sample.query === 'nothing-matches-this-query' && /^0 of /.test(sample.result ?? ''),
  )
)
  throw new Error('Filter timing did not observe the expected empty-result query.');
report.filters = {
  inventorySize,
  profile:
    'desktop1440x900, fresh normal headless Chromium browser, explicit CPU1, unthrottled network, initialnetworkidle/fontsready; input event to two animation frames',
  cpuSlowdown: 1,
  compositor: {
    renderer: systemInfo.gpu.auxAttributes.glRenderer,
    features: systemInfo.gpu.featureStatus,
  },
  sampleCount: latencies.length,
  p95Ms: percentile(
    latencies.map((s) => s.ms),
    0.95,
  ),
  maxMs: Math.max(...latencies.map((s) => s.ms)),
  budgetMs: 100,
  samples: latencies,
};
await context.close();
await browser.close();
report.host.loadAverageAtEnd = loadavg();
report.budgets = {
  ...(!desktopOnly
    ? {
        mobileLcp: report.pages.every((page) => page.p75LcpMs <= page.lcpBudgetMs),
        mobileCls: report.pages.every((page) => page.maxCls <= page.clsBudget),
        staticCatalogContexts: report.pages.every((page) =>
          page.runs.every((run) => run.webglContexts === 0),
        ),
      }
    : {}),
  filtering: report.filters.p95Ms < report.filters.budgetMs,
};
report.budgets.allPassed = Object.values(report.budgets).every(Boolean);
await writeFile(output, JSON.stringify(report, null, 2) + '\n');
console.log('Report:', output, 'filter p95:', report.filters.p95Ms);

console.log('Budgets:', JSON.stringify(report.budgets));
if (!report.budgets.allPassed) process.exitCode = 1;
