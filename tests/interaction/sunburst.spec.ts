import { expect, test, type Page } from '@playwright/test';
import pngjs from 'pngjs';
import { events, openInteraction, waitForEvent } from './helpers.ts';
import { clickUntilEvent } from './hierarchy.ts';

const { PNG } = pngjs;

/**
 * Sunburst drill-down on `_dev/interaction-sunburst` (plan E13.2, E20.4): hover labels and
 * events per sector, clicks that drill into a sector (a GUI restyle of `level`, animated) or back
 * up from the center, `sunburstclick` / `click` listeners that cancel, and the transition
 * settling on the new layout (snapping under reduced motion).
 *
 * The example: Plotly's Eve tree over the whole 600×360 px plot area (radius 180 px around
 * container (320, 200)), sorted by value: Seth 24, Cain 14, Awan 10, Abel 6, Azura 4 of Eve's
 * 68, counterclockwise from 3 o'clock; the root is a 60 px disc and each level a 60 px ring.
 * First-level colors are explicit, descendants inherit them and leaves are opaque.
 */
const EXAMPLE = '_dev/interaction-sunburst';

type RGB = readonly [number, number, number];
const WHITE: RGB = [0xff, 0xff, 0xff];
const SETH: RGB = [0x5e, 0x74, 0xd5];
const CAIN: RGB = [0xea, 0x2a, 0x37];

/**
 * Degrees counterclockwise from 3 o'clock inside each first-level sector, clear of its label
 * (labels sit on the bisector): Seth spans 0°–127°, Cain 127°–201°.
 */
const MID = { Seth: 40, Cain: 185 } as const;
/** Radius inside the first ring (60–120 px), clear of the labels at its middle. */
const RING = 72;
/** A point in the middle disc, clear of the root's label at the center. */
const DISC = [90, 40] as const;

interface Pt {
  x: number;
  y: number;
}

/** Page point at `angle` degrees counterclockwise from 3 o'clock, `r` px from the center. */
async function at(page: Page, angle: number, r: number): Promise<Pt> {
  const box = await page.evaluate(() => {
    const hook = (
      window as unknown as {
        __interaction: { chart: { three: { root: { canvas: HTMLCanvasElement } } } };
      }
    ).__interaction;
    const b = hook.chart.three.root.canvas.getBoundingClientRect();
    return { left: b.left, top: b.top };
  });
  const a = (angle * Math.PI) / 180;
  return { x: box.left + 320 + r * Math.cos(a), y: box.top + 200 - r * Math.sin(a) };
}

async function pixel(page: Page, p: Pt): Promise<RGB> {
  const png = PNG.sync.read(
    await page.screenshot({
      clip: { x: Math.round(p.x), y: Math.round(p.y), width: 1, height: 1 },
    }),
  );
  return [png.data[0] ?? -1, png.data[1] ?? -1, png.data[2] ?? -1];
}

const near = (a: RGB, b: RGB): boolean => a.every((c, k) => Math.abs(c - (b[k] ?? 0)) <= 10);

/** Wait until the pixel at `p` shows `rgb`. */
async function expectColor(page: Page, p: Pt, rgb: RGB): Promise<void> {
  await expect.poll(async () => near(await pixel(page, p), rgb), { timeout: 10_000 }).toBe(true);
}

/** Wait until the pixel at `p` no longer shows `rgb`. */
async function expectOtherColor(page: Page, p: Pt, rgb: RGB): Promise<void> {
  await expect.poll(async () => near(await pixel(page, p), rgb), { timeout: 10_000 }).toBe(false);
}

async function level(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    const hook = (
      window as unknown as { __interaction: { chart: { data: Record<string, unknown>[] } } }
    ).__interaction;
    return hook.chart.data[0]?.['level'] ?? null;
  });
}

/**
 * From now on, record the largest number of arc instances the trace drew in any frame, read back
 * with {@link maxArcs}. A transition draws the leaving sectors too, so it peaks above the final
 * count; a snap never does, however fast or slow frames come.
 */
async function trackArcs(page: Page): Promise<void> {
  await page.evaluate(() => {
    interface Obj {
      geometry?: { instanceCount?: number; attributes?: Record<string, unknown> };
    }
    const w = window as unknown as {
      __maxArcs: number;
      __interaction: {
        chart: { on(name: string, fn: () => void): void; getTraceObjects(i: number): Obj[] };
      };
    };
    w.__maxArcs = 0;
    const { chart } = w.__interaction;
    chart.on('afterrender', () => {
      for (const o of chart.getTraceObjects(0)) {
        // The arc primitive's mesh (its instanced shape attribute), not the text batch.
        if (!o.geometry?.attributes?.['iShape']) continue;
        const n = o.geometry.instanceCount;
        if (typeof n === 'number' && n !== Infinity) w.__maxArcs = Math.max(w.__maxArcs, n);
      }
    });
  });
}

async function maxArcs(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __maxArcs: number }).__maxArcs);
}

const visibleLabel = (page: Page) =>
  page.locator('.holochart-hoverlabel').filter({ visible: true });

test.beforeEach(async ({ page }) => {
  await openInteraction(page, EXAMPLE);
  // The geometry the tests assume: the white root in the middle, Seth and Cain on the first ring.
  await expectColor(page, await at(page, ...DISC), WHITE);
  await expectColor(page, await at(page, MID.Seth, RING), SETH);
  await expectColor(page, await at(page, MID.Cain, RING), CAIN);
});

test('hovering a sector shows its label and emits hover with Plotly fields', async ({ page }) => {
  await events(page, true);
  const p = await at(page, MID.Seth, RING);
  await page.mouse.move(p.x, p.y);
  const hover = await waitForEvent(page, 'hover');
  expect(hover.payload.points?.[0]).toMatchObject({
    curveNumber: 0,
    pointNumber: 2,
    label: 'Seth',
    value: 12,
    parent: 'Eve',
    currentPath: 'Eve/',
    entry: 'Eve',
    root: 'Eve',
  });
  const label = visibleLabel(page);
  await expect(label).toHaveCount(1);
  await expect(label).toContainText('Seth');
  await expect(label).toContainText('35% of Eve');
});

test('clicking a sector drills into it with a transition; the center goes back up', async ({
  page,
}) => {
  await events(page, true);
  await trackArcs(page);
  const seth = await at(page, MID.Seth, RING);
  await page.mouse.click(seth.x, seth.y);
  const drill = await waitForEvent(page, 'sunburstclick');
  expect(drill.payload).toMatchObject({ nextLevel: 'Seth', points: [{ label: 'Seth' }] });
  await waitForEvent(page, 'click');
  const restyle = await waitForEvent(page, 'restyle');
  expect(restyle.payload).toMatchObject({ update: { level: ['Seth'] }, traces: [0] });
  expect(await level(page)).toBe('Seth');
  const names = (await events(page))
    .map((e) => e.name)
    .filter((n) => n !== 'hover' && n !== 'unhover');
  expect(names.slice(0, 3)).toEqual(['sunburstclick', 'click', 'restyle']);

  // Settles on Seth's subtree: Seth is the disc (90 px), Enos (10 of 24) and Noam fill half the
  // ring around it, the other half stays empty (Seth's own value).
  await expectColor(page, await at(page, ...DISC), SETH);
  await expectColor(page, await at(page, 30, 165), SETH);
  await expectOtherColor(page, await at(page, 270, 135), SETH);
  // The zoom animated: the six leaving sectors were drawn with Seth's three (wedge + rim each).
  expect(await maxArcs(page)).toBe(18);

  // Clicks during the transition do nothing: retry until one lands after it.
  await events(page, true);
  const center = await at(page, 0, 0);
  await clickUntilEvent(page, { x: center.x + 10, y: center.y + 10 }, 'sunburstclick');
  const up = await waitForEvent(page, 'sunburstclick');
  expect(up.payload).toMatchObject({ nextLevel: 'Eve', points: [{ label: 'Seth' }] });
  await expect.poll(() => level(page)).toBe('Eve');
  await expectColor(page, await at(page, ...DISC), WHITE);
  await expectColor(page, await at(page, MID.Cain, RING), CAIN);
});

test('leaves and the root emit clicks without drilling', async ({ page }) => {
  await events(page, true);
  const cain = await at(page, MID.Cain, RING);
  await page.mouse.click(cain.x, cain.y);
  const leaf = await waitForEvent(page, 'sunburstclick');
  expect(leaf.payload['nextLevel']).toBeUndefined();
  await waitForEvent(page, 'click');
  const center = await at(page, 0, 0);
  await page.mouse.click(center.x, center.y);
  await expect
    .poll(async () => (await events(page)).filter((e) => e.name === 'sunburstclick').length)
    .toBe(2);
  expect((await events(page)).some((e) => e.name === 'restyle')).toBe(false);
  expect(await level(page)).toBeNull();
});

test('a sunburstclick or click listener returning false cancels the drill', async ({ page }) => {
  await page.evaluate(() => {
    const hook = (
      window as unknown as {
        __interaction: { chart: { on(name: string, fn: () => unknown): () => void } };
      }
    ).__interaction;
    (window as unknown as { __off: () => void }).__off = hook.chart.on(
      'sunburstclick',
      () => false,
    );
  });
  await events(page, true);
  const seth = await at(page, MID.Seth, RING);
  await page.mouse.click(seth.x, seth.y);
  await waitForEvent(page, 'sunburstclick');
  // Plotly: a cancelled sunburstclick also skips the click event.
  await page.waitForTimeout(300);
  const names = (await events(page)).map((e) => e.name);
  expect(names).not.toContain('click');
  expect(names).not.toContain('restyle');
  expect(await level(page)).toBeNull();

  // A click listener returning false cancels too (the click itself is emitted).
  await page.evaluate(() => {
    const w = window as unknown as {
      __off: () => void;
      __interaction: { chart: { on(name: string, fn: () => unknown): () => void } };
    };
    w.__off();
    w.__interaction.chart.on('click', () => false);
  });
  await events(page, true);
  await page.mouse.click(seth.x, seth.y);
  await waitForEvent(page, 'click');
  await page.waitForTimeout(300);
  expect((await events(page)).some((e) => e.name === 'restyle')).toBe(false);
  await expectColor(page, await at(page, ...DISC), WHITE);
});

test('under reduced motion the drill snaps', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await trackArcs(page);
  const seth = await at(page, MID.Seth, RING);
  await page.mouse.click(seth.x, seth.y);
  await expect.poll(() => level(page)).toBe('Seth');
  await expectColor(page, await at(page, ...DISC), SETH);
  // Seth's three sectors only: nothing was drawn leaving.
  expect(await maxArcs(page)).toBe(6);
});
