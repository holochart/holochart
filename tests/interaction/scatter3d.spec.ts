import { expect, test, type Page } from '@playwright/test';
import { events, openInteraction, waitForEvent, type LoggedEvent } from './helpers.ts';

/**
 * `scatter3d` hover, picking, spikes, clicks, legend and annotations on `scatter3d/interaction`
 * (plan E14.1d, E20.4): hovering a point (GPU-picked, asynchronously) shows its `x: …`, `y: …`,
 * `z: …` label at the point's projection and emits `hover` with `x`, `y`, `z`; spikes run from it
 * to the walls; a click emits the hovered point; orbiting hides the label, which comes back at
 * the point's new place; a legend click hides a trace from hover; a click on an annotation with
 * `captureevents` emits `clickannotation`.
 *
 * The example: 640×400 px, 20 px margins, one scene over the plot area with a fixed camera;
 * `alpha` (trace 0) has 5 points on the diagonal, `beta` (trace 1) 3 with a hovertemplate.
 */
const EXAMPLE = 'scatter3d/interaction';

type Point = { x: number; y: number };

/** Page px of point `i` of trace `trace` for the current camera. */
async function pointAt(page: Page, trace: number, i: number): Promise<Point> {
  return page.evaluate(
    ([t, k]) => {
      const hook = (
        window as unknown as {
          __interaction: {
            chart: { three: { root: { canvas: HTMLCanvasElement } } };
            project(trace: number, i: number): { x: number; y: number };
          };
        }
      ).__interaction;
      const box = hook.chart.three.root.canvas.getBoundingClientRect();
      const p = hook.project(t, k);
      return { x: box.left + p.x, y: box.top + p.y };
    },
    [trace, i] as const,
  );
}

const labels = (page: Page) => page.locator('.holochart-hoverlabel').filter({ visible: true });

/** Whether the scene's spike lines are drawn. */
async function spikesShown(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const hook = (
      window as unknown as {
        __interaction: {
          chart: {
            three: {
              viewports: {
                scene: {
                  traverse(fn: (o: { name: string; visible: boolean }) => void): void;
                };
              }[];
            };
          };
        };
      }
    ).__interaction;
    let shown = false;
    for (const v of hook.chart.three.viewports) {
      v.scene.traverse((o) => {
        if (o.name === 'holochart:scene-spikes' && o.visible) shown = true;
      });
    }
    return shown;
  });
}

type EventPoint = { curveNumber: number; pointNumber: number; x: unknown; y: unknown; z: unknown };

function firstPoint(e: LoggedEvent): EventPoint {
  return (e.payload['points'] as EventPoint[])[0]!;
}

/** Move to a point and wait for its hover (picks resolve asynchronously). */
async function hoverPoint(page: Page, trace: number, i: number): Promise<LoggedEvent> {
  const p = await pointAt(page, trace, i);
  await page.mouse.move(p.x - 3, p.y - 3);
  await page.mouse.move(p.x, p.y, { steps: 2 });
  await expect
    .poll(
      async () =>
        (await events(page)).some(
          (e) =>
            e.name === 'hover' &&
            firstPoint(e).curveNumber === trace &&
            firstPoint(e).pointNumber === i,
        ),
      { timeout: 15_000 },
    )
    .toBe(true);
  return (await events(page)).filter((e) => e.name === 'hover').at(-1)!;
}

test.describe('scatter3d interaction', () => {
  test.beforeEach(async ({ page }) => {
    await openInteraction(page, EXAMPLE);
  });

  test('hover shows x, y, z at the projected point and emits them', async ({ page }) => {
    const hover = await hoverPoint(page, 0, 2);
    const p = firstPoint(hover);
    expect(p).toMatchObject({ curveNumber: 0, pointNumber: 2, x: 2, y: 2, z: 2 });
    const label = labels(page).first();
    await expect(label).toContainText('x: 2');
    await expect(label).toContainText('y: 2');
    await expect(label).toContainText('z: 2');
    await expect(label).toContainText('a2');
    // The label's arrow points at the point: its box starts beside it.
    const at = await pointAt(page, 0, 2);
    const box = (await label.boundingBox())!;
    const dx = Math.min(Math.abs(box.x - at.x), Math.abs(box.x + box.width - at.x));
    expect(dx).toBeLessThan(20);
    expect(at.y).toBeGreaterThan(box.y - 20);
    expect(at.y).toBeLessThan(box.y + box.height + 20);
  });

  test('hovertemplate formats z', async ({ page }) => {
    await hoverPoint(page, 1, 1);
    await expect(labels(page).first()).toHaveText(/beta b1: 3\.0/);
  });

  test('spikes are drawn to the walls while a point is hovered', async ({ page }) => {
    expect(await spikesShown(page)).toBe(false);
    await hoverPoint(page, 0, 3);
    await expect.poll(() => spikesShown(page)).toBe(true);
    await page.mouse.move(5, 5);
    await expect.poll(() => spikesShown(page)).toBe(false);
  });

  test('a click emits the hovered point', async ({ page }) => {
    await hoverPoint(page, 0, 1);
    await events(page, true);
    await page.mouse.down();
    await page.mouse.up();
    const click = await waitForEvent(page, 'click');
    expect(firstPoint(click)).toMatchObject({ curveNumber: 0, pointNumber: 1, x: 1, y: 1, z: 1 });
  });

  test('orbiting hides the label, which comes back at the new place', async ({ page }) => {
    await hoverPoint(page, 0, 4);
    const before = await pointAt(page, 0, 4);
    await events(page, true);
    await page.mouse.down();
    await page.mouse.move(before.x + 80, before.y + 10, { steps: 8 });
    await page.mouse.up();
    await waitForEvent(page, 'unhover');
    await expect(labels(page)).toHaveCount(0);
    await waitForEvent(page, 'relayout');
    const after = await pointAt(page, 0, 4);
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(10);
    await events(page, true);
    await hoverPoint(page, 0, 4);
    const box = (await labels(page).first().boundingBox())!;
    expect(after.y).toBeGreaterThan(box.y - 20);
    expect(after.y).toBeLessThan(box.y + box.height + 20);
  });

  test('a trace hidden from the legend is not hovered', async ({ page }) => {
    const beta = await pointAt(page, 1, 0);
    const item = page
      .getByRole('toolbar', { name: 'Legend', exact: true })
      .getByRole('button', { name: 'beta', exact: true });
    const box = (await item.boundingBox())!;
    await page.mouse.click(box.x + 20, box.y + box.height / 2);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as unknown as { __interaction: { chart: { data: { visible?: unknown }[] } } })
              .__interaction.chart.data[1]!.visible,
        ),
      )
      .toBe('legendonly');
    await events(page, true);
    await page.mouse.move(beta.x, beta.y, { steps: 3 });
    await page.waitForTimeout(600);
    const hovers = (await events(page)).filter((e) => e.name === 'hover');
    expect(hovers.every((e) => firstPoint(e).curveNumber !== 1)).toBe(true);
    // Showing it again brings its hover back.
    await page.mouse.click(box.x + 20, box.y + box.height / 2);
    await hoverPoint(page, 1, 0);
  });

  test('a click on an annotation with captureevents emits clickannotation', async ({ page }) => {
    const head = await pointAt(page, 0, 2);
    await page.mouse.click(head.x + 40, head.y - 40);
    const click = await waitForEvent(page, 'clickannotation');
    expect(click.payload['index']).toBe(0);
  });
});
