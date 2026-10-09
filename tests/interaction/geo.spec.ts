import { expect, test, type Page } from '@playwright/test';
import pixelmatch from 'pixelmatch';
import pngjs from 'pngjs';
import {
  callChart,
  dragBetween,
  events,
  openInteraction,
  touchGesture,
  waitForEvent,
  type LoggedEvent,
} from './helpers.ts';
import { press, tabIntoChart } from './keyboard-helpers.ts';

const { PNG } = pngjs;

/**
 * Geo pointer scenarios on `_dev/interaction-geo` (backlog GEO2, GEO6): hover and click on
 * `scattergeo` markers, the drag of each kind of map (a world map turns in longitude and moves up
 * and down, a globe turns in longitude and latitude, a scoped map pans), wheel and pinch zoom,
 * double-click reset, `fitbounds`, box / lasso selection, `staticPlot`, two subplots, a 50m
 * basemap, a basemap that arrives late or not at all, and a lazily loaded projection; image
 * export (`toImage`) of maps whose data and code are not loaded yet; and WebGL context loss and
 * restore; and the 3D globe (`'globe3d'`, GEO8): the orthographic view drawn as a lit sphere in a
 * 3D viewport. The keyboard is in keyboard-geo.spec.ts.
 *
 * The example draws one map per page load, chosen by the query parameter `geo` (see its header):
 * 640×400 px, 20 px margins, so the plot area is the 600×360 px rect at container (20, 20). Trace A
 * (red) and trace B (blue) are markers of 12 px at known longitudes and latitudes. The tests do no
 * projection maths: `window.__interaction.geo` maps a longitude and latitude to page px in the
 * current view (`toPage`), a page point back (`invert`), and reports the view (`view`).
 */
const EXAMPLE = '_dev/interaction-geo';
const RED = [0xea, 0x2a, 0x37] as const;
const BLUE = [0x5e, 0x74, 0xd5] as const;
const LAND = [0xd9, 0xc9, 0xa3] as const;
const OCEAN = [0xcf, 0xe3, 0xf2] as const;

/** The world maps' points: `[lon, lat]` of trace A and of trace B. */
const A = [
  [10, 10],
  [60, 30],
  [-60, 40],
  [120, -30],
] as const;
const B = [
  [-60, -15],
  [150, 50],
] as const;
/** Away from every marker: the Sahara, and the middle of the south Atlantic. */
const SAHARA = [5, 24] as const;
const ATLANTIC = [-20, -20] as const;
/** The choropleth variants: the lowest region (France) and the highest (Australia), and a city. */
const LOW = [0x1b, 0x78, 0x37] as const;
const HIGH = [0x76, 0x2a, 0x83] as const;
const FRANCE = [2.5, 47] as const;
const AUSTRALIA = [134, -25] as const;
const LONDON = [-0.1, 51.5] as const;
/**
 * On a globe turned to (0°, 0°): land in the lower right of the disc, which the globe's light
 * leaves at 0.8 of its color; ocean in the upper left and in the lower right; and land on the far
 * side (Australia) that lies behind sea of the near side (the Mozambique Channel).
 */
const KALAHARI = [24, -24] as const;
const NORTH_ATLANTIC = [-40, 38] as const;
const INDIAN_OCEAN = [62, -38] as const;
const FAR_LAND = [140, -22] as const;
/** On the `usa` map: land between the markers, away from the state lines. */
const KANSAS = [-98.5, 38.5] as const;

interface Pt {
  x: number;
  y: number;
}

interface GeoViewInfo {
  mode: string;
  version: number;
  rotation: { lon: number; lat: number };
  center: { lon: number; lat: number } | null;
  scale: number;
  rect: { x: number; y: number; width: number; height: number };
  globe: boolean;
  viewport: '2d' | '3d' | null;
}

interface GeoWindow {
  __interaction: {
    chart: {
      ready: Promise<unknown>;
      layout: Record<string, unknown>;
      fullLayout: Record<string, unknown> | undefined;
      three: { root: { canvas: HTMLCanvasElement } };
    };
    geo: {
      toPage(lon: number, lat: number, id?: string): (Pt & { hidden: boolean }) | null;
      invert(x: number, y: number, id?: string): { lon: number; lat: number } | null;
      view(id?: string): GeoViewInfo | null;
      figure(name: string): unknown;
      toImage(name: string): Promise<string>;
    };
  };
}

async function open(page: Page, variant: string, query: Record<string, string> = {}) {
  await openInteraction(page, EXAMPLE, { geo: variant, ...query });
}

/** Where a longitude and latitude are drawn now, page px (`hidden`: the projection hides it). */
async function at(
  page: Page,
  lonlat: readonly [number, number],
  id = 'geo',
): Promise<Pt & { hidden: boolean }> {
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

async function invert(page: Page, p: Pt, id = 'geo') {
  return page.evaluate(
    ([x, y, sub]) =>
      (window as unknown as GeoWindow).__interaction.geo.invert(
        x as number,
        y as number,
        sub as string,
      ),
    [p.x, p.y, id] as const,
  );
}

async function view(page: Page, id = 'geo'): Promise<GeoViewInfo> {
  const v = await page.evaluate(
    (sub) => (window as unknown as GeoWindow).__interaction.geo.view(sub),
    id,
  );
  if (!v) throw new Error(`no view on ${id}`);
  return v;
}

/** A value of the defaulted layout, by path (`geo.projection.scale`). */
async function full(page: Page, path: string): Promise<unknown> {
  return page.evaluate((p) => {
    let node: unknown = (window as unknown as GeoWindow).__interaction.chart.fullLayout;
    for (const key of p.split('.')) node = (node as Record<string, unknown> | undefined)?.[key];
    return node;
  }, path);
}

/** The pixel color at a page point. */
async function pixel(page: Page, p: Pt): Promise<number[]> {
  const png = PNG.sync.read(
    await page.screenshot({
      clip: { x: Math.round(p.x), y: Math.round(p.y), width: 1, height: 1 },
    }),
  );
  return [png.data[0]!, png.data[1]!, png.data[2]!];
}

function near(c: number[], rgb: readonly number[]): boolean {
  return rgb.every((v, k) => Math.abs((c[k] ?? -1) - v) <= 10);
}

/**
 * How much light a pixel of a globe has, if it is `rgb` under the globe's light: the color times
 * a factor between the ambient light (0.7) and all of it. `null` for any other color.
 */
function light(c: number[], rgb: readonly number[]): number | null {
  const k = ((c[0] ?? 0) + (c[1] ?? 0) + (c[2] ?? 0)) / (rgb[0]! + rgb[1]! + rgb[2]!);
  const same = rgb.every((v, i) => Math.abs((c[i] ?? -99) - k * v) <= 8);
  return same && k > 0.66 && k < 1.03 ? k : null;
}

/** Whether a pixel is `rgb`: as it is, or (`'lit'`) under the light of a globe. */
function shows(c: number[], rgb: readonly number[], how?: 'lit'): boolean {
  return how === 'lit' ? light(c, rgb) !== null : near(c, rgb);
}

/** Whether the pixel at a point has a color, once the frame that draws it is out. */
async function expectColor(
  page: Page,
  p: Pt,
  rgb: readonly number[],
  is = true,
  how?: 'lit',
): Promise<void> {
  await expect
    .poll(async () => shows(await pixel(page, p), rgb, how), {
      message: `pixel at (${p.x.toFixed(1)}, ${p.y.toFixed(1)}) ${is ? 'is' : 'is not'} ${how ?? ''} ${rgb.join(',')}`,
    })
    .toBe(is);
}

/** Whether the pixel at a point is a color under the light of a globe. */
const expectLit = (page: Page, p: Pt, rgb: readonly number[], is = true): Promise<void> =>
  expectColor(page, p, rgb, is, 'lit');

const visibleLabel = (page: Page) =>
  page.locator('.holochart-hoverlabel').filter({ visible: true });

async function settle(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const hook = (window as unknown as GeoWindow).__interaction;
    await hook.chart.ready;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
}

/** Park the pointer in the figure's margin: no hover label, nothing under it. */
async function park(page: Page): Promise<void> {
  const o = await origin(page);
  await page.mouse.move(o.x + 5, o.y + 395);
}

async function origin(page: Page): Promise<Pt> {
  return page.evaluate(() => {
    const box = (
      window as unknown as GeoWindow
    ).__interaction.chart.three.root.canvas.getBoundingClientRect();
    return { x: box.left, y: box.top };
  });
}

async function cursor(page: Page): Promise<string> {
  return page.evaluate(
    () => (window as unknown as GeoWindow).__interaction.chart.three.root.canvas.style.cursor,
  );
}

const named = (all: LoggedEvent[], name: string) => all.filter((e) => e.name === name);

/** The relayouts so far whose keys belong to a geo subplot (not `dragmode`). */
const geoRelayouts = (all: LoggedEvent[]) =>
  named(all, 'relayout').filter((e) => Object.keys(e.payload).some((k) => k.startsWith('geo')));

/**
 * The one relayout of a gesture: wait for it, give a second one the time to show up, and return
 * the payload.
 */
async function oneRelayout(page: Page): Promise<Record<string, unknown>> {
  await waitForEvent(page, 'relayout');
  await settle(page);
  await page.waitForTimeout(400);
  const relayouts = geoRelayouts(await events(page));
  expect(relayouts).toHaveLength(1);
  return relayouts[0]!.payload;
}

/** A page point on whole pixels (a wheel event carries no fractions of one). */
function whole(p: Pt): Pt {
  return { x: Math.round(p.x), y: Math.round(p.y) };
}

/** What is drawn under a page point: the reference for "the point under the pointer stays". */
async function under(page: Page, p: Pt, id = 'geo'): Promise<readonly [number, number]> {
  const lonlat = await invert(page, p, id);
  if (!lonlat) throw new Error(`nothing of the map at ${p.x}, ${p.y}`);
  return [lonlat.lon, lonlat.lat];
}

/**
 * Wheel notches that reach the canvas in one task, as a spinning wheel's do: nothing of the test
 * runner or of a slow frame comes between two of them (the zoom is committed when the wheel has
 * rested for 200 ms, and software GL under load can take longer than that for a frame).
 */
async function wheelBurst(page: Page, p: Pt, deltaY: number, notches: number): Promise<void> {
  await page.evaluate(
    ([x, y, delta, n]) => {
      const canvas = (window as unknown as GeoWindow).__interaction.chart.three.root.canvas;
      for (let k = 0; k < (n as number); k++) {
        canvas.dispatchEvent(
          new WheelEvent('wheel', {
            clientX: x as number,
            clientY: y as number,
            deltaY: delta as number,
            bubbles: true,
            cancelable: true,
          }),
        );
      }
    },
    [p.x, p.y, deltaY, notches] as const,
  );
}

function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Selected points as `[curveNumber, pointNumber, lon, lat]`. */
function picked(e: LoggedEvent): unknown[][] {
  return (
    e.payload.points as unknown as {
      curveNumber: number;
      pointNumber: number;
      lon: number;
      lat: number;
    }[]
  ).map((p) => [p.curveNumber, p.pointNumber, p.lon, p.lat]);
}

// Nothing a scenario does may throw in the page or log an error.
let problems: string[] = [];
/** Console errors a test expects (a request it blocks on purpose). */
let expected: RegExp[] = [];

test.beforeEach(({ page }) => {
  problems = [];
  expected = [];
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console.error: ${message.text()}`);
  });
});

test.afterEach(() => {
  expect(problems.filter((p) => !expected.some((re) => re.test(p)))).toEqual([]);
});

test.describe('hover and click', () => {
  test.beforeEach(async ({ page }) => {
    await open(page, 'world');
  });

  test('the map and the markers are drawn where the view puts them', async ({ page }) => {
    const v = await view(page);
    expect(v.mode).toBe('unclipped');
    expect(v.scale).toBeCloseTo(1, 9);
    await expectColor(page, await at(page, A[1]), RED);
    await expectColor(page, await at(page, A[3]), RED);
    await expectColor(page, await at(page, B[0]), BLUE);
    await expectColor(page, await at(page, SAHARA), LAND);
    await expectColor(page, await at(page, ATLANTIC), OCEAN);
  });

  test('hovering a marker shows its latitude and longitude and emits hover', async ({ page }) => {
    await events(page, true);
    const p = await at(page, A[1]);
    await page.mouse.move(p.x + 2, p.y + 1);
    const hover = await waitForEvent(page, 'hover');
    expect(hover.payload.points).toHaveLength(1);
    expect(hover.payload.points?.[0]).toMatchObject({
      curveNumber: 0,
      pointNumber: 1,
      lon: 60,
      lat: 30,
      location: null,
    });
    const label = visibleLabel(page);
    await expect(label).toHaveCount(1);
    // Plotly's `(lat°, lon°)`, then the point's text.
    await expect(label).toContainText('(30°, 60°)');
    await expect(label).toContainText('a1');

    // The other trace's point, with negative coordinates.
    const q = await at(page, B[0]);
    await page.mouse.move(q.x, q.y);
    await expect
      .poll(async () => named(await events(page), 'hover').at(-1)?.payload.points?.[0])
      .toMatchObject({ curveNumber: 1, pointNumber: 0, lon: -60, lat: -15 });
    await expect(visibleLabel(page)).toContainText(/\([-−]15°, [-−]60°\)/);

    // Over the open sea nothing is hovered.
    await events(page, true);
    const sea = await at(page, ATLANTIC);
    await page.mouse.move(sea.x, sea.y);
    await waitForEvent(page, 'unhover');
    await expect(visibleLabel(page)).toHaveCount(0);
  });

  test('a click on a marker emits click with the point; the map does not move', async ({
    page,
  }) => {
    await events(page, true);
    const before = await view(page);
    const p = await at(page, A[1]);
    await page.mouse.click(p.x, p.y);
    const click = await waitForEvent(page, 'click');
    expect(click.payload.points).toHaveLength(1);
    expect(click.payload.points?.[0]).toMatchObject({
      curveNumber: 0,
      pointNumber: 1,
      lon: 60,
      lat: 30,
    });
    await page.waitForTimeout(400);
    const all = await events(page);
    expect(named(all, 'click')).toHaveLength(1);
    expect(named(all, 'relayout')).toHaveLength(0);
    expect(named(all, 'relayouting')).toHaveLength(0);
    expect(await view(page)).toEqual(before);
  });

  test('a click on the empty map emits no click', async ({ page }) => {
    await events(page, true);
    const sea = await at(page, ATLANTIC);
    await page.mouse.click(sea.x, sea.y);
    await page.waitForTimeout(400);
    const all = await events(page);
    expect(named(all, 'click')).toHaveLength(0);
    expect(named(all, 'relayout')).toHaveLength(0);
  });

  test('a drag that starts on a marker moves the map and emits no click', async ({ page }) => {
    await events(page, true);
    const p = await at(page, A[1]);
    await dragBetween(page, p, { x: p.x + 40, y: p.y + 10 }, 6);
    await waitForEvent(page, 'relayout');
    await page.waitForTimeout(300);
    expect(named(await events(page), 'click')).toHaveLength(0);
  });

  test('the hover label goes away when a drag starts and comes back after it', async ({ page }) => {
    const p = await at(page, A[1]);
    await page.mouse.move(p.x, p.y);
    await waitForEvent(page, 'hover');
    await expect(visibleLabel(page)).toHaveCount(1);
    await events(page, true);
    await page.mouse.down();
    await page.mouse.move(p.x + 30, p.y + 5, { steps: 4 });
    // The map moved under the pointer: a label left where the point was would be wrong.
    await waitForEvent(page, 'unhover');
    await expect(visibleLabel(page)).toHaveCount(0);
    await page.mouse.move(p.x + 60, p.y + 10, { steps: 4 });
    await expect(visibleLabel(page)).toHaveCount(0);
    await page.mouse.up();
    await waitForEvent(page, 'relayout');
    // The marker followed the pointer, which is still over it.
    await expect(visibleLabel(page)).toHaveCount(1);
    await expect(visibleLabel(page)).toContainText('a1');
  });

  test('the cursor says what a drag does: move in pan mode, crosshair when selecting', async ({
    page,
  }) => {
    const sea = await at(page, ATLANTIC);
    await page.mouse.move(sea.x, sea.y);
    await expect.poll(() => cursor(page)).toBe('move');
    // Over a marker too: the press there still drags the map.
    const p = await at(page, A[0]);
    await page.mouse.move(p.x, p.y);
    await expect.poll(() => cursor(page)).toBe('move');
    // In the margin there is nothing to drag.
    await park(page);
    await expect.poll(() => cursor(page)).toBe('');
    await callChart(page, 'relayout', { dragmode: 'select' });
    await page.mouse.move(sea.x, sea.y);
    await expect.poll(() => cursor(page)).toBe('crosshair');
  });
});

test.describe('a world map of the whole sphere (unclipped)', () => {
  test.beforeEach(async ({ page }) => {
    await open(page, 'world');
  });

  test('a horizontal drag turns the map in longitude; the marker stays under the pointer', async ({
    page,
  }) => {
    await events(page, true);
    const from = await at(page, A[0]);
    const to = { x: from.x + 80, y: from.y };
    await dragBetween(page, from, to, 10);
    const relayout = await oneRelayout(page);
    // Plotly's keys for this kind of map; a value that did not change is left out.
    const allowed = [
      'geo.projection.rotation.lon',
      'geo.center.lon',
      'geo.center.lat',
      'geo.projection.scale',
    ];
    expect(Object.keys(relayout).every((k) => allowed.includes(k))).toBe(true);
    expect(relayout).toHaveProperty(['geo.projection.rotation.lon']);
    expect(relayout).not.toHaveProperty(['geo.projection.scale']);
    expect(relayout).not.toHaveProperty(['geo.fitbounds']);
    // Dragging east shows what lies west.
    expect(relayout['geo.projection.rotation.lon']).toBeLessThan(-20);
    expect(named(await events(page), 'relayouting').length).toBeGreaterThan(0);
    // The layout has what the event says.
    expect(await full(page, 'geo.projection.rotation.lon')).toBeCloseTo(
      relayout['geo.projection.rotation.lon'] as number,
      9,
    );
    const v = await view(page);
    expect(v.rotation.lon).toBeCloseTo(relayout['geo.projection.rotation.lon'] as number, 9);
    expect(v.rotation.lat).toBe(0);
    expect(v.scale).toBeCloseTo(1, 9);
    // The marker that was grabbed is under the pointer, in the maths and on the canvas.
    expect(dist(await at(page, A[0]), to)).toBeLessThan(2);
    await park(page);
    await expectColor(page, to, RED);
    await expectColor(page, from, RED, false);
    // The land turned with it.
    await expectColor(page, await at(page, SAHARA), LAND);
    await expectColor(page, await at(page, ATLANTIC), OCEAN);
  });

  test('a vertical drag moves the map up and down (center.lat), without turning it', async ({
    page,
  }) => {
    await events(page, true);
    const from = await at(page, ATLANTIC);
    const to = { x: from.x, y: from.y + 40 };
    await dragBetween(page, from, to, 8);
    const relayout = await oneRelayout(page);
    expect(Object.keys(relayout)).toEqual(['geo.center.lat']);
    // The map went down, so the middle of the subplot shows what lies further north.
    expect(relayout['geo.center.lat']).toBeGreaterThan(5);
    const v = await view(page);
    expect(v.rotation.lon).toBe(0);
    expect(v.center?.lat).toBeCloseTo(relayout['geo.center.lat'] as number, 6);
    const grabbed = await at(page, ATLANTIC);
    expect(dist(grabbed, to)).toBeLessThan(2);
    await park(page);
    await expectColor(page, await at(page, A[0]), RED);
  });

  test('a layout pass in the middle of a drag does not send the map back', async ({ page }) => {
    await events(page, true);
    const from = await at(page, A[0]);
    const step = (k: number): Pt => ({ x: from.x + 30 * k, y: from.y + 8 * k });
    /** Remember the subplot's view, or say whether it is still the one remembered. */
    const sameView = (remember: boolean) =>
      page.evaluate((keep) => {
        const w = window as unknown as {
          __view?: unknown;
          __interaction: { chart: { getCalcdata(i: number): { subplot: { view: unknown } } } };
        };
        const now = w.__interaction.chart.getCalcdata(0).subplot.view;
        if (keep) w.__view = now;
        return w.__view === now;
      }, remember);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(step(1).x, step(1).y, { steps: 4 });
    // Something else updates the figure while the map is held: its layout…
    await sameView(true);
    await callChart(page, 'relayout', { 'geo.showcountries': true });
    await settle(page);
    expect(await sameView(false)).toBe(false);
    expect(dist(await at(page, A[0]), step(1))).toBeLessThan(2);
    await page.mouse.move(step(2).x, step(2).y, { steps: 4 });
    expect(dist(await at(page, A[0]), step(2))).toBeLessThan(2);
    // …and its data.
    await sameView(true);
    await callChart(page, 'restyle', { lat: [[-15, 55]] }, [1]);
    await settle(page);
    expect(await sameView(false)).toBe(false);
    expect(dist(await at(page, A[0]), step(2))).toBeLessThan(2);
    await page.mouse.move(step(3).x, step(3).y, { steps: 4 });
    await page.mouse.up();
    await expect.poll(async () => geoRelayouts(await events(page)).length).toBe(2);
    await settle(page);
    // One relayout was the test's own; the other is the drag's, all of it.
    const drag = geoRelayouts(await events(page))[1]!.payload;
    expect(drag['geo.projection.rotation.lon']).toBeLessThan(-30);
    expect(dist(await at(page, A[0]), step(3))).toBeLessThan(2);
    await park(page);
    await expectColor(page, step(3), RED);
    await expectColor(page, await at(page, [150, 55]), BLUE);
  });

  test('a resize in the middle of a drag keeps the view, in the new rect', async ({ page }) => {
    await events(page, true);
    const from = await at(page, A[0]);
    const mid = { x: from.x + 40, y: from.y + 10 };
    const to = { x: from.x + 80, y: from.y + 20 };
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(mid.x, mid.y, { steps: 5 });
    const held = await view(page);
    // A title takes room from the plot area: the subplot's rect, and with it its view, change.
    await callChart(page, 'relayout', { 'title.text': 'A title' });
    await settle(page);
    const moved = await view(page);
    expect(moved.rect).not.toEqual(held.rect);
    expect(moved.rotation.lon).toBeCloseTo(held.rotation.lon, 6);
    expect(moved.center?.lat).toBeCloseTo(held.center?.lat ?? NaN, 6);
    // The drag goes on with what is under the pointer now.
    const grabbed = await under(page, mid);
    await page.mouse.move(to.x, to.y, { steps: 5 });
    await page.mouse.up();
    await expect.poll(async () => geoRelayouts(await events(page)).length).toBe(1);
    await settle(page);
    expect(dist(await at(page, grabbed), to)).toBeLessThan(2);
    expect(dist(await at(page, A[0]), to)).toBeLessThan(6);
  });

  test('double-click goes back to the first view and emits doubleclick', async ({ page }) => {
    const first = await view(page);
    const from = await at(page, ATLANTIC);
    await dragBetween(page, from, { x: from.x + 70, y: from.y + 30 }, 8);
    await waitForEvent(page, 'relayout');
    await settle(page);
    expect((await view(page)).rotation.lon).not.toBeCloseTo(0, 1);

    await events(page, true);
    const sea = await at(page, ATLANTIC);
    await page.mouse.dblclick(sea.x, sea.y);
    await waitForEvent(page, 'doubleclick');
    await expect.poll(async () => (await view(page)).rotation.lon).toBeCloseTo(0, 9);
    const v = await view(page);
    expect(v.scale).toBeCloseTo(first.scale, 9);
    expect(v.center?.lat).toBeCloseTo(first.center?.lat ?? NaN, 6);
    expect(v.center?.lon).toBeCloseTo(first.center?.lon ?? NaN, 6);
    expect(named(await events(page), 'doubleclick')).toHaveLength(1);
    expect(named(await events(page), 'click')).toHaveLength(0);
    await park(page);
    await expectColor(page, await at(page, A[1]), RED);
    await expectColor(page, await at(page, SAHARA), LAND);
  });
});

test.describe('a globe (clipped)', () => {
  test.beforeEach(async ({ page }) => {
    await open(page, 'globe');
  });

  test('a point on the far side is not drawn and cannot be hovered', async ({ page }) => {
    expect((await view(page)).mode).toBe('clipped');
    const far = await at(page, A[3]);
    expect(far.hidden).toBe(true);
    await expectColor(page, far, RED, false);
    await events(page, true);
    await page.mouse.move(far.x, far.y);
    await page.waitForTimeout(400);
    expect(named(await events(page), 'hover')).toHaveLength(0);
    // The near side is.
    const p = await at(page, A[1]);
    expect(p.hidden).toBe(false);
    await page.mouse.move(p.x, p.y);
    expect((await waitForEvent(page, 'hover')).payload.points?.[0]).toMatchObject({
      curveNumber: 0,
      pointNumber: 1,
    });
  });

  test('a drag turns the globe in longitude and latitude; a marker turned away disappears', async ({
    page,
  }) => {
    await events(page, true);
    const from = await at(page, A[0]);
    const to = { x: from.x + 110, y: from.y - 40 };
    const before = await at(page, A[1]);
    await expectColor(page, before, RED);
    await dragBetween(page, from, to, 12);
    const relayout = await oneRelayout(page);
    const allowed = [
      'geo.projection.rotation.lon',
      'geo.projection.rotation.lat',
      'geo.projection.scale',
    ];
    expect(Object.keys(relayout).every((k) => allowed.includes(k))).toBe(true);
    expect(relayout['geo.projection.rotation.lon']).toBeLessThan(-20);
    expect(Math.abs(relayout['geo.projection.rotation.lat'] as number)).toBeGreaterThan(5);
    expect(relayout).not.toHaveProperty(['geo.projection.scale']);
    expect(named(await events(page), 'relayouting').length).toBeGreaterThan(0);
    const v = await view(page);
    expect(v.rotation.lon).toBeCloseTo(relayout['geo.projection.rotation.lon'] as number, 9);
    expect(v.rotation.lat).toBeCloseTo(relayout['geo.projection.rotation.lat'] as number, 9);
    // The marker that was grabbed is under the pointer.
    expect(dist(await at(page, A[0]), to)).toBeLessThan(2);
    await park(page);
    await expectColor(page, to, RED);

    // (60°, 30°) went over the edge: gone from the canvas, and from hover.
    const gone = await at(page, A[1]);
    expect(gone.hidden).toBe(true);
    await expectColor(page, gone, RED, false);
    await expectColor(page, before, RED, false);
    await events(page, true);
    await page.mouse.move(gone.x, gone.y);
    await page.waitForTimeout(400);
    const hovers = named(await events(page), 'hover');
    expect(hovers.every((h) => h.payload.points?.every((pt) => pt.pointNumber !== 1) ?? true)).toBe(
      true,
    );
    // (-60°, 40°) is still there.
    const still = await at(page, A[2]);
    expect(still.hidden).toBe(false);
    await page.mouse.move(still.x, still.y);
    await expect
      .poll(async () => named(await events(page), 'hover').at(-1)?.payload.points?.[0])
      .toMatchObject({ curveNumber: 0, pointNumber: 2, lon: -60, lat: 40 });
  });
});

test('a globe: double-click turns it back to the first view', async ({ page }) => {
  await open(page, 'globe');
  const first = await at(page, A[0]);
  await dragBetween(page, first, { x: first.x + 90, y: first.y - 30 }, 8);
  await waitForEvent(page, 'relayout');
  await settle(page);
  expect(dist(await at(page, A[0]), first)).toBeGreaterThan(80);
  await events(page, true);
  await page.mouse.dblclick(first.x, first.y);
  await waitForEvent(page, 'doubleclick');
  await expect.poll(async () => dist(await at(page, A[0]), first)).toBeLessThan(0.5);
  const v = await view(page);
  expect(v.rotation.lon).toBeCloseTo(0, 9);
  expect(v.rotation.lat).toBeCloseTo(0, 9);
  // The marker is under the pointer again, which hovers it.
  await expect(visibleLabel(page)).toContainText('a0');
  await park(page);
  await expectColor(page, first, RED);
});

test.describe('globe3d', () => {
  /** The names of the chart's viewports, in drawing order. */
  const viewports = (page: Page): Promise<string[]> =>
    page.evaluate(() =>
      (
        window as unknown as {
          __interaction: { chart: { three: { root: { viewports: { name: string }[] } } } };
        }
      ).__interaction.chart.three.root.viewports.map((vp) => vp.name),
    );

  /** The light a point of the globe has, if it is drawn in `rgb`. */
  async function lightAt(
    page: Page,
    lonlat: readonly [number, number],
    rgb: readonly number[],
  ): Promise<number> {
    const p = await at(page, lonlat);
    await expectLit(page, p, rgb);
    return light(await pixel(page, p), rgb)!;
  }

  test('is drawn as a lit sphere in a 3D viewport, under the markers; the far side is hidden', async ({
    page,
  }) => {
    await open(page, 'globe3d');
    expect(await view(page)).toMatchObject({ mode: 'clipped', globe: true, viewport: '3d' });
    expect(await full(page, 'geo.projection.type')).toBe('globe3d');
    // The globe's own viewport, then the 2D one with what is positioned in px.
    expect((await viewports(page)).filter((name) => name.startsWith('subplot-'))).toEqual([
      'subplot-geo-globe',
      'subplot-geo',
    ]);
    await park(page);
    // Land and ocean where the view puts them, each in its color under the globe's light.
    await expectLit(page, await at(page, SAHARA), LAND);
    await expectLit(page, await at(page, ATLANTIC), OCEAN);
    await expectLit(page, await at(page, KALAHARI), LAND);
    await expectLit(page, await at(page, SAHARA), OCEAN, false);
    // It is shaded as a sphere: the light comes from the upper left, so the same color is
    // brighter there than in the lower right, and nowhere as flat as on a map.
    const upper = await lightAt(page, NORTH_ATLANTIC, OCEAN);
    const lower = await lightAt(page, INDIAN_OCEAN, OCEAN);
    expect(upper).toBeGreaterThan(0.93);
    expect(lower).toBeLessThan(0.85);
    expect(upper - lower).toBeGreaterThan(0.1);
    await expectColor(page, await at(page, KALAHARI), LAND, false);
    // The markers are drawn above the globe, in their own colors.
    await expectColor(page, await at(page, A[0]), RED);
    await expectColor(page, await at(page, B[0]), BLUE);
    // Nothing of the far side: where Australia is behind the globe, the near side's sea shows,
    // and the marker there is not drawn.
    const far = await at(page, FAR_LAND);
    expect(far.hidden).toBe(true);
    await expectLit(page, far, OCEAN);
    await expectLit(page, far, LAND, false);
    await expectColor(page, await at(page, A[3]), RED, false);
    // Outside the disc there is the background and no map.
    const v = await view(page);
    const corner = { x: v.rect.x + 6, y: v.rect.y + 6 };
    expect(light(await pixel(page, corner), OCEAN)).toBeNull();
    expect(light(await pixel(page, corner), LAND)).toBeNull();
  });

  test('hover hits a marker on the near side and not one on the far side', async ({ page }) => {
    await open(page, 'globe3d');
    const far = await at(page, A[3]);
    expect(far.hidden).toBe(true);
    await expectColor(page, far, RED, false);
    await events(page, true);
    await page.mouse.move(far.x, far.y);
    await page.waitForTimeout(400);
    expect(named(await events(page), 'hover')).toHaveLength(0);
    const p = await at(page, A[1]);
    expect(p.hidden).toBe(false);
    await page.mouse.move(p.x, p.y);
    expect((await waitForEvent(page, 'hover')).payload.points?.[0]).toMatchObject({
      curveNumber: 0,
      pointNumber: 1,
      lon: 60,
      lat: 30,
    });
    await expect(visibleLabel(page)).toContainText('a1');
  });

  test('a drag turns it: the land that was grabbed follows the pointer, and is drawn there', async ({
    page,
  }) => {
    await open(page, 'globe3d');
    await events(page, true);
    // From the Kalahari to where the Indian Ocean is drawn, east of Madagascar.
    const from = await at(page, KALAHARI);
    const to = { x: from.x + 70, y: from.y - 10 };
    const sea = await at(page, ATLANTIC);
    await park(page);
    await expectLit(page, from, LAND);
    await expectLit(page, to, OCEAN);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    for (let k = 1; k <= 7; k++) await page.mouse.move(from.x + 10 * k, from.y - (10 / 7) * k);
    // Still held: the globe has followed every step, and the grabbed land is under the pointer.
    expect(dist(await at(page, KALAHARI), to)).toBeLessThan(2);
    await expectLit(page, to, LAND);
    await page.mouse.up();
    const relayout = await oneRelayout(page);
    expect(Object.keys(relayout).sort()).toEqual([
      'geo.projection.rotation.lat',
      'geo.projection.rotation.lon',
    ]);
    expect(relayout['geo.projection.rotation.lon']).toBeLessThan(-15);
    expect(Math.abs(relayout['geo.projection.rotation.lat'] as number)).toBeGreaterThan(1);
    expect(named(await events(page), 'relayouting').length).toBeGreaterThan(0);
    const v = await view(page);
    expect(v).toMatchObject({ globe: true, viewport: '3d' });
    expect(v.rotation.lon).toBeCloseTo(relayout['geo.projection.rotation.lon'] as number, 9);
    // The meshes turned with the view: land and sea are where the view now puts them.
    expect(dist(await at(page, KALAHARI), to)).toBeLessThan(2);
    await park(page);
    await expectLit(page, to, LAND);
    expect(dist(await at(page, ATLANTIC), sea)).toBeGreaterThan(50);
    await expectLit(page, await at(page, ATLANTIC), OCEAN);
    await expectLit(page, await at(page, SAHARA), LAND);
    // The markers went with it, the far side stays hidden.
    for (const lonlat of [A[0], A[2]]) {
      const marker = await at(page, lonlat);
      expect(marker.hidden).toBe(false);
      await expectColor(page, marker, RED);
    }
    expect((await at(page, A[3])).hidden).toBe(true);
    await expectColor(page, await at(page, A[3]), RED, false);
  });

  test('the wheel zooms it about the pointer, and a double-click turns it back', async ({
    page,
  }) => {
    await open(page, 'globe3d');
    const first = await view(page);
    const start = await at(page, A[0]);
    const p = whole(await at(page, A[1]));
    const held = await under(page, p);
    await page.mouse.move(p.x, p.y);
    await waitForEvent(page, 'hover');
    await events(page, true);
    await wheelBurst(page, p, -100, 6);
    const relayout = await oneRelayout(page);
    expect(relayout['geo.projection.scale'] as number).toBeGreaterThan(first.scale * 1.5);
    // What was under the pointer still is, and the globe is drawn at the new scale.
    expect(dist(await at(page, held), p)).toBeLessThan(2);
    await park(page);
    await expectColor(page, await at(page, A[1]), RED);
    await expectLit(page, await at(page, [55, 24]), LAND);
    await expectLit(page, await at(page, [62, 18]), OCEAN);
    // The globe is larger than the subplot now: its corner is on the sphere.
    const v = await view(page);
    const corner = { x: v.rect.x + v.rect.width - 6, y: v.rect.y + 6 };
    const c = await pixel(page, corner);
    expect(light(c, LAND) !== null || light(c, OCEAN) !== null).toBe(true);
    await events(page, true);
    await page.mouse.dblclick(p.x, p.y);
    await waitForEvent(page, 'doubleclick');
    await expect.poll(async () => dist(await at(page, A[0]), start)).toBeLessThan(0.5);
    expect((await view(page)).scale).toBeCloseTo(first.scale, 9);
    expect((await view(page)).rotation.lon).toBeCloseTo(0, 9);
    await park(page);
    await expectColor(page, start, RED);
    await expectLit(page, await at(page, SAHARA), LAND);
    await expectLit(page, await at(page, ATLANTIC), OCEAN);
  });

  test("a relayout between 'orthographic' and 'globe3d' redraws the map, both ways", async ({
    page,
  }) => {
    await open(page, 'globe');
    /** The map is drawn flat (the layers in their own colors) or as a globe (lit), and works. */
    const drawn = async (viewport: '2d' | '3d'): Promise<void> => {
      await settle(page);
      await park(page);
      const round = viewport === '3d';
      expect(await view(page)).toMatchObject({ globe: round, viewport });
      // The globe's viewport exists while the map is a globe, under the 2D one, and only then.
      expect((await viewports(page)).filter((name) => name.startsWith('subplot-'))).toEqual(
        round ? ['subplot-geo-globe', 'subplot-geo'] : ['subplot-geo'],
      );
      await expectLit(page, await at(page, SAHARA), LAND);
      await expectLit(page, await at(page, ATLANTIC), OCEAN);
      // Where the light is low a globe is darker than the flat map's color.
      await expectColor(page, await at(page, KALAHARI), LAND, !round);
      await expectLit(page, await at(page, KALAHARI), LAND);
      // The far side shows on neither.
      await expectLit(page, await at(page, FAR_LAND), LAND, false);
      // The markers are above the map, and hover goes on working.
      await expectColor(page, await at(page, A[0]), RED);
      await events(page, true);
      const p = await at(page, A[1]);
      await page.mouse.move(p.x, p.y);
      expect((await waitForEvent(page, 'hover')).payload.points?.[0]).toMatchObject({
        curveNumber: 0,
        pointNumber: 1,
      });
    };
    await drawn('2d');
    await callChart(page, 'relayout', { 'geo.projection.type': 'globe3d' });
    await drawn('3d');
    await callChart(page, 'relayout', { 'geo.projection.type': 'orthographic' });
    await drawn('2d');
    await callChart(page, 'relayout', { 'geo.projection.type': 'globe3d' });
    await drawn('3d');
    // A drag of the flat map, then of the globe it becomes again: both follow the pointer.
    for (const type of ['orthographic', 'globe3d']) {
      await callChart(page, 'relayout', { 'geo.projection.type': type });
      await settle(page);
      await events(page, true);
      const from = await at(page, SAHARA);
      const to = { x: from.x + 40, y: from.y + 10 };
      await dragBetween(page, from, to, 6);
      await oneRelayout(page);
      expect(dist(await at(page, SAHARA), to)).toBeLessThan(2);
      await park(page);
      await expectLit(page, to, LAND);
    }
    // A turned globe keeps its view through the switch, and the flat map is drawn turned.
    await callChart(page, 'relayout', {
      'geo.projection.rotation.lon': -50,
      'geo.projection.rotation.lat': 0,
    });
    await settle(page);
    await park(page);
    const sahara = await at(page, SAHARA);
    await expectLit(page, sahara, LAND);
    await callChart(page, 'relayout', { 'geo.projection.type': 'orthographic' });
    await settle(page);
    expect(await view(page)).toMatchObject({ globe: false, viewport: '2d' });
    expect((await view(page)).rotation.lon).toBeCloseTo(-50, 9);
    expect(dist(await at(page, SAHARA), sahara)).toBeLessThan(0.01);
    await expectColor(page, sahara, LAND);
    await expectColor(page, await at(page, ATLANTIC), OCEAN);
  });

  test('the view keys and a box selection work on it as on a flat globe', async ({ page }) => {
    await open(page, 'globe3d');
    // Shift + an arrow turns it, by one relayout; the meshes follow the view.
    await tabIntoChart(page);
    expect(await press(page, 'ArrowRight')).toContain('a0');
    await events(page, true);
    expect(await press(page, 'Shift+ArrowLeft')).toMatch(/^Map centered at longitude/);
    expect(Object.keys(await oneRelayout(page))).toEqual(['geo.projection.rotation.lon']);
    const turned = await view(page);
    expect(turned.rotation.lon).toBeLessThan(-5);
    expect(turned).toMatchObject({ globe: true, viewport: '3d' });
    await park(page);
    await expectLit(page, await at(page, SAHARA), LAND);
    await expectLit(page, await at(page, ATLANTIC), OCEAN);
    expect(dist(await at(page, SAHARA), await at(page, ATLANTIC))).toBeGreaterThan(50);
    // 0 turns it back.
    await events(page, true);
    await press(page, '0');
    await oneRelayout(page);
    expect((await view(page)).rotation.lon).toBeCloseTo(0, 9);
    await page.keyboard.press('Escape');

    // A box selects the markers inside it, and the globe does not move.
    await callChart(page, 'relayout', { dragmode: 'select' });
    await settle(page);
    const still = await view(page);
    await events(page, true);
    const a0 = await at(page, A[0]);
    const a1 = await at(page, A[1]);
    await dragBetween(page, { x: a0.x - 15, y: a0.y + 15 }, { x: a1.x + 15, y: a1.y - 15 }, 8);
    expect(picked(await waitForEvent(page, 'selected'))).toEqual([
      [0, 0, 10, 10],
      [0, 1, 60, 30],
    ]);
    expect(named(await events(page), 'relayouting')).toHaveLength(0);
    expect(await view(page)).toEqual(still);
    await park(page);
    await settle(page);
    await expectColor(page, a0, RED);
    await expectColor(page, await at(page, B[0]), BLUE, false);
    await expectLit(page, await at(page, SAHARA), LAND);
  });

  test('fitbounds gives it the view that fits the data, and it is drawn in that view', async ({
    page,
  }) => {
    await open(page, 'globe3d');
    const first = await view(page);
    await callChart(page, 'relayout', { 'geo.fitbounds': 'locations' });
    await settle(page);
    const fitted = await view(page);
    expect(fitted).toMatchObject({ globe: true, viewport: '3d' });
    expect(Math.abs(fitted.rotation.lon - first.rotation.lon)).toBeGreaterThan(10);
    await park(page);
    let seen = 0;
    for (const [lonlat, color] of [
      [SAHARA, LAND],
      [KALAHARI, LAND],
      [ATLANTIC, OCEAN],
      [INDIAN_OCEAN, OCEAN],
    ] as const) {
      const p = await at(page, lonlat);
      const r = fitted.rect;
      const inside =
        p.x > r.x + 2 && p.x < r.x + r.width - 2 && p.y > r.y + 2 && p.y < r.y + r.height - 2;
      if (p.hidden || !inside) continue;
      await expectLit(page, p, color);
      seen++;
    }
    expect(seen).toBeGreaterThan(1);
    for (const lonlat of [A[0], A[1]]) await expectColor(page, await at(page, lonlat), RED);
  });

  test('resolution 50: the globe is drawn from the 50m basemap and turns without the 110m one', async ({
    page,
  }) => {
    const loaded: string[] = [];
    page.on('request', (request) => {
      const m = /\/(base-\d+m|extras-\d+m)\.ts/.exec(request.url());
      if (m) loaded.push(m[1]!);
    });
    await open(page, 'hires3d');
    expect(await full(page, 'geo.resolution')).toBe(50);
    expect(await view(page)).toMatchObject({ globe: true, viewport: '3d' });
    await park(page);
    await expectLit(page, await at(page, SAHARA), LAND);
    await expectLit(page, await at(page, ATLANTIC), OCEAN);
    await events(page, true);
    const from = await at(page, SAHARA);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    const seen: number[] = [];
    for (let k = 1; k <= 12; k++) {
      await page.mouse.move(from.x + 8 * k, from.y - 3 * k);
      seen.push((await view(page)).rotation.lon);
    }
    const to = { x: from.x + 96, y: from.y - 36 };
    for (let k = 1; k < seen.length; k++) expect(seen[k]).toBeLessThan(seen[k - 1]!);
    expect(dist(await at(page, SAHARA), to)).toBeLessThan(2);
    await page.mouse.up();
    const relayout = await oneRelayout(page);
    expect(relayout['geo.projection.rotation.lon']).toBeLessThan(-20);
    await park(page);
    await settle(page);
    await expectLit(page, to, LAND);
    await expectLit(page, await at(page, ATLANTIC), OCEAN);
    await expectColor(page, await at(page, A[0]), RED);
    // Zoom in on the strait of Gibraltar, which the 50m coast has open and narrow.
    await events(page, true);
    const strait = whole(await at(page, [-5.6, 35.95]));
    await page.mouse.move(strait.x, strait.y);
    await page.mouse.wheel(0, -2000);
    await oneRelayout(page);
    await park(page);
    await settle(page);
    await expectLit(page, await at(page, [-5.6, 35.95]), OCEAN);
    await expectLit(page, await at(page, [-5.6, 36.6]), LAND);
    await expectLit(page, await at(page, [-5.6, 35.3]), LAND);
    // A globe projects nothing, so it never asks for the basemap a flat map turns with.
    expect(loaded).toContain('base-50m');
    expect(loaded).not.toContain('base-110m');
  });
});

test.describe('a scoped map (usa)', () => {
  test.beforeEach(async ({ page }) => {
    await open(page, 'usa');
  });

  test('a drag pans: center.lon and center.lat, and nothing turns', async ({ page }) => {
    const first = await view(page);
    expect(first.mode).toBe('scoped');
    await events(page, true);
    const marker = await at(page, [-100, 40]);
    await expectColor(page, marker, RED);
    // Kansas, between the markers and away from the state lines.
    const from = await at(page, KANSAS);
    await expectColor(page, from, LAND);
    const to = { x: from.x + 60, y: from.y + 30 };
    await dragBetween(page, from, to, 8);
    const relayout = await oneRelayout(page);
    expect(Object.keys(relayout).sort()).toEqual(['geo.center.lat', 'geo.center.lon']);
    const v = await view(page);
    expect(v.rotation).toEqual(first.rotation);
    expect(v.scale).toBeCloseTo(first.scale, 9);
    expect(v.center?.lon).toBeCloseTo(relayout['geo.center.lon'] as number, 6);
    expect(v.center?.lat).toBeCloseTo(relayout['geo.center.lat'] as number, 6);
    // A pan is a translation: every point moved by the drag.
    const moved = await at(page, [-100, 40]);
    expect(moved.x - marker.x).toBeCloseTo(60, 0);
    expect(moved.y - marker.y).toBeCloseTo(30, 0);
    await park(page);
    await expectColor(page, moved, RED);
    await expectColor(page, to, LAND);
  });

  test('double-click goes back to the first view', async ({ page }) => {
    const first = await at(page, [-100, 40]);
    const from = await at(page, KANSAS);
    await dragBetween(page, from, { x: from.x - 50, y: from.y + 20 }, 8);
    await waitForEvent(page, 'relayout');
    await settle(page);
    expect(dist(await at(page, [-100, 40]), first)).toBeGreaterThan(40);
    await events(page, true);
    await page.mouse.dblclick(from.x, from.y);
    await waitForEvent(page, 'doubleclick');
    await expect.poll(async () => dist(await at(page, [-100, 40]), first)).toBeLessThan(1);
    await park(page);
    await expectColor(page, first, RED);
  });
});

/** The wheel in each kind of map: the keys its relayout may have. */
const WHEEL = [
  {
    variant: 'world',
    marker: A[1],
    keys: [
      'geo.projection.rotation.lon',
      'geo.center.lon',
      'geo.center.lat',
      'geo.projection.scale',
    ],
  },
  {
    variant: 'globe',
    marker: A[1],
    keys: ['geo.projection.rotation.lon', 'geo.projection.rotation.lat', 'geo.projection.scale'],
  },
  {
    variant: 'usa',
    marker: [-80, 35],
    keys: ['geo.center.lon', 'geo.center.lat', 'geo.projection.scale'],
  },
] as const;

for (const { variant, marker, keys } of WHEEL) {
  test(`${variant}: the wheel zooms about the pointer and commits one relayout when it rests`, async ({
    page,
  }) => {
    await open(page, variant);
    const first = await view(page);
    const p = whole(await at(page, marker));
    const held = await under(page, p);
    await page.mouse.move(p.x, p.y);
    await waitForEvent(page, 'hover');
    await events(page, true);
    // d3's zoom doubles the scale every 500 px of wheel.
    await page.mouse.wheel(0, -300);
    const relayout = await oneRelayout(page);
    expect(Object.keys(relayout).every((k) => (keys as readonly string[]).includes(k))).toBe(true);
    const scale = relayout['geo.projection.scale'] as number;
    expect(scale / first.scale).toBeCloseTo(2 ** 0.6, 3);
    expect(named(await events(page), 'relayouting').length).toBeGreaterThan(0);
    const v = await view(page);
    expect(v.scale).toBeCloseTo(scale, 9);
    expect(await full(page, 'geo.projection.scale')).toBeCloseTo(scale, 9);
    if (variant === 'usa') expect(v.rotation).toEqual(first.rotation);
    // What was under the pointer still is, and the hovered marker still has its label.
    expect(dist(await at(page, held), p)).toBeLessThan(1.5);
    await expect(visibleLabel(page)).toHaveCount(1);
    await expect(visibleLabel(page)).toContainText(variant === 'usa' ? 'a2' : 'a1');

    // Part of the way back out.
    await events(page, true);
    await page.mouse.wheel(0, 200);
    const out = await oneRelayout(page);
    expect((out['geo.projection.scale'] as number) / scale).toBeCloseTo(2 ** -0.4, 3);
    expect(dist(await at(page, held), p)).toBeLessThan(1.5);
    // On the canvas too (the label's arrow is over the marker while it is hovered).
    await park(page);
    await expectColor(page, p, RED);
  });

  test(`${variant}: a spin of the wheel is one gesture, with one relayout`, async ({ page }) => {
    await open(page, variant);
    const first = await view(page);
    const p = whole(await at(page, marker));
    const held = await under(page, p);
    await events(page, true);
    await wheelBurst(page, p, -100, 4);
    const relayout = await oneRelayout(page);
    expect((relayout['geo.projection.scale'] as number) / first.scale).toBeCloseTo(2 ** 0.8, 3);
    // One preview per notch, one commit for all.
    expect(named(await events(page), 'relayouting')).toHaveLength(4);
    expect(dist(await at(page, held), p)).toBeLessThan(1.5);
    // A drag right after a spin commits the spin first: two relayouts, the zoom then the move.
    await events(page, true);
    await wheelBurst(page, p, -100, 1);
    const to = { x: p.x + 30, y: p.y + 10 };
    await dragBetween(page, p, to, 6);
    await expect.poll(async () => geoRelayouts(await events(page)).length).toBe(2);
    await settle(page);
    const [zoom, move] = geoRelayouts(await events(page)).map((e) => e.payload);
    expect(zoom).toHaveProperty(['geo.projection.scale']);
    expect(move).not.toHaveProperty(['geo.projection.scale']);
    // The pass of the first relayout came while the drag was on: the drag went on regardless.
    expect(dist(await at(page, held), to)).toBeLessThan(2);
  });
}

for (const scroll of ['false', 'cartesian']) {
  test(`config.scrollZoom ${scroll}: the wheel leaves the map alone and the page may scroll`, async ({
    page,
  }) => {
    await open(page, 'world', { scroll });
    const first = await view(page);
    await page.evaluate(() => {
      const w = window as unknown as { __wheel: boolean[] };
      w.__wheel = [];
      window.addEventListener('wheel', (e) => w.__wheel.push(e.defaultPrevented));
    });
    const p = await at(page, ATLANTIC);
    await page.mouse.move(p.x, p.y);
    await events(page, true);
    await page.mouse.wheel(0, -200);
    await page.waitForTimeout(600);
    const all = await events(page);
    expect(named(all, 'relayout')).toHaveLength(0);
    expect(named(all, 'relayouting')).toHaveLength(0);
    expect(await view(page)).toEqual(first);
    // Not prevented: the browser scrolls the page.
    expect(
      await page.evaluate(() => (window as unknown as { __wheel: boolean[] }).__wheel),
    ).toEqual([false]);
    // A drag still works.
    await dragBetween(page, p, { x: p.x + 40, y: p.y }, 6);
    await waitForEvent(page, 'relayout');
  });
}

test('the wheel over a map is the map’s: the page does not scroll', async ({ page }) => {
  await open(page, 'world');
  await page.evaluate(() => {
    const w = window as unknown as { __wheel: boolean[] };
    w.__wheel = [];
    window.addEventListener('wheel', (e) => w.__wheel.push(e.defaultPrevented));
  });
  const p = await at(page, ATLANTIC);
  await page.mouse.move(p.x, p.y);
  await page.mouse.wheel(0, -100);
  await waitForEvent(page, 'relayout');
  const prevented = () =>
    page.evaluate(() => (window as unknown as { __wheel: boolean[] }).__wheel);
  expect(await prevented()).toEqual([true]);
  // While the map is held too: the page does not scroll away under the drag, and the drag is
  // not a zoom.
  await settle(page);
  const scale = (await view(page)).scale;
  await events(page, true);
  await page.mouse.down();
  await page.mouse.move(p.x + 30, p.y, { steps: 3 });
  await page.mouse.wheel(0, -100);
  await expect.poll(prevented).toEqual([true, true]);
  await page.mouse.up();
  const relayout = await oneRelayout(page);
  expect(relayout).not.toHaveProperty(['geo.projection.scale']);
  expect((await view(page)).scale).toBeCloseTo(scale, 9);
});

test.describe('fitbounds', () => {
  test.beforeEach(async ({ page }) => {
    await open(page, 'fit');
  });

  const POINTS = [
    [0, 45],
    [20, 50],
    [10, 60],
    [30, 40],
    [-5, 55],
  ] as const;

  test('the first view fits the data', async ({ page }) => {
    expect(await full(page, 'geo.fitbounds')).toBe('locations');
    const v = await view(page);
    expect(v.scale).toBeGreaterThan(3);
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const lonlat of POINTS) {
      const p = await at(page, lonlat);
      // Every point is inside the map. (As in Plotly the fit is centred on the middle latitude,
      // which this projection does not draw in the middle: a marker can touch the edge.)
      expect(p.x).toBeGreaterThan(v.rect.x);
      expect(p.x).toBeLessThan(v.rect.x + v.rect.width);
      expect(p.y).toBeGreaterThan(v.rect.y);
      expect(p.y).toBeLessThan(v.rect.y + v.rect.height);
      x0 = Math.min(x0, p.x);
      x1 = Math.max(x1, p.x);
      y0 = Math.min(y0, p.y);
      y1 = Math.max(y1, p.y);
    }
    // And the data fills the map in the direction that is the tighter one.
    const fill = Math.max((x1 - x0 + 12) / v.rect.width, (y1 - y0 + 12) / v.rect.height);
    expect(fill).toBeGreaterThan(0.9);
    await expectColor(page, await at(page, POINTS[0]), RED);
    await expectColor(page, await at(page, POINTS[3]), BLUE);
  });

  test('the first gesture turns the fit off, and the view stays where the gesture left it', async ({
    page,
  }) => {
    await events(page, true);
    const from = await at(page, POINTS[1]);
    const to = { x: from.x - 60, y: from.y + 25 };
    await dragBetween(page, from, to, 8);
    const relayout = await oneRelayout(page);
    // While the fit is on the layout's view attributes are stand-ins: all of them are written.
    expect(Object.keys(relayout).sort()).toEqual(
      [
        'geo.center.lat',
        'geo.center.lon',
        'geo.fitbounds',
        'geo.projection.rotation.lon',
        'geo.projection.scale',
      ].sort(),
    );
    expect(relayout['geo.fitbounds']).toBe(false);
    expect(await full(page, 'geo.fitbounds')).toBe(false);
    // The pass that follows the relayout does not fit again: the marker is where it was left.
    expect(dist(await at(page, POINTS[1]), to)).toBeLessThan(2);
    await park(page);
    await expectColor(page, to, RED);

    // The next gesture has nothing to turn off.
    await events(page, true);
    const again = await at(page, POINTS[1]);
    await dragBetween(page, again, { x: again.x + 30, y: again.y }, 6);
    const second = await oneRelayout(page);
    expect(second).not.toHaveProperty(['geo.fitbounds']);

    // Double-click: the fit is back.
    await events(page, true);
    const sea = await at(page, [5, 43]);
    await page.mouse.dblclick(sea.x, sea.y);
    await waitForEvent(page, 'doubleclick');
    await expect.poll(() => full(page, 'geo.fitbounds')).toBe('locations');
    await settle(page);
    await expect.poll(async () => dist(await at(page, POINTS[1]), from)).toBeLessThan(1);
  });
});

test.describe('selection', () => {
  test.beforeEach(async ({ page }) => {
    await open(page, 'world');
    await callChart(page, 'relayout', { dragmode: 'select' });
  });

  test('a box selects the markers inside it; the map does not move; double-click deselects', async ({
    page,
  }) => {
    const first = await view(page);
    await events(page, true);
    const a0 = await at(page, A[0]);
    const a1 = await at(page, A[1]);
    // Around (10°, 10°) and (60°, 30°) of trace A, and nothing else.
    await dragBetween(page, { x: a0.x - 15, y: a0.y + 15 }, { x: a1.x + 15, y: a1.y - 15 }, 8);
    const selected = await waitForEvent(page, 'selected');
    expect(picked(selected)).toEqual([
      [0, 0, 10, 10],
      [0, 1, 60, 30],
    ]);
    const all = await events(page);
    expect(named(all, 'selecting').length).toBeGreaterThan(0);
    expect(named(all, 'relayouting')).toHaveLength(0);
    expect(geoRelayouts(all)).toHaveLength(0);
    expect(await view(page)).toEqual(first);
    await park(page);
    await settle(page);
    // Selected markers keep their color; the others are dimmed, in both traces.
    await expectColor(page, a0, RED);
    await expectColor(page, a1, RED);
    await expectColor(page, await at(page, A[2]), RED, false);
    await expectColor(page, await at(page, B[0]), BLUE, false);

    await events(page, true);
    const sea = await at(page, ATLANTIC);
    await page.mouse.dblclick(sea.x, sea.y);
    await waitForEvent(page, 'deselect');
    await park(page);
    await settle(page);
    await expectColor(page, await at(page, A[2]), RED);
    await expectColor(page, await at(page, B[0]), BLUE);
    expect(await view(page)).toEqual(first);
  });

  test('a lasso selects the markers inside it', async ({ page }) => {
    await callChart(page, 'relayout', { dragmode: 'lasso' });
    const first = await view(page);
    await events(page, true);
    const b0 = await at(page, B[0]);
    await page.mouse.move(b0.x - 20, b0.y - 20);
    await page.mouse.down();
    await page.mouse.move(b0.x + 25, b0.y - 20, { steps: 5 });
    await page.mouse.move(b0.x, b0.y + 25, { steps: 5 });
    await page.mouse.move(b0.x - 20, b0.y - 20, { steps: 5 });
    await page.mouse.up();
    expect(picked(await waitForEvent(page, 'selected'))).toEqual([[1, 0, -60, -15]]);
    expect(await view(page)).toEqual(first);
    expect(geoRelayouts(await events(page))).toHaveLength(0);
  });

  test('while selecting, the wheel leaves the map alone, as in Plotly', async ({ page }) => {
    // Plotly attaches its geo zoom behaviour in pan mode only.
    const first = await view(page);
    const p = await at(page, ATLANTIC);
    await page.mouse.move(p.x, p.y);
    await events(page, true);
    await page.mouse.wheel(0, -200);
    await page.waitForTimeout(600);
    expect(geoRelayouts(await events(page))).toHaveLength(0);
    expect(await view(page)).toEqual(first);
  });
});

test('config.staticPlot: nothing hovers, moves or zooms', async ({ page }) => {
  await open(page, 'world', { static: '1' });
  const first = await view(page);
  await expectColor(page, await at(page, A[1]), RED);
  await expectColor(page, await at(page, SAHARA), LAND);
  await events(page, true);
  const p = await at(page, A[1]);
  await page.mouse.move(p.x, p.y);
  await page.waitForTimeout(300);
  await expect(visibleLabel(page)).toHaveCount(0);
  expect(await cursor(page)).toBe('');
  await page.mouse.click(p.x, p.y);
  const sea = await at(page, ATLANTIC);
  await dragBetween(page, sea, { x: sea.x + 80, y: sea.y + 30 }, 8);
  await page.mouse.wheel(0, -300);
  await page.mouse.dblclick(sea.x, sea.y);
  await page.waitForTimeout(600);
  expect(await events(page)).toEqual([]);
  expect(await view(page)).toEqual(first);
  await expectColor(page, p, RED);
});

test.describe('two subplots', () => {
  test.beforeEach(async ({ page }) => {
    await open(page, 'two');
  });

  test('each subplot hovers its own trace', async ({ page }) => {
    const left = await view(page, 'geo');
    const right = await view(page, 'geo2');
    expect(left.mode).toBe('unclipped');
    expect(right.mode).toBe('clipped');
    expect(left.rect.x + left.rect.width).toBeLessThanOrEqual(right.rect.x);
    await events(page, true);
    const p = await at(page, [30, 30], 'geo2');
    await expectColor(page, p, BLUE);
    await page.mouse.move(p.x, p.y);
    expect((await waitForEvent(page, 'hover')).payload.points?.[0]).toMatchObject({
      curveNumber: 1,
      pointNumber: 1,
      lon: 30,
      lat: 30,
    });
    const q = await at(page, A[0], 'geo');
    await expectColor(page, q, RED);
    await page.mouse.move(q.x, q.y);
    await expect
      .poll(async () => named(await events(page), 'hover').at(-1)?.payload.points?.[0])
      .toMatchObject({ curveNumber: 0, pointNumber: 0, lon: 10, lat: 10 });
  });

  test('a drag in one subplot leaves the other alone, and the keys carry its id', async ({
    page,
  }) => {
    const left = await view(page, 'geo');
    const right = await view(page, 'geo2');
    const marker = await at(page, A[0], 'geo');

    await events(page, true);
    const from = await at(page, [30, 30], 'geo2');
    const to = { x: from.x - 50, y: from.y + 20 };
    await dragBetween(page, from, to, 8);
    const turned = await oneRelayout(page);
    expect(Object.keys(turned).sort()).toEqual([
      'geo2.projection.rotation.lat',
      'geo2.projection.rotation.lon',
    ]);
    expect(
      named(await events(page), 'relayouting').every((e) =>
        Object.keys(e.payload).every((k) => k.startsWith('geo2.')),
      ),
    ).toBe(true);
    expect(await view(page, 'geo')).toEqual(left);
    expect((await view(page, 'geo2')).rotation).not.toEqual(right.rotation);
    expect(dist(await at(page, [30, 30], 'geo2'), to)).toBeLessThan(2);
    await park(page);
    await expectColor(page, marker, RED);
    await expectColor(page, to, BLUE);

    // And the other way round.
    const after = await view(page, 'geo2');
    await events(page, true);
    const start = await at(page, A[0], 'geo');
    await dragBetween(page, start, { x: start.x + 40, y: start.y }, 8);
    const moved = await oneRelayout(page);
    expect(Object.keys(moved).every((k) => k.startsWith('geo.'))).toBe(true);
    expect(moved).toHaveProperty(['geo.projection.rotation.lon']);
    expect(await view(page, 'geo2')).toEqual(after);
    await park(page);
    await expectColor(page, to, BLUE);

    // The wheel, too, is the subplot's under the pointer.
    await events(page, true);
    await page.mouse.move(to.x, to.y);
    await page.mouse.wheel(0, -200);
    const zoomed = await oneRelayout(page);
    expect(Object.keys(zoomed).every((k) => k.startsWith('geo2.'))).toBe(true);
    expect(zoomed['geo2.projection.scale']).toBeGreaterThan(1.2);
    expect((await view(page, 'geo')).scale).toBeCloseTo(1, 9);
  });
});

test('resolution 50: the globe turns while it is dragged, and is drawn again after', async ({
  page,
}) => {
  await open(page, 'hires');
  expect(await full(page, 'geo.resolution')).toBe(50);
  await expectColor(page, await at(page, SAHARA), LAND);
  await events(page, true);
  const from = await at(page, A[0]);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  const seen: number[] = [];
  for (let k = 1; k <= 12; k++) {
    await page.mouse.move(from.x + 8 * k, from.y - 3 * k);
    // The view follows every step of the drag: the chart is not waiting for the 50m map.
    seen.push((await view(page)).rotation.lon);
  }
  const to = { x: from.x + 96, y: from.y - 36 };
  for (let k = 1; k < seen.length; k++) expect(seen[k]).toBeLessThan(seen[k - 1]!);
  // Still held: the marker is under the pointer.
  expect(dist(await at(page, A[0]), to)).toBeLessThan(2);
  await page.mouse.up();
  const relayout = await oneRelayout(page);
  expect(relayout['geo.projection.rotation.lon']).toBeLessThan(-20);
  await park(page);
  // After the release the layers are projected again: land where land is, sea where sea is,
  // the marker on top.
  await settle(page);
  await expectColor(page, to, RED);
  await expectColor(page, await at(page, SAHARA), LAND);
  await expectColor(page, await at(page, ATLANTIC), OCEAN);
  // Zoom in, where the 50m coast and the 110m coast are not the same line.
  await events(page, true);
  const sahara = whole(await at(page, SAHARA));
  const held = await under(page, sahara);
  await page.mouse.move(sahara.x, sahara.y);
  await page.mouse.wheel(0, -1000);
  const zoomed = await oneRelayout(page);
  expect(zoomed['geo.projection.scale']).toBeCloseTo(4, 1);
  await park(page);
  await settle(page);
  await expectColor(page, sahara, LAND);
  expect(dist(await at(page, held), sahara)).toBeLessThan(1.5);
  // The marker went with the map, and is drawn where the view says.
  const marker = await at(page, A[0]);
  expect(dist(marker, to)).toBeGreaterThan(20);
  await expectColor(page, marker, RED);
});

test.describe('lazy parts', () => {
  test('a basemap that arrives late: ready waits for it', async ({ page }) => {
    let requests = 0;
    await page.route('**/basemap/generated/base-110m.ts*', async (route) => {
      requests++;
      await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });
    await open(page, 'world');
    expect(requests).toBeGreaterThan(0);
    // `openInteraction` awaited `chart.ready`: the land is on the first frame after it.
    expect(near(await pixel(page, await at(page, SAHARA)), LAND)).toBe(true);
    await expectColor(page, await at(page, A[1]), RED);
  });

  test('a basemap that never arrives: ready resolves, the markers are drawn and still work', async ({
    page,
  }) => {
    expected = [/Failed to load resource/, /base-110m/];
    const warnings: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'warning') warnings.push(m.text());
    });
    await page.route('**/basemap/generated/base-110m.ts*', (route) => route.abort());
    await open(page, 'world');
    const p = await at(page, A[1]);
    await expectColor(page, p, RED);
    // The ocean is not a basemap layer: it is there. The land is not.
    await expectColor(page, await at(page, ATLANTIC), OCEAN);
    expect(near(await pixel(page, await at(page, SAHARA)), LAND)).toBe(false);
    expect(warnings.some((w) => /basemap could not be loaded/.test(w))).toBe(true);
    await events(page, true);
    await page.mouse.move(p.x, p.y);
    await waitForEvent(page, 'hover');
    await dragBetween(page, p, { x: p.x + 40, y: p.y }, 6);
    await oneRelayout(page);
    expect(dist(await at(page, A[1]), { x: p.x + 40, y: p.y })).toBeLessThan(2);
  });

  test('a relayout to a lazily loaded projection draws the map once its code is there', async ({
    page,
  }) => {
    await open(page, 'world');
    const before = await at(page, A[1]);
    await callChart(page, 'relayout', { 'geo.projection.type': 'robinson' });
    await expect.poll(() => full(page, 'geo.projection.type')).toBe('robinson');
    // The view is there once the chunk has loaded and the layout has run again.
    await expect
      .poll(() =>
        page.evaluate(() => (window as unknown as GeoWindow).__interaction.geo.view() !== null),
      )
      .toBe(true);
    await settle(page);
    const v = await view(page);
    expect(v.mode).toBe('unclipped');
    const p = await at(page, A[1]);
    // Robinson is not natural earth: the marker moved.
    expect(dist(p, before)).toBeGreaterThan(1);
    await expectColor(page, p, RED);
    await expectColor(page, await at(page, B[0]), BLUE);
    await expectColor(page, await at(page, SAHARA), LAND);
    await expectColor(page, await at(page, ATLANTIC), OCEAN);
    // And it is a map like any other.
    await events(page, true);
    await page.mouse.move(p.x, p.y);
    expect((await waitForEvent(page, 'hover')).payload.points?.[0]).toMatchObject({
      curveNumber: 0,
      pointNumber: 1,
    });
    const from = await at(page, A[0]);
    const to = { x: from.x + 60, y: from.y };
    await dragBetween(page, from, to, 8);
    const relayout = await oneRelayout(page);
    expect(relayout).toHaveProperty(['geo.projection.rotation.lon']);
    expect(dist(await at(page, A[0]), to)).toBeLessThan(2);
  });
});

/**
 * What each map must show: `[lon, lat]` and the color drawn there; `'lit'` when it is a layer of
 * a 3D globe, which has its color under the globe's light.
 */
const DRAWN: Record<
  string,
  readonly (readonly [readonly [number, number], readonly number[], 'lit'?])[]
> = {
  // The 3D globe, and the same at 50m: sphere meshes and 3D lines from three lazy chunks.
  globe3d: [
    [A[0], RED],
    [B[0], BLUE],
    [SAHARA, LAND, 'lit'],
    [ATLANTIC, OCEAN, 'lit'],
  ],
  hires3d: [
    [A[0], RED],
    [B[0], BLUE],
    [SAHARA, LAND, 'lit'],
    [ATLANTIC, OCEAN, 'lit'],
  ],
  world: [
    [A[1], RED],
    [B[0], BLUE],
    [SAHARA, LAND],
    [ATLANTIC, OCEAN],
  ],
  // Robinson: the code of the projection is a lazy chunk.
  robinson: [
    [A[1], RED],
    [B[0], BLUE],
    [SAHARA, LAND],
    [ATLANTIC, OCEAN],
  ],
  // The 50m basemap, on a globe.
  hires: [
    [A[0], RED],
    [B[0], BLUE],
    [SAHARA, LAND],
    [ATLANTIC, OCEAN],
  ],
  // A choropleth by ISO-3 `locations`: its regions come from the basemap.
  choro: [
    [FRANCE, LOW],
    [AUSTRALIA, HIGH],
    [LONDON, RED],
    [SAHARA, LAND],
    [ATLANTIC, OCEAN],
  ],
  // By country names, on Robinson at 50m: the name table, the projection and the basemap are
  // all loaded lazily.
  names: [
    [FRANCE, LOW],
    [AUSTRALIA, HIGH],
    [LONDON, RED],
    [SAHARA, LAND],
    [ATLANTIC, OCEAN],
  ],
};

test.describe('lazy parts: ready means drawn', () => {
  test.setTimeout(180_000);

  test('the code of a projection that arrives late: ready waits for it, then for the basemap', async ({
    page,
  }) => {
    let requests = 0;
    await page.route('**/geo/projections-extra.ts*', async (route) => {
      requests++;
      await new Promise((r) => setTimeout(r, 1200));
      await route.continue();
    });
    await open(page, 'robinson');
    expect(requests).toBeGreaterThan(0);
    // `openInteraction` awaited `chart.ready`: the map is on the first frame after it.
    expect((await view(page)).mode).toBe('unclipped');
    for (const [lonlat, color] of DRAWN['robinson']!) {
      expect(near(await pixel(page, await at(page, lonlat)), color)).toBe(true);
    }
  });

  test('a relayout to a lazily loaded projection resolves with the map drawn', async ({ page }) => {
    await open(page, 'world');
    await page.route('**/geo/projections-extra.ts*', async (route) => {
      await new Promise((r) => setTimeout(r, 800));
      await route.continue();
    });
    const before = await at(page, A[1]);
    await callChart(page, 'relayout', { 'geo.projection.type': 'robinson' });
    // No polling: the promise of the relayout waited for the code and the pass after it.
    const info = await page.evaluate(
      () => (window as unknown as GeoWindow).__interaction.geo.view() !== null,
    );
    expect(info).toBe(true);
    const p = await at(page, A[1]);
    expect(dist(p, before)).toBeGreaterThan(1);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(undefined))));
    expect(near(await pixel(page, p), RED)).toBe(true);
    expect(near(await pixel(page, await at(page, SAHARA)), LAND)).toBe(true);
  });

  test('a choropleth by country names on a lazy projection at 50m: ready waits for all three', async ({
    page,
  }) => {
    await open(page, 'names');
    for (const [lonlat, color] of DRAWN['names']!) {
      expect(near(await pixel(page, await at(page, lonlat)), color)).toBe(true);
    }
  });
});

test.describe('image export', () => {
  // The 50m basemap takes software GL a few seconds alone, and several times that under load.
  test.setTimeout(180_000);

  const decode = (url: string) => {
    expect(url.startsWith('data:image/png;base64,')).toBe(true);
    return PNG.sync.read(Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
  };

  for (const variant of Object.keys(DRAWN)) {
    test(`toImage of the ${variant} map, as the first map of the page, has the basemap and the traces`, async ({
      page,
    }) => {
      // A page that has drawn no map: nothing the export needs is loaded or cached.
      const loaded: string[] = [];
      page.on('request', (request) => {
        const m = /\/(base-\d+m|extras-\d+m|projections-extra|country-names)\.ts/.exec(
          request.url(),
        );
        if (m) loaded.push(m[1]!);
      });
      await open(page, 'blank');
      expect(loaded).toEqual([]);
      const url = await page.evaluate(
        (name) => (window as unknown as GeoWindow).__interaction.geo.toImage(name),
        variant,
      );
      const image = decode(url);
      expect([image.width, image.height]).toEqual([640, 400]);
      // The export is what loaded them.
      expect(loaded).toContain(
        variant === 'hires' || variant === 'hires3d' || variant === 'names'
          ? 'base-50m'
          : 'base-110m',
      );
      if (variant === 'robinson' || variant === 'names')
        expect(loaded).toContain('projections-extra');
      if (variant === 'names') expect(loaded).toContain('country-names');
      // Draw the same figure in the page to learn where things are in a figure of this size.
      await page.evaluate(async (name) => {
        const hook = (window as unknown as GeoWindow).__interaction;
        await (hook.chart as unknown as { react(f: unknown): Promise<unknown> }).react(
          hook.geo.figure(name),
        );
      }, variant);
      await settle(page);
      const o = await origin(page);
      for (const [lonlat, color, how] of DRAWN[variant]!) {
        const p = await at(page, lonlat);
        expect(p.hidden).toBe(false);
        const k = 4 * (Math.round(p.y - o.y) * image.width + Math.round(p.x - o.x));
        const rgb = [image.data[k]!, image.data[k + 1]!, image.data[k + 2]!];
        expect(
          shows(rgb, color, how),
          `${lonlat.join(', ')} is ${rgb.join(',')} in the image`,
        ).toBe(true);
      }
    });
  }

  test('chart.toImage of a map on screen matches a screenshot of it', async ({ page }) => {
    await open(page, 'names');
    await park(page);
    const canvas = page.locator('canvas').first();
    const box = (await canvas.boundingBox())!;
    expect(box).toMatchObject({ width: 640, height: 400 });
    const shot = PNG.sync.read(await page.screenshot({ clip: box }));
    const image = decode(
      await page.evaluate(() =>
        (
          window as unknown as { __interaction: { chart: { toImage(): Promise<string> } } }
        ).__interaction.chart.toImage(),
      ),
    );
    expect([image.width, image.height]).toEqual([640, 400]);
    const diff = pixelmatch(shot.data, image.data, undefined, 640, 400, { threshold: 0.1 });
    // MSAA edges may differ by a pixel between two contexts; everything else is equal.
    expect(diff / (640 * 400)).toBeLessThan(0.002);
    // The live chart is untouched.
    expect(await page.locator('canvas').count()).toBe(1);
  });
});

test.describe('context loss', () => {
  interface LossWindow {
    __interaction: {
      chart: {
        on(name: string, fn: () => void): void;
        three: {
          root: { contextLost: boolean };
          renderer: { getContext(): WebGL2RenderingContext };
        };
      };
    };
    __context?: { events: string[]; ext: WEBGL_lose_context };
  }

  const contextEvents = (page: Page): Promise<string[]> =>
    page.evaluate(() => (window as unknown as LossWindow).__context?.events ?? []);

  /** Lose the chart's WebGL context, check it is gone, and bring it back. */
  async function loseAndRestore(page: Page): Promise<void> {
    await page.evaluate(() => {
      const w = window as unknown as LossWindow;
      const chart = w.__interaction.chart;
      const ext = chart.three.renderer.getContext().getExtension('WEBGL_lose_context')!;
      const log: string[] = [];
      for (const name of ['webglcontextlost', 'webglcontextrestored']) {
        chart.on(name, () => void log.push(name));
      }
      w.__context = { events: log, ext };
      ext.loseContext();
    });
    await expect.poll(() => contextEvents(page)).toEqual(['webglcontextlost']);
    expect(
      await page.evaluate(
        () => (window as unknown as LossWindow).__interaction.chart.three.root.contextLost,
      ),
    ).toBe(true);
    await page.evaluate(() => (window as unknown as LossWindow).__context!.ext.restoreContext());
    await expect
      .poll(() => contextEvents(page))
      .toEqual(['webglcontextlost', 'webglcontextrestored']);
    await settle(page);
  }

  const CASES = [
    ['choro', {}, 'its own context'],
    ['choro', { shared: '1' }, 'the shared renderer'],
    ['hires', {}, 'its own context'],
    ['names', {}, 'its own context'],
    // The 3D globe: meshes, 3D lines and a second viewport come back too.
    ['hires3d', {}, 'its own context'],
    ['globe3d', { shared: '1' }, 'the shared renderer'],
  ] as const;

  for (const [variant, query, where] of CASES) {
    test(`${variant} on ${where}: the map is drawn again after a restore, and works`, async ({
      page,
    }) => {
      test.setTimeout(180_000);
      // The browser reports the loss and the restore on the console; nothing else may.
      expected.push(/Context (Lost|Restored)/i);
      const warnings: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'warning') warnings.push(message.text());
      });
      await open(page, variant, query);
      await park(page);
      const canvas = page.locator('canvas').first();
      const box = (await canvas.boundingBox())!;
      const before = PNG.sync.read(await page.screenshot({ clip: box }));
      await loseAndRestore(page);
      // Base layers and traces are back where they were.
      for (const [lonlat, color, how] of DRAWN[variant]!) {
        await expectColor(page, await at(page, lonlat), color, true, how);
      }
      const after = PNG.sync.read(await page.screenshot({ clip: box }));
      const diff = pixelmatch(before.data, after.data, undefined, box.width, box.height, {
        threshold: 0.1,
      });
      expect(diff / (box.width * box.height)).toBeLessThan(0.002);
      expect(warnings.filter((w) => !/Context (Lost|Restored)|GPU stall/i.test(w))).toEqual([]);

      // Hover a marker, and a region of the choropleth.
      const marker = DRAWN[variant]!.find(([, color]) => color === RED)!;
      const m = await at(page, marker[0]);
      await events(page, true);
      await page.mouse.move(m.x + 2, m.y + 2);
      await page.mouse.move(m.x, m.y);
      const regions = variant === 'choro' || variant === 'names';
      const text = regions ? 'London' : 'a0';
      expect((await waitForEvent(page, 'hover')).payload.points?.[0]).toMatchObject({ text });
      await expect(visibleLabel(page)).toContainText(text);
      if (regions) {
        const f = await at(page, FRANCE);
        await events(page, true);
        await page.mouse.move(f.x, f.y);
        await expect
          .poll(async () =>
            named(await events(page), 'hover').some(
              (e) =>
                (e.payload.points?.[0] as { location?: unknown } | undefined)?.location !== null,
            ),
          )
          .toBe(true);
      }
      // A drag moves the map; what was grabbed stays under the pointer, and is drawn there.
      await park(page);
      const from = await at(page, SAHARA);
      const to = { x: from.x + 50, y: from.y };
      await events(page, true);
      await dragBetween(page, from, to, 6);
      await oneRelayout(page);
      expect(dist(await at(page, SAHARA), to)).toBeLessThan(2);
      await park(page);
      await settle(page);
      for (const [lonlat, color, how] of DRAWN[variant]!) {
        const p = await at(page, lonlat);
        if (!p.hidden) await expectColor(page, p, color, true, how);
      }
      // The wheel zooms it.
      const scale = (await view(page)).scale;
      await events(page, true);
      await wheelBurst(page, await at(page, SAHARA), -100, 2);
      await oneRelayout(page);
      expect((await view(page)).scale).toBeGreaterThan(scale);
    });
  }
});

test.describe('touch', () => {
  test.use({ hasTouch: true });

  test('a tap on a marker hovers and clicks it', async ({ page }) => {
    await open(page, 'world');
    await events(page, true);
    const p = await at(page, A[1]);
    await page.touchscreen.tap(p.x, p.y);
    const click = await waitForEvent(page, 'click');
    expect(click.payload.points?.[0]).toMatchObject({ curveNumber: 0, pointNumber: 1, lon: 60 });
    const all = await events(page);
    expect(named(all, 'hover').at(-1)?.payload.points?.[0]).toMatchObject({
      curveNumber: 0,
      pointNumber: 1,
    });
    await expect(visibleLabel(page)).toContainText('a1');
    expect(geoRelayouts(all)).toHaveLength(0);
  });

  test('the canvas keeps every touch gesture (touch-action: none)', async ({ page }) => {
    await open(page, 'world');
    expect(
      await page.evaluate(
        () =>
          (window as unknown as GeoWindow).__interaction.chart.three.root.canvas.style.touchAction,
      ),
    ).toBe('none');
  });

  test('one finger drags a world map: it turns and the marker stays under the finger', async ({
    page,
  }) => {
    await open(page, 'world');
    await events(page, true);
    const from = await at(page, A[0]);
    const to = { x: from.x + 70, y: from.y + 30 };
    await touchGesture(page, [[from, to]]);
    const relayout = await oneRelayout(page);
    expect(relayout['geo.projection.rotation.lon']).toBeLessThan(-20);
    expect(relayout['geo.center.lat']).toBeGreaterThan(5);
    expect(dist(await at(page, A[0]), to)).toBeLessThan(2);
    expect(named(await events(page), 'click')).toHaveLength(0);
    // A finger hovers by tapping: the marker it dragged gets no label when it lifts.
    await expect(visibleLabel(page)).toHaveCount(0);
    expect(named(await events(page), 'hover')).toHaveLength(0);
    await expectColor(page, to, RED);
  });

  test('one finger turns a globe', async ({ page }) => {
    await open(page, 'globe');
    await events(page, true);
    const from = await at(page, A[0]);
    const to = { x: from.x + 60, y: from.y - 40 };
    await touchGesture(page, [[from, to]]);
    const relayout = await oneRelayout(page);
    expect(relayout['geo.projection.rotation.lon']).toBeLessThan(-10);
    expect(Math.abs(relayout['geo.projection.rotation.lat'] as number)).toBeGreaterThan(5);
    expect(dist(await at(page, A[0]), to)).toBeLessThan(2);
  });

  for (const variant of ['world', 'globe', 'usa'] as const) {
    test(`${variant}: two fingers pinch-zoom about their middle`, async ({ page }) => {
      await open(page, variant);
      const first = await view(page);
      await events(page, true);
      const marker = variant === 'usa' ? ([-100, 40] as const) : A[0];
      const m = await at(page, marker);
      // Fingers 40 px apart around the marker, then 120 px apart: three times the scale.
      await touchGesture(page, [
        [
          { x: m.x - 20, y: m.y },
          { x: m.x - 60, y: m.y },
        ],
        [
          { x: m.x + 20, y: m.y },
          { x: m.x + 60, y: m.y },
        ],
      ]);
      const relayout = await oneRelayout(page);
      const scale = relayout['geo.projection.scale'] as number;
      expect(scale / first.scale).toBeCloseTo(3, 1);
      expect((await view(page)).scale).toBeCloseTo(scale, 9);
      // The middle of the pinch did not move.
      expect(dist(await at(page, marker), m)).toBeLessThan(2);
      await expectColor(page, m, RED);
      expect(named(await events(page), 'click')).toHaveLength(0);

      // Fingers lifted one at a time: still one gesture, one relayout.
      await events(page, true);
      await touchGesture(
        page,
        [
          [
            { x: m.x - 60, y: m.y },
            { x: m.x - 30, y: m.y },
          ],
          [
            { x: m.x + 60, y: m.y },
            { x: m.x + 30, y: m.y },
          ],
        ],
        { liftOneByOne: true },
      );
      const back = await oneRelayout(page);
      expect((back['geo.projection.scale'] as number) / scale).toBeCloseTo(0.5, 1);
      expect(dist(await at(page, marker), m)).toBeLessThan(2);
    });
  }

  test('a one-finger lasso selects', async ({ page }) => {
    await open(page, 'world');
    await callChart(page, 'relayout', { dragmode: 'lasso' });
    const first = await view(page);
    await events(page, true);
    const q = await at(page, B[0]);
    await touchGesture(page, [
      [
        { x: q.x - 15, y: q.y - 20 },
        { x: q.x - 15, y: q.y + 20 },
        { x: q.x + 25, y: q.y + 20 },
        { x: q.x - 15, y: q.y - 20 },
      ],
    ]);
    expect(picked(await waitForEvent(page, 'selected'))).toEqual([[1, 0, -60, -15]]);
    expect(await view(page)).toEqual(first);
  });

  test('a double tap goes back to the first view', async ({ page }) => {
    await open(page, 'world');
    const from = await at(page, ATLANTIC);
    await touchGesture(page, [[from, { x: from.x + 60, y: from.y + 20 }]]);
    await waitForEvent(page, 'relayout');
    await settle(page);
    await events(page, true);
    const sea = await at(page, ATLANTIC);
    await page.touchscreen.tap(sea.x, sea.y);
    await page.touchscreen.tap(sea.x, sea.y);
    await waitForEvent(page, 'doubleclick');
    await expect.poll(async () => (await view(page)).rotation.lon).toBeCloseTo(0, 9);
  });
});
