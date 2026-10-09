import { expect, test, type Page } from '@playwright/test';
import { pixel, type RGB } from './hierarchy.ts';
import {
  callChart,
  dragBetween,
  events,
  openInteraction,
  ranges,
  toPage,
  touchGesture,
  waitForEvent,
  type LoggedEvent,
} from './helpers.ts';

/**
 * What the pointer does to a `graph` trace, on `_dev/interaction-graph-drag` (backlog G5):
 *
 * - `?case=preset` (the default): six nodes at whole-number positions (A, B, C on y = 0 at
 *   x = 0, 2, 4; D, E, F on y = 2 at x = 1, 3, 4) and five directed links (0: A → B, 1: B → C,
 *   2: D → E, 3: A → D, 4: E → F), on a white background, x in [-1, 5], y in [-1, 3]. Hovering
 *   highlights, nodes drag as data, a selection reports its links and two selected nodes
 *   highlight the path between them.
 * - `?case=force`: a ring of eight nodes with two chords, laid out by `arrangement: 'force'` and
 *   drawn at rest. A drag pins a node and moves nothing else; a double click releases it.
 * - `?case=simulate`: the same with `force.simulate`: the other nodes give way while a node is
 *   dragged, and the figure gets where the layout settles.
 */
const EXAMPLE = '_dev/interaction-graph-drag';

interface Nodes {
  x: (number | null)[];
  y: (number | null)[];
}

interface PathInfo {
  nodes: number[];
  links: number[];
  length: number;
}

interface Hook {
  chart: {
    data: {
      node: { x?: (number | null)[]; y?: (number | null)[] };
      force?: { start?: { x?: number[]; y?: number[]; alpha?: number } };
    }[];
    fullData: { selectedpoints?: number[] }[];
  };
  frames: number;
  nodes(): Nodes;
  path(): PathInfo | null;
}

/** A logged event point with the graph's own fields (the page keeps these). */
interface GraphPoint {
  curveNumber: number;
  pointNumber: number;
  kind?: string;
  label?: string;
  neighbors?: number;
  source?: number;
  target?: number;
  links?: number[];
  path?: PathInfo;
}

type Update = Record<string, unknown[][]>;

const HOOK = '__interaction';

const pointsOf = (event: LoggedEvent): GraphPoint[] =>
  (event.payload.points ?? []) as unknown as GraphPoint[];

const updateOf = (event: LoggedEvent): Update =>
  (event.payload as unknown as { update: Update }).update;

const nodes = (page: Page): Promise<Nodes> =>
  page.evaluate((key) => (window as unknown as Record<string, Hook>)[key]!.nodes(), HOOK);

const highlightedPath = (page: Page): Promise<PathInfo | null> =>
  page.evaluate((key) => (window as unknown as Record<string, Hook>)[key]!.path(), HOOK);

const figureNode = (page: Page): Promise<Hook['chart']['data'][number]['node']> =>
  page.evaluate(
    (key) => (window as unknown as Record<string, Hook>)[key]!.chart.data[0]!.node,
    HOOK,
  );

const startAlpha = (page: Page): Promise<number | undefined> =>
  page.evaluate(
    (key) => (window as unknown as Record<string, Hook>)[key]!.chart.data[0]!.force?.start?.alpha,
    HOOK,
  );

const restyles = async (page: Page): Promise<LoggedEvent[]> =>
  (await events(page)).filter((e) => e.name === 'restyle');

/** Page coordinates of node `i` where calc put it. */
async function nodeOnPage(page: Page, i: number): Promise<{ x: number; y: number }> {
  const at = await nodes(page);
  return toPage(page, at.x[i]!, at.y[i]!);
}

/**
 * Wait until the chart is at rest: it has drawn nothing for `quiet` animation frames in a row
 * (frames, not ms: under load everything that runs on animation frames slows down together).
 */
function atRest(page: Page, quiet = 20): Promise<number> {
  return page.evaluate(
    ([key, frames]) =>
      new Promise<number>((resolve, reject) => {
        const hook = (window as unknown as Record<string, Hook>)[key as string]!;
        const limit = performance.now() + 40_000;
        let last = hook.frames;
        let still = 0;
        const tick = (): void => {
          still = hook.frames === last ? still + 1 : 0;
          last = hook.frames;
          if (still >= (frames as number)) resolve(last);
          else if (performance.now() > limit) reject(new Error('the chart never came to rest'));
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    [HOOK, quiet] as const,
  );
}

/** How much of a node's color shows at a pixel on the white background: 0 none, 1 all of it. */
const strength = ([r, g, b]: RGB): number => 1 - Math.min(r, g, b) / 255;

/**
 * The strength of the node color inside the node at data (`x`, `y`): 4 px off its center, clear
 * of the grid lines that cross there and show through a dimmed node.
 */
async function nodeStrength(page: Page, x: number, y: number): Promise<number> {
  const center = await toPage(page, x, y);
  return strength(await pixel(page, { x: center.x + 4, y: center.y + 4 }));
}

const labels = (page: Page) => page.locator('.holochart-hoverlabel').filter({ visible: true });

test.describe('highlighting', () => {
  test.beforeEach(async ({ page }) => {
    await openInteraction(page, EXAMPLE);
  });

  test('hovering a node dims what is not next to it, and leaving restores it', async ({ page }) => {
    // Every node is drawn in full.
    for (const [x, y] of [
      [0, 0],
      [2, 0],
      [1, 2],
      [3, 2],
    ] as const) {
      expect(await nodeStrength(page, x, y)).toBeGreaterThan(0.7);
    }
    const b = await toPage(page, 2, 0);
    await page.mouse.move(b.x + 2, b.y - 2);
    const hover = await waitForEvent(page, 'hover');
    expect(pointsOf(hover)).toMatchObject([{ kind: 'node', label: 'B', neighbors: 2 }]);
    // A and C are B's neighbours; D, E and F are not.
    await expect.poll(() => nodeStrength(page, 1, 2)).toBeLessThan(0.3);
    expect(await nodeStrength(page, 3, 2)).toBeLessThan(0.3);
    expect(await nodeStrength(page, 4, 2)).toBeLessThan(0.3);
    expect(await nodeStrength(page, 0, 0)).toBeGreaterThan(0.7);
    expect(await nodeStrength(page, 4, 0)).toBeGreaterThan(0.7);
    // Off every node and link: back to what it was.
    const empty = await toPage(page, 2, 1);
    await page.mouse.move(empty.x, empty.y);
    await waitForEvent(page, 'unhover');
    await expect.poll(() => nodeStrength(page, 1, 2)).toBeGreaterThan(0.7);
    expect(await nodeStrength(page, 3, 2)).toBeGreaterThan(0.7);
  });

  test('hovering a link keeps the link and its two ends', async ({ page }) => {
    // The middle of D → E, a pixel off the line.
    const p = await toPage(page, 2, 2);
    await page.mouse.move(p.x, p.y + 1);
    const hover = await waitForEvent(page, 'hover');
    expect(pointsOf(hover)).toMatchObject([{ kind: 'link', pointNumber: 2, source: 3, target: 4 }]);
    await expect.poll(() => nodeStrength(page, 0, 0)).toBeLessThan(0.3);
    expect(await nodeStrength(page, 4, 2)).toBeLessThan(0.3);
    expect(await nodeStrength(page, 1, 2)).toBeGreaterThan(0.7);
    expect(await nodeStrength(page, 3, 2)).toBeGreaterThan(0.7);
  });

  test('`highlight.hops` and `highlight.direction` say how far and which way', async ({ page }) => {
    await callChart(page, 'restyle', { 'highlight.hops': 2, 'highlight.direction': 'out' });
    // From A along the links: B and D, then C and E. F is three links away.
    const a = await toPage(page, 0, 0);
    await page.mouse.move(a.x + 2, a.y - 2);
    await waitForEvent(page, 'hover');
    await expect.poll(() => nodeStrength(page, 4, 2)).toBeLessThan(0.3);
    expect(await nodeStrength(page, 3, 2)).toBeGreaterThan(0.7);
    expect(await nodeStrength(page, 4, 0)).toBeGreaterThan(0.7);
    // Against the links nothing leads to A: from C, B and A.
    await callChart(page, 'restyle', { 'highlight.direction': 'in' });
    const c = await toPage(page, 4, 0);
    await page.mouse.move(c.x - 2, c.y - 2);
    await expect.poll(() => nodeStrength(page, 1, 2)).toBeLessThan(0.3);
    expect(await nodeStrength(page, 0, 0)).toBeGreaterThan(0.7);
    expect(await nodeStrength(page, 2, 0)).toBeGreaterThan(0.7);
  });

  test('`highlight.mode: none` leaves everything as it is', async ({ page }) => {
    await callChart(page, 'restyle', { 'highlight.mode': 'none' });
    const b = await toPage(page, 2, 0);
    await page.mouse.move(b.x + 2, b.y - 2);
    await waitForEvent(page, 'hover');
    await page.waitForTimeout(200);
    expect(await nodeStrength(page, 1, 2)).toBeGreaterThan(0.7);
  });
});

test.describe('dragging a node at a given position', () => {
  test.beforeEach(async ({ page }) => {
    await openInteraction(page, EXAMPLE);
  });

  test('moves it, its links follow, and the release restyles its position', async ({ page }) => {
    const from = await toPage(page, 2, 0);
    const to = await toPage(page, 2.5, 1);
    await page.mouse.move(from.x, from.y);
    await waitForEvent(page, 'hover');
    await expect(labels(page)).toHaveCount(1);
    await events(page, true);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    // The label of the node hovered at the press does not stay behind.
    await waitForEvent(page, 'unhover');
    await expect(labels(page)).toHaveCount(0);
    // The node is drawn where the pointer has it, before anything is released.
    await expect.poll(() => nodeStrength(page, 2.5, 1)).toBeGreaterThan(0.7);
    expect(await nodeStrength(page, 2, 0)).toBeLessThan(0.3);
    expect(await restyles(page)).toHaveLength(0);
    await page.mouse.up();

    const restyle = await waitForEvent(page, 'restyle');
    const update = updateOf(restyle);
    expect(Object.keys(update)).toEqual(['node.x', 'node.y']);
    const [xs] = update['node.x'] as number[][];
    const [ys] = update['node.y'] as number[][];
    expect(xs![1]).toBeCloseTo(2.5, 1);
    expect(ys![1]).toBeCloseTo(1, 1);
    // The other nodes are written back as they were.
    expect(xs!.filter((_, i) => i !== 1)).toEqual([0, 4, 1, 3, 4]);
    expect(ys!.filter((_, i) => i !== 1)).toEqual([0, 0, 2, 2, 2]);
    expect((restyle.payload as { traces?: number[] }).traces).toEqual([0]);

    const at = await nodes(page);
    expect(at.x[1]).toBeCloseTo(2.5, 1);
    expect(at.y[1]).toBeCloseTo(1, 1);
    expect((await figureNode(page)).x?.[1]).toBeCloseTo(2.5, 1);
    // A drag of a node is not a drag of the chart: no zoom, no click.
    const names = (await events(page)).map((e) => e.name);
    expect(names).not.toContain('relayout');
    expect(names).not.toContain('click');
    const r = await ranges(page);
    expect(r.x).toEqual([-1, 5]);
    // The node is hovered where it is now.
    await page.mouse.move(to.x + 1, to.y + 1);
    await expect.poll(async () => pointsOf(await waitForEvent(page, 'hover'))[0]?.label).toBe('B');
    await expect(labels(page)).toHaveCount(1);
  });

  test('a click on a node without moving still fires click, and restyles nothing', async ({
    page,
  }) => {
    const a = await toPage(page, 0, 0);
    await page.mouse.move(a.x + 1, a.y + 1);
    await waitForEvent(page, 'hover');
    await events(page, true);
    await page.mouse.down();
    await page.mouse.up();
    const click = await waitForEvent(page, 'click');
    expect(pointsOf(click)).toMatchObject([{ kind: 'node', label: 'A', pointNumber: 0 }]);
    expect(await restyles(page)).toHaveLength(0);
    expect((await nodes(page)).x).toEqual([0, 2, 4, 1, 3, 4]);
  });

  test("a press on empty space is still the chart's drag", async ({ page }) => {
    await events(page, true);
    await dragBetween(page, await toPage(page, 0.5, 1.6), await toPage(page, 3.5, 0.4));
    await waitForEvent(page, 'relayout');
    const r = await ranges(page);
    expect(r.x[0]).toBeCloseTo(0.5, 1);
    expect(r.x[1]).toBeCloseTo(3.5, 1);
    expect(await restyles(page)).toHaveLength(0);
  });

  test('`node.draggable: false` leaves a press on a node to the chart', async ({ page }) => {
    await callChart(page, 'restyle', { 'node.draggable': false });
    await callChart(page, 'relayout', { dragmode: 'pan' });
    await events(page, true);
    await dragBetween(page, await toPage(page, 2, 0), await toPage(page, 3, 0));
    await waitForEvent(page, 'relayout');
    expect(await restyles(page)).toHaveLength(0);
    // The chart panned by a unit; the node is where the figure has it.
    expect((await ranges(page)).x[0]).toBeCloseTo(-2, 1);
    expect((await nodes(page)).x[1]).toBe(2);
  });

  test.describe('with a finger', () => {
    test.use({ hasTouch: true });

    test('a node drags with one finger that starts sideways', async ({ page }) => {
      await events(page, true);
      const p0 = await toPage(page, 2, 0);
      const p2 = await toPage(page, 3, 1);
      await touchGesture(page, [[p0, { x: p0.x + 30, y: p0.y - 2 }, p2]]);
      const update = updateOf(await waitForEvent(page, 'restyle'));
      expect((update['node.x'] as number[][])[0]![1]).toBeCloseTo(3, 1);
      expect((update['node.y'] as number[][])[0]![1]).toBeCloseTo(1, 1);
    });
  });
});

test.describe('dragging a node of a force layout at rest', () => {
  test.beforeEach(async ({ page }) => {
    await openInteraction(page, EXAMPLE, { case: 'force' });
  });

  test('pins the node where it is dropped, moves nothing else, and a double click releases it', async ({
    page,
  }) => {
    const before = await nodes(page);
    expect((await figureNode(page)).x).toBeUndefined();
    const from = await nodeOnPage(page, 0);
    await events(page, true);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 60, from.y - 30, { steps: 8 });
    await page.mouse.up();

    const update = updateOf(await waitForEvent(page, 'restyle'));
    expect(Object.keys(update)).toEqual([
      'node.x',
      'node.y',
      'force.start.x',
      'force.start.y',
      'force.start.alpha',
    ]);
    // The picture, at rest: no layout runs.
    expect(update['force.start.alpha']).toEqual([0]);
    const [xs] = update['node.x'] as (number | null)[][];
    expect(xs!.slice(1)).toEqual([null, null, null, null, null, null, null]);
    const dropped = await nodes(page);
    // To the right and up on screen (y up in the layout's units).
    expect(dropped.x[0]!).toBeGreaterThan(before.x[0]! + 5);
    expect(dropped.y[0]!).toBeGreaterThan(before.y[0]! + 2);
    expect(xs![0]).toBeCloseTo(dropped.x[0]!, 1);
    for (let i = 1; i < 8; i++) {
      expect(dropped.x[i]!).toBeCloseTo(before.x[i]!, 1);
      expect(dropped.y[i]!).toBeCloseTo(before.y[i]!, 1);
    }
    expect((await figureNode(page)).x?.[0]).toBeCloseTo(dropped.x[0]!, 1);
    expect(await restyles(page)).toHaveLength(1);

    // A double click on the pinned node unsets its position, and the layout warms up again.
    await atRest(page);
    await events(page, true);
    const pinned = await nodeOnPage(page, 0);
    await page.mouse.move(pinned.x, pinned.y);
    await page.mouse.dblclick(pinned.x, pinned.y);
    const released = updateOf(await waitForEvent(page, 'restyle'));
    expect((released['node.x'] as (number | null)[][])[0]![0]).toBeNull();
    expect((released['node.y'] as (number | null)[][])[0]![0]).toBeNull();
    expect(released['force.start.alpha']).toEqual([0.3]);
    expect((await figureNode(page)).x?.[0]).toBeNull();
    // A double click on a node resets no view.
    expect((await events(page)).map((e) => e.name)).not.toContain('doubleclick');
    // Free again, the node moves back towards its neighbours.
    const free = await nodes(page);
    const moved = Math.hypot(free.x[0]! - dropped.x[0]!, free.y[0]! - dropped.y[0]!);
    expect(moved).toBeGreaterThan(2);
  });

  test('a double click on a node that is not pinned does nothing', async ({ page }) => {
    const p = await nodeOnPage(page, 3);
    await events(page, true);
    await page.mouse.move(p.x, p.y);
    await page.mouse.dblclick(p.x, p.y);
    await waitForEvent(page, 'click');
    await page.waitForTimeout(300);
    const names = (await events(page)).map((e) => e.name);
    expect(names).not.toContain('restyle');
    expect(names).not.toContain('relayout');
  });
});

test.describe('dragging a node under force.simulate', () => {
  test.beforeEach(async ({ page }) => {
    await openInteraction(page, EXAMPLE, { case: 'simulate' });
    await atRest(page);
  });

  test('the other nodes give way, the node stays pinned, and a double click releases it', async ({
    page,
  }) => {
    const before = await nodes(page);
    const from = await nodeOnPage(page, 0);
    await events(page, true);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 80, from.y - 40, { steps: 10 });
    // Held for a moment: the simulation runs while the node is dragged.
    await page.waitForTimeout(400);
    await page.mouse.up();

    // The release pins the node and writes the picture as it is at that moment.
    const first = updateOf(await waitForEvent(page, 'restyle'));
    expect(Object.keys(first)).toContain('node.x');
    expect(first['force.start.alpha']).toEqual([0]);
    const pinnedX = (first['node.x'] as (number | null)[][])[0]![0]!;
    const pinnedY = (first['node.y'] as (number | null)[][])[0]![0]!;
    expect(pinnedX).toBeGreaterThan(before.x[0]! + 5);
    // Its neighbour had already given way when it was dropped.
    const startX = (first['force.start.x'] as number[][])[0]!;
    const startY = (first['force.start.y'] as number[][])[0]!;
    const gaveWay = (i: number): number =>
      Math.hypot(startX[i]! - before.x[i]!, startY[i]! - before.y[i]!);
    expect(gaveWay(1)).toBeGreaterThan(1);

    // When the layout has settled, the figure gets where it ended.
    await expect.poll(async () => (await restyles(page)).length, { timeout: 30_000 }).toBe(2);
    const second = updateOf((await restyles(page))[1]!);
    expect(Object.keys(second)).toEqual(['force.start.x', 'force.start.y', 'force.start.alpha']);
    expect(second['force.start.alpha']).toEqual([0]);
    await atRest(page);
    const after = await nodes(page);
    // The node is where it was dropped; the figure says so.
    expect(after.x[0]!).toBeCloseTo(pinnedX, 1);
    expect(after.y[0]!).toBeCloseTo(pinnedY, 1);
    expect((await figureNode(page)).x?.[0]).toBe(pinnedX);
    expect(await startAlpha(page)).toBe(0);
    // The others followed.
    const followed = (i: number): number =>
      Math.hypot(after.x[i]! - before.x[i]!, after.y[i]! - before.y[i]!);
    expect(followed(1)).toBeGreaterThan(2);
    expect(followed(7)).toBeGreaterThan(2);

    // A double click releases it: on screen first, then in the figure when it has settled.
    await events(page, true);
    const pinned = await nodeOnPage(page, 0);
    await page.mouse.move(pinned.x, pinned.y);
    await page.mouse.dblclick(pinned.x, pinned.y);
    const released = updateOf(await waitForEvent(page, 'restyle'));
    expect((released['node.x'] as (number | null)[][])[0]![0]).toBeNull();
    await expect.poll(async () => (await restyles(page)).length, { timeout: 30_000 }).toBe(2);
    expect((await figureNode(page)).x?.[0]).toBeNull();
    expect(await startAlpha(page)).toBe(0);
  });
});

test.describe('selection', () => {
  test.beforeEach(async ({ page }) => {
    await openInteraction(page, EXAMPLE);
  });

  test('a box selection reports its nodes and the links among them', async ({ page }) => {
    await callChart(page, 'setDragmode', 'select');
    await events(page, true);
    // A, B and D: the box starts on empty space, left of A, and ends right of B, above D.
    await dragBetween(page, await toPage(page, -0.5, 2.5), await toPage(page, 2.5, -0.5));
    const selected = await waitForEvent(page, 'selected');
    const points = pointsOf(selected).sort((a, b) => a.pointNumber - b.pointNumber);
    expect(points.map((p) => [p.kind, p.label])).toEqual([
      ['node', 'A'],
      ['node', 'B'],
      ['node', 'D'],
    ]);
    // Each node lists its links to the other selected nodes: A → B is link 0, A → D link 3.
    expect(points.map((p) => p.links)).toEqual([[0, 3], [0], [3]]);
    const among = [...new Set(points.flatMap((p) => p.links ?? []))].sort();
    expect(among).toEqual([0, 3]);
    // Three nodes: no path.
    expect(points.every((p) => p.path === undefined)).toBe(true);
    // The links that do not join two selected nodes are dimmed with the nodes outside.
    await expect.poll(() => nodeStrength(page, 3, 2)).toBeLessThan(0.3);
    expect(await nodeStrength(page, 1, 2)).toBeGreaterThan(0.7);
  });

  test('`selectedpoints` goes in and comes out', async ({ page }) => {
    await callChart(page, 'restyle', { selectedpoints: [[3, 4, 5]] });
    await expect.poll(() => nodeStrength(page, 0, 0)).toBeLessThan(0.3);
    expect(await nodeStrength(page, 3, 2)).toBeGreaterThan(0.7);
    const full = await page.evaluate(
      (key) => (window as unknown as Record<string, Hook>)[key]!.chart.fullData[0]!.selectedpoints,
      HOOK,
    );
    expect(full).toEqual([3, 4, 5]);
    await callChart(page, 'restyle', { selectedpoints: null });
    await expect.poll(() => nodeStrength(page, 0, 0)).toBeGreaterThan(0.7);
  });

  test('clicks select nodes, shift adds to the selection, and two selected nodes highlight the path between them', async ({
    page,
  }) => {
    await callChart(page, 'relayout', { clickmode: 'event+select' });
    await events(page, true);
    const a = await toPage(page, 0, 0);
    await page.mouse.click(a.x + 1, a.y + 1);
    const one = pointsOf(await waitForEvent(page, 'selected'));
    expect(one.map((p) => p.pointNumber)).toEqual([0]);
    expect(await highlightedPath(page)).toBeNull();

    await events(page, true);
    const c = await toPage(page, 4, 0);
    await page.keyboard.down('Shift');
    await page.mouse.click(c.x - 1, c.y + 1);
    await page.keyboard.up('Shift');
    const two = pointsOf(await waitForEvent(page, 'selected'));
    expect(two.map((p) => p.pointNumber)).toEqual([0, 2]);
    // The event carries the path, and so does `graphPath` of the trace.
    const path = { nodes: [0, 1, 2], links: [0, 1], length: 2 };
    expect(two.map((p) => p.path)).toEqual([path, path]);
    expect(await highlightedPath(page)).toEqual(path);
    // No link joins A and C directly.
    expect(two.map((p) => p.links)).toEqual([[], []]);
    // B is on the path and shows in full, though it is not selected; D is off it.
    await page.mouse.move(a.x + 250, a.y - 150);
    await expect.poll(() => nodeStrength(page, 1, 2)).toBeLessThan(0.3);
    expect(await nodeStrength(page, 2, 0)).toBeGreaterThan(0.7);
    expect(await nodeStrength(page, 0, 0)).toBeGreaterThan(0.7);

    // Along the links nothing leads from C to D or from D to C, unless their direction is ignored.
    await callChart(page, 'restyle', { selectedpoints: [[2, 3]] });
    expect(await highlightedPath(page)).toBeNull();
    await callChart(page, 'restyle', { 'highlight.pathdirected': false });
    expect(await highlightedPath(page)).toEqual({
      nodes: [2, 1, 0, 3],
      links: [1, 0, 3],
      length: 3,
    });
    // By value: B → C (1), A → B (5), A → D (2).
    await callChart(page, 'restyle', { 'highlight.pathweight': 'value' });
    expect((await highlightedPath(page))?.length).toBe(8);
  });

  test('a click on a link selects its two ends', async ({ page }) => {
    await callChart(page, 'relayout', { clickmode: 'event+select' });
    await events(page, true);
    const p = await toPage(page, 2, 2);
    await page.mouse.click(p.x, p.y + 1);
    const click = await waitForEvent(page, 'click');
    expect(pointsOf(click)).toMatchObject([{ kind: 'link', pointNumber: 2, source: 3, target: 4 }]);
    const selected = pointsOf(await waitForEvent(page, 'selected'));
    expect(selected.map((s) => [s.kind, s.pointNumber])).toEqual([
      ['node', 3],
      ['node', 4],
    ]);
    // The link itself is the one among them, and the path between them.
    expect(selected.map((s) => s.links)).toEqual([[2], [2]]);
    expect(await highlightedPath(page)).toEqual({ nodes: [3, 4], links: [2], length: 1 });
  });

  test('`highlight.path` draws a path whatever is selected', async ({ page }) => {
    await callChart(page, 'restyle', { 'highlight.path': [[0, 4]] });
    expect(await highlightedPath(page)).toEqual({ nodes: [0, 3, 4], links: [3, 2], length: 2 });
    await expect.poll(() => nodeStrength(page, 2, 0)).toBeLessThan(0.3);
    expect(await nodeStrength(page, 1, 2)).toBeGreaterThan(0.7);
    await callChart(page, 'restyle', { 'highlight.path': null });
    expect(await highlightedPath(page)).toBeNull();
    await expect.poll(() => nodeStrength(page, 2, 0)).toBeGreaterThan(0.7);
  });
});
