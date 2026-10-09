import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import type { Chart } from '../../packages/runtime/src/chart.ts';
import type { GeoSubplot } from '../../packages/traces-geo/src/geo/subplot.ts';
import { HUBS, LINKS, focus } from '../../examples/demos/airline-globe/network.mts';
import { openExample, parkPointer } from '../visual/harness.ts';

const MODULE = `/@fs${path.resolve(import.meta.dirname, '../../packages/holochart/src/index.ts')}`;

async function state(page: Page) {
  return page.evaluate(async (url) => {
    const { getChart } = (await import(url)) as { getChart(el: HTMLElement): Chart };
    const globe = getChart(document.querySelector<HTMLElement>('[data-globe]')!);
    const graph = getChart(document.querySelector<HTMLElement>('[data-graph]')!);
    const geo = globe.layout['geo'] as {
      projection: { rotation: { lon: number; lat: number }; scale: number };
    };
    return {
      rotation: geo.projection.rotation,
      scale: geo.projection.scale,
      lift: (globe.data[1]!['line'] as { lift: number }).lift,
      mode: globe.data.at(-1)!['mode'],
      highlighted: (graph.data[0]!['highlight'] as { nodes: number[] }).nodes,
      globeEdges: globe.data
        .slice(1, -1)
        .reduce((n, t) => n + (t['lon'] as number[]).length / 3, 0),
    };
  }, MODULE);
}

async function idle(page: Page) {
  await expect(page.locator('.airline-demo')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('[role="status"]')).not.toContainText('Could not update');
}

test('airline globe links selection, raised edges, views and reset', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openExample(page, 'demos/airline-globe/world-network');
  await parkPointer(page);
  expect(await state(page)).toMatchObject({
    lift: 0.22,
    globeEdges: LINKS.length,
    highlighted: [],
  });

  const dubai = HUBS.findIndex((h) => h.code === 'DXB');
  await page.getByLabel('Airline hub', { exact: true }).selectOption(String(dubai));
  await idle(page);
  expect(await state(page)).toMatchObject({
    rotation: { lon: HUBS[dubai]!.lon, lat: HUBS[dubai]!.lat },
    highlighted: [dubai],
    globeEdges: focus(dubai).links.length,
  });

  const raised = await page.locator('[data-globe] canvas').screenshot();
  await page.getByLabel('Arc height', { exact: true }).fill('0');
  await idle(page);
  expect((await state(page)).lift).toBe(0);
  await parkPointer(page);
  expect(await page.locator('[data-globe] canvas').screenshot()).not.toEqual(raised);
  await page.getByLabel('Airport labels', { exact: true }).uncheck();
  await idle(page);
  expect((await state(page)).mode).toBe('markers');

  await page.getByRole('button', { name: 'Pacific', exact: true }).click();
  await idle(page);
  expect((await state(page)).rotation).toMatchObject({ lon: 160, lat: 5 });
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await idle(page);
  expect(await state(page)).toMatchObject({
    rotation: { lon: 20, lat: 20 },
    scale: 0.62,
    lift: 0.22,
    mode: 'markers+text',
    highlighted: [],
    globeEdges: LINKS.length,
  });

  // Click an actual graph node at the position drawn by its solved axes.
  const london = HUBS.findIndex((h) => h.code === 'LHR');
  const point = await page.evaluate(
    async ({ url, index }) => {
      const { getChart } = (await import(url)) as { getChart(el: HTMLElement): Chart };
      const el = document.querySelector<HTMLElement>('[data-graph]')!;
      const chart = getChart(el);
      const calc = chart.getCalcdata(0) as { x: Float64Array; y: Float64Array };
      const rect = el.getBoundingClientRect();
      return {
        x: rect.x + chart.axes.get('x')!.l2c(calc.x[index]!),
        y: rect.y + chart.axes.get('y')!.l2c(calc.y[index]!),
      };
    },
    { url: MODULE, index: london },
  );
  await page.mouse.click(point.x, point.y);
  await expect(page.getByLabel('Airline hub', { exact: true })).toHaveValue(String(london));
  await idle(page);
  expect((await state(page)).highlighted).toEqual([london]);

  // Selection turns this airport to the middle of the globe; click its real marker too.
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await idle(page);
  const globePoint = await page.evaluate(async (url) => {
    const { getChart } = (await import(url)) as { getChart(el: HTMLElement): Chart };
    const el = document.querySelector<HTMLElement>('[data-globe]')!;
    const chart = getChart(el);
    const calc = chart.getCalcdata(chart.data.length - 1) as { subplot: GeoSubplot };
    const p = calc.subplot.view!.project(38.7993, 8.9779)!; // ADD, clear of the dense European hubs.
    const rect = el.getBoundingClientRect();
    const domain = calc.subplot.rect;
    return { x: rect.x + domain.x + p[0], y: rect.y + domain.y + domain.height - p[1] };
  }, MODULE);
  await page.mouse.click(globePoint.x, globePoint.y);
  const addis = HUBS.findIndex((h) => h.code === 'ADD');
  await expect(page.getByLabel('Airline hub', { exact: true })).toHaveValue(String(addis));
  await idle(page);
  expect((await state(page)).highlighted).toEqual([addis]);
  expect(errors).toEqual([]);
});

test('airline globe stacks both charts in a narrow container', async ({ page }) => {
  await openExample(page, 'demos/airline-globe/world-network');
  await page.locator('#example-root').evaluate((el) => {
    el.style.width = '390px';
    el.style.height = '1000px';
  });
  await expect(page.locator('.airline-demo')).toHaveAttribute('data-narrow', 'true');
  await expect
    .poll(async () => {
      const globe = (await page.locator('[data-globe]').boundingBox())!;
      const graph = (await page.locator('[data-graph]').boundingBox())!;
      return graph.y > globe.y + globe.height && graph.width <= 390 && globe.height > 250;
    })
    .toBe(true);
  expect(
    await page.locator('.airline-demo').evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await page.getByLabel('Airline hub', { exact: true }).selectOption('23');
  await idle(page);
  expect((await state(page)).highlighted).toEqual([23]);
});

test('airline hub ranking switches metric and restores the same route counts', async ({ page }) => {
  await openExample(page, 'demos/airline-globe/hub-ranking');
  const stage = page.locator('[data-airline-chart="hub-ranking"]');
  const ranking = () =>
    page.evaluate(async (url) => {
      const { getChart } = (await import(url)) as { getChart(el: HTMLElement): Chart };
      const chart = getChart(
        document.querySelector<HTMLElement>('[data-airline-chart="hub-ranking"]')!,
      );
      return {
        traces: chart.data.length,
        values: chart.data[0]!['x'],
        labels: chart.data[0]!['y'],
        title: chart.layout['xaxis'] as { title: { text: string } },
      };
    }, MODULE);
  expect((await ranking()).traces).toBe(2);
  expect((await ranking()).labels).toHaveLength(24);
  await page.getByRole('button', { name: 'Regions reached', exact: true }).click();
  await expect(stage).toHaveAttribute('aria-busy', 'false');
  const regions = await ranking();
  expect(regions.traces).toBe(1);
  expect(regions.title.title.text).toBe('Destination regions');
  expect(Math.max(...(regions.values as number[]))).toBeLessThanOrEqual(7);
  await expect(page.getByRole('list', { name: 'Chart legend' })).toBeHidden();

  // Rapid changes are serialized; the last click must win.
  await page.getByRole('button', { name: 'Connections', exact: true }).click();
  await page.getByRole('button', { name: 'Regions reached', exact: true }).click();
  await page.getByRole('button', { name: 'Connections', exact: true }).click();
  await expect(stage).toHaveAttribute('aria-busy', 'false');
  expect((await ranking()).traces).toBe(2);
  expect((await ranking()).title.title.text).toBe('Connected airports');
  await expect(page.getByRole('list', { name: 'Chart legend' })).toBeVisible();
  expect(await page.getByRole('status').count()).toBe(0);
});
