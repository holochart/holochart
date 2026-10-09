import { expect, test, type Page } from '@playwright/test';

/**
 * Charts created in the same tick share the text engine's glyph atlas, `_dev/interaction-text-atlas`.
 * A chart whose labels use glyphs another chart asked for a moment earlier is told its text is
 * typeset before those glyphs are in the atlas texture; it draws gaps, and has to be redrawn when
 * they arrive (packages/render/src/primitives/text-atlas.ts). Before that redraw existed the gaps
 * stayed until something else redrew the chart: "Hourly precipitation (in)" read
 * "ourl pre ipitation in".
 *
 * The check needs no reference image: once the page is quiet, what each chart shows must already
 * be what it draws when asked to draw again. A chart left with a stale atlas fails that, because
 * the forced draw uploads the current atlas and the missing glyphs appear.
 */
const EXAMPLE = '_dev/interaction-text-atlas';
const COUNT = 6;

interface Hook {
  charts: { three: { root: { shared: boolean; renderNow(): void } } }[];
  settled(quietMs?: number): Promise<void>;
}

declare global {
  interface Window {
    __textAtlas?: Hook;
  }
}

async function open(page: Page): Promise<void> {
  await page.goto(`/?example=${EXAMPLE}&size=meta`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__textAtlas !== undefined, undefined, {
    timeout: 30_000,
  });
  await page.evaluate(() => window.__textAtlas!.settled());
}

/** What each chart shows on the page right now. */
function shown(page: Page): Promise<Buffer[]> {
  return Promise.all(
    Array.from({ length: COUNT }, (_, i) => page.locator(`[data-chart="${i}"]`).screenshot()),
  );
}

test('charts created together show every glyph without another redraw', async ({ page }) => {
  await open(page);
  // Both kinds of render root are in play: four with a context of their own, two on the shared one.
  expect(
    await page.evaluate(() => window.__textAtlas!.charts.map((c) => c.three.root.shared)),
  ).toEqual([false, false, false, false, true, true]);

  const before = await shown(page);
  await page.evaluate(async () => {
    for (const chart of window.__textAtlas!.charts) chart.three.root.renderNow();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
  const after = await shown(page);

  const changed = before.flatMap((image, i) => (image.equals(after[i] as Buffer) ? [] : [i]));
  expect(changed, 'charts whose text changed when drawn again').toEqual([]);
});
