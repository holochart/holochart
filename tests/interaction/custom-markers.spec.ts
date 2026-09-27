import { expect, test } from '@playwright/test';
import pngjs from 'pngjs';
import { events, openInteraction, toPage, waitForEvent } from './helpers.ts';

/**
 * Hover on custom marker symbols and image sprites (plan E8.11) on
 * `_dev/interaction-custom-markers`: trace 0 draws a registered SVG-path symbol at (v, 10·v),
 * trace 1 an image sprite at (v, 10·v + 30), x in [-1, 10], y in [-10, 130].
 */
const EXAMPLE = '_dev/interaction-custom-markers';

test.beforeEach(async ({ page }) => {
  await openInteraction(page, EXAMPLE);
});

test('the custom symbols and image sprites are drawn once the chart is ready', async ({ page }) => {
  const png = pngjs.PNG.sync.read(await page.screenshot());
  // Count the red symbol pixels and the green image pixels.
  let red = 0;
  let green = 0;
  const { data } = png;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i]! > 180 && data[i + 1]! < 80) red++;
    if (data[i + 1]! > 100 && data[i]! < 60) green++;
  }
  const drawn = { red, green };
  expect(drawn.red).toBeGreaterThan(500);
  expect(drawn.green).toBeGreaterThan(500);
});

test('hovering a custom symbol shows its hover label', async ({ page }) => {
  const p = await toPage(page, 4, 40);
  await page.mouse.move(p.x + 1, p.y);
  const hover = await waitForEvent(page, 'hover');
  expect(hover.payload.points).toEqual([{ curveNumber: 0, pointNumber: 4, x: 4, y: 40 }]);
  const label = page.locator('.holochart-hoverlabel').filter({ visible: true });
  await expect(label).toContainText('tri 4');
  await expect(label.locator('.holochart-hoverlabel-name')).toHaveText('symbols');
});

test('hovering an image sprite shows its hover label, and leaving it unhovers', async ({
  page,
}) => {
  const p = await toPage(page, 6, 90);
  await page.mouse.move(p.x, p.y + 1);
  const hover = await waitForEvent(page, 'hover');
  expect(hover.payload.points).toEqual([{ curveNumber: 1, pointNumber: 6, x: 6, y: 90 }]);
  await expect(page.locator('.holochart-hoverlabel').filter({ visible: true })).toContainText(
    'img 6',
  );
  await events(page, true);
  const empty = await toPage(page, 1, 120);
  await page.mouse.move(empty.x, empty.y);
  await waitForEvent(page, 'unhover');
  await expect(page.locator('.holochart-hoverlabel').filter({ visible: true })).toHaveCount(0);
});

test('image export waits for a marker image requested just before', async ({ page }) => {
  // A sprite no chart has drawn yet: the export's offscreen chart must wait for it to decode.
  const url = await page.evaluate(async () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#2040ff"/></svg>';
    const image = `data:image/svg+xml,${encodeURIComponent(svg)}`;
    const chart = (
      window as unknown as {
        __interaction: {
          chart: {
            restyle(update: object, traces: number[]): Promise<unknown>;
            toImage(o: object): Promise<string>;
          };
        };
      }
    ).__interaction.chart;
    void chart.restyle({ 'marker.image': image }, [1]);
    return chart.toImage({ format: 'png' });
  });
  const png = pngjs.PNG.sync.read(Buffer.from(url.split(',')[1]!, 'base64'));
  let blue = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    if (png.data[i + 2]! > 200 && png.data[i]! < 80 && png.data[i + 1]! < 100) blue++;
  }
  // Ten 18 px squares.
  expect(blue).toBeGreaterThan(1000);
});
