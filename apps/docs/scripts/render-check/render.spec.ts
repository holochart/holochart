/**
 * Every docs page renders without errors (plan E19.4). For each hand-written page (see
 * `pages.ts`): load it, check that VitePress rendered it (not the 404 page) with every
 * `<Example>` embed of its Markdown, scroll each embed into view so it starts (embeds are lazy),
 * and wait until it is ready or has failed. The page fails on:
 *
 * - an example that shows its error state, or doesn't mount in time;
 * - any `console.error` (the `<Example>` component logs failures there too) or uncaught exception;
 * - a same-origin request that fails or returns HTTP 4xx/5xx (missing thumbnails, fonts, chunks).
 *
 * Console warnings are not failures: software GL logs performance warnings ("GPU stall due to
 * ReadPixels"), and pages with more than ~16 embeds make Chromium warn about WebGL contexts.
 */
import { expect, test, type ConsoleMessage, type Page } from '@playwright/test';
import { docsPages } from './pages.ts';

/** How long one example may take to mount (SwiftShader, modules compiled on first request). */
const EXAMPLE_TIMEOUT = 30_000;

/**
 * Console errors that are not page bugs, each with its reason. Keep this short: fix the page
 * instead where possible.
 */
const IGNORED_CONSOLE: readonly RegExp[] = [];

function location(msg: ConsoleMessage): string {
  const { url, lineNumber } = msg.location();
  return url ? ` (${url.replace(/^https?:\/\/[^/]+/, '')}:${lineNumber})` : '';
}

/** Collect the page's errors from now on. */
function watchErrors(page: Page, origin: string): string[] {
  const problems: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (IGNORED_CONSOLE.some((re) => re.test(text))) return;
    problems.push(`console.error: ${text}${location(msg)}`);
  });
  page.on('pageerror', (error) => problems.push(`uncaught exception: ${error.message}`));
  page.on('requestfailed', (request) => {
    const failure = request.failure()?.errorText ?? 'failed';
    // Requests the page cancels itself (navigation, a disposed example's pending fetch).
    if (!request.url().startsWith(origin) || failure === 'net::ERR_ABORTED') return;
    problems.push(`request failed: ${request.url()} (${failure})`);
  });
  page.on('response', (response) => {
    if (response.url().startsWith(origin) && response.status() >= 400) {
      problems.push(`HTTP ${response.status()}: ${response.url()}`);
    }
  });
  return problems;
}

const pages = docsPages();

for (const docsPage of pages) {
  test(docsPage.file, async ({ page, baseURL }) => {
    test.setTimeout(60_000 + EXAMPLE_TIMEOUT * docsPage.examples.length);
    const problems = watchErrors(page, new URL(baseURL ?? '/').origin);

    await page.goto(docsPage.route, { waitUntil: 'load' });
    await expect(page.locator('.VPContent'), 'VitePress rendered the page').toBeVisible();
    await expect(page.locator('.NotFound'), 'not the 404 page').toHaveCount(0);

    const figures = page.locator('figure.hc-example');
    await expect(figures, 'every <Example> of the Markdown is on the page').toHaveCount(
      docsPage.examples.length,
    );

    for (let i = 0; i < docsPage.examples.length; i++) {
      const figure = figures.nth(i);
      const id = (await figure.getAttribute('data-example-id')) ?? docsPage.examples[i];
      // An embed inside a collapsed block or an inactive tab never starts; that is not a failure.
      if (!(await figure.isVisible())) continue;
      await figure.scrollIntoViewIfNeeded();
      const state = await figure
        .evaluate(
          (el, timeout) =>
            new Promise<string>((resolve) => {
              const deadline = performance.now() + timeout;
              const poll = (): void => {
                const status = el.querySelector(
                  ':scope > .hc-example-preview > .hc-example-status',
                );
                if (!status) return resolve('ready');
                if (status.getAttribute('data-status') === 'error') {
                  return resolve(`error: ${status.textContent?.trim() ?? ''}`);
                }
                if (performance.now() > deadline) return resolve('timeout');
                setTimeout(poll, 100);
              };
              poll();
            }),
          EXAMPLE_TIMEOUT,
        )
        .catch((error: unknown) => `error: ${String(error)}`);
      if (state === 'timeout') {
        problems.push(`example ${id} did not mount within ${EXAMPLE_TIMEOUT / 1000} s`);
      } else if (state !== 'ready') {
        problems.push(`example ${id}: ${state}`);
      }
    }

    // Late errors: the last example's first frames, deferred text and font loads.
    await page.waitForTimeout(500);
    expect(problems, problems.join('\n')).toEqual([]);
  });
}
