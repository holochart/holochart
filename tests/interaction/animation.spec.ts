import { expect, test, type Page } from '@playwright/test';
import { events, openInteraction } from './helpers.ts';

/**
 * Frames and `animate` with the controls on `_dev/animation-interaction` (plan E7.4, E5.11;
 * plotly.js `Plotly.animate` and `sliders/draw.js`): the Play button plays the year frames from
 * the current one, the year slider follows playback (`animatingframe`) without running its steps,
 * Pause drops the queued frames, a slider step animates to its frame. Frames last 250 ms.
 */
const EXAMPLE = '_dev/animation-interaction';
const YEARS = Array.from({ length: 12 }, (_, i) => String(1952 + 5 * i));

function chartValue<T>(page: Page, fn: string): Promise<T> {
  return page.evaluate((body) => {
    const chart = (window as unknown as { __interaction: { chart: unknown } }).__interaction.chart;
    return new Function('chart', `return (${body});`)(chart) as T;
  }, fn);
}

/** Names of the frames played so far (`animatingframe`). */
async function played(page: Page): Promise<string[]> {
  return (await events(page))
    .filter((e) => e.name === 'animatingframe')
    .map((e) => String(e.payload['name']));
}

test.beforeEach(async ({ page }) => {
  await openInteraction(page, EXAMPLE);
});

test('Play plays the frames in order and the slider follows each one', async ({ page }) => {
  const slider = page.getByRole('slider', { name: 'Year' });
  await expect(slider).toHaveAttribute('aria-valuenow', '0');
  await page.getByRole('button', { name: 'Play' }).click();
  await expect.poll(async () => (await played(page)).length, { timeout: 15_000 }).toBe(12);
  expect(await played(page)).toEqual(YEARS);
  await expect.poll(() => events(page).then((e) => e.at(-1)?.name)).toBe('animated');
  await expect(slider).toHaveAttribute('aria-valuenow', '11');
  await expect(slider).toHaveAttribute('aria-valuetext', 'Year: 2007');
  expect(await chartValue(page, 'chart.fullLayout._currentFrame')).toBe('2007');
  expect(await chartValue(page, 'chart.layout.sliders[0].active')).toBe(11);
  // The slider moved without running its steps (Plotly: `doCallback` false).
  const changes = (await events(page)).filter((e) => e.name === 'sliderchange');
  expect(changes.length).toBe(11);
  expect(changes.every((e) => e.payload['interaction'] === false)).toBe(true);
  // The last frame's data are drawn.
  const x = await chartValue<number[]>(page, 'Array.from(chart.fullData[0].x)');
  const frameX = await chartValue<number[]>(page, 'chart.frames[11].data[0].x');
  expect(x).toEqual(frameX);
});

test('Pause stops after the current frame; Play resumes from it', async ({ page }) => {
  await page.getByRole('button', { name: 'Play' }).click();
  await expect.poll(async () => (await played(page)).length).toBeGreaterThanOrEqual(3);
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect
    .poll(() => events(page).then((e) => e.some((x) => x.name === 'animated')))
    .toBe(true);
  expect((await events(page)).some((e) => e.name === 'animationinterrupted')).toBe(true);
  const stopped = await played(page);
  const current = stopped.at(-1) as string;
  expect(stopped.length).toBeLessThan(12);
  // Nothing else plays.
  await page.waitForTimeout(700);
  expect(await played(page)).toEqual(stopped);
  expect(await chartValue(page, 'chart.fullLayout._currentFrame')).toBe(current);
  const slider = page.getByRole('slider', { name: 'Year' });
  await expect(slider).toHaveAttribute('aria-valuetext', `Year: ${current}`);

  await events(page, true);
  await page.getByRole('button', { name: 'Play' }).click();
  await expect
    .poll(async () => (await played(page)).length, { timeout: 15_000 })
    .toBeGreaterThan(0);
  const next = YEARS[YEARS.indexOf(current) + 1];
  expect((await played(page))[0]).toBe(next);
});

test('a slider step animates to its frame', async ({ page }) => {
  const slider = page.getByRole('slider', { name: 'Year' });
  await slider.focus();
  await page.keyboard.press('End');
  await expect.poll(async () => played(page)).toEqual(['2007']);
  await expect.poll(() => chartValue(page, 'chart.fullLayout._currentFrame')).toBe('2007');
  await expect
    .poll(() => chartValue<number[]>(page, 'Array.from(chart.fullData[1].y)'))
    .toEqual(await chartValue<number[]>(page, 'chart.frames[11].data[1].y'));
  const change = (await events(page)).find((e) => e.name === 'sliderchange');
  expect(change?.payload).toMatchObject({ label: '2007', interaction: true });
});
