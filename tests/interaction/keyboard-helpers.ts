import type { Locator, Page } from '@playwright/test';

/**
 * Shared by the keyboard specs of the chart families (backlog S2.14): the plot area's focus
 * target, its live region, and a real Tab into the chart.
 */

interface Hook {
  __interaction: { chart: { element: HTMLElement } };
}

/** The plot area's focus target. */
export function target(page: Page): Locator {
  return page.getByRole('application', { name: /^Chart data/ });
}

/** The live region keyboard navigation announces in. */
export function announcement(page: Page): Locator {
  return page.locator('.holochart-live');
}

/** The hover labels showing. */
export function labels(page: Page): Locator {
  return page.locator('.holochart-hoverlabel').filter({ visible: true });
}

/** Focus the plot area with a real Tab from just before the chart. */
export async function tabIntoChart(page: Page): Promise<void> {
  await page.evaluate(() => {
    const chart = (window as unknown as Hook).__interaction.chart.element;
    chart.tabIndex = -1;
    chart.focus();
  });
  await page.keyboard.press('Tab');
  await page.evaluate(() => {
    (window as unknown as Hook).__interaction.chart.element.removeAttribute('tabindex');
  });
}

/**
 * Press `key` and return the announcement once it has changed (the first keys wait for the
 * navigation code and the traces' stops to load; a repeated announcement alternates a trailing
 * no-break space, so it changes too).
 */
export async function press(page: Page, key: string): Promise<string> {
  const live = announcement(page);
  const before = (await live.count()) > 0 ? ((await live.textContent()) ?? '') : '';
  await page.keyboard.press(key);
  await page.waitForFunction(
    (was) => {
      const text = document.querySelector('.holochart-live')?.textContent ?? '';
      return text !== '' && text !== was;
    },
    before,
    { timeout: 10_000 },
  );
  return ((await live.textContent()) ?? '').trimEnd();
}

interface AnchorHook {
  __interaction: {
    chart: {
      on(name: 'hover', fn: (p: { points: { bbox?: { x0: number; y0: number } }[] }) => void): void;
      three: { root: { canvas: HTMLCanvasElement } };
    };
  };
  __anchor?: { x: number; y: number };
}

/** From now on, remember where each hover's first label is anchored (see {@link anchor}). */
export async function trackAnchors(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as AnchorHook;
    w.__interaction.chart.on('hover', (p) => {
      const b = p.points[0]?.bbox;
      if (b) w.__anchor = { x: b.x0, y: b.y0 };
    });
  });
}

/**
 * The page point the last hover label is anchored at (after {@link trackAnchors}): where a
 * keyboard stop puts its label. A pointer there hovers the same element, which is how the specs
 * check that a stop's label sits on what it describes.
 */
export async function anchor(page: Page): Promise<{ x: number; y: number }> {
  return page.evaluate(() => {
    const w = window as unknown as AnchorHook;
    const box = w.__interaction.chart.three.root.canvas.getBoundingClientRect();
    if (!w.__anchor) throw new Error('no hover yet');
    return { x: box.left + w.__anchor.x, y: box.top + w.__anchor.y };
  });
}
