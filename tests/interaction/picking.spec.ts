import { expect, test, type Page } from '@playwright/test';

/**
 * E2.17: GPU picks in `_dev/picking-3d` must keep up with a moving pointer. Under SwiftShader a
 * pick takes a large fraction of a second, so a sweep always has picks pending; the old queue
 * dropped every finished pick while a newer one waited and the readout froze until the pointer
 * stopped. Now each finished pick is shown and the last position always resolves.
 */
const BOOT_TIMEOUT_MS = 30_000;

async function openPicking(page: Page): Promise<void> {
  await page.goto('/?example=_dev/picking-3d&test=1', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__exampleReady !== undefined, undefined, {
    timeout: BOOT_TIMEOUT_MS,
  });
  await page.evaluate(() => window.__exampleReady);
}

/** The readout text once no pick is pending (the example flags `data-pick-pending`). */
async function settledReadout(page: Page): Promise<string> {
  await expect(page.locator('#example-root[data-pick-pending="false"]')).toHaveCount(1, {
    timeout: 60_000,
  });
  const readout = page.locator('.pick-readout');
  return (await readout.isVisible()) ? ((await readout.textContent()) ?? '') : '';
}

test('the pick readout keeps updating during a sweep and ends on a fresh pick', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await openPicking(page);
  const box = await page.locator('#example-root canvas').boundingBox();
  if (!box) throw new Error('no canvas');
  // Count readout changes while the pointer is still moving.
  await page.evaluate(() => {
    const el = document.querySelector('.pick-readout');
    const w = window as unknown as { __readouts: string[] };
    w.__readouts = [];
    if (!el) return;
    new MutationObserver(() => w.__readouts.push(el.textContent ?? '')).observe(el, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  });
  // Keep moving until the readout has changed twice while the pointer moves (each pick takes
  // seconds under SwiftShader, more on a loaded machine). The old queue never updated it before
  // the pointer stopped, so it would run into the time limit instead.
  const cy = box.y + box.height * 0.55;
  const start = Date.now();
  const changes = (): Promise<number> =>
    page.evaluate(() => new Set((window as unknown as { __readouts: string[] }).__readouts).size);
  let i = 0;
  while (Date.now() - start < 60_000 && (i % 20 !== 0 || (await changes()) < 2)) {
    const f = (i++ % 80) / 80;
    await page.mouse.move(box.x + box.width * (0.3 + 0.4 * f), cy);
    await page.waitForTimeout(60);
  }
  const lastX = box.x + box.width * (0.3 + 0.4 * (((i - 1) % 80) / 80));
  expect(await changes()).toBeGreaterThanOrEqual(2);

  const final = await settledReadout(page);
  expect(final).not.toBe('');
  // A fresh pick at the same spot (leave, come straight back) agrees with where the sweep ended.
  const end = { x: lastX, y: cy };
  await page.mouse.move(box.x - 20, box.y - 20);
  await expect(page.locator('.pick-readout')).toBeHidden();
  await page.mouse.move(end.x, end.y);
  expect(await settledReadout(page)).toBe(final);
});
