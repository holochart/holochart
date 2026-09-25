import { expect, test, type Page } from '@playwright/test';
import { events, openInteraction, waitForEvent } from './helpers.ts';

/**
 * Update menus on `_dev/updatemenus-interaction` (plan E5.10, plotly.js `updatemenus/draw.js`):
 * real clicks and keys on the DOM controls run the button's method through the chart API, store
 * `active` with a relayout, emit `buttonclicked`, toggle with `args2`, only emit with
 * `execute: false`, and follow the figure when every button sets one attribute.
 */
const EXAMPLE = '_dev/updatemenus-interaction';

/** Evaluate against `window.__interaction.chart`. */
function chartValue<T>(page: Page, fn: string): Promise<T> {
  return page.evaluate((body) => {
    const chart = (window as unknown as { __interaction: { chart: unknown } }).__interaction.chart;
    return new Function('chart', `return (${body});`)(chart) as T;
  }, fn);
}

test.beforeEach(async ({ page }) => {
  await openInteraction(page, EXAMPLE);
});

test('buttons: a click restyles, stores active and emits buttonclicked', async ({ page }) => {
  const toolbar = page.getByRole('toolbar', { name: 'Series' });
  await expect(toolbar.getByRole('button', { name: 'Both' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await toolbar.getByRole('button', { name: 'Only b' }).click();
  const clicked = await waitForEvent(page, 'buttonclicked');
  expect(clicked.payload).toMatchObject({ active: 2, label: 'Only b', menu: 0 });
  const restyle = (await events(page)).find((e) => e.name === 'restyle');
  expect(restyle?.payload).toMatchObject({ update: { visible: [false, true] } });
  await expect(toolbar.getByRole('button', { name: 'Only b' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(await chartValue(page, 'chart.fullData.map((t) => t.visible)')).toEqual([false, true]);
  expect(await chartValue(page, 'chart.layout.updatemenus[0].active')).toBe(2);
});

test('buttons: keyboard (Tab to the toolbar, arrows, Enter)', async ({ page }) => {
  const toolbar = page.getByRole('toolbar', { name: 'Series' });
  await toolbar.getByRole('button', { name: 'Both' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(toolbar.getByRole('button', { name: 'Only a' })).toBeFocused();
  await page.keyboard.press('Enter');
  const clicked = await waitForEvent(page, 'buttonclicked');
  expect(clicked.payload).toMatchObject({ active: 1, label: 'Only a' });
  expect(await chartValue(page, 'chart.fullData.map((t) => t.visible)')).toEqual([true, false]);
});

test('dropdown: open, choose with the mouse and with the keyboard', async ({ page }) => {
  const header = page.getByRole('button', { name: /^Mode:/ });
  await expect(header).toHaveAttribute('aria-expanded', 'false');
  await header.click();
  await expect(header).toHaveAttribute('aria-expanded', 'true');
  const list = page.getByRole('listbox', { name: 'Mode' });
  await expect(list).toBeVisible();
  await list.getByRole('option', { name: 'Markers' }).click();
  await expect(header).toHaveAttribute('aria-expanded', 'false');
  await expect(header).toHaveAccessibleName('Mode: Markers');
  expect(await chartValue(page, 'chart.fullData[0].mode')).toBe('markers');

  await header.focus();
  await page.keyboard.press('ArrowDown');
  await expect(list).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(header).toBeFocused();
  await expect(header).toHaveAccessibleName('Mode: Both');
  await expect.poll(() => chartValue(page, 'chart.fullData[0].mode')).toBe('lines+markers');

  await header.click();
  await page.keyboard.press('Escape');
  await expect(header).toHaveAttribute('aria-expanded', 'false');
});

test('relayout buttons follow the figure (simple binding)', async ({ page }) => {
  const toolbar = page.getByRole('toolbar', { name: 'Y axis' });
  await toolbar.getByRole('button', { name: 'Log' }).click();
  await expect.poll(() => chartValue(page, 'chart.fullLayout.yaxis.type')).toBe('log');
  // Changed elsewhere: the menu follows.
  await chartValue(page, "chart.relayout({ 'yaxis.type': 'linear' })");
  await expect(toolbar.getByRole('button', { name: 'Linear' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(await chartValue(page, 'chart.layout.updatemenus[2].active')).toBe(0);
});

test('args2 toggles and execute:false only emits', async ({ page }) => {
  const grid = page.getByRole('button', { name: 'Hide grid' });
  await grid.click();
  await expect.poll(() => chartValue(page, 'chart.fullLayout.yaxis.showgrid')).toBe(false);
  await expect(grid).toHaveAttribute('aria-pressed', 'true');
  await grid.click();
  await expect.poll(() => chartValue(page, 'chart.fullLayout.yaxis.showgrid')).toBe(true);
  await expect(grid).toHaveAttribute('aria-pressed', 'false');

  await events(page, true);
  const custom = page.getByRole('button', { name: 'Custom' });
  await expect(custom).not.toHaveAttribute('aria-pressed', /.*/);
  await custom.click();
  const clicked = await waitForEvent(page, 'buttonclicked');
  expect(clicked.payload).toMatchObject({ label: 'Custom' });
  expect((await events(page)).some((e) => e.name === 'relayout')).toBe(false);
});

test('pressing a menu does not start a zoom', async ({ page }) => {
  const before = await chartValue<number[]>(page, 'chart.fullLayout.xaxis.range');
  const box = await page.getByRole('button', { name: 'Only a' }).boundingBox();
  if (!box) throw new Error('no button');
  await page.mouse.move(box.x + 5, box.y + 5);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + 150, { steps: 5 });
  await page.mouse.up();
  expect(await chartValue<number[]>(page, 'chart.fullLayout.xaxis.range')).toEqual(before);
});
