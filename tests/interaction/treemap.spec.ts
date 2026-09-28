import { expect, test, type Page } from '@playwright/test';
import { events, openInteraction, waitForEvent } from './helpers.ts';
import {
  at,
  cancelOn,
  expectColor,
  level,
  maxRects,
  pixel,
  trackRects,
  type RGB,
} from './hierarchy.ts';

/**
 * Treemap drill-down on `_dev/interaction-treemap` (plan E13.3, E20.4): hover labels, outlines and
 * events per tile, clicks that drill into a tile (a GUI restyle of `level`, animated), back up from
 * the entry's header or the path bar, `treemapclick` / `click` listeners that cancel, and the
 * transition settling on the new layout (snapping under reduced motion).
 *
 * The example (container px): Eve's header band at y 20–40 over the whole 600 px width; below it
 * Seth (x 20–320), Cain (320–470), Awan (470–560) and Abel (560–620) down to y 380, each with a
 * 20 px header; Seth holds Enos (x 20–220) and Noam (220–320) from y 60. Once drilled into Seth,
 * Enos spans x 20–420 and Noam 420–620 below Seth's header (y 20–40), and the path bar's Eve
 * segment is at y 0–18.
 */
const EXAMPLE = '_dev/interaction-treemap';

const WHITE: RGB = [0xff, 0xff, 0xff];
const SETH: RGB = [0x5e, 0x74, 0xd5];
const CAIN: RGB = [0xea, 0x2a, 0x37];

const P = {
  eveHeader: [200, 30],
  sethHeader: [240, 50],
  enos: [120, 250],
  cain: [395, 250],
  cainTop: [395, 40],
  pathbar: [300, 9],
  noamDrilled: [520, 250],
} as const;

const pt = (page: Page, [x, y]: readonly [number, number]) => at(page, x, y);

test.beforeEach(async ({ page }) => {
  await openInteraction(page, EXAMPLE);
  await expectColor(page, await pt(page, P.eveHeader), WHITE);
  await expectColor(page, await pt(page, P.enos), SETH);
  await expectColor(page, await pt(page, P.cain), CAIN);
});

test('hovering a tile outlines it and emits hover with Plotly fields', async ({ page }) => {
  await events(page, true);
  const before = await pixel(page, await pt(page, P.cainTop));
  const p = await pt(page, P.cain);
  await page.mouse.move(p.x, p.y);
  const hover = await waitForEvent(page, 'hover');
  expect(hover.payload.points?.[0]).toMatchObject({
    curveNumber: 0,
    pointNumber: 2,
    label: 'Cain',
    value: 15,
    parent: 'Eve',
    currentPath: 'Eve/',
    entry: 'Eve',
    root: 'Eve',
  });
  const label = page.locator('.holochart-hoverlabel').filter({ visible: true });
  await expect(label).toHaveCount(1);
  await expect(label).toContainText('Cain');
  await expect(label).toContainText('25% of Eve');
  // Plotly's hovered outline: 2 px contrasting the (dark) paper, over Cain's top edge.
  await expectColor(page, await pt(page, P.cainTop), WHITE);
  expect(before).not.toEqual(WHITE);
});

test('clicking a tile drills into it with a transition; the path bar goes back up', async ({
  page,
}) => {
  await events(page, true);
  await trackRects(page);
  const seth = await pt(page, P.sethHeader);
  await page.mouse.click(seth.x, seth.y);
  const drill = await waitForEvent(page, 'treemapclick');
  expect(drill.payload).toMatchObject({ nextLevel: 'Seth', points: [{ label: 'Seth' }] });
  await waitForEvent(page, 'click');
  const restyle = await waitForEvent(page, 'restyle');
  expect(restyle.payload).toMatchObject({ update: { level: ['Seth'] }, traces: [0] });
  expect(await level(page)).toBe('Seth');
  const names = (await events(page))
    .map((e) => e.name)
    .filter((n) => n !== 'hover' && n !== 'unhover');
  expect(names.slice(0, 3)).toEqual(['treemapclick', 'click', 'restyle']);

  // Settles on Seth's subtree, with Eve on the path bar.
  await expectColor(page, await pt(page, P.noamDrilled), SETH);
  await expectColor(page, await pt(page, P.pathbar), WHITE);
  // The zoom animated: the five leaving tiles were drawn with Seth's three.
  expect(await maxRects(page)).toBe(8);

  // Clicks during a transition don't drill: let it end.
  await page.waitForTimeout(900);
  await events(page, true);
  const bar = await pt(page, P.pathbar);
  await page.mouse.click(bar.x, bar.y);
  const up = await waitForEvent(page, 'treemapclick');
  expect(up.payload).toMatchObject({ nextLevel: 'Eve', points: [{ label: 'Eve' }] });
  await expect.poll(() => level(page)).toBe('Eve');
  await expectColor(page, await pt(page, P.cain), CAIN);
});

test("clicking the entry's header goes up; leaves drill in too", async ({ page }) => {
  const enos = await pt(page, P.enos);
  await page.mouse.click(enos.x, enos.y);
  const leaf = await waitForEvent(page, 'treemapclick');
  expect(leaf.payload).toMatchObject({ nextLevel: 'Enos', points: [{ label: 'Enos' }] });
  await expect.poll(() => level(page)).toBe('Enos');
  // Enos fills the treemap below its header.
  await expectColor(page, await pt(page, P.cain), SETH);

  // Clicks during a transition don't drill: let it end.
  await page.waitForTimeout(900);
  await events(page, true);
  const header = await pt(page, P.eveHeader);
  await page.mouse.click(header.x, header.y);
  const up = await waitForEvent(page, 'treemapclick');
  expect(up.payload).toMatchObject({ nextLevel: 'Seth', points: [{ label: 'Enos' }] });
  await expect.poll(() => level(page)).toBe('Seth');
});

test('the root emits clicks without drilling', async ({ page }) => {
  await events(page, true);
  const header = await pt(page, P.eveHeader);
  await page.mouse.click(header.x, header.y);
  const root = await waitForEvent(page, 'treemapclick');
  expect(root.payload).toMatchObject({ nextLevel: 'Eve', points: [{ label: 'Eve' }] });
  await waitForEvent(page, 'click');
  await page.waitForTimeout(300);
  expect((await events(page)).some((e) => e.name === 'restyle')).toBe(false);
  expect(await level(page)).toBeNull();
});

test('a treemapclick or click listener returning false cancels the drill', async ({ page }) => {
  await cancelOn(page, 'treemapclick');
  await events(page, true);
  const seth = await pt(page, P.sethHeader);
  await page.mouse.click(seth.x, seth.y);
  await waitForEvent(page, 'treemapclick');
  await page.waitForTimeout(300);
  const names = (await events(page)).map((e) => e.name);
  expect(names).not.toContain('click');
  expect(names).not.toContain('restyle');
  expect(await level(page)).toBeNull();

  await cancelOn(page, 'click');
  await events(page, true);
  await page.mouse.click(seth.x, seth.y);
  await waitForEvent(page, 'click');
  await page.waitForTimeout(300);
  expect((await events(page)).some((e) => e.name === 'restyle')).toBe(false);
  await expectColor(page, await pt(page, P.cain), CAIN);
});

test('under reduced motion the drill snaps', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await trackRects(page);
  const seth = await pt(page, P.sethHeader);
  await page.mouse.click(seth.x, seth.y);
  await expect.poll(() => level(page)).toBe('Seth');
  await expectColor(page, await pt(page, P.noamDrilled), SETH);
  // Seth's three tiles only: nothing was drawn leaving.
  expect(await maxRects(page)).toBe(3);
});
