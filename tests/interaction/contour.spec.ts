import { expect, test } from '@playwright/test';
import { events, openInteraction, toPage, waitForEvent } from './helpers.ts';

/**
 * Contour hover on `contour/interaction` (plan E11.2, E20.4): a 5 × 4 grid at x = 0, 1, 2, 4, 8
 * and y = 0…3 with `z = 10·row + column`, and a gap at column 2 of row 1 (`connectgaps: false`).
 * Hover snaps to the nearest grid point, splitting cells halfway between points (Plotly's contour
 * hover), and reports `[row, column]` as the point number.
 */
const EXAMPLE = 'contour/interaction';

test.beforeEach(async ({ page }) => {
  await openInteraction(page, EXAMPLE);
});

test('hover snaps to the nearest grid point and shows its x, y and z', async ({ page }) => {
  await events(page, true);
  // Between x = 4 and x = 8 the cells split at 6: 5.6 belongs to x = 4.
  const at = await toPage(page, 5.6, 2.3);
  await page.mouse.move(at.x, at.y);
  const label = page.locator('.holochart-hoverlabel').filter({ visible: true });
  await expect(label).toHaveCount(1);
  await expect(label.first()).toContainText('x: 4');
  await expect(label.first()).toContainText('y: 2');
  await expect(label.first()).toContainText('z: 23');
  const hover = await waitForEvent(page, 'hover');
  const point = hover.payload.points?.[0] as Record<string, unknown> | undefined;
  expect(point).toMatchObject({ curveNumber: 0, pointNumber: [2, 3], x: 4, y: 2, z: 23 });
});

test('crossing the midpoint between grid points moves the hover', async ({ page }) => {
  await events(page, true);
  const right = await toPage(page, 6.4, 0.2);
  await page.mouse.move(right.x, right.y);
  const label = page.locator('.holochart-hoverlabel').filter({ visible: true });
  await expect(label.first()).toContainText('z: 4');
  const hover = await waitForEvent(page, 'hover');
  expect(hover.payload.points?.[0]).toMatchObject({ pointNumber: [0, 4], x: 8, y: 0 });
});

test('a gap drawn as a hole hovers with an empty z', async ({ page }) => {
  await events(page, true);
  const at = await toPage(page, 2.1, 1.1);
  await page.mouse.move(at.x, at.y);
  const label = page.locator('.holochart-hoverlabel').filter({ visible: true });
  await expect(label).toHaveCount(1);
  await expect(label.first()).toContainText('x: 2');
  await expect(label.first()).toContainText('y: 1');
  await expect(label.first()).not.toContainText('z: 12');
  const hover = await waitForEvent(page, 'hover');
  const point = hover.payload.points?.[0] as Record<string, unknown> | undefined;
  expect(point).toMatchObject({ pointNumber: [1, 2], x: 2, y: 1 });
  expect(point?.['z']).toBeUndefined();
});
