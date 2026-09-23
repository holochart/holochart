import { expect, type Page } from '@playwright/test';

/** What `examples/_dev/interaction-*.ts` expose on `window.__interaction`. */
export interface LoggedEvent {
  name: string;
  payload: Record<string, unknown> & {
    points?: { curveNumber: number; pointNumber: number; x: unknown; y: unknown }[];
  };
}

/** Time for the sandbox to compile the module graph and install the example. */
const BOOT_TIMEOUT_MS = 30_000;

/**
 * Open an interaction example in the sandbox at its fixed test size and wait for its first frame.
 * (Interaction examples are tagged `no-visual-test`, so they run in the normal sandbox mode.)
 */
export async function openInteraction(page: Page, id: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    await page.goto(`/?example=${id}&size=meta`, { waitUntil: 'load' });
    try {
      await page.waitForFunction(
        () => (window as unknown as { __interaction?: unknown }).__interaction !== undefined,
        undefined,
        { timeout: BOOT_TIMEOUT_MS },
      );
      await page.evaluate(async () => {
        const hook = (
          window as unknown as { __interaction: { chart: { ready: Promise<unknown> } } }
        ).__interaction;
        await hook.chart.ready;
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      });
      return;
    } catch (error) {
      // Vite may reload the page once after optimizing a newly discovered dependency.
      const message = error instanceof Error ? error.message : String(error);
      if (!/Execution context was destroyed|navigation/i.test(message) || attempt >= 2) throw error;
    }
  }
}

/** Page coordinates of a data point on subplot `xy`. */
export async function toPage(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ([dx, dy]) => {
      interface Axis {
        scale: { d2p(v: unknown): number };
      }
      const hook = (
        window as unknown as {
          __interaction: {
            chart: {
              three: { root: { canvas: HTMLCanvasElement } };
              subplots: Map<
                string,
                {
                  rect: { x: number; y: number; width: number; height: number };
                  xaxis: Axis;
                  yaxis: Axis;
                }
              >;
            };
          };
        }
      ).__interaction;
      const box = hook.chart.three.root.canvas.getBoundingClientRect();
      const sp = hook.chart.subplots.get('xy');
      if (!sp) throw new Error('no xy subplot');
      return {
        x: box.left + sp.rect.x + sp.xaxis.scale.d2p(dx),
        y: box.top + sp.rect.y + sp.rect.height - sp.yaxis.scale.d2p(dy),
      };
    },
    [x, y] as const,
  );
}

/** The chart's events so far (and clear the log with `clear`). */
export async function events(page: Page, clear = false): Promise<LoggedEvent[]> {
  return page.evaluate((reset) => {
    const hook = (window as unknown as { __interaction: { events: LoggedEvent[] } }).__interaction;
    const out = JSON.parse(JSON.stringify(hook.events)) as LoggedEvent[];
    if (reset) hook.events.length = 0;
    return out;
  }, clear);
}

/** Wait for an event by name and return the latest one. */
export async function waitForEvent(page: Page, name: string): Promise<LoggedEvent> {
  await expect
    .poll(async () => (await events(page)).some((e) => e.name === name), { timeout: 10_000 })
    .toBe(true);
  const all = await events(page);
  return all.filter((e) => e.name === name).at(-1) as LoggedEvent;
}

/** Axis ranges in use (linear coordinates) of the `xy` subplot. */
export async function ranges(page: Page): Promise<{ x: number[]; y: number[] }> {
  return page.evaluate(() => {
    const hook = (
      window as unknown as {
        __interaction: {
          chart: { axes: Map<string, { scale: { range: readonly number[] } }> };
        };
      }
    ).__interaction;
    return {
      x: [...(hook.chart.axes.get('x')?.scale.range ?? [])],
      y: [...(hook.chart.axes.get('y')?.scale.range ?? [])],
    };
  });
}

/** Call a chart method in the page (e.g. `setDragmode('pan')`) and wait for its frame. */
export async function callChart(page: Page, method: string, ...args: unknown[]): Promise<void> {
  await page.evaluate(
    async ([m, a]) => {
      const chart = (
        window as unknown as {
          __interaction: { chart: Record<string, (...x: unknown[]) => Promise<unknown>> };
        }
      ).__interaction.chart;
      await chart[m as string]?.(...(a as unknown[]));
    },
    [method, args] as const,
  );
}

/** Drag with the primary button through `steps` intermediate moves. */
export async function dragBetween(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  steps = 8,
): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps });
  await page.mouse.up();
}
