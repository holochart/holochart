import { expect, test, type Page } from '@playwright/test';
import { events, openInteraction, waitForEvent } from './helpers.ts';

/**
 * The slider on `_dev/sliders-interaction` (plan E5.11, plotly.js `sliders/draw.js`): pointer
 * presses and drags snap to steps, keys step and jump, every change emits `sliderchange` and
 * runs the step's `restyle`, drags emit `sliderstart` / `sliderend`.
 */
const EXAMPLE = '_dev/sliders-interaction';

function chartValue<T>(page: Page, fn: string): Promise<T> {
  return page.evaluate((body) => {
    const chart = (window as unknown as { __interaction: { chart: unknown } }).__interaction.chart;
    return new Function('chart', `return (${body});`)(chart) as T;
  }, fn);
}

test.beforeEach(async ({ page }) => {
  await openInteraction(page, EXAMPLE);
});

test('the handle is an accessible slider', async ({ page }) => {
  const slider = page.getByRole('slider', { name: 'Size' });
  await expect(slider).toHaveAttribute('aria-valuenow', '0');
  await expect(slider).toHaveAttribute('aria-valuemax', '9');
  await expect(slider).toHaveAttribute('aria-valuetext', 'Size: 4');
});

test('keyboard: arrows, PageUp, End, Home run the steps', async ({ page }) => {
  const slider = page.getByRole('slider', { name: 'Size' });
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  const change = await waitForEvent(page, 'sliderchange');
  expect(change.payload).toMatchObject({
    active: 1,
    label: '6',
    interaction: true,
    previousActive: 0,
  });
  await expect.poll(() => chartValue(page, 'chart.fullData[0].marker.size')).toBe(6);
  await page.keyboard.press('End');
  await expect(slider).toHaveAttribute('aria-valuenow', '9');
  await expect.poll(() => chartValue(page, 'chart.fullData[0].marker.size')).toBe(22);
  await page.keyboard.press('Home');
  await page.keyboard.press('PageUp');
  await expect(slider).toHaveAttribute('aria-valuenow', '1');
  await expect(slider).toHaveAttribute('aria-valuetext', 'Size: 6');
  await expect.poll(() => chartValue(page, 'chart.layout.sliders[0].active')).toBe(1);
});

test('pointer: press and drag snap to steps; start and end events', async ({ page }) => {
  const track = page.locator('.hc-slider-track');
  const box = await track.boundingBox();
  if (!box) throw new Error('no track');
  const y = box.y + 8;
  await events(page, true);
  await page.mouse.move(box.x + box.width * 0.5, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 2, y, { steps: 8 });
  await page.mouse.up();
  await waitForEvent(page, 'sliderend');
  const names = (await events(page)).map((e) => e.name).filter((n) => n.startsWith('slider'));
  expect(names[0]).toBe('sliderstart');
  expect(names.at(-1)).toBe('sliderend');
  expect(names.filter((n) => n === 'sliderchange').length).toBeGreaterThanOrEqual(2);
  await expect(page.getByRole('slider', { name: 'Size' })).toHaveAttribute('aria-valuenow', '9');
  await expect.poll(() => chartValue(page, 'chart.fullData[0].marker.size')).toBe(22);
});

test('follows the figure when the traced attribute changes elsewhere', async ({ page }) => {
  await chartValue(page, "chart.restyle({ 'marker.size': 10 })");
  const slider = page.getByRole('slider', { name: 'Size' });
  await expect(slider).toHaveAttribute('aria-valuenow', '3');
  const change = await waitForEvent(page, 'sliderchange');
  expect(change.payload).toMatchObject({ active: 3, interaction: false });
});
