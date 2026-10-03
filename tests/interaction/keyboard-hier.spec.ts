import { expect, test } from '@playwright/test';
import { events, openInteraction, waitForEvent } from './helpers.ts';
import { level } from './hierarchy.ts';
import { anchor, labels, press, tabIntoChart, target, trackAnchors } from './keyboard-helpers.ts';

/**
 * Keyboard navigation of the hierarchy and flow traces (backlog S2.14) with real key presses:
 * sunburst, treemap and icicle nodes along the tree (← / → siblings, ↑ parent, ↓ first child,
 * Enter drills and the cursor stays on its node), sankey nodes and links along the flow. Each
 * stop shows the hover label of its element and announces it with its place in the structure.
 */

test.describe('sunburst', () => {
  test.beforeEach(async ({ page }) => {
    await openInteraction(page, '_dev/interaction-sunburst');
    await tabIntoChart(page);
  });

  test('arrows walk the tree and announce each node like its hover label', async ({ page }) => {
    await expect(target(page)).toBeFocused();
    expect(await press(page, 'ArrowRight')).toBe(
      'trace 0: Eve, 10, 100% of Eve, level 1, 1 of 1, children: 5.',
    );
    await expect(labels(page)).toHaveCount(1);
    await expect(labels(page)).toContainText('Eve');
    // Down: the first child (children are sorted by value).
    expect(await press(page, 'ArrowDown')).toBe(
      'trace 0: Seth, 12, 35% of Eve, level 2, 1 of 5, children: 2.',
    );
    await expect(labels(page)).toContainText('35% of Eve');
    expect(await press(page, 'ArrowRight')).toMatch(
      /^trace 0: Cain, 14, .*level 2, 2 of 5, children: 0\.$/,
    );
    expect(await press(page, 'End')).toMatch(/^trace 0: Azura, 4, .*level 2, 5 of 5/);
    expect(await press(page, 'Home')).toMatch(/^trace 0: Seth, /);
    expect(await press(page, 'ArrowDown')).toMatch(
      /^trace 0: Enos, 10, .* of Seth, level 3, 1 of 2/,
    );
    expect(await press(page, 'ArrowUp')).toMatch(/^trace 0: Seth, /);
    expect(await press(page, 'ArrowUp')).toMatch(/^trace 0: Eve, /);
    const hovers = (await events(page)).filter((e) => e.name === 'hover');
    expect(hovers.at(-1)?.payload.points?.[0]).toMatchObject({ curveNumber: 0, pointNumber: 0 });
  });

  test('Enter drills into a node and the cursor stays on it', async ({ page }) => {
    await press(page, 'ArrowRight');
    await press(page, 'ArrowDown');
    await events(page, true);
    await page.keyboard.press('Enter');
    await waitForEvent(page, 'restyle');
    await expect.poll(() => level(page)).toBe('Seth');
    // Seth is the entry now: its children are one step down, nothing is beside it.
    expect(await press(page, 'ArrowRight')).toMatch(
      /^trace 0: Seth, 12, .*level 2, 1 of 1, children: 2\.$/,
    );
    expect(await press(page, 'ArrowDown')).toMatch(/^trace 0: Enos, /);
  });
});

for (const type of ['treemap', 'icicle'] as const) {
  test(`${type}: arrows walk the tiles along the tree`, async ({ page }) => {
    await openInteraction(page, `_dev/interaction-${type}`);
    await tabIntoChart(page);
    expect(await press(page, 'ArrowRight')).toBe(
      'trace 0: Eve, 60, 100% of Eve, level 1, 1 of 1, children: 4.',
    );
    expect(await press(page, 'ArrowDown')).toBe(
      'trace 0: Seth, 30, 50% of Eve, level 2, 1 of 4, children: 2.',
    );
    await expect(labels(page)).toHaveCount(1);
    await expect(labels(page)).toContainText('50% of Eve');
    expect(await press(page, 'ArrowRight')).toBe(
      'trace 0: Cain, 15, 25% of Eve, level 2, 2 of 4, children: 0.',
    );
    // A leaf has nothing below: the cursor stays (and says so again).
    expect(await press(page, 'ArrowDown')).toMatch(/^trace 0: Cain, /);
    expect(await press(page, 'End')).toMatch(/level 2, 4 of 4/);
    expect(await press(page, 'ArrowUp')).toMatch(/^trace 0: Eve, /);
  });
}

test('sankey: arrows walk the nodes, and the links down and up the flow', async ({ page }) => {
  await openInteraction(page, '_dev/sankey-drag');
  await trackAnchors(page);
  await tabIntoChart(page);
  // Nodes in reading order, each with its value (the label's secondary box).
  expect(await press(page, 'ArrowRight')).toBe(
    'trace 0: A, Incoming flow count: 0, Outgoing flow count: 1, 6.00, 1 of 5.',
  );
  await expect(labels(page)).toHaveCount(1);
  await expect(labels(page)).toContainText('Outgoing flow count: 1');
  // The label sits on its node: a pointer at its anchor hovers the same node.
  const onA = await anchor(page);
  expect(await press(page, 'ArrowRight')).toMatch(/^trace 0: B, .*4\.00, 2 of 5\.$/);
  await expect(labels(page)).toContainText('4.00');
  await page.mouse.move(onA.x, onA.y);
  await expect(labels(page)).toContainText('6.00');
  await page.mouse.move(0, 0);
  await expect(labels(page)).toHaveCount(0);
  // Down: the node's first outgoing link, then the link's target.
  expect(await press(page, 'ArrowDown')).toBe(
    'trace 0: b to c, Source: B, Target: C, 4.00, 1 of 1.',
  );
  expect(await press(page, 'ArrowDown')).toMatch(/^trace 0: C, Incoming flow count: 2, /);
  // Up: the node's first incoming link, then that link's source.
  expect(await press(page, 'ArrowUp')).toMatch(/^trace 0: a to c, Source: A, Target: C, /);
  expect(await press(page, 'ArrowUp')).toMatch(/^trace 0: A, /);
  expect(await press(page, 'End')).toMatch(/^trace 0: E, .*5 of 5\.$/);
  const hovers = (await events(page)).filter((e) => e.name === 'hover');
  expect(hovers.length).toBeGreaterThan(5);
});
