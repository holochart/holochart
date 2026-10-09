import { expect, test, type Page } from '@playwright/test';
import { events, openInteraction, toPage } from './helpers.ts';
import {
  anchor,
  announcement,
  labels,
  press,
  tabIntoChart,
  target,
  trackAnchors,
} from './keyboard-helpers.ts';

/**
 * Keyboard navigation of the `graph` trace (backlog G10) on `_dev/keyboard-graph`, with real key
 * presses. In every arrangement ↓ goes along a link, ↑ comes back and ← / → move among the stops
 * beside the cursor:
 *
 * - a network: the nodes, and the links of each node around it; ↓ from a node to its first link
 *   and from a link to the node at its other end;
 * - a tree: siblings, the parent and the first child, as in the hierarchy traces; Enter folds a
 *   node that has children and unfolds it, as a click on it does;
 * - a layered graph: the nodes of a rank, and the linked node in the rank before and after.
 *
 * Each stop shows the hover label of its node or link, anchored on it, and announces it with its
 * place and with where ↑ and ↓ lead, in the chart's language. After an update the cursor is on
 * the node or link it was on, or near it when that is no longer drawn. The stops of `chord` and
 * `graph3d` are in chord.spec.ts and graph3d.spec.ts.
 */
const EXAMPLE = '_dev/keyboard-graph';

interface HoverPoint {
  kind?: string;
  label?: string;
  source?: string;
  target?: string;
  pointNumber: number;
}

interface ChartHook {
  __interaction: {
    chart: {
      data: { tree?: { collapsed?: unknown } }[];
      relayout(update: Record<string, unknown>): Promise<unknown>;
      restyle(update: Record<string, unknown>, traces?: number[]): Promise<unknown>;
    };
  };
}

/** `tree.collapsed` of the figure as the chart has it now. */
const collapsed = (page: Page): Promise<unknown> =>
  page.evaluate(
    () => (window as unknown as ChartHook).__interaction.chart.data[0]?.tree?.collapsed,
  );

const relayout = (page: Page, update: Record<string, unknown>): Promise<void> =>
  page.evaluate(async (u) => {
    await (window as unknown as ChartHook).__interaction.chart.relayout(u);
  }, update);

/** The point of the last `hover` event. */
async function hovered(page: Page): Promise<HoverPoint | undefined> {
  const hovers = (await events(page)).filter((e) => e.name === 'hover');
  return (hovers.at(-1)?.payload.points as HoverPoint[] | undefined)?.[0];
}

test.describe('a network', () => {
  test.beforeEach(async ({ page }) => {
    await openInteraction(page, EXAMPLE);
    await tabIntoChart(page);
  });

  test('arrows move between nodes, into the links of a node and along a link', async ({ page }) => {
    await expect(target(page)).toBeFocused();
    expect(await press(page, 'ArrowRight')).toBe(
      'net: A, Links in: 0, out: 2, Group: core, node 1 of 6. Down: A → D.',
    );
    await expect(labels(page)).toHaveCount(1);
    await expect(labels(page)).toContainText('Links in: 0, out: 2');
    // Down: the first of A's links, clockwise from 12 o'clock.
    expect(await press(page, 'ArrowDown')).toBe('net: A → D, Value: 2, link 1 of 2 of A. Down: D.');
    await expect(labels(page)).toContainText('A → D');
    expect(await hovered(page)).toMatchObject({ kind: 'link', source: 'A', target: 'D' });
    // Right: the next link around A, and around again.
    expect(await press(page, 'ArrowRight')).toBe(
      'net: A → B, Value: 5, link 2 of 2 of A. Down: B.',
    );
    expect(await press(page, 'ArrowRight')).toMatch(/^net: A → D, .*link 1 of 2 of A/);
    expect(await press(page, 'ArrowLeft')).toMatch(/^net: A → B, .*link 2 of 2 of A/);
    // Down: along the link to B.
    expect(await press(page, 'ArrowDown')).toBe(
      'net: B, Links in: 1, out: 1, Group: core, node 2 of 6. Down: B → C.',
    );
    expect(await hovered(page)).toMatchObject({ kind: 'node', label: 'B', pointNumber: 1 });
    // B's links: to C on its right, then the one from A on its left; that one leads back to A.
    expect(await press(page, 'ArrowDown')).toMatch(/^net: B → C, .*link 1 of 2 of B\. Down: C\.$/);
    expect(await press(page, 'End')).toBe('net: A → B, Value: 5, link 2 of 2 of B. Down: A.');
    expect(await press(page, 'Home')).toMatch(/^net: B → C, /);
    // Up: back to the node whose links these are.
    expect(await press(page, 'ArrowUp')).toMatch(/^net: B, .*node 2 of 6/);
    // Up on a node stays (and says so again).
    expect(await press(page, 'ArrowUp')).toMatch(/^net: B, .*node 2 of 6/);
  });

  test('← / → step through the nodes, Home goes to the hub and End to the last node', async ({
    page,
  }) => {
    await press(page, 'ArrowRight');
    expect(await press(page, 'ArrowRight')).toMatch(/^net: B, .*node 2 of 6/);
    expect(await press(page, 'ArrowRight')).toMatch(/^net: C, .*node 3 of 6\. Down: B → C\.$/);
    // A node without links has nothing below it.
    expect(await press(page, 'End')).toBe('net: F, Links in: 0, out: 0, Group: edge, node 6 of 6.');
    expect(await press(page, 'ArrowDown')).toMatch(/^net: F, .*node 6 of 6\.$/);
    expect(await press(page, 'ArrowLeft')).toMatch(/^net: E, .*node 5 of 6\. Down: D → E\.$/);
    // A, B and D have two links each: the first of them is the hub.
    expect(await press(page, 'Home')).toMatch(/^net: A, .*node 1 of 6/);
  });

  test('the label of a stop sits on its node or link', async ({ page }) => {
    await trackAnchors(page);
    await press(page, 'ArrowRight');
    await press(page, 'ArrowRight');
    // B is at (2, 0).
    const b = await toPage(page, 2, 0);
    const onB = await anchor(page);
    expect(Math.hypot(onB.x - b.x, onB.y - b.y)).toBeLessThan(2);
    // B's first link is B → C: its label is on the link, between B and C.
    await press(page, 'ArrowDown');
    const c = await toPage(page, 4, 0);
    const onLink = await anchor(page);
    expect(Math.abs(onLink.y - b.y)).toBeLessThan(2);
    expect(onLink.x).toBeGreaterThan(b.x + 20);
    expect(onLink.x).toBeLessThan(c.x - 20);
    // A pointer there hovers the same link.
    await page.keyboard.press('Escape');
    await events(page, true);
    await page.mouse.move(onLink.x - 2, onLink.y - 2);
    await page.mouse.move(onLink.x, onLink.y, { steps: 3 });
    await expect.poll(async () => (await hovered(page))?.kind).toBe('link');
    expect(await hovered(page)).toMatchObject({ source: 'B', target: 'C' });
  });

  test('a node hidden through the legend is not a stop, and neither are its links', async ({
    page,
  }) => {
    await page.evaluate(async () => {
      const chart = (
        window as unknown as {
          __interaction: { chart: { relayout(u: Record<string, unknown>): Promise<unknown> } };
        }
      ).__interaction.chart;
      await chart.relayout({ hiddenlabels: ['edge'] });
    });
    expect(await press(page, 'ArrowRight')).toBe(
      'net: A, Links in: 0, out: 2, Group: core, node 1 of 3. Down: A → B.',
    );
    expect(await press(page, 'ArrowDown')).toBe('net: A → B, Value: 5, link 1 of 1 of A. Down: B.');
    expect(await press(page, 'End')).toMatch(/link 1 of 1 of A/);
  });

  test('the cursor of a node hidden through the legend goes to the drawn node before it', async ({
    page,
  }) => {
    await relayout(page, { showlegend: true });
    const legend = page.getByRole('toolbar', { name: 'Legend' });
    const edge = legend.getByRole('button', { name: 'edge' });
    await expect(edge).toHaveAttribute('aria-pressed', 'true');
    await press(page, 'ArrowRight');
    await press(page, 'End');
    expect(await press(page, 'ArrowLeft')).toMatch(/^net: E, .*node 5 of 6/);
    // To the legend, and hide the group of D, E and F.
    await edge.focus();
    await page.keyboard.press('Enter');
    await expect(edge).toHaveAttribute('aria-pressed', 'false');
    // Back on the plot the cursor is on C, the last node that is left before E: ↑ stays on it.
    await target(page).focus();
    expect(await press(page, 'ArrowUp')).toBe(
      'net: C, Links in: 1, out: 0, Group: core, node 3 of 3. Down: B → C.',
    );
    expect(await press(page, 'ArrowLeft')).toMatch(/^net: B, .*node 2 of 3/);
  });

  test('the cursor stays on its node when the stops before it change, and a link whose far end is hidden gives it to its node', async ({
    page,
  }) => {
    // D's link from A, as seen from D: one of the two stops of that link.
    await press(page, 'ArrowRight');
    await press(page, 'ArrowDown');
    expect(await press(page, 'ArrowDown')).toMatch(/^net: D, .*node 4 of 6/);
    await press(page, 'ArrowDown');
    expect(await press(page, 'End')).toBe('net: A → D, Value: 2, link 2 of 2 of D. Down: A.');
    // The core group goes: D is the first node now, and its link to A is not drawn.
    await relayout(page, { hiddenlabels: ['core'] });
    await expect(labels(page)).toContainText('D');
    expect(await press(page, 'ArrowUp')).toBe(
      'net: D, Links in: 1, out: 1, Group: edge, node 1 of 3. Down: D → E.',
    );
    expect(await hovered(page)).toMatchObject({ kind: 'node', label: 'D', pointNumber: 3 });
    // And back: D is the fourth node again, and the cursor is still on it.
    await relayout(page, { hiddenlabels: [] });
    expect(await press(page, 'ArrowUp')).toMatch(/^net: D, .*node 4 of 6/);
  });
});

test('a network announces in the language of the chart', async ({ page }) => {
  await openInteraction(page, EXAMPLE, { locale: 'de' });
  await tabIntoChart(page);
  expect(await press(page, 'ArrowRight')).toBe(
    'net: A, Links in: 0, out: 2, Group: core, Knoten 1 von 6. Nach unten: A → D.',
  );
  expect(await press(page, 'ArrowDown')).toBe(
    'net: A → D, Value: 2, Verbindung 1 von 2 des Knotens A. Nach unten: D.',
  );
});

test('a tree: arrows walk it like a hierarchy', async ({ page }) => {
  await openInteraction(page, EXAMPLE, { graph: 'tree' });
  await tabIntoChart(page);
  expect(await press(page, 'ArrowRight')).toBe(
    'org: Root, Links: 2, level 1, 1 of 1, children: 2. Down: A.',
  );
  await expect(labels(page)).toContainText('Root');
  expect(await press(page, 'ArrowDown')).toBe(
    'org: A, Links: 3, level 2, 1 of 2, children: 2. Up: Root. Down: A one.',
  );
  expect(await press(page, 'ArrowRight')).toBe(
    'org: B, Links: 1, level 2, 2 of 2, children: 0. Up: Root.',
  );
  // A leaf has nothing below: the cursor stays.
  expect(await press(page, 'ArrowDown')).toMatch(/^org: B, /);
  expect(await press(page, 'Home')).toMatch(/^org: A, /);
  expect(await press(page, 'ArrowDown')).toBe(
    'org: A one, Links: 1, level 3, 1 of 2, children: 0. Up: A.',
  );
  expect(await press(page, 'End')).toMatch(/^org: A two, .*level 3, 2 of 2/);
  expect(await press(page, 'ArrowUp')).toMatch(/^org: A, /);
  expect(await press(page, 'ArrowUp')).toMatch(/^org: Root, /);
  expect(await hovered(page)).toMatchObject({ kind: 'node', label: 'Root', pointNumber: 0 });
});

test('a tree: the nodes of a folded subtree are not stops', async ({ page }) => {
  await openInteraction(page, EXAMPLE, { graph: 'tree' });
  await page.evaluate(async () => {
    const chart = (
      window as unknown as {
        __interaction: {
          chart: { restyle(u: Record<string, unknown>, traces?: number[]): Promise<unknown> };
        };
      }
    ).__interaction.chart;
    await chart.restyle({ 'tree.collapsed': [['a']] }, [0]);
  });
  await tabIntoChart(page);
  await press(page, 'ArrowRight');
  // A still has two children, and nothing to go down to: it says that it is folded.
  expect(await press(page, 'ArrowDown')).toBe(
    'org: A, Links: 3, level 2, 1 of 2, children: 2. Folded. Up: Root.',
  );
  expect(await press(page, 'ArrowDown')).toMatch(/^org: A, /);
});

test('a tree: Enter folds a node like a click on it, says so, and the cursor stays on the node', async ({
  page,
}) => {
  await openInteraction(page, EXAMPLE, { graph: 'tree' });
  await tabIntoChart(page);
  await press(page, 'ArrowRight');
  expect(await press(page, 'ArrowDown')).toMatch(
    /^org: A, .*children: 2\. Up: Root\. Down: A one\.$/,
  );
  await events(page, true);
  // The fold is shown over time: the stops are those of the tree it ends in from the start.
  expect(await press(page, 'Enter')).toBe(
    'org: A, Links: 3, level 2, 1 of 2, children: 2. Folded. Up: Root.',
  );
  expect(await collapsed(page)).toEqual(['a']);
  // Enter is still the chart's click on the node.
  const click = (await events(page)).find((e) => e.name === 'click');
  expect(click?.payload.points).toMatchObject([{ kind: 'node', label: 'A', pointNumber: 1 }]);
  await expect(labels(page)).toHaveCount(1);
  await expect(labels(page)).toContainText('A');
  expect(await hovered(page)).toMatchObject({ kind: 'node', label: 'A', pointNumber: 1 });
  // The cursor is on A: nothing below it now, B beside it.
  expect(await press(page, 'ArrowDown')).toMatch(/^org: A, .*Folded\. Up: Root\.$/);
  expect(await press(page, 'ArrowRight')).toMatch(/^org: B, .*2 of 2/);
  expect(await press(page, 'ArrowLeft')).toMatch(/^org: A, .*1 of 2/);
});

test('a tree: Enter unfolds a folded node, and does nothing on a leaf', async ({ page }) => {
  // Without motion a fold is drawn at once, and the next Enter finds the tree at rest.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openInteraction(page, EXAMPLE, { graph: 'tree' });
  await tabIntoChart(page);
  // The root folds too: every other node goes, and the cursor is on the only stop left.
  await press(page, 'ArrowRight');
  expect(await press(page, 'Enter')).toBe(
    'org: Root, Links: 2, level 1, 1 of 1, children: 2. Folded.',
  );
  expect(await collapsed(page)).toEqual(['r']);
  expect(await press(page, 'Enter')).toBe(
    'org: Root, Links: 2, level 1, 1 of 1, children: 2. Down: A.',
  );
  expect(await collapsed(page)).toEqual([]);
  await press(page, 'ArrowDown');
  expect(await press(page, 'Enter')).toMatch(/^org: A, .*children: 2\. Folded\. Up: Root\.$/);
  expect(await press(page, 'Enter')).toBe(
    'org: A, Links: 3, level 2, 1 of 2, children: 2. Up: Root. Down: A one.',
  );
  // A leaf: Enter is a click and no more, and nothing is said again.
  expect(await press(page, 'ArrowDown')).toMatch(/^org: A one, /);
  const said = await announcement(page).textContent();
  await events(page, true);
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await events(page)).some((e) => e.name === 'click')).toBe(true);
  expect(await collapsed(page)).toEqual([]);
  expect(await announcement(page).textContent()).toBe(said);
});

test('a tree: the cursor of a node in a subtree that folds goes to the node it folds into', async ({
  page,
}) => {
  await openInteraction(page, EXAMPLE, { graph: 'tree' });
  await tabIntoChart(page);
  await press(page, 'ArrowRight');
  await press(page, 'ArrowDown');
  await press(page, 'ArrowDown');
  expect(await press(page, 'End')).toMatch(/^org: A two, /);
  await page.evaluate(async () => {
    await (window as unknown as ChartHook).__interaction.chart.restyle(
      { 'tree.collapsed': [['a']] },
      [0],
    );
  });
  await expect(labels(page)).toContainText('A');
  expect(await hovered(page)).toMatchObject({ kind: 'node', label: 'A', pointNumber: 1 });
  expect(await press(page, 'ArrowRight')).toMatch(/^org: B, /);
});

test('a layered graph: ← / → within a rank, ↑ / ↓ along the links', async ({ page }) => {
  await openInteraction(page, EXAMPLE, { graph: 'layered' });
  await tabIntoChart(page);
  const load = await press(page, 'ArrowRight');
  expect(load).toMatch(
    /^pipeline: Load, Links in: 0, out: 2, Group: source, rank 1 of 3, 1 of 1\. Down: (Clean|Enrich)\.$/,
  );
  await expect(labels(page)).toContainText('Load');
  // Font measurements can shift which linked node is nearest across the rank.
  // Follow the announced destination, then Home starts the left-to-right rank traversal.
  const down = load!.includes('Down: Clean.') ? 'Clean' : 'Enrich';
  const first = await press(page, 'ArrowDown');
  expect(first).toBe(
    `pipeline: ${down}, Links in: 1, out: 1, Group: work, rank 2 of 3, ${down === 'Clean' ? 1 : 2} of 2. Up: Load. Down: Report.`,
  );
  expect(await press(page, 'Home')).toBe(
    'pipeline: Clean, Links in: 1, out: 1, Group: work, rank 2 of 3, 1 of 2. Up: Load. Down: Report.',
  );
  expect(await press(page, 'ArrowRight')).toBe(
    'pipeline: Enrich, Links in: 1, out: 1, Group: work, rank 2 of 3, 2 of 2. Up: Load. Down: Report.',
  );
  // The end of the rank: the cursor stays.
  expect(await press(page, 'ArrowRight')).toMatch(/^pipeline: Enrich, /);
  expect(await press(page, 'Home')).toMatch(/^pipeline: Clean, /);
  const report = await press(page, 'ArrowDown');
  expect(report).toMatch(
    /^pipeline: Report, Links in: 2, out: 0, Group: sink, rank 3 of 3, 1 of 1\. Up: (Clean|Enrich)\.$/,
  );
  const up = report!.includes('Up: Clean.') ? 'Clean' : 'Enrich';
  expect(await press(page, 'ArrowUp')).toContain(`pipeline: ${up}, `);
  expect(await press(page, 'ArrowUp')).toMatch(/^pipeline: Load, /);
});

test('a chord diagram: around the ring, and along its ribbons like the links of a graph', async ({
  page,
}) => {
  // Four directed links around the ring: A → B, B → C, C → D, D → A.
  await openInteraction(page, '_dev/interaction-chord');
  await tabIntoChart(page);
  expect(await press(page, 'ArrowRight')).toMatch(/^trace 0: A, .*node 1 of 4\. Down: A → B\.$/);
  await expect(labels(page)).toContainText('A');
  // ← from the first node goes around the ring to the last.
  expect(await press(page, 'ArrowLeft')).toMatch(/^trace 0: D, .*node 4 of 4\. Down: D → A\.$/);
  // ↓: D's ribbon, then the node it leads to; ↑ from a ribbon goes back to its source.
  expect(await press(page, 'ArrowDown')).toMatch(
    /^trace 0: d to a, .*link 1 of 1 of D\. Down: A\.$/,
  );
  expect(await press(page, 'ArrowUp')).toMatch(/^trace 0: D, .*node 4 of 4/);
  await press(page, 'ArrowDown');
  expect(await press(page, 'ArrowDown')).toMatch(/^trace 0: A, .*node 1 of 4/);
});

test('the graph is described: its summary and its edge list', async ({ page }) => {
  await openInteraction(page, EXAMPLE, { table: '1' });
  const described = await page.evaluate(async () => {
    const chart = (
      window as unknown as {
        __interaction: {
          chart: { describe(): Promise<{ summary: string; traces: string[] } | undefined> };
        };
      }
    ).__interaction.chart;
    return chart.describe();
  });
  expect(described?.summary).toBe('Network graph chart.');
  expect(described?.traces).toEqual([
    'Directed network graph "net": 6 nodes, 4 links, 2 groups, at given positions. ' +
      '2 connected components, the largest with 5 nodes, 1 node without links; ' +
      'most connected: A (2 links), B (2), D (2). Groups: core (3 nodes), edge (3).',
  ]);
  // The visible data table is the edge list.
  const table = page.locator('.holochart-data-table').getByRole('table', { name: 'net (4 rows)' });
  await expect(table.getByRole('columnheader')).toHaveText(['Source', 'Target', 'Value']);
  await expect(table.locator('tbody tr')).toHaveText(['AB5', 'BC1', 'DE3', 'AD2']);
});
