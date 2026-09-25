import { expect, test, type Page } from '@playwright/test';
import { dragBetween, events, openInteraction, waitForEvent } from './helpers.ts';

/**
 * Parallel-coordinates pointer scenarios on `parcoords/interaction` (plan E10.10, E20.4): brushing
 * an axis restyles `dimensions[i].constraintrange` (one range, several with `multiselect`, a new
 * range replacing the old without it), a click on a range removes it and a click elsewhere on the
 * axis clears it, and dragging an axis label reorders the dimensions with a restyle of
 * `dimensions`. None of it zooms or relayouts anything.
 *
 * The example: 640×400 px, domain x 60–580 and y 80–360, axes Alpha, Beta (no multiselect) and
 * Gamma at x = 60, 320 and 580, each 0–100 from y = 358 (bottom) to y = 82 (top).
 */
const EXAMPLE = 'parcoords/interaction';
const AXES = { alpha: 60, beta: 320, gamma: 580 } as const;

/** Container y of a value on the 0–100 axes. */
const yOf = (v: number): number => 358 - 2.76 * v;

interface Box {
  left: number;
  top: number;
}

async function canvasBox(page: Page): Promise<Box> {
  return page.evaluate(() => {
    const hook = (
      window as unknown as {
        __interaction: { chart: { three: { root: { canvas: HTMLCanvasElement } } } };
      }
    ).__interaction;
    const r = hook.chart.three.root.canvas.getBoundingClientRect();
    return { left: r.left, top: r.top };
  });
}

const at = (box: Box, x: number, y: number) => ({ x: box.left + x, y: box.top + y });

/** Brush `axis` from value `from` to `to`; returns the restyle it emitted. */
async function brush(page: Page, box: Box, axis: number, from: number, to: number) {
  await events(page, true);
  await dragBetween(page, at(box, axis, yOf(from)), at(box, axis, yOf(to)));
  return waitForEvent(page, 'restyle');
}

async function click(page: Page, box: Box, axis: number, v: number) {
  await events(page, true);
  const p = at(box, axis, yOf(v));
  await page.mouse.click(p.x, p.y);
  return waitForEvent(page, 'restyle');
}

/** The constraint ranges of dimension `i` in `fullData`. */
async function constraint(page: Page, i: number): Promise<unknown> {
  return page.evaluate(
    (k) =>
      (
        window as unknown as {
          __interaction: {
            chart: { fullData: readonly { dimensions: { constraintrange?: unknown }[] }[] };
          };
        }
      ).__interaction.chart.fullData[0]?.dimensions[k]?.constraintrange ?? null,
    i,
  );
}

/** Round every number in a nested array. */
const rounded = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(rounded) : typeof v === 'number' ? Math.round(v) : v;

test.describe('parcoords interaction', () => {
  test.beforeEach(async ({ page }) => {
    await openInteraction(page, EXAMPLE);
    await events(page, true);
  });

  test('brushing an axis restyles its constraint range; multiselect adds ranges', async ({
    page,
  }) => {
    const box = await canvasBox(page);
    const first = await brush(page, box, AXES.alpha, 20, 60);
    expect(first.payload['traces']).toEqual([0]);
    const update = first.payload['update'] as Record<string, unknown>;
    expect(Object.keys(update)).toEqual(['dimensions[0].constraintrange']);
    expect(rounded(update['dimensions[0].constraintrange'])).toEqual([[20, 60]]);
    expect(rounded(await constraint(page, 0))).toEqual([20, 60]);

    // A second brush on the same axis adds a range (multiselect is on by default).
    const second = await brush(page, box, AXES.alpha, 75, 90);
    expect(
      rounded(
        (second.payload['update'] as Record<string, unknown>)['dimensions[0].constraintrange'],
      ),
    ).toEqual([
      [
        [20, 60],
        [75, 90],
      ],
    ]);

    // Dragging the end of a range extends it.
    const grown = await brush(page, box, AXES.alpha, 89, 95);
    expect(rounded(await constraint(page, 0))).toEqual([
      [20, 60],
      [75, 95],
    ]);
    expect(grown.payload['traces']).toEqual([0]);

    // A click on a range's body removes that range; a click off the ranges clears the axis.
    await click(page, box, AXES.alpha, 40);
    expect(rounded(await constraint(page, 0))).toEqual([75, 95]);
    const cleared = await click(page, box, AXES.alpha, 10);
    expect(cleared.payload['update']).toEqual({ 'dimensions[0].constraintrange': null });
    expect(await constraint(page, 0)).toBeNull();
    expect((await events(page)).filter((e) => e.name === 'relayout')).toEqual([]);
  });

  test('without multiselect a new brush replaces the range', async ({ page }) => {
    const box = await canvasBox(page);
    await brush(page, box, AXES.beta, 10, 30);
    const second = await brush(page, box, AXES.beta, 50, 70);
    expect(
      rounded(
        (second.payload['update'] as Record<string, unknown>)['dimensions[1].constraintrange'],
      ),
    ).toEqual([[50, 70]]);
    expect(rounded(await constraint(page, 1))).toEqual([50, 70]);
  });

  test('dragging an axis label reorders the dimensions', async ({ page }) => {
    const box = await canvasBox(page);
    // "Alpha" is centered on x = 60, its baseline 28 px above the domain (y = 52).
    await dragBetween(page, at(box, AXES.alpha, 47), at(box, 420, 47), 12);
    const restyle = await waitForEvent(page, 'restyle');
    const dims = (restyle.payload['update'] as { dimensions: { label: string }[][] }).dimensions;
    expect(dims[0]!.map((d) => d.label)).toEqual(['Beta', 'Alpha', 'Gamma']);
    const labels = await page.evaluate(() =>
      (
        window as unknown as {
          __interaction: { chart: { fullData: readonly { dimensions: { label: string }[] }[] } };
        }
      ).__interaction.chart.fullData[0]!.dimensions.map((d) => d.label),
    );
    expect(labels).toEqual(['Beta', 'Alpha', 'Gamma']);
    expect((await events(page)).filter((e) => e.name === 'relayout')).toEqual([]);
  });
});
