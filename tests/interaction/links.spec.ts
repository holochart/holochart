import { expect, test, type Page } from '@playwright/test';
import { events, openInteraction, toPage } from './helpers.ts';

/**
 * Rich-text links on `_dev/interaction-links` (plan E2.10): hovering an `<a href>` run shows a
 * pointer cursor, clicking it opens the link with its `target` (`_blank` by default) and no
 * opener, and the click is the link's (no chart `click` event, no zoom). `window.open` is
 * stubbed so nothing navigates.
 *
 * The example: one trace at (v, 10·v), x in [-1, 10], y in [-10, 100]; an annotation link
 * (`target="_self"`, 20 px) centered at (5, 50); the title is a link as a whole (top left); the
 * point (2, 20) has a text label link (`target="_top"`) to its right.
 */
const EXAMPLE = '_dev/interaction-links';

interface Pt {
  x: number;
  y: number;
}

/** Replace `window.open` with a recorder. */
async function stubOpen(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __opened: unknown[][] };
    w.__opened = [];
    window.open = ((...args: unknown[]) => {
      w.__opened.push(args);
      return null;
    }) as typeof window.open;
  });
}

async function opened(page: Page): Promise<unknown[][]> {
  return page.evaluate(() => (window as unknown as { __opened: unknown[][] }).__opened);
}

/** The cursor the chart shows at a page point (the element under it and its ancestors). */
async function cursorAt(page: Page, p: Pt): Promise<string> {
  await page.mouse.move(p.x, p.y);
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
  return page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    return el ? getComputedStyle(el).cursor : '';
  }, p);
}

/** Page position of a container point. */
async function containerToPage(page: Page, x: number, y: number): Promise<Pt> {
  return page.evaluate(
    ([cx, cy]) => {
      const hook = (
        window as unknown as {
          __interaction: { chart: { three: { root: { canvas: HTMLCanvasElement } } } };
        }
      ).__interaction;
      const box = hook.chart.three.root.canvas.getBoundingClientRect();
      return { x: box.left + cx, y: box.top + cy };
    },
    [x, y] as const,
  );
}

test.describe('rich-text links', () => {
  test.beforeEach(async ({ page }) => {
    await openInteraction(page, EXAMPLE);
    await stubOpen(page);
  });

  test('an annotation link shows a pointer and opens with its target', async ({ page }) => {
    const center = await toPage(page, 5, 50);
    const outside = await toPage(page, 5, 20);
    expect(await cursorAt(page, outside)).not.toBe('pointer');
    expect(await cursorAt(page, center)).toBe('pointer');
    await page.mouse.click(center.x, center.y);
    await expect
      .poll(() => opened(page))
      .toEqual([['https://example.com/annotation', '_self', 'noopener']]);
    // The link took the click: no chart click, no zoom.
    expect((await events(page)).map((e) => e.name)).toEqual([]);
  });

  test('a title link opens in a new tab by default', async ({ page }) => {
    // The default look puts an 11 px title at the top left (x: 0.01, pad 6 px).
    const p = await containerToPage(page, 6.4 + 12, 6 + 6);
    expect(await cursorAt(page, p)).toBe('pointer');
    await page.mouse.click(p.x, p.y);
    await expect
      .poll(() => opened(page))
      .toEqual([['https://example.com/title', '_blank', 'noopener']]);
  });

  test('a scatter text link opens from the trace', async ({ page }) => {
    // `middle right` label of the point (2, 20): starts a few px right of the marker.
    const point = await toPage(page, 2, 20);
    const p = { x: point.x + 30, y: point.y };
    expect(await cursorAt(page, p)).toBe('pointer');
    await page.mouse.click(p.x, p.y);
    await expect
      .poll(() => opened(page))
      .toEqual([['https://example.com/point', '_top', 'noopener']]);
  });
});
