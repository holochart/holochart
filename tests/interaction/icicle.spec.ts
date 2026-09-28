import { expect, test, type Page } from '@playwright/test';
import { events, openInteraction, waitForEvent } from './helpers.ts';
import { at, cancelOn, expectColor, level, maxRects, trackRects, type RGB } from './hierarchy.ts';

/**
 * Icicle drill-down on `_dev/interaction-icicle` (plan E13.4, E20.4): hover labels and events per
 * cell, clicks that drill into a cell (animated), back up from the entry or the path bar, and an
 * `icicleclick` listener that cancels.
 *
 * The example (container px): three 200 px columns from x 20 — Eve (the white root), then Seth
 * (y 20–200), Cain (200–290), Awan (290–344) and Abel (344–380), then Enos (y 20–140). Drilled into
 * Seth, it takes the left half (x 20–320) and its children the right half; the path bar's Eve
 * segment is at y 0–18.
 */
const EXAMPLE = '_dev/interaction-icicle';

const WHITE: RGB = [0xff, 0xff, 0xff];
const SETH: RGB = [0x5e, 0x74, 0xd5];
const CAIN: RGB = [0xea, 0x2a, 0x37];

const P = {
  eve: [120, 250],
  seth: [320, 150],
  cain: [320, 260],
  pathbar: [300, 9],
  sethDrilled: [200, 250],
} as const;

const pt = (page: Page, [x, y]: readonly [number, number]) => at(page, x, y);

test.beforeEach(async ({ page }) => {
  await openInteraction(page, EXAMPLE);
  await expectColor(page, await pt(page, P.eve), WHITE);
  await expectColor(page, await pt(page, P.seth), SETH);
  await expectColor(page, await pt(page, P.cain), CAIN);
});

test('hovering a cell emits hover with Plotly fields', async ({ page }) => {
  await events(page, true);
  const p = await pt(page, P.cain);
  await page.mouse.move(p.x, p.y);
  const hover = await waitForEvent(page, 'hover');
  expect(hover.payload.points?.[0]).toMatchObject({
    pointNumber: 2,
    label: 'Cain',
    value: 15,
    parent: 'Eve',
    entry: 'Eve',
  });
  const label = page.locator('.holochart-hoverlabel').filter({ visible: true });
  await expect(label).toContainText('25% of Eve');
});

test('clicking a cell drills in with a transition; the path bar and the entry go up', async ({
  page,
}) => {
  await events(page, true);
  await trackRects(page);
  const seth = await pt(page, P.seth);
  await page.mouse.click(seth.x, seth.y);
  const drill = await waitForEvent(page, 'icicleclick');
  expect(drill.payload).toMatchObject({ nextLevel: 'Seth', points: [{ label: 'Seth' }] });
  await expect.poll(() => level(page)).toBe('Seth');
  await expectColor(page, await pt(page, P.sethDrilled), SETH);
  await expectColor(page, await pt(page, P.pathbar), WHITE);
  expect(await maxRects(page)).toBe(8);

  // Clicks during a transition don't drill: let it end.
  await page.waitForTimeout(900);
  await events(page, true);
  const bar = await pt(page, P.pathbar);
  await page.mouse.click(bar.x, bar.y);
  const up = await waitForEvent(page, 'icicleclick');
  expect(up.payload).toMatchObject({ nextLevel: 'Eve', points: [{ label: 'Eve' }] });
  await expect.poll(() => level(page)).toBe('Eve');
  await expectColor(page, await pt(page, P.cain), CAIN);
  await page.waitForTimeout(900);

  // Back in, then up again from the entry itself.
  await page.mouse.click(seth.x, seth.y);
  await expect.poll(() => level(page)).toBe('Seth');
  await expectColor(page, await pt(page, P.sethDrilled), SETH);
  await page.waitForTimeout(900);
  const entry = await pt(page, P.sethDrilled);
  await page.mouse.click(entry.x, entry.y);
  await expect.poll(() => level(page)).toBe('Eve');
});

test('an icicleclick listener returning false cancels the drill', async ({ page }) => {
  await cancelOn(page, 'icicleclick');
  await events(page, true);
  const seth = await pt(page, P.seth);
  await page.mouse.click(seth.x, seth.y);
  await waitForEvent(page, 'icicleclick');
  await page.waitForTimeout(300);
  const names = (await events(page)).map((e) => e.name);
  expect(names).not.toContain('click');
  expect(names).not.toContain('restyle');
  expect(await level(page)).toBeNull();
});
