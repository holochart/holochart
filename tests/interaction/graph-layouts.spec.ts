import { expect, test, type Page } from '@playwright/test';
import pngjs from 'pngjs';
import { events, openInteraction, toPage, waitForEvent } from './helpers.ts';

const { PNG } = pngjs;

/**
 * What moves in a `graph` trace, on `_dev/interaction-graph-layouts` (backlog G2, G4):
 *
 * - `?case=tree`: a tree of a root, three branches (A, B, C: nodes 1 to 3) and six leaves. A
 *   click on a node that has children folds or unfolds it: a GUI restyle of `tree.collapsed`,
 *   tweened, and at once under reduced motion.
 * - `?case=simulate`: a force layout drawn while it settles (`force.simulate`) next to the same
 *   figure without it. The animation ends by itself on the same picture, does not replay for a
 *   change of style, is skipped under reduced motion, and leaves no frame loop behind when the
 *   chart goes away.
 */
const EXAMPLE = '_dev/interaction-graph-layouts';

interface Nodes {
  x: (number | null)[];
  y: (number | null)[];
  hidden: number[];
}

interface Hook {
  chart: {
    data: { tree?: { collapsed?: unknown } }[];
    restyle(update: unknown, traces?: unknown): Promise<unknown>;
    destroy(): void;
  };
  frames: number;
  lastFrame: number;
  lastRestyle: number;
  nodes(chart?: unknown): Nodes;
  twin: unknown;
  restart(): Promise<void>;
}

declare global {
  interface Window {
    __rafs?: number;
    __ticks?: number;
  }
}

/** The hook of the page, as these tests read it (the page's own type is the other examples'). */
const HOOK = '__interaction';

const nodes = (page: Page): Promise<Nodes> =>
  page.evaluate((key) => (window as unknown as Record<string, Hook>)[key]!.nodes(), HOOK);

const frames = (page: Page): Promise<number> =>
  page.evaluate((key) => (window as unknown as Record<string, Hook>)[key]!.frames, HOOK);

const collapsed = (page: Page): Promise<unknown> =>
  page.evaluate(
    (key) => (window as unknown as Record<string, Hook>)[key]!.chart.data[0]!.tree?.collapsed,
    HOOK,
  );

/** How long after its last `restyle` the chart drew its last frame, in ms. */
const drawnFor = (page: Page): Promise<number> =>
  page.evaluate((key) => {
    const hook = (window as unknown as Record<string, Hook>)[key]!;
    return hook.lastFrame - hook.lastRestyle;
  }, HOOK);

/** Page coordinates of node `i` where calc put it. */
async function nodeOnPage(page: Page, i: number): Promise<{ x: number; y: number }> {
  const at = await nodes(page);
  return toPage(page, at.x[i]!, at.y[i]!);
}

/**
 * Wait until the chart is at rest: it has drawn nothing for `quiet` animation frames in a row
 * (frames, not ms: under load everything that runs on animation frames slows down together).
 * Returns the frames the chart has drawn in all.
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

test.describe('folding a tree', () => {
  test.beforeEach(async ({ page }) => {
    await openInteraction(page, EXAMPLE);
  });

  test('a click on a node with children folds it, and a second click unfolds it', async ({
    page,
  }) => {
    const open = await nodes(page);
    expect(open.hidden).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    await atRest(page);
    await events(page, true);
    const before = await frames(page);

    const a = await nodeOnPage(page, 1);
    await page.mouse.move(a.x, a.y);
    await page.mouse.click(a.x, a.y);
    // The chart restyled itself, like for any change made on it, and still reports the click.
    await waitForEvent(page, 'restyle');
    const click = (await events(page)).find((e) => e.name === 'click');
    expect(click?.payload.points).toMatchObject([{ kind: 'node', label: 'A', pointNumber: 1 }]);
    expect(await collapsed(page)).toEqual(['a']);
    expect((await atRest(page)) - before).toBeGreaterThan(1);
    // The fold was shown over time (half a second), not in the one frame a snap takes.
    expect(await drawnFor(page)).toBeGreaterThan(400);

    const folded = await nodes(page);
    expect(folded.hidden).toEqual([0, 0, 0, 0, 1, 1, 1, 0, 0, 0]);
    // The leaves of A take no room now: the tree is laid out again.
    expect(folded.y[1]).not.toBe(open.y[1]);

    // The node is where the new layout put it; a click there unfolds it.
    await events(page, true);
    const again = await nodeOnPage(page, 1);
    await page.mouse.move(again.x, again.y);
    await page.mouse.click(again.x, again.y);
    await waitForEvent(page, 'restyle');
    expect(await collapsed(page)).toEqual([]);
    await atRest(page);
    const unfolded = await nodes(page);
    expect(unfolded.hidden).toEqual(open.hidden);
    expect(unfolded.x).toEqual(open.x);
    expect(unfolded.y).toEqual(open.y);
  });

  test('the pointer is a hand over a node that folds, and a leaf does nothing', async ({
    page,
  }) => {
    await atRest(page);
    // The chart sets the cursor on the element that takes its pointer events.
    const hand = (): Promise<boolean> =>
      page.evaluate(() =>
        Array.from(document.querySelectorAll<HTMLElement>('*')).some(
          (el) => el.style.cursor === 'pointer',
        ),
      );
    const b = await nodeOnPage(page, 2);
    await page.mouse.move(b.x, b.y);
    await expect.poll(hand).toBe(true);
    const leaf = await nodeOnPage(page, 4);
    await page.mouse.move(leaf.x, leaf.y);
    await expect.poll(hand).toBe(false);
    await events(page, true);
    await page.mouse.click(leaf.x, leaf.y);
    await waitForEvent(page, 'click');
    await page.waitForTimeout(300);
    expect((await events(page)).some((e) => e.name === 'restyle')).toBe(false);
    expect((await nodes(page)).hidden).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  test('hover finds a node where it is drawn after a fold', async ({ page }) => {
    await atRest(page);
    const c = await nodeOnPage(page, 3);
    await page.mouse.move(c.x, c.y);
    await page.mouse.click(c.x, c.y);
    await waitForEvent(page, 'restyle');
    await atRest(page);
    await events(page, true);
    const b = await nodeOnPage(page, 2);
    await page.mouse.move(b.x + 1, b.y + 1);
    const hover = await waitForEvent(page, 'hover');
    expect(hover.payload.points).toMatchObject([{ kind: 'node', label: 'B' }]);
  });

  test('under reduced motion a fold is drawn at once', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openInteraction(page, EXAMPLE);
    await atRest(page);
    const before = await frames(page);
    const a = await nodeOnPage(page, 1);
    await page.mouse.move(a.x, a.y);
    await atRest(page);
    const hovered = await frames(page);
    await page.mouse.click(a.x, a.y);
    await waitForEvent(page, 'restyle');
    const drawn = (await atRest(page)) - hovered;
    expect((await nodes(page)).hidden).toEqual([0, 0, 0, 0, 1, 1, 1, 0, 0, 0]);
    // The new tree, the hover label on it, the cursor: a handful of frames at once, not a tween.
    expect(drawn).toBeLessThan(6);
    expect(await drawnFor(page)).toBeLessThan(350);
    expect(hovered).toBeGreaterThanOrEqual(before);
  });
});

test.describe('force.simulate', () => {
  /** Screenshots of the animated chart and of its static twin, canvas only. */
  async function pictures(page: Page): Promise<[Buffer, Buffer]> {
    const shot = (selector: string): Promise<Buffer> =>
      page.locator(selector).first().screenshot({ animations: 'disabled', scale: 'css' });
    // The twin is the element right after the example's own.
    return [await shot('#twin'), await shot(':has(+ #twin)')];
  }

  /** How many pixels of two screenshots differ by more than a rounding step. */
  function differing(a: Buffer, b: Buffer): number {
    const pa = PNG.sync.read(a);
    const pb = PNG.sync.read(b);
    expect([pa.width, pa.height]).toEqual([pb.width, pb.height]);
    let count = 0;
    for (let i = 0; i < pa.data.length; i += 4) {
      const d =
        Math.abs(pa.data[i]! - pb.data[i]!) +
        Math.abs(pa.data[i + 1]! - pb.data[i + 1]!) +
        Math.abs(pa.data[i + 2]! - pb.data[i + 2]!);
      if (d > 6) count++;
    }
    return count;
  }

  test('the layout settles on screen, ends by itself and ends on the static picture', async ({
    page,
  }) => {
    await openInteraction(page, EXAMPLE, { case: 'simulate' });
    // Still moving right after the first frame: the two pictures differ.
    const [staticEarly, movingEarly] = await pictures(page);
    const early = differing(staticEarly, movingEarly);
    const total = await atRest(page);
    // 600 ticks, four a frame.
    expect(total).toBeGreaterThanOrEqual(150);
    expect(total).toBeLessThan(260);
    const [still, settled] = await pictures(page);
    expect(differing(still, settled)).toBe(0);
    expect(early).toBeGreaterThan(50);
    // The calc of both is the settled layout, from the first frame on.
    const same = await page.evaluate((key) => {
      const hook = (window as unknown as Record<string, Hook>)[key]!;
      return JSON.stringify(hook.nodes()) === JSON.stringify(hook.nodes(hook.twin));
    }, HOOK);
    expect(same).toBe(true);
    // And then nothing: no frame is drawn while nothing changes.
    const later = await frames(page);
    await page.waitForTimeout(600);
    expect(await frames(page)).toBe(later);
    expect(total).toBe(later);
  });

  test('a change of style does not replay it; a change of the layout does', async ({ page }) => {
    await openInteraction(page, EXAMPLE, { case: 'simulate' });
    const total = await atRest(page);
    const restyle = (update: unknown): Promise<void> =>
      page.evaluate(
        async ([key, u]) => {
          await (window as unknown as Record<string, Hook>)[key as string]!.chart.restyle(u, [0]);
        },
        [HOOK, update] as const,
      );
    await restyle({ 'node.color': 'crimson', 'link.width': 3 });
    const styled = await atRest(page);
    expect(styled - total).toBeLessThan(6);
    // Labels are data (a calc edit), but move nothing.
    await restyle({ 'node.label': [['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l']] });
    const labelled = await atRest(page);
    expect(labelled - styled).toBeLessThan(6);
    await restyle({ 'force.charge': -140 });
    const replayed = await atRest(page);
    expect(replayed - labelled).toBeGreaterThanOrEqual(150);
  });

  test('hover follows the nodes while they move', async ({ page }) => {
    await openInteraction(page, EXAMPLE, { case: 'simulate' });
    await atRest(page);
    // Where node 0 ends up, which calc knows from the first frame on.
    const end = await nodeOnPage(page, 0);
    await page.mouse.move(end.x, end.y);
    expect((await waitForEvent(page, 'hover')).payload.points).toMatchObject([
      { kind: 'node', pointNumber: 0 },
    ]);
    // Again from the start, with the pointer waiting there: the node is drawn in the spiral in
    // the middle, so there is nothing to hover yet.
    await page.evaluate((key) => (window as unknown as Record<string, Hook>)[key]!.restart(), HOOK);
    await events(page, true);
    await page.mouse.move(end.x + 1, end.y);
    await page.mouse.move(end.x, end.y);
    await page.waitForTimeout(150);
    expect((await events(page)).some((e) => e.name === 'hover')).toBe(false);
    // It arrives, and a move finds it.
    await atRest(page);
    await page.mouse.move(end.x + 1, end.y);
    await page.mouse.move(end.x, end.y);
    expect((await waitForEvent(page, 'hover')).payload.points).toMatchObject([
      { kind: 'node', pointNumber: 0 },
    ]);
  });

  test('under reduced motion the settled layout is drawn at once', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openInteraction(page, EXAMPLE, { case: 'simulate' });
    const [still, moving] = await pictures(page);
    expect(differing(still, moving)).toBe(0);
    expect(await atRest(page)).toBeLessThan(10);
  });

  test('a chart that goes away in the middle leaves no frame loop behind', async ({ page }) => {
    // Count the animation frames the page asks for, and the frames that pass, from before
    // anything loads. The sandbox asks for one of its own every frame, so what is compared is
    // how many are asked for per frame.
    await page.addInitScript(() => {
      window.__rafs = 0;
      window.__ticks = 0;
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (callback) => {
        window.__rafs = (window.__rafs ?? 0) + 1;
        return raf(callback);
      };
      const tick = (): void => {
        window.__ticks = (window.__ticks ?? 0) + 1;
        raf(tick);
      };
      raf(tick);
    });
    /** Animation frames asked for per frame, over `ms`. */
    const perFrame = async (ms: number): Promise<number> => {
      const read = (): Promise<[number, number]> =>
        page.evaluate(() => [window.__rafs ?? 0, window.__ticks ?? 0]);
      const [rafs0, ticks0] = await read();
      await page.waitForTimeout(ms);
      const [rafs1, ticks1] = await read();
      return (rafs1 - rafs0) / Math.max(1, ticks1 - ticks0);
    };

    await openInteraction(page, EXAMPLE, { case: 'simulate' });
    await atRest(page);
    const idle = await perFrame(500);

    for (let round = 0; round < 3; round++) {
      await page.evaluate(
        (key) => (window as unknown as Record<string, Hook>)[key]!.restart(),
        HOOK,
      );
      // In the middle of the run the simulation asks for a frame after every frame, and so does
      // the chart, to draw it.
      expect(await perFrame(300)).toBeGreaterThan(idle + 0.8);
      await page.evaluate((key) => {
        (window as unknown as Record<string, Hook>)[key]!.chart.destroy();
      }, HOOK);
      await page.waitForTimeout(100);
      // Destroyed with the simulation running: nothing of it asks for frames any more.
      expect(await perFrame(500)).toBeLessThan(idle + 0.2);
    }
  });
});
