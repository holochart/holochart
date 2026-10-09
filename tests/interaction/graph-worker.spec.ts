import { expect, test, type Page } from '@playwright/test';

/**
 * The layout worker in a real browser (backlog G7), on `_dev/graph-worker`: a force layout sent
 * through `layoutInWorker` under the dev server. What Node cannot show is checked here: that
 * Vite serves the worker file the client asks for and a worker really runs the layout, that
 * positions arrive while it runs, that another thread of the browser computes the same bytes,
 * that a cancel reaches the worker, and that the main thread takes over, in slices, when the
 * worker file cannot be loaded.
 */
const EXAMPLE = '_dev/graph-worker';

/** Mirrors `LayoutAsk` and `LayoutReport` of the example. */
interface LayoutAsk {
  nodes?: number;
  links?: number;
  ticks?: number;
  thread?: 'auto' | 'main' | 'sync';
  cancelAfter?: number;
  compare?: boolean;
  draw?: boolean;
  move?: boolean;
}
interface LayoutReport {
  thread: 'worker' | 'main' | 'sync';
  outcome: 'done' | 'aborted';
  progressTicks: number[];
  firstProgress: number | null;
  total: number;
  elapsed: number;
  ticks: number;
  longestBlock: number;
  equalsMain: boolean | null;
  finite: boolean;
}
interface Hook {
  layout(ask?: LayoutAsk): Promise<LayoutReport>;
  workerUrl(url: string | null): void;
  thread(): 'worker' | 'main' | undefined;
  warnings: string[];
}
type HookWindow = Window & { __graphWorker: Hook };

/** Open the example without its own first layout (`idle`) and wait for its hook. */
async function open(page: Page): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    await page.goto(`/?example=${EXAMPLE}&size=meta&idle=1`, { waitUntil: 'load' });
    try {
      await page.waitForFunction(
        () => (window as unknown as Partial<HookWindow>).__graphWorker !== undefined,
        undefined,
        { timeout: 30_000 },
      );
      return;
    } catch (error) {
      // Vite may reload the page once after optimizing a newly discovered dependency.
      const message = error instanceof Error ? error.message : String(error);
      if (!/Execution context was destroyed|navigation/i.test(message) || attempt >= 2) throw error;
    }
  }
}

const layout = (page: Page, ask: LayoutAsk = {}): Promise<LayoutReport> =>
  page.evaluate((a) => (window as unknown as HookWindow).__graphWorker.layout(a), ask);

const warnings = (page: Page): Promise<string[]> =>
  page.evaluate(() => (window as unknown as HookWindow).__graphWorker.warnings);

const layoutWorkers = (page: Page): string[] =>
  page
    .workers()
    .map((worker) => worker.url())
    .filter((url) => url.includes('layout-worker'));

/** A graph small enough to lay out twice (worker and main thread) within a loaded test run. */
const SMALL: LayoutAsk = { nodes: 2000, links: 6000, ticks: 150 };

test.describe('the graph layout worker', () => {
  test('lays out 10,000 nodes in a worker and streams positions before the result', async ({
    page,
  }) => {
    await open(page);
    expect(layoutWorkers(page)).toHaveLength(0);
    const report = await layout(page, { nodes: 10_000, links: 50_000 });
    expect(report.outcome).toBe('done');
    expect(report.thread).toBe('worker');
    expect(report.finite).toBe(true);
    // 90 ticks at this size: the layout's own default.
    expect(report.ticks).toBe(90);
    // Progress came, in order, while the layout was still running.
    expect(report.progressTicks.length).toBeGreaterThan(1);
    expect(report.progressTicks).toEqual([...report.progressTicks].sort((a, b) => a - b));
    expect(report.progressTicks[0]!).toBeLessThan(report.ticks);
    expect(report.firstProgress!).toBeLessThan(report.total);
    // A worker of the browser ran it, from the file the dev server made of layout-worker.ts.
    expect(layoutWorkers(page)).toHaveLength(1);
    expect(
      await page.evaluate(() => (window as unknown as HookWindow).__graphWorker.thread()),
    ).toBe('worker');
    expect(await warnings(page)).toEqual([]);
  });

  test('gives the bytes a main-thread layout gives', async ({ page }) => {
    await open(page);
    const report = await layout(page, { ...SMALL, compare: true });
    expect(report.thread).toBe('worker');
    expect(report.outcome).toBe('done');
    expect(report.equalsMain).toBe(true);
    // The caller's arrays went as copies; given away instead, the result is the same.
    const moved = await layout(page, { ...SMALL, compare: true, move: true });
    expect(moved.thread).toBe('worker');
    expect(moved.equalsMain).toBe(true);
  });

  test('keeps the main thread free while it lays out', async ({ page }) => {
    await open(page);
    const ask: LayoutAsk = { nodes: 10_000, links: 50_000, draw: false };
    const worker = await layout(page, ask);
    const blocking = await layout(page, { ...ask, thread: 'sync' });
    expect(worker.thread).toBe('worker');
    // One call holds the thread for the whole layout; with the worker it is never held for
    // even a quarter of that (in practice a few milliseconds, but the machine may be busy).
    expect(blocking.longestBlock).toBeGreaterThan(blocking.elapsed * 0.9);
    expect(worker.longestBlock).toBeLessThan(blocking.elapsed / 4);
  });

  test('cancels a running layout and goes on with the next', async ({ page }) => {
    await open(page);
    // 100,000 ticks would run for minutes.
    const cancelled = await layout(page, { ...SMALL, ticks: 100_000, cancelAfter: 2 });
    expect(cancelled.outcome).toBe('aborted');
    expect(cancelled.thread).toBe('worker');
    // Nothing that was still on its way was reported after the cancel.
    expect(cancelled.progressTicks).toHaveLength(2);
    const next = await layout(page, SMALL);
    expect(next.outcome).toBe('done');
    expect(next.thread).toBe('worker');
    // The cancelled layout stopped: with it still running, the next would get half of the
    // worker and take about twice its own computing time.
    expect(next.ticks).toBe(150);
    expect(layoutWorkers(page)).toHaveLength(1);
  });

  test('replaces a running layout when the same owner asks again', async ({ page }) => {
    await open(page);
    const [first, second] = await page.evaluate(
      ([long, short]) => {
        const hook = (window as unknown as HookWindow).__graphWorker;
        const running = hook.layout(long);
        return Promise.all([running, hook.layout(short)]);
      },
      [{ ...SMALL, ticks: 100_000 }, SMALL] as const,
    );
    expect(first.outcome).toBe('aborted');
    expect(second.outcome).toBe('done');
    expect(second.ticks).toBe(150);
  });

  test('falls back to the main thread, in slices, when the worker file cannot be loaded', async ({
    page,
  }) => {
    await open(page);
    await page.evaluate(() =>
      (window as unknown as HookWindow).__graphWorker.workerUrl('/no-such-dir/layout-worker.js'),
    );
    const report = await layout(page, { ...SMALL, compare: true, draw: false });
    expect(report.outcome).toBe('done');
    expect(report.thread).toBe('main');
    expect(report.equalsMain).toBe(true);
    // The same progress as from the worker, and the page was let in between the slices.
    expect(report.progressTicks.length).toBeGreaterThan(1);
    expect(report.longestBlock).toBeLessThan(report.elapsed / 3);
    expect(
      await page.evaluate(() => (window as unknown as HookWindow).__graphWorker.thread()),
    ).toBe('main');
    // Said once, with the way out.
    await layout(page, { ...SMALL, draw: false });
    const said = (await warnings(page)).filter((w) => w.includes('layout worker'));
    expect(said).toHaveLength(1);
    expect(said[0]).toContain('setGraphWorkerUrl');

    // Back at the default address the worker is used again.
    await page.evaluate(() => (window as unknown as HookWindow).__graphWorker.workerUrl(null));
    const again = await layout(page, SMALL);
    expect(again.thread).toBe('worker');
  });
});
