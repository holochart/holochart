import { expect, test, type Page } from '@playwright/test';
import { callChart, events, openInteraction, waitForEvent, type LoggedEvent } from './helpers.ts';
import {
  anchor,
  announcement,
  labels,
  press,
  tabIntoChart,
  trackAnchors,
} from './keyboard-helpers.ts';

/**
 * Keyboard access to maps (backlog S2.14, GEO6) on `_dev/interaction-geo`, with real key presses:
 *
 * - **Stops.** The points of a `scattergeo` trace in data order and the regions of a `choropleth`
 *   in the order of `locations`, each announced like its hover label, with the label anchored
 *   where the point or the region's feature point is drawn. What the projection hides (the far
 *   side of a globe) is not a stop, and "point n of m" counts the stops there are; turning the
 *   globe brings the others in.
 * - **View keys.** Shift + arrows pan a scoped map, turn a world map and a globe; `+` / `-` zoom
 *   about the middle inside `minscale` / `maxscale`; `0` resets. Each press is one GUI relayout
 *   with the keys of the same gesture by pointer, kept by `layout.uirevision`, and is announced
 *   with where the view is now, in the chart's language.
 * - **Descriptions.** The traces' summaries, the generated summary (in the chart's language) and
 *   the data tables, hidden and visible.
 *
 * See the example's header for its variants (`geo=…`) and its geometry.
 */
const EXAMPLE = '_dev/interaction-geo';

interface Pt {
  x: number;
  y: number;
}

interface GeoViewInfo {
  mode: string;
  rotation: { lon: number; lat: number };
  center: { lon: number; lat: number } | null;
  scale: number;
  rect: { x: number; y: number; width: number; height: number };
}

interface GeoWindow {
  __interaction: {
    chart: {
      ready: Promise<unknown>;
      describe(): Promise<{ traces: string[]; overview: string } | undefined>;
      react(figure: unknown): Promise<unknown>;
    };
    geo: {
      toPage(lon: number, lat: number, id?: string): (Pt & { hidden: boolean }) | null;
      invert(x: number, y: number, id?: string): { lon: number; lat: number } | null;
      view(id?: string): GeoViewInfo | null;
      figure(name: string): { data: unknown[]; layout: Record<string, unknown>; config: unknown };
    };
  };
}

async function open(page: Page, variant: string, query: Record<string, string> = {}) {
  await openInteraction(page, EXAMPLE, { geo: variant, ...query });
  await tabIntoChart(page);
}

/** Where a longitude and latitude are drawn now, page px. */
async function at(page: Page, lonlat: readonly [number, number], id = 'geo'): Promise<Pt> {
  const p = await page.evaluate(
    ([lon, lat, sub]) =>
      (window as unknown as GeoWindow).__interaction.geo.toPage(
        lon as number,
        lat as number,
        sub as string,
      ),
    [lonlat[0], lonlat[1], id] as const,
  );
  if (!p) throw new Error(`no position for ${lonlat.join(', ')} on ${id}`);
  return p;
}

/** The longitude and latitude drawn at a page point. */
async function invert(page: Page, p: Pt): Promise<{ lon: number; lat: number }> {
  const lonlat = await page.evaluate(
    ([x, y]) => (window as unknown as GeoWindow).__interaction.geo.invert(x, y),
    [p.x, p.y] as const,
  );
  if (!lonlat) throw new Error(`nothing of the map at ${p.x}, ${p.y}`);
  return lonlat;
}

async function view(page: Page, id = 'geo'): Promise<GeoViewInfo> {
  const v = await page.evaluate(
    (sub) => (window as unknown as GeoWindow).__interaction.geo.view(sub),
    id,
  );
  if (!v) throw new Error(`no view on ${id}`);
  return v;
}

const relayouts = (all: LoggedEvent[]): Record<string, unknown>[] =>
  all.filter((e) => e.name === 'relayout').map((e) => e.payload);

/**
 * Press a view key that moves the map: the announcement, and the one relayout it committed, once
 * the pass of that relayout has drawn.
 */
async function viewKey(
  page: Page,
  key: string,
): Promise<{ said: string; relayout: Record<string, unknown> }> {
  await events(page, true);
  const said = await press(page, key);
  await waitForEvent(page, 'relayout');
  await page.evaluate(async () => {
    await (window as unknown as GeoWindow).__interaction.chart.ready;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
  const all = relayouts(await events(page));
  expect(all).toHaveLength(1);
  return { said, relayout: all[0]! };
}

/** The numbers of "Map centered at longitude …°, latitude …°, scale …." */
function saidView(text: string): { lon: number; lat: number; scale: number } {
  const m = /^Map centered at longitude (\S+)°, latitude (\S+)°, scale (\S+)\.$/.exec(text);
  if (!m) throw new Error(`not a view announcement: ${text}`);
  const n = (s: string): number => Number(s.replace('−', '-'));
  return { lon: n(m[1]!), lat: n(m[2]!), scale: n(m[3]!) };
}

// Nothing a scenario does may throw in the page or log an error.
let problems: string[] = [];

test.beforeEach(({ page }) => {
  problems = [];
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console.error: ${message.text()}`);
  });
});

test.afterEach(() => {
  expect(problems).toEqual([]);
});

test.describe('scattergeo stops', () => {
  test('arrows step through the points in data order, labelled like their hover', async ({
    page,
  }) => {
    await open(page, 'world');
    await trackAnchors(page);
    expect(await press(page, 'ArrowRight')).toBe('A: (10°, 10°), a0, point 1 of 4.');
    await expect(labels(page)).toHaveCount(1);
    await expect(labels(page)).toContainText('a0');
    // The label is anchored where the point is drawn.
    const first = await anchor(page);
    const drawn = await at(page, [10, 10]);
    expect(Math.hypot(first.x - drawn.x, first.y - drawn.y)).toBeLessThan(1.5);
    expect(await press(page, 'ArrowRight')).toBe('A: (30°, 60°), a1, point 2 of 4.');
    const hover = (await events(page)).filter((e) => e.name === 'hover').at(-1);
    expect(hover?.payload.points?.[0]).toMatchObject({
      curveNumber: 0,
      pointNumber: 1,
      lon: 60,
      lat: 30,
    });
    expect(await press(page, 'End')).toBe('A: (−30°, 120°), a3, point 4 of 4.');
    expect(await press(page, 'Home')).toBe('A: (10°, 10°), a0, point 1 of 4.');
    expect(await press(page, 'ArrowLeft')).toBe('A: (10°, 10°), a0, point 1 of 4.');
    expect(await press(page, 'PageDown')).toMatch(/^B: \(.+\), b[01], point [12] of 2\.$/);
    await page.keyboard.press('Escape');
    await expect(labels(page)).toHaveCount(0);
    // The first label sat on its point: a pointer there hovers that point.
    await events(page, true);
    await page.mouse.move(first.x + 1, first.y + 1);
    await page.mouse.move(first.x, first.y);
    expect((await waitForEvent(page, 'hover')).payload.points?.[0]).toMatchObject({
      curveNumber: 0,
      pointNumber: 0,
    });
  });

  test('a point on the far side of a globe is not a stop until the globe is turned to it', async ({
    page,
  }) => {
    await open(page, 'globe');
    // a3 (120°E) is behind the globe turned to (0°, 0°): three stops, not four.
    expect(await press(page, 'End')).toBe('A: (40°, −60°), a2, point 3 of 3.');
    expect(await press(page, 'PageDown')).toBe('B: (−15°, −60°), b0, point 1 of 1.');
    await page.keyboard.press('Escape');
    // Turn east until 120°E is on the near side: the view goes where the arrow points.
    let lon = 0;
    for (let i = 0; i < 6; i++) {
      const { said } = await viewKey(page, 'Shift+ArrowRight');
      expect(saidView(said).lon).toBeGreaterThan(lon);
      lon = saidView(said).lon;
    }
    expect(lon).toBeGreaterThan(50);
    expect(await press(page, 'End')).toMatch(/^A: \(−30°, 120°\), a3, point \d of \d\.$/);
    await expect(labels(page)).toContainText('a3');
  });
});

test.describe('view keys', () => {
  test('a world map: Shift + arrows turn it and move it, + and - zoom, 0 resets', async ({
    page,
  }) => {
    await open(page, 'world');
    const start = await view(page);
    expect(start.mode).toBe('unclipped');
    // Without a cursor: the keys go to the map.
    const right = await viewKey(page, 'Shift+ArrowRight');
    // The keys of a horizontal drag on this map, and nothing else.
    expect(Object.keys(right.relayout).sort()).toEqual([
      'geo.center.lon',
      'geo.projection.rotation.lon',
    ]);
    const turned = await view(page);
    expect(turned.rotation.lon).toBeGreaterThan(10);
    expect(turned.rotation.lon).toBeCloseTo(
      right.relayout['geo.projection.rotation.lon'] as number,
    );
    expect(turned.center!.lat).toBeCloseTo(start.center!.lat, 6);
    expect(turned.scale).toBe(start.scale);
    // The announcement says where the view is now.
    const said = saidView(right.said);
    expect(said.lon).toBeCloseTo(turned.center!.lon, 1);
    expect(said.lat).toBeCloseTo(0, 1);
    expect(said.scale).toBe(1);

    const up = await viewKey(page, 'Shift+ArrowUp');
    expect(Object.keys(up.relayout)).toEqual(['geo.center.lat']);
    const moved = await view(page);
    expect(moved.center!.lat).toBeGreaterThan(5);
    expect(moved.rotation.lon).toBeCloseTo(turned.rotation.lon, 6);
    expect(saidView(up.said).lat).toBeCloseTo(moved.center!.lat, 1);

    // `+` zooms about the middle: what is there stays there.
    const middle = {
      x: moved.rect.x + moved.rect.width / 2,
      y: moved.rect.y + moved.rect.height / 2,
    };
    const before = await invert(page, middle);
    const closer = await viewKey(page, '+');
    expect(closer.relayout['geo.projection.scale']).toBeCloseTo(1.25, 9);
    expect(saidView(closer.said).scale).toBe(1.25);
    const after = await invert(page, middle);
    expect(after.lon).toBeCloseTo(before.lon, 3);
    expect(after.lat).toBeCloseTo(before.lat, 3);
    const out = await viewKey(page, '-');
    expect(out.relayout['geo.projection.scale']).toBeCloseTo(1, 9);

    // `0`: back to the first view, with the relayout of a double-click.
    const reset = await viewKey(page, '0');
    expect(reset.said).toBe('View reset.');
    expect(reset.relayout).toEqual({
      'geo.fitbounds': false,
      'geo.projection.scale': 1,
      'geo.center.lon': 0,
      'geo.center.lat': 0,
      'geo.projection.rotation.lon': 0,
    });
    const back = await view(page);
    expect(back.rotation.lon).toBeCloseTo(start.rotation.lon, 6);
    expect(back.center!.lat).toBeCloseTo(start.center!.lat, 6);
    expect(back.scale).toBe(start.scale);
  });

  test('a globe turns in longitude and latitude; the cursor’s label follows its point', async ({
    page,
  }) => {
    await open(page, 'globe');
    expect(await press(page, 'ArrowRight')).toBe('A: (10°, 10°), a0, point 1 of 3.');
    /** Where the cursor's label is, from the point it labels. */
    const offset = async (): Promise<Pt> => {
      const box = (await labels(page).boundingBox())!;
      const point = await at(page, [10, 10]);
      return { x: box.x - point.x, y: box.y + box.height / 2 - point.y };
    };
    const beside = await offset();
    const before = await at(page, [10, 10]);
    const left = await viewKey(page, 'Shift+ArrowLeft');
    expect(Object.keys(left.relayout)).toEqual(['geo.projection.rotation.lon']);
    const turned = await view(page);
    expect(turned.mode).toBe('clipped');
    expect(turned.rotation.lon).toBeLessThan(-5);
    expect(saidView(left.said)).toMatchObject({ lat: 0, scale: 1 });
    expect(saidView(left.said).lon).toBeCloseTo(turned.rotation.lon, 1);
    const up = await viewKey(page, 'Shift+ArrowUp');
    expect(Object.keys(up.relayout)).toEqual(['geo.projection.rotation.lat']);
    const tilted = await view(page);
    // It turns as far up as it does sideways.
    expect(tilted.rotation.lat).toBeCloseTo(-turned.rotation.lon, 6);
    expect(saidView(up.said).lat).toBeCloseTo(tilted.rotation.lat, 1);
    // The cursor is still on its point, and its label is where the point is drawn now.
    const drawn = await at(page, [10, 10]);
    expect(Math.hypot(drawn.x - before.x, drawn.y - before.y)).toBeGreaterThan(30);
    await expect(labels(page)).toHaveCount(1);
    await expect(labels(page)).toContainText('a0');
    await expect
      .poll(async () => {
        const now = await offset();
        return Math.hypot(now.x - beside.x, now.y - beside.y);
      })
      .toBeLessThan(1.5);
    expect(await press(page, 'ArrowRight')).toMatch(/^A: .*a1, point 2 of \d\.$/);
  });

  test('a scoped map pans by a tenth of the subplot', async ({ page }) => {
    await open(page, 'usa');
    const start = await view(page);
    expect(start.mode).toBe('scoped');
    const kansas = await at(page, [-98.5, 38.5]);
    const left = await viewKey(page, 'Shift+ArrowLeft');
    expect(Object.keys(left.relayout).sort()).toEqual(['geo.center.lat', 'geo.center.lon']);
    const moved = await view(page);
    expect(moved.center!.lon).toBeLessThan(start.center!.lon);
    expect(moved.rotation).toEqual(start.rotation);
    // The view went west: the map moved east, by a tenth of the rect it draws in.
    const now = await at(page, [-98.5, 38.5]);
    expect(now.x - kansas.x).toBeCloseTo(start.rect.width / 10, 0);
    expect(now.y - kansas.y).toBeCloseTo(0, 0);
    expect(saidView(left.said).lon).toBeCloseTo(moved.center!.lon, 1);
    const down = await viewKey(page, 'Shift+ArrowDown');
    const lower = await at(page, [-98.5, 38.5]);
    expect(now.y - lower.y).toBeCloseTo(start.rect.height / 10, 0);
    expect(saidView(down.said).lat).toBeLessThan(saidView(left.said).lat);
  });

  test('+ stops at maxscale and - at minscale: a key that changes nothing commits nothing', async ({
    page,
  }) => {
    await open(page, 'world');
    await callChart(page, 'relayout', {
      'geo.projection.maxscale': 1.5,
      'geo.projection.minscale': 0.9,
    });
    expect((await viewKey(page, '+')).relayout['geo.projection.scale']).toBeCloseTo(1.25, 9);
    const top = await viewKey(page, '+');
    expect(top.relayout['geo.projection.scale']).toBe(1.5);
    expect(saidView(top.said).scale).toBe(1.5);
    await events(page, true);
    await page.keyboard.press('+');
    await page.evaluate(() => new Promise((r) => setTimeout(r, 300)));
    expect(relayouts(await events(page))).toEqual([]);
    expect((await view(page)).scale).toBe(1.5);
    await expect(announcement(page)).toHaveText(top.said);
    await viewKey(page, '-');
    await viewKey(page, '-');
    const bottom = await viewKey(page, '-');
    expect(bottom.relayout['geo.projection.scale']).toBe(0.9);
  });

  test('layout.uirevision keeps the view a key gave, as it keeps a drag’s', async ({ page }) => {
    await open(page, 'world');
    const react = (uirevision?: string): Promise<void> =>
      page.evaluate(async (rev) => {
        const hook = (window as unknown as GeoWindow).__interaction;
        const figure = hook.geo.figure('world');
        await hook.chart.react({
          ...figure,
          layout: { ...figure.layout, ...(rev ? { uirevision: rev } : {}) },
        });
      }, uirevision);
    await react('keep');
    await viewKey(page, 'Shift+ArrowRight');
    await viewKey(page, '+');
    const moved = await view(page);
    await react('keep');
    const kept = await view(page);
    expect(kept.rotation.lon).toBeCloseTo(moved.rotation.lon, 6);
    expect(kept.scale).toBe(1.25);
    // Without it the figure's own view comes back.
    await react();
    const fresh = await view(page);
    expect(fresh.rotation.lon).toBe(0);
    expect(fresh.scale).toBe(1);
  });

  test('two subplots: every map without a cursor, the cursor’s map with one', async ({ page }) => {
    await open(page, 'two');
    const both = await viewKey(page, '+');
    expect(Object.keys(both.relayout).sort()).toEqual([
      'geo.projection.scale',
      'geo2.projection.scale',
    ]);
    // Both maps are centered on (0°, 0°) at the same scale: one sentence says it.
    expect(saidView(both.said)).toEqual({ lon: 0, lat: 0, scale: 1.25 });
    // Trace B is on `geo2`, the globe.
    await press(page, 'ArrowRight');
    expect(await press(page, 'PageDown')).toMatch(/^B: /);
    const one = await viewKey(page, 'Shift+ArrowUp');
    expect(Object.keys(one.relayout)).toEqual(['geo2.projection.rotation.lat']);
    expect((await view(page, 'geo')).rotation.lat).toBe(0);
    expect((await view(page, 'geo2')).rotation.lat).toBeGreaterThan(5);
  });

  test('the view is announced in the chart’s language, with its numbers', async ({ page }) => {
    await open(page, 'world', { locale: 'de' });
    const closer = await press(page, '+');
    expect(closer).toBe('Karte zentriert auf Längengrad 0°, Breitengrad 0°, Maßstab 1,25.');
    await page.evaluate(() => (window as unknown as GeoWindow).__interaction.chart.ready);
    expect(await press(page, '0')).toBe('Ansicht zurückgesetzt.');
  });
});

test.describe('choropleth stops', () => {
  test('arrows step through the regions in the order of locations, each at its feature’s point', async ({
    page,
  }) => {
    await open(page, 'choro');
    await trackAnchors(page);
    expect(await press(page, 'ArrowRight')).toBe('Index: BRA, 20, point 1 of 5.');
    await expect(labels(page)).toHaveCount(1);
    expect(await press(page, 'ArrowRight')).toBe('Index: FRA, 10, point 2 of 5.');
    await expect(labels(page)).toContainText('FRA');
    const hover = (await events(page)).filter((e) => e.name === 'hover').at(-1);
    expect(hover?.payload.points?.[0]).toMatchObject({
      curveNumber: 0,
      pointNumber: 1,
      location: 'FRA',
    });
    // The label is anchored inside France.
    const france = await anchor(page);
    const where = await invert(page, france);
    expect(where.lon).toBeGreaterThan(-5);
    expect(where.lon).toBeLessThan(8.5);
    expect(where.lat).toBeGreaterThan(42);
    expect(where.lat).toBeLessThan(51.5);
    expect(await press(page, 'ArrowRight')).toBe('Index: AUS, 50, point 3 of 5.');
    expect(await press(page, 'End')).toBe('Index: CHN, 40, point 5 of 5.');
    // The next trace's stops are its points.
    expect(await press(page, 'PageDown')).toMatch(
      /^Cities: \(.+\), (London|Tokyo), point \d of 2\.$/,
    );
    await page.keyboard.press('Escape');
    await expect(labels(page)).toHaveCount(0);
    // A pointer where the label of France sat hovers France.
    await events(page, true);
    await page.mouse.move(france.x + 1, france.y + 1);
    await page.mouse.move(france.x, france.y);
    expect((await waitForEvent(page, 'hover')).payload.points?.[0]).toMatchObject({
      curveNumber: 0,
      pointNumber: 1,
    });
  });

  test('regions behind a globe are not stops; a view key on a region moves its map', async ({
    page,
  }) => {
    await open(page, 'choroglobe');
    // Australia, the United States and China have their points on the far side.
    expect(await press(page, 'ArrowRight')).toBe('Index: BRA, 20, point 1 of 2.');
    expect(await press(page, 'End')).toBe('Index: FRA, 10, point 2 of 2.');
    const turn = await viewKey(page, 'Shift+ArrowLeft');
    expect(Object.keys(turn.relayout)).toEqual(['geo.projection.rotation.lon']);
    expect(saidView(turn.said).lon).toBeLessThan(-5);
    // The cursor stays on France.
    await expect(labels(page)).toContainText('FRA');
  });
});

test.describe('descriptions and tables', () => {
  const describe = (page: Page) =>
    page.evaluate(async () => {
      const d = await (window as unknown as GeoWindow).__interaction.chart.describe();
      return { traces: d?.traces ?? [], overview: d?.overview ?? '' };
    });

  test('a choropleth says its region count and its lowest and highest regions by name', async ({
    page,
  }) => {
    await openInteraction(page, EXAMPLE, { geo: 'choro' });
    const d = await describe(page);
    expect(d.traces).toEqual([
      'Choropleth map "Index": 5 regions. Lowest: France (10). Highest: Australia (50).',
      'Map scatter "Cities": 2 points. Longitude −0.1° to 139.7°, latitude 35.7° to 51.5°.',
    ]);
    // The generated summary names the same two regions.
    expect(d.overview).toBe('Index is highest at Australia (50) and lowest at France (10).');
    const hidden = page.locator('.holochart-a11y');
    await expect(hidden).toContainText(d.traces[0]!);
    await expect(hidden).toContainText(d.traces[1]!);
    await expect(hidden).toContainText(d.overview);
    // The hidden data tables: locations and values, coordinates and text.
    const regions = page.getByRole('table', { name: 'Index (5 rows)' });
    await expect(regions.getByRole('columnheader')).toHaveText(['location', 'value']);
    await expect(regions.getByRole('row').nth(1).getByRole('cell')).toHaveText(['BRA', '20']);
    await expect(regions.getByRole('row')).toHaveCount(6);
    const cities = page.getByRole('table', { name: 'Cities (2 rows)' });
    await expect(cities.getByRole('columnheader')).toHaveText(['longitude', 'latitude', 'text']);
    await expect(cities.getByRole('row').nth(2).getByRole('cell')).toHaveText([
      '139.7°',
      '35.7°',
      'Tokyo',
    ]);
  });

  test('the generated summary is in the chart’s language', async ({ page }) => {
    await openInteraction(page, EXAMPLE, { geo: 'choro', locale: 'de' });
    expect((await describe(page)).overview).toBe(
      'Index ist am höchsten bei Australia (50) und am niedrigsten bei France (10).',
    );
  });

  test('scattergeo says its point count and its extent', async ({ page }) => {
    await openInteraction(page, EXAMPLE, { geo: 'world' });
    expect((await describe(page)).traces).toEqual([
      'Map scatter "A": 4 points. Longitude −60° to 120°, latitude −30° to 40°.',
      'Map scatter "B": 2 points. Longitude −60° to 150°, latitude −15° to 50°.',
    ]);
  });

  test('the visible data table lists locations and values, coordinates and text', async ({
    page,
  }) => {
    await openInteraction(page, EXAMPLE, { geo: 'choro', table: '1' });
    const tables = page.locator('.holochart-data-table');
    await expect(tables.getByRole('table')).toHaveCount(2);
    const regions = tables.getByRole('table', { name: 'Index (5 rows)' });
    await expect(regions.getByRole('columnheader')).toHaveText(['location', 'value']);
    await expect(regions.locator('tbody tr')).toHaveCount(5);
    await expect(regions.locator('tbody tr').nth(2).locator('td, th')).toHaveText(['AUS', '50']);
    const cities = tables.getByRole('table', { name: 'Cities (2 rows)' });
    await expect(cities.locator('tbody tr').first().locator('td, th')).toHaveText([
      '−0.1°',
      '51.5°',
      'London',
    ]);
  });
});
