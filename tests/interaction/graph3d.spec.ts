import { expect, test, type Page } from '@playwright/test';
import pngjs from 'pngjs';
import { events, openInteraction, waitForEvent, type LoggedEvent } from './helpers.ts';
import { press, tabIntoChart } from './keyboard-helpers.ts';

const { PNG } = pngjs;

/**
 * `graph3d` hover, click, orbit and legend on `_dev/interaction-graph3d` (backlog G6): five nodes
 * at whole-number positions in a 3D scene (A (0, 0, 0), B (2, 0, 0), C (2, 2, 0) in group `low`;
 * D (0, 0, 2), E (0, 2, 2) in group `high`) and four directed links (A → B, B → C, A → D, D → E).
 * Nodes and links are found by the scene's GPU picking, which resolves asynchronously: a hover
 * is waited for, not read at once. With `?links=more` there are also B → A, against A → B, and
 * C → C.
 */
const EXAMPLE = '_dev/interaction-graph3d';

/** Label → position on the scene's axes. */
const AT: Readonly<Record<string, readonly [number, number, number]>> = {
  A: [0, 0, 0],
  B: [2, 0, 0],
  C: [2, 2, 0],
  D: [0, 0, 2],
  E: [0, 2, 2],
};

type Point = { x: number; y: number };

interface GraphPoint {
  curveNumber: number;
  pointNumber: number;
  kind?: string;
  label?: string;
  degree?: number;
  group?: string;
  z?: number;
  source?: string;
  target?: string;
  value?: number;
}

const pointsOf = (e: LoggedEvent): GraphPoint[] => (e.payload['points'] ?? []) as GraphPoint[];

/** Page px of a position on the scene's axes for the current camera. */
async function pageAt(page: Page, at: readonly [number, number, number]): Promise<Point> {
  return page.evaluate(([x, y, z]) => {
    const hook = (
      window as unknown as {
        __interaction: {
          chart: { three: { root: { canvas: HTMLCanvasElement } } };
          project(x: number, y: number, z: number): { x: number; y: number };
        };
      }
    ).__interaction;
    const box = hook.chart.three.root.canvas.getBoundingClientRect();
    const p = hook.project(x, y, z);
    return { x: box.left + p.x, y: box.top + p.y };
  }, at);
}

const labels = (page: Page) => page.locator('.holochart-hoverlabel').filter({ visible: true });

/** Move to a place and wait for the hover of the part that is there (picks are asynchronous). */
async function hoverAt(
  page: Page,
  at: Point,
  matches: (p: GraphPoint) => boolean,
): Promise<GraphPoint> {
  await page.mouse.move(at.x - 3, at.y - 3);
  await page.mouse.move(at.x, at.y, { steps: 2 });
  const found = async (): Promise<GraphPoint | undefined> =>
    (await events(page))
      .filter((e) => e.name === 'hover')
      .map((e) => pointsOf(e)[0]!)
      .findLast(matches);
  await expect.poll(async () => (await found()) !== undefined, { timeout: 15_000 }).toBe(true);
  return (await found())!;
}

const node = (label: string) => (p: GraphPoint) => p.kind === 'node' && p.label === label;

test('sprites and tubes are picked like spheres and lines', async ({ page }) => {
  await openInteraction(page, EXAMPLE, { parts: 'mesh' });
  const point = await hoverAt(page, await pageAt(page, AT['B']!), node('B'));
  expect(point).toMatchObject({ pointNumber: 1, kind: 'node', label: 'B', degree: 2 });
  await events(page, true);
  // On the tube from A to D, nearer A than the arrowhead at D.
  const [a, d] = [AT['A']!, AT['D']!];
  const at = await pageAt(page, [
    a[0] + (d[0] - a[0]) * 0.4,
    a[1] + (d[1] - a[1]) * 0.4,
    a[2] + (d[2] - a[2]) * 0.4,
  ]);
  const link = await hoverAt(page, at, (p) => p.kind === 'link');
  expect(link).toMatchObject({ pointNumber: 2, kind: 'link', source: 'A', target: 'D', value: 2 });
  await expect(labels(page).first()).toContainText('A → D');
});

/** The mean color of the 5 × 5 px around a place on the page. */
async function colorAt(page: Page, at: Point): Promise<[number, number, number]> {
  const shot = PNG.sync.read(
    await page.screenshot({ clip: { x: at.x - 2, y: at.y - 2, width: 5, height: 5 } }),
  );
  const sum = [0, 0, 0];
  for (let i = 0; i < shot.data.length; i += 4) {
    for (let c = 0; c < 3; c++) sum[c]! += shot.data[i + c]!;
  }
  const count = shot.data.length / 4;
  return [sum[0]! / count, sum[1]! / count, sum[2]! / count];
}

const apart = (a: readonly number[], b: readonly number[]): number =>
  Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

test('opposite links bow apart and a self-link is a ring: each is hovered where it is drawn', async ({
  page,
}) => {
  await openInteraction(page, EXAMPLE, { links: 'more' });
  // A → B and B → A are a fan of two: each bows a tenth of its length (0.2) to its right, so
  // their middles are 0.2 off the straight line, on either side of it.
  const link = (source: string, target: string) => (p: GraphPoint) =>
    p.kind === 'link' && p.source === source && p.target === target;
  const ab = await hoverAt(page, await pageAt(page, [1, -0.2, 0]), link('A', 'B'));
  expect(ab).toMatchObject({ pointNumber: 0, value: 5 });
  await events(page, true);
  const ba = await hoverAt(page, await pageAt(page, [1, 0.2, 0]), link('B', 'A'));
  expect(ba).toMatchObject({ pointNumber: 4, value: 4 });
  await expect(labels(page).first()).toContainText('B → A');

  // C → C: a ring on the side of C away from its neighbour B, that is toward +y. Its far side is
  // a node's radius (13 px) and 14 px from the center, at the depth of the middle of the scene.
  const c = await pageAt(page, AT['C']!);
  const out = await pageAt(page, [2, 2.5, 0]);
  const length = Math.hypot(out.x - c.x, out.y - c.y);
  const along = (px: number): Point => ({
    x: c.x + ((out.x - c.x) / length) * px,
    y: c.y + ((out.y - c.y) / length) * px,
  });
  let ring: GraphPoint | undefined;
  for (const px of [27, 22, 32, 18, 36]) {
    await events(page, true);
    const at = along(px);
    await page.mouse.move(at.x - 3, at.y - 3);
    await page.mouse.move(at.x, at.y, { steps: 2 });
    const found = async (): Promise<GraphPoint | undefined> =>
      (await events(page))
        .filter((e) => e.name === 'hover')
        .map((e) => pointsOf(e)[0]!)
        .findLast(link('C', 'C'));
    await expect
      .poll(async () => (await found()) !== undefined, { timeout: 4000 })
      .toBe(true)
      .catch(() => undefined);
    ring = await found();
    if (ring) break;
  }
  expect(ring).toMatchObject({ pointNumber: 5, kind: 'link', source: 'C', target: 'C', value: 6 });
  await expect(labels(page).first()).toContainText('C → C');
  // The label points at the ring, not at the middle of the node.
  const box = (await labels(page).first().boundingBox())!;
  const tip = Math.min(Math.abs(box.x - c.x), Math.abs(box.x + box.width - c.x));
  expect(tip).toBeGreaterThan(8);
});

test('hovering a node dims what is not its neighbourhood, until the pointer is elsewhere', async ({
  page,
}) => {
  await openInteraction(page, EXAMPLE);
  // D and E are not next to B; A and C are. The middle of D → E is a link outside it too.
  const [d, e] = [AT['D']!, AT['E']!];
  const places = {
    a: await pageAt(page, AT['A']!),
    c: await pageAt(page, AT['C']!),
    e: await pageAt(page, e),
    de: await pageAt(page, [(d[0] + e[0]) / 2, (d[1] + e[1]) / 2, (d[2] + e[2]) / 2]),
  };
  const read = async () => ({
    a: await colorAt(page, places.a),
    c: await colorAt(page, places.c),
    e: await colorAt(page, places.e),
    de: await colorAt(page, places.de),
  });
  // An empty corner of the scene.
  const canvas = (await page.locator('canvas').first().boundingBox())!;
  const corner = { x: canvas.x + 30, y: canvas.y + canvas.height - 30 };
  await page.mouse.move(corner.x, corner.y);
  const before = await read();
  // Something is drawn at each place.
  const background = await colorAt(page, { x: corner.x + 20, y: corner.y });
  expect(apart(before.e, background)).toBeGreaterThan(60);
  expect(apart(before.de, background)).toBeGreaterThan(20);

  await hoverAt(page, await pageAt(page, AT['B']!), node('B'));
  await expect.poll(async () => apart((await read()).e, before.e)).toBeGreaterThan(40);
  const during = await read();
  // The neighbours keep their look; what is not highlighted is nearly the background.
  expect(apart(during.a, before.a)).toBeLessThan(6);
  expect(apart(during.c, before.c)).toBeLessThan(6);
  expect(apart(during.e, background)).toBeLessThan(apart(before.e, background) * 0.4);
  expect(apart(during.de, background)).toBeLessThan(apart(before.de, background) * 0.5);

  // Over nothing: the look of before, a moment later.
  await page.mouse.move(corner.x, corner.y, { steps: 3 });
  await expect
    .poll(async () => apart((await read()).e, before.e), { timeout: 5000 })
    .toBeLessThan(6);
  const after = await read();
  expect(apart(after.de, before.de)).toBeLessThan(6);

  // And at once when the pointer leaves the chart.
  await hoverAt(page, await pageAt(page, AT['B']!), node('B'));
  await expect.poll(async () => apart((await read()).e, before.e)).toBeGreaterThan(40);
  await page.mouse.move(canvas.x + canvas.width + 60, canvas.y + canvas.height + 60, { steps: 4 });
  await expect
    .poll(async () => apart((await read()).e, before.e), { timeout: 5000 })
    .toBeLessThan(6);
});

test.describe('graph3d interaction', () => {
  test.beforeEach(async ({ page }) => {
    await openInteraction(page, EXAMPLE);
  });

  test('hovering a node names it, its links and its group', async ({ page }) => {
    const at = await pageAt(page, AT['B']!);
    const point = await hoverAt(page, at, node('B'));
    expect(point).toEqual({
      curveNumber: 0,
      pointNumber: 1,
      kind: 'node',
      label: 'B',
      degree: 2,
      group: 'low',
      z: 0,
    });
    const label = labels(page).first();
    await expect(label).toContainText('B');
    await expect(label).toContainText('Links in: 1, out: 1');
    await expect(label).toContainText('Group: low');
    // The label points at the node: its box is beside the node's projection.
    const box = (await label.boundingBox())!;
    const dx = Math.min(Math.abs(box.x - at.x), Math.abs(box.x + box.width - at.x));
    expect(dx).toBeLessThan(30);
    expect(at.y).toBeGreaterThan(box.y - 20);
    expect(at.y).toBeLessThan(box.y + box.height + 20);

    // Off every node and link: unhover, label gone.
    await page.mouse.move(8, 8);
    await waitForEvent(page, 'unhover');
    await expect(labels(page)).toHaveCount(0);
  });

  test('hovering a link names its two ends and its value', async ({ page }) => {
    // The middle of D → E, where no node and no arrowhead is.
    const [d, e] = [AT['D']!, AT['E']!];
    const at = await pageAt(page, [(d[0] + e[0]) / 2, (d[1] + e[1]) / 2, (d[2] + e[2]) / 2]);
    const point = await hoverAt(page, at, (p) => p.kind === 'link');
    expect(point).toMatchObject({
      curveNumber: 0,
      pointNumber: 3,
      kind: 'link',
      source: 'D',
      target: 'E',
      value: 3,
    });
    const label = labels(page).first();
    await expect(label).toContainText('D → E');
    await expect(label).toContainText('Value: 3');
  });

  test('a click emits the hovered node', async ({ page }) => {
    await hoverAt(page, await pageAt(page, AT['D']!), node('D'));
    await events(page, true);
    await page.mouse.down();
    await page.mouse.up();
    const click = await waitForEvent(page, 'click');
    expect(pointsOf(click)[0]).toMatchObject({
      curveNumber: 0,
      pointNumber: 3,
      kind: 'node',
      label: 'D',
      degree: 2,
      group: 'high',
    });
  });

  test('a drag orbits the camera; nodes are hovered where they are drawn after it', async ({
    page,
  }) => {
    const before = await pageAt(page, AT['C']!);
    await events(page, true);
    // From an empty corner of the scene.
    const canvas = (await page.locator('canvas').first().boundingBox())!;
    await page.mouse.move(canvas.x + 60, canvas.y + 330);
    await page.mouse.down();
    await page.mouse.move(canvas.x + 150, canvas.y + 345, { steps: 8 });
    await page.mouse.up();
    const relayout = await waitForEvent(page, 'relayout');
    expect((relayout.payload['keys'] as string[]).join()).toContain('scene.camera');
    const after = await pageAt(page, AT['C']!);
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(10);
    await events(page, true);
    const point = await hoverAt(page, after, node('C'));
    expect(point).toMatchObject({ pointNumber: 2, kind: 'node', label: 'C', degree: 1 });
  });

  test('a group hidden through the legend is not drawn and not hovered', async ({ page }) => {
    const at = await pageAt(page, AT['E']!);
    await hoverAt(page, at, node('E'));
    const item = page
      .getByRole('toolbar', { name: 'Legend', exact: true })
      .getByRole('button', { name: 'high', exact: true });
    const box = (await item.boundingBox())!;
    await page.mouse.click(box.x + 20, box.y + box.height / 2);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (
              window as unknown as {
                __interaction: { chart: { fullLayout: { hiddenlabels?: unknown[] } } };
              }
            ).__interaction.chart.fullLayout.hiddenlabels,
        ),
      )
      .toEqual(['high']);
    await events(page, true);
    await page.mouse.move(at.x - 3, at.y - 3);
    await page.mouse.move(at.x, at.y, { steps: 3 });
    await page.waitForTimeout(700);
    const hovers = (await events(page)).filter((e) => e.name === 'hover');
    expect(hovers.every((e) => pointsOf(e)[0]!.label !== 'E')).toBe(true);
  });
});

test('keyboard: arrows step through the nodes and along their links, Shift + arrow orbits, and the graph is described', async ({
  page,
}) => {
  await openInteraction(page, EXAMPLE);
  await tabIntoChart(page);
  expect(await press(page, 'ArrowRight')).toBe(
    'net: A, Links in: 0, out: 2, Group: low, node 1 of 5. Down: A → B.',
  );
  await expect(labels(page)).toContainText('Links in: 0, out: 2');
  // Down: the first of A's links (in 3D, by the index of the node at the other end), then along
  // the next one to D.
  expect(await press(page, 'ArrowDown')).toBe('net: A → B, Value: 5, link 1 of 2 of A. Down: B.');
  await expect(labels(page)).toContainText('A → B');
  expect(await press(page, 'ArrowRight')).toBe('net: A → D, Value: 2, link 2 of 2 of A. Down: D.');
  expect(await press(page, 'ArrowDown')).toBe(
    'net: D, Links in: 1, out: 1, Group: high, node 4 of 5. Down: A → D.',
  );
  expect(await press(page, 'End')).toBe(
    'net: E, Links in: 1, out: 0, Group: high, node 5 of 5. Down: D → E.',
  );
  // The scene's view keys (loaded with the 3D package's accessibility chunk).
  const before = await pageAt(page, AT['C']!);
  await events(page, true);
  await page.keyboard.press('Shift+ArrowLeft');
  const relayout = await waitForEvent(page, 'relayout');
  expect((relayout.payload['keys'] as string[]).join()).toContain('scene.camera');
  const after = await pageAt(page, AT['C']!);
  expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(10);
  const described = await page.evaluate(async () => {
    const chart = (
      window as unknown as {
        __interaction: { chart: { describe(): Promise<{ traces: string[] } | undefined> } };
      }
    ).__interaction.chart;
    return (await chart.describe())?.traces ?? [];
  });
  expect(described).toEqual([
    '3D directed network graph "net": 5 nodes, 4 links, 2 groups, at given positions. ' +
      'All nodes are connected; most connected: A (2 links), B (2), D (2). ' +
      'Groups: low (3 nodes), high (2).',
  ]);
});
