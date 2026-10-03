import { expect, test, type Page } from '@playwright/test';
import { events, openInteraction, ranges, waitForEvent } from './helpers.ts';

/**
 * Keyboard navigation (plan E6.5) and keyboard access to the controls (E17.4) on
 * `_dev/keyboard-navigation`: Tab order through the plot area and the controls, the virtual cursor
 * (arrows, Page Up / Down, Home / End) with its hover label and live-region announcements, Enter
 * emitting `click`, zoom / pan / reset through GUI relayouts, the legend's key targets and the
 * controls' `aria-pressed` states. Real key presses (`page.keyboard`).
 */
const EXAMPLE = '_dev/keyboard-navigation';

test.beforeEach(async ({ page }) => {
  await openInteraction(page, EXAMPLE);
});

/** The plot area's focus target. */
function target(page: Page) {
  return page.getByRole('application', { name: /^Chart data/ });
}

/** The live region's text. */
function announcement(page: Page) {
  return page.locator('.holochart-live');
}

/** What has focus: a short description for tab-order assertions. */
function focused(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return '';
    const name = el.getAttribute('aria-label') ?? el.textContent?.trim() ?? '';
    const group = el.closest('[role="toolbar"], [role="group"]')?.getAttribute('aria-label');
    return `${el.getAttribute('role') ?? el.tagName.toLowerCase()}:${group ? `${group}/` : ''}${name}`;
  });
}

/** Focus the plot area with a real Tab from just before the chart. */
async function tabIntoChart(page: Page): Promise<void> {
  await page.evaluate(() => {
    const chart = (window as unknown as { __interaction: { chart: { element: HTMLElement } } })
      .__interaction.chart.element;
    chart.tabIndex = -1;
    chart.focus();
  });
  await page.keyboard.press('Tab');
  await page.evaluate(() => {
    const chart = (window as unknown as { __interaction: { chart: { element: HTMLElement } } })
      .__interaction.chart.element;
    chart.removeAttribute('tabindex');
  });
}

test('Tab focuses the plot area first, with a focus ring', async ({ page }) => {
  await tabIntoChart(page);
  await expect(target(page)).toBeFocused();
  await expect(target(page)).toHaveCSS('outline-width', '2px');
  await expect(target(page)).toHaveCSS('outline-style', 'solid');
  // The ring surrounds the plot area.
  const box = await target(page).boundingBox();
  const plot = await page.evaluate(() => {
    const chart = (
      window as unknown as {
        __interaction: {
          chart: {
            element: HTMLElement;
            subplots: Map<string, { rect: { x: number; y: number; width: number } }>;
          };
        };
      }
    ).__interaction.chart;
    const r = chart.element.getBoundingClientRect();
    const sp = chart.subplots.get('xy')!.rect;
    return { x: r.left + sp.x, y: r.top + sp.y, width: sp.width };
  });
  expect(box?.x).toBeCloseTo(plot.x, 0);
  expect(box?.y).toBeCloseTo(plot.y, 0);
  expect(box?.width).toBeCloseTo(plot.width, 0);
  await page.keyboard.press('Tab');
  await expect(target(page)).toHaveCSS('outline-width', '0px');
});

test('controls are reachable in the documented tab order', async ({ page, browserName }) => {
  // Known issue (docs/release/browser-support.md, W1): the range selector's buttons have no
  // `tabindex`, and WebKit only tabs to buttons that have one (the legend, modebar, update menu
  // and slider set it), so Tab leaves the chart after the toolbar.
  test.fixme(browserName === 'webkit', 'W1: range selector buttons are not tab stops on WebKit');
  await tabIntoChart(page);
  const order = [await focused(page)];
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    order.push(await focused(page));
  }
  expect(order).toEqual([
    'application:Chart data: arrow keys move between points, + and - zoom',
    'button:Legend/Revenue',
    'button:Bar mode/Group',
    'slider:Marker size',
    expect.stringMatching(/^button:Chart toolbar\//),
    'button:Range selector: Month/3m (Last 3 months)',
    'button:Range selector: Month/All',
  ]);
  // Shift + Tab goes back through the same stops.
  await page.keyboard.press('Shift+Tab');
  expect(await focused(page)).toBe('button:Range selector: Month/3m (Last 3 months)');
});

test('arrows, Page Up / Down, Home / End move the cursor and announce each point', async ({
  page,
}) => {
  await tabIntoChart(page);
  await events(page, true);
  await page.keyboard.press('ArrowRight');
  await expect(announcement(page)).toHaveText(/^Revenue: \(Jan 1, 2024, 12\), point 1 of 6\.\s?$/);
  const label = page.locator('.holochart-hoverlabel').filter({ visible: true });
  await expect(label).toHaveCount(1);
  await expect(label).toContainText('Jan 1, 2024, 12');
  await page.keyboard.press('ArrowRight');
  await expect(announcement(page)).toHaveText(/^Revenue: .*15\), point 2 of 6\./);
  await page.keyboard.press('End');
  await expect(announcement(page)).toHaveText(/point 6 of 6\./);
  // Page Down: the next trace in legend order, at the same month.
  await page.keyboard.press('PageDown');
  await expect(announcement(page)).toHaveText(/^Costs: .*11\), point 6 of 6\./);
  await page.keyboard.press('Home');
  await expect(announcement(page)).toHaveText(/^Costs: .*8\), point 1 of 6\./);
  // Up: the trace drawn next above at this month (Revenue 12 over Costs 8, Target 14 over both).
  await page.keyboard.press('ArrowUp');
  await expect(announcement(page)).toHaveText(/^Revenue: .*12\), point 1 of 6\./);
  await page.keyboard.press('ArrowUp');
  await expect(announcement(page)).toHaveText(/^Target: .*14\), point 1 of 6\./);
  await page.keyboard.press('PageUp');
  await expect(announcement(page)).toHaveText(/^Costs: /);
  const hovers = (await events(page)).filter((e) => e.name === 'hover');
  expect(hovers.at(-1)?.payload.points?.[0]).toMatchObject({ curveNumber: 1, pointNumber: 0 });
  await page.keyboard.press('Escape');
  await expect(label).toHaveCount(0);
  expect((await events(page)).at(-1)?.name).toBe('unhover');
});

test('Enter and Space emit click with the point and the key event', async ({ page }) => {
  await tabIntoChart(page);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await events(page, true);
  await page.keyboard.press('Enter');
  const click = await waitForEvent(page, 'click');
  expect(click.payload).toMatchObject({
    event: 'keydown',
    points: [{ curveNumber: 0, pointNumber: 1, x: '2024-02-01', y: 15 }],
  });
  await page.keyboard.press('Space');
  await expect
    .poll(async () => (await events(page)).filter((e) => e.name === 'click'))
    .toHaveLength(2);
});

test('+ / - zoom, Shift + arrows pan and 0 resets, all through relayout', async ({ page }) => {
  await tabIntoChart(page);
  const before = await ranges(page);
  await events(page, true);
  await page.keyboard.press('+');
  const zoom = await waitForEvent(page, 'relayout');
  expect(Object.keys(zoom.payload).sort()).toEqual([
    'xaxis.range[0]',
    'xaxis.range[1]',
    'yaxis.range[0]',
    'yaxis.range[1]',
  ]);
  await expect(announcement(page)).toHaveText(/^Zoomed in\.\s?$/);
  const zoomed = await ranges(page);
  expect(zoomed.x[1]! - zoomed.x[0]!).toBeCloseTo((before.x[1]! - before.x[0]!) * 0.8, 0);

  await events(page, true);
  await page.keyboard.press('Shift+ArrowRight');
  const pan = await waitForEvent(page, 'relayout');
  expect(Object.keys(pan.payload).sort()).toEqual(['xaxis.range[0]', 'xaxis.range[1]']);
  const panned = await ranges(page);
  const span = zoomed.x[1]! - zoomed.x[0]!;
  expect(panned.x[0]! - zoomed.x[0]!).toBeCloseTo(span * 0.1, 0);

  await page.keyboard.press('-');
  await events(page, true);
  await page.keyboard.press('0');
  await waitForEvent(page, 'relayout');
  await expect(announcement(page)).toHaveText(/^View reset\.\s?$/);
  await expect.poll(async () => (await ranges(page)).x).toEqual(before.x);
});

test('legend items: toggle buttons with aria-pressed, arrows, Enter and Shift + Enter', async ({
  page,
}) => {
  const legend = page.getByRole('toolbar', { name: 'Legend' });
  const items = legend.getByRole('button');
  await expect(items).toHaveText(['', '', '']);
  await expect(items).toHaveCount(3);
  const revenue = legend.getByRole('button', { name: 'Revenue' });
  await expect(revenue).toHaveAttribute('aria-pressed', 'true');
  await tabIntoChart(page);
  await page.keyboard.press('Tab');
  await expect(revenue).toBeFocused();
  await expect(revenue).toHaveCSS('outline-style', 'solid');
  await page.keyboard.press('ArrowDown');
  const costs = legend.getByRole('button', { name: 'Costs' });
  await expect(costs).toBeFocused();
  await events(page, true);
  await page.keyboard.press('Enter');
  await waitForEvent(page, 'legendclick');
  await expect(costs).toHaveAttribute('aria-pressed', 'false');
  // Focus stays on the item across the redraw.
  await expect(costs).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(costs).toHaveAttribute('aria-pressed', 'true');
  // Shift + Enter: a double-click, isolating the item.
  await page.keyboard.press('Shift+Enter');
  await expect(revenue).toHaveAttribute('aria-pressed', 'false');
  await expect(legend.getByRole('button', { name: 'Target' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await expect(costs).toHaveAttribute('aria-pressed', 'true');
  // Hidden traces are skipped by the data navigation.
  await page.keyboard.press('Shift+Tab');
  await expect(target(page)).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(announcement(page)).toHaveText(/^Costs: /);
  await page.keyboard.press('PageDown');
  await expect(announcement(page)).toHaveText(/^Costs: /);
});

test('controls keep their keys: a focused slider or menu does not move the cursor', async ({
  page,
}) => {
  const slider = page.getByRole('slider', { name: 'Marker size' });
  await slider.focus();
  await events(page, true);
  await page.keyboard.press('ArrowRight');
  await expect(slider).toHaveAttribute('aria-valuenow', '1');
  await page.getByRole('button', { name: 'Group' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('button', { name: 'Overlay' })).toBeFocused();
  expect((await events(page)).filter((e) => e.name === 'hover')).toHaveLength(0);
  await expect(announcement(page)).toHaveCount(0);
});

test('toggles report their state with aria-pressed', async ({ page }) => {
  const toolbar = page.getByRole('toolbar', { name: 'Chart toolbar' });
  await expect(toolbar.getByRole('button', { name: 'Zoom', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(toolbar.getByRole('button', { name: 'Pan', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await toolbar.getByRole('button', { name: 'Pan', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(toolbar.getByRole('button', { name: 'Pan', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const selector = page.getByRole('group', { name: 'Range selector: Month' });
  await expect(selector.getByRole('button', { name: 'All' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await selector.getByRole('button', { name: /^3m/ }).focus();
  await page.keyboard.press('Enter');
  await expect(selector.getByRole('button', { name: /^3m/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(
    page.getByRole('toolbar', { name: 'Bar mode' }).getByRole('button', { name: 'Group' }),
  ).toHaveAttribute('aria-pressed', 'true');
});

test('pie slices: arrows move between slices, Enter clicks', async ({ page }) => {
  await page.evaluate(async () => {
    const chart = (
      window as unknown as { __interaction: { chart: { react(f: object): Promise<unknown> } } }
    ).__interaction.chart;
    await chart.react({
      data: [
        {
          type: 'pie',
          name: 'Channels',
          labels: ['Online', 'Retail', 'Partners'],
          values: [50, 30, 20],
          sort: false,
        },
      ],
      layout: {},
    });
  });
  await tabIntoChart(page);
  await page.keyboard.press('ArrowRight');
  await expect(announcement(page)).toHaveText(/^Channels: Online, 50, 50%, point 1 of 3\./);
  await page.keyboard.press('ArrowDown');
  await expect(announcement(page)).toHaveText(/^Channels: Retail, 30, 30%, point 2 of 3\./);
  const label = page.locator('.holochart-hoverlabel').filter({ visible: true });
  await expect(label).toContainText('Retail');
  await events(page, true);
  await page.keyboard.press('Enter');
  const click = await waitForEvent(page, 'click');
  expect(click.payload.points?.[0]).toMatchObject({ curveNumber: 0, pointNumber: 1 });
});
