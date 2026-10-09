import { expect, test } from '@playwright/test';
import {
  callChart,
  dragBetween,
  events,
  openInteraction,
  ranges,
  toPage,
  waitForEvent,
} from './helpers.ts';

/**
 * Pointer scenarios on `_dev/interaction-graph` (backlog G1): six nodes at whole-number positions
 * (A, B, C on y = 0 at x = 0, 2, 4; D, E, F on y = 2 at x = 1, 3, 4) and four directed links
 * (A → B, B → C, D → E, A → D), x in [-1, 5], y in [-1, 3].
 */
const EXAMPLE = '_dev/interaction-graph';

/** A logged event point with the graph's own fields. */
interface GraphPoint {
  curveNumber: number;
  pointNumber: number;
  kind?: string;
  label?: string;
  degree?: number;
  source?: string;
  target?: string;
  value?: number;
}

const pointsOf = (event: { payload: { points?: unknown } }): GraphPoint[] =>
  (event.payload.points ?? []) as GraphPoint[];

test.beforeEach(async ({ page }) => {
  await openInteraction(page, EXAMPLE);
});

test('hovering a node names it and its links', async ({ page }) => {
  const p = await toPage(page, 2, 0);
  await page.mouse.move(p.x + 2, p.y - 2);
  const hover = await waitForEvent(page, 'hover');
  expect(pointsOf(hover)).toEqual([
    { curveNumber: 0, pointNumber: 1, kind: 'node', label: 'B', degree: 2 },
  ]);
  const label = page.locator('.holochart-hoverlabel').filter({ visible: true });
  await expect(label).toHaveCount(1);
  await expect(label).toContainText('B');
  await expect(label).toContainText('Links in: 1, out: 1');

  // Off every node and link: unhover, label gone.
  const empty = await toPage(page, 2, 1);
  await page.mouse.move(empty.x, empty.y);
  await waitForEvent(page, 'unhover');
  await expect(page.locator('.holochart-hoverlabel').filter({ visible: true })).toHaveCount(0);
});

test('hovering a link names its two ends and its value', async ({ page }) => {
  // The middle of D → E, a pixel off the line.
  const p = await toPage(page, 2, 2);
  await page.mouse.move(p.x, p.y + 1);
  const hover = await waitForEvent(page, 'hover');
  expect(pointsOf(hover)).toEqual([
    { curveNumber: 0, pointNumber: 2, kind: 'link', label: '', source: 'D', target: 'E', value: 3 },
  ]);
  const label = page.locator('.holochart-hoverlabel').filter({ visible: true });
  await expect(label).toContainText('D → E');
  await expect(label).toContainText('Value: 3');
});

test('a node wins over the link that ends in it', async ({ page }) => {
  // Just inside the edge of B, on the line from A.
  const p = await toPage(page, 2, 0);
  await page.mouse.move(p.x - 7, p.y);
  const hover = await waitForEvent(page, 'hover');
  expect(pointsOf(hover)[0]).toMatchObject({ kind: 'node', label: 'B' });
});

test('box zoom keeps nodes and links hoverable where they are drawn', async ({ page }) => {
  await events(page, true);
  await dragBetween(page, await toPage(page, 0.5, 2.6), await toPage(page, 3.5, 1.4));
  await waitForEvent(page, 'relayout');
  const r = await ranges(page);
  expect(r.x[0]).toBeCloseTo(0.5, 1);
  expect(r.x[1]).toBeCloseTo(3.5, 1);
  expect(r.y[0]).toBeCloseTo(1.4, 1);
  expect(r.y[1]).toBeCloseTo(2.6, 1);

  await events(page, true);
  const node = await toPage(page, 3, 2);
  await page.mouse.move(node.x + 1, node.y + 1);
  expect(pointsOf(await waitForEvent(page, 'hover'))[0]).toMatchObject({
    kind: 'node',
    label: 'E',
  });
  // The link is still under the pointer half way between its nodes, at the new scale.
  await events(page, true);
  const link = await toPage(page, 2, 2);
  await page.mouse.move(link.x, link.y);
  await expect
    .poll(async () => pointsOf(await waitForEvent(page, 'hover'))[0]?.kind, { timeout: 10_000 })
    .toBe('link');
});

test('box select selects the nodes inside the box', async ({ page }) => {
  await callChart(page, 'setDragmode', 'select');
  await events(page, true);
  await dragBetween(page, await toPage(page, -0.5, 0.5), await toPage(page, 2.5, -0.5));
  const selected = await waitForEvent(page, 'selected');
  const points = pointsOf(selected).sort((a, b) => a.pointNumber - b.pointNumber);
  expect(points.map((p) => p.pointNumber)).toEqual([0, 1]);
  expect(points.map((p) => p.label)).toEqual(['A', 'B']);
  expect(points.every((p) => p.kind === 'node')).toBe(true);
});
