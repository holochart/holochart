import { expect, test, type Page } from '@playwright/test';
import { TEST_CONTAINER_ID } from '../../apps/sandbox/src/test-protocol.ts';
import { openExample } from '../visual/harness.ts';
import { dragBetween, events, openInteraction, waitForEvent } from './helpers.ts';

/**
 * Table pointer scenarios on `table/interaction` (plan E9.13, E20.4): the wheel and a drag over the
 * table scroll its rows and never zoom or pan the plot under it, and dragging a header cell
 * reorders the columns with a `restyle` of `columnorder`.
 *
 * The example: 640×400 px, 20 px margins, a scatter plot filling the plot area with wheel zoom on
 * (`scrollZoom`), and a 200-row table over its right half (`domain.x: [0.5, 1]`: container x
 * 320–620, y 20–380) with three equal columns (100 px), a 28 px header and 20 px rows.
 */
const EXAMPLE = 'table/interaction';

/** Table geometry in container px (see the module comment). */
const TABLE = { left: 320, top: 20, width: 300, height: 360, header: 28 } as const;

interface Box {
  left: number;
  top: number;
}

async function canvasBox(page: Page): Promise<Box> {
  return page.evaluate(() => {
    const hook = (
      window as unknown as {
        __interaction: { chart: { three: { root: { canvas: HTMLCanvasElement } } } };
      }
    ).__interaction;
    const r = hook.chart.three.root.canvas.getBoundingClientRect();
    return { left: r.left, top: r.top };
  });
}

/** Page point for container px. */
function at(box: Box, x: number, y: number): { x: number; y: number } {
  return { x: box.left + x, y: box.top + y };
}

/** Pixels of a container-px region, after the next frames have rendered. */
async function region(
  page: Page,
  box: Box,
  r: { x: number; y: number; width: number; height: number },
): Promise<Buffer> {
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  return page.screenshot({
    clip: { x: box.left + r.x, y: box.top + r.y, width: r.width, height: r.height },
  });
}

const BODY = {
  x: TABLE.left + 2,
  y: TABLE.top + TABLE.header + 2,
  width: TABLE.width - 4,
  height: 200,
};
const HEADER = { x: TABLE.left + 2, y: TABLE.top + 2, width: TABLE.width - 4, height: 24 };

test.describe('table interaction', () => {
  test.beforeEach(async ({ page }) => {
    await openInteraction(page, EXAMPLE);
    await events(page, true);
  });

  test('the wheel scrolls the rows over the table and zooms the plot elsewhere', async ({
    page,
  }) => {
    const box = await canvasBox(page);
    const before = await region(page, box, BODY);
    const header = await region(page, box, HEADER);
    const inside = at(box, TABLE.left + 150, TABLE.top + 200);
    await page.mouse.move(inside.x, inside.y);
    await page.mouse.wheel(0, 300);
    const scrolled = await region(page, box, BODY);
    expect(scrolled.equals(before)).toBe(false);
    // The header stays put.
    expect((await region(page, box, HEADER)).equals(header)).toBe(true);
    // Scrolling back restores the first rows exactly.
    await page.mouse.wheel(0, -300);
    expect((await region(page, box, BODY)).equals(before)).toBe(true);
    // The plot under the table never zoomed (wheel zoom commits after the wheel rests).
    await page.waitForTimeout(600);
    expect((await events(page)).filter((e) => e.name === 'relayout')).toEqual([]);

    // Control: the same wheel over the plot's left half zooms it.
    const plot = at(box, 150, 200);
    await page.mouse.move(plot.x, plot.y);
    await page.mouse.wheel(0, -200);
    await waitForEvent(page, 'relayout');
  });

  test('dragging the rows scrolls them and does not zoom or pan the plot', async ({ page }) => {
    const box = await canvasBox(page);
    const before = await region(page, box, BODY);
    await dragBetween(
      page,
      at(box, TABLE.left + 150, TABLE.top + 300),
      at(box, TABLE.left + 150, TABLE.top + 120),
    );
    expect((await region(page, box, BODY)).equals(before)).toBe(false);
    // Dragging back down to the top restores the first rows.
    await dragBetween(
      page,
      at(box, TABLE.left + 150, TABLE.top + 60),
      at(box, TABLE.left + 150, TABLE.top + 340),
    );
    expect((await region(page, box, BODY)).equals(before)).toBe(true);
    await page.waitForTimeout(300);
    expect((await events(page)).filter((e) => e.name === 'relayout')).toEqual([]);
  });

  test('dragging a header cell reorders the columns and restyles columnorder', async ({ page }) => {
    const box = await canvasBox(page);
    const header = await region(page, box, HEADER);
    // Drag the first column's header (center x 370) past the second column's center (470).
    await dragBetween(
      page,
      at(box, TABLE.left + 50, TABLE.top + 14),
      at(box, TABLE.left + 180, TABLE.top + 14),
      12,
    );
    const restyle = await waitForEvent(page, 'restyle');
    expect(restyle.payload).toEqual({ update: { columnorder: [[1, 0, 2]] }, traces: [1] });
    const order = await page.evaluate(
      () =>
        (
          window as unknown as {
            __interaction: { chart: { fullData: readonly { columnorder?: unknown }[] } };
          }
        ).__interaction.chart.fullData[1]?.columnorder,
    );
    expect(order).toEqual([1, 0, 2]);
    expect((await region(page, box, HEADER)).equals(header)).toBe(false);
    expect((await events(page)).filter((e) => e.name === 'relayout')).toEqual([]);
  });
});

/**
 * Rich-text links in cells (plan E9.13, E2.10) on `table/rich-text`, opened in the sandbox's test
 * mode (the gallery example has no event hook): the "Wikipedia" link in the first row of the last
 * column shows a pointer and opens in a new browsing context without an opener; a drag that
 * starts on it opens nothing. `window.open` is stubbed so nothing navigates.
 */
test.describe('table rich-text links', () => {
  test.beforeEach(async ({ page }) => {
    await openExample(page, 'table/rich-text');
    await page.evaluate(() => {
      const w = window as unknown as { __opened: unknown[][] };
      w.__opened = [];
      window.open = ((...args: unknown[]) => {
        w.__opened.push(args);
        return null;
      }) as typeof window.open;
    });
  });

  const opened = (page: Page) =>
    page.evaluate(() => (window as unknown as { __opened: unknown[][] }).__opened);

  /** The cursor at a page point, after the pointer moved there and the chart handled it. */
  async function cursorAt(page: Page, x: number, y: number): Promise<string> {
    await page.mouse.move(x, y);
    await page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    );
    return page.evaluate(
      ([px, py]) => {
        const el = document.elementFromPoint(px, py);
        return el ? getComputedStyle(el).cursor : '';
      },
      [x, y] as const,
    );
  }

  test('a link in a cell shows a pointer and opens on click, not on a drag', async ({ page }) => {
    const box = (await page.locator(`#${TEST_CONTAINER_ID}`).boundingBox())!;
    // The link's cell: the last column (x ≈ 525–625) of the first body row of the 640×400
    // example. Find the text by its cursor rather than by exact positions, over a band tall enough
    // that margin changes in the default look don't move it out of the search.
    let link: { x: number; y: number } | undefined;
    for (let y = 40; y <= 140 && !link; y += 3) {
      for (let x = 530; x <= 600 && !link; x += 5) {
        if ((await cursorAt(page, box.x + x, box.y + y)) === 'pointer') {
          link = { x: box.x + x, y: box.y + y };
        }
      }
    }
    expect(link, 'no pointer cursor over the link').toBeDefined();
    const at = link!;
    // Plain text in the same row is not a link.
    expect(await cursorAt(page, box.x + 300, at.y)).not.toBe('pointer');

    // A drag that starts on the link opens nothing.
    await dragBetween(page, at, { x: at.x, y: at.y + 40 });
    await page.waitForTimeout(100);
    expect(await opened(page)).toEqual([]);

    await page.mouse.click(at.x, at.y);
    await expect
      .poll(() => opened(page))
      .toEqual([['https://en.wikipedia.org/wiki/Water', '_blank', 'noopener']]);
  });
});
