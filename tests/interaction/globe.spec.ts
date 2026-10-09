import { expect, test, type Page } from '@playwright/test';
import pngjs from 'pngjs';
import { callChart, events, openInteraction, type LoggedEvent } from './helpers.ts';

const { PNG } = pngjs;

/**
 * The traces on the 3D globe (backlog GEO8, ADR-028), on `_dev/interaction-globe`: `choropleth`
 * regions as a mesh on the sphere and as prisms, hovered and clicked through GPU picking (a
 * region where it is drawn, nothing through the globe, a prism on its wall and on its cap, a
 * prism in front of the region behind it, the new view after a drag), `scattergeo` arcs above
 * the surface and hidden behind the globe, image export, the relayout between `'orthographic'`
 * and `'globe3d'`, and a globe next to a 3D scene (two GPU pickers on one render root).
 *
 * The example draws one figure per page load, chosen by the query parameter `globe` (see its
 * header): 640×400 px, 20 px margins, a globe 180 px in radius turned to (0°, 0°). The tests do
 * no projection maths: `window.__interaction.globe` maps a longitude, a latitude and a height
 * above the surface to page px (`toPage`) and gives the highest point of an arc (`arcTop`).
 *
 * Picks are asynchronous (ADR-010) and slow under software GL: every expectation on an event
 * polls for it.
 */
const EXAMPLE = '_dev/interaction-globe';

/** The regions of the example: location → `[lon, lat]` of a point inside, `z`, `elevation`. */
const REGIONS = {
  MID: { at: [0, 0], index: 0, z: 10, elevation: 0 },
  TOWER: { at: [35, 0], index: 1, z: 30, elevation: 4 },
  BEHIND: { at: [57, 0], index: 2, z: 20, elevation: 0 },
  WEST: { at: [-50, 20], index: 3, z: 50, elevation: 1 },
  FAR: { at: [180, 40], index: 4, z: 40, elevation: 0 },
  FARTOP: { at: [145, 25], index: 5, z: 60, elevation: 2 },
} as const;
type Location = keyof typeof REGIONS;

/** `elevationscale` 0.5 over the largest elevation, 4. */
const heightOf = (location: Location): number => (REGIONS[location].elevation / 4) * 0.5;

const ROUTES = {
  front: { from: [-40, 30], to: [40, 30] },
  back: { from: [140, -30], to: [220, -30] },
  lift: 0.3,
} as const;

interface Pt {
  x: number;
  y: number;
}
type PagePoint = Pt & { hidden: boolean };

interface GlobeView {
  rotation: { lon: number; lat: number };
  scale: number;
  radius: number;
  globe: boolean;
  viewports: string[];
}

interface GlobeWindow {
  __interaction: {
    chart: { fullLayout: Record<string, unknown> | undefined };
    globe: {
      toPage(lon: number, lat: number, height?: number, id?: string): PagePoint | null;
      arcTop(
        from: readonly [number, number],
        to: readonly [number, number],
        lift: number,
        id?: string,
      ): PagePoint | null;
      view(id?: string): GlobeView | null;
      toImage(name: string): Promise<string>;
    };
  };
}

async function open(page: Page, variant: string): Promise<void> {
  await openInteraction(page, EXAMPLE, { globe: variant });
}

/** Where the point `height` radii above a longitude and latitude is drawn now, page px. */
async function at(page: Page, lonlat: readonly [number, number], height = 0): Promise<PagePoint> {
  const p = await page.evaluate(
    ([lon, lat, h]) => (window as unknown as GlobeWindow).__interaction.globe.toPage(lon!, lat!, h),
    [lonlat[0], lonlat[1], height] as const,
  );
  if (!p) throw new Error(`no position for ${lonlat.join(', ')}`);
  return p;
}

async function view(page: Page): Promise<GlobeView> {
  const v = await page.evaluate(() =>
    (window as unknown as GlobeWindow).__interaction.globe.view(),
  );
  if (!v) throw new Error('no view');
  return v;
}

/** Move the pointer to a page point, in a few steps so that hover follows. */
async function moveTo(page: Page, p: Pt): Promise<void> {
  await page.mouse.move(p.x - 3, p.y - 3);
  await page.mouse.move(p.x, p.y, { steps: 3 });
}

/** The point of the latest `name` event; `undefined` when the latest is another or has none. */
function latestPoint(
  log: readonly LoggedEvent[],
  name: string,
): Record<string, unknown> | undefined {
  const last = [...log].reverse().find((e) => e.name === name);
  return (last?.payload.points as Record<string, unknown>[] | undefined)?.[0];
}

/** Wait until hover is on `location` (the pick of the pointer's position has resolved). */
async function expectHover(page: Page, location: Location): Promise<void> {
  const region = REGIONS[location];
  await expect
    .poll(async () => latestPoint(await events(page), 'hover'), {
      message: `hover on ${location}`,
      timeout: 15_000,
    })
    .toMatchObject({
      curveNumber: expect.any(Number) as unknown as number,
      pointNumber: region.index,
      location,
      z: region.z,
      elevation: region.elevation,
    });
}

/** Give a pick the time to resolve, and expect that nothing was hovered meanwhile. */
async function expectNoHover(page: Page): Promise<void> {
  // Software GL resolves a pick within some hundred ms; two frames follow its delivery.
  await page.waitForTimeout(1500);
  expect((await events(page)).filter((e) => e.name === 'hover')).toEqual([]);
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

/** The arcs' red: far more red than green or blue. Land, ocean and regions are not. */
const isArc = (c: number[]): boolean => c[0]! > 170 && c[1]! < 90 && c[2]! < 110;
/** The regions' greens (lit or not): green well above red and blue. */
const isRegion = (c: number[]): boolean => c[1]! > c[0]! + 20 && c[1]! > c[2]! + 20;

/** Park the pointer off the map, so that no hover label is in a pixel check. */
async function park(page: Page): Promise<void> {
  await page.mouse.move(5, 5);
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
}

test.describe('choropleth on a 3D globe', () => {
  test('is drawn in the globe’s 3D viewport: regions on the near side, prisms above the surface', async ({
    page,
  }) => {
    await open(page, 'regions');
    expect(await view(page)).toMatchObject({ globe: true, viewports: ['3d', '2d'] });
    await park(page);
    // A flat region, the cap of the tower (half a radius up) and its wall facing the viewer.
    expect(isRegion(await pixel(page, await at(page, REGIONS.MID.at)))).toBe(true);
    expect(isRegion(await pixel(page, await at(page, REGIONS.TOWER.at, heightOf('TOWER'))))).toBe(
      true,
    );
    expect(isRegion(await pixel(page, await at(page, [30, 0], heightOf('TOWER') / 2)))).toBe(true);
    // Away from every region: ocean.
    expect(isRegion(await pixel(page, await at(page, [-20, -40])))).toBe(false);
    // The regions behind the globe are not drawn through it.
    const far = await at(page, REGIONS.FAR.at);
    expect(far.hidden).toBe(true);
    expect(isRegion(await pixel(page, far))).toBe(false);
    const farTop = await at(page, REGIONS.FARTOP.at, heightOf('FARTOP'));
    expect(farTop.hidden).toBe(true);
    expect(isRegion(await pixel(page, farTop))).toBe(false);
  });

  test('hovers and clicks a region on the near side through the GPU pick', async ({ page }) => {
    await open(page, 'regions');
    const mid = await at(page, [4, -3]);
    await moveTo(page, mid);
    await expectHover(page, 'MID');
    await events(page, true);
    await page.mouse.click(mid.x, mid.y);
    await expect
      .poll(async () => latestPoint(await events(page), 'click'), { timeout: 15_000 })
      .toMatchObject({ pointNumber: 0, location: 'MID', z: 10, elevation: 0 });
    // Off every region: the label goes.
    await events(page, true);
    await moveTo(page, await at(page, [-20, -40]));
    await expect
      .poll(async () => (await events(page)).some((e) => e.name === 'unhover'), {
        timeout: 15_000,
      })
      .toBe(true);
    expect((await events(page)).filter((e) => e.name === 'hover')).toEqual([]);
  });

  test('does not hover through the globe: neither a region nor a prism on the far side', async ({
    page,
  }) => {
    await open(page, 'regions');
    // Where the far regions would be drawn if the globe were glass: ocean, on the near side.
    for (const p of [
      await at(page, REGIONS.FAR.at),
      await at(page, REGIONS.FARTOP.at),
      await at(page, REGIONS.FARTOP.at, heightOf('FARTOP')),
    ]) {
      expect(p.hidden).toBe(true);
      await events(page, true);
      await moveTo(page, p);
      await expectNoHover(page);
    }
  });

  test('hits a prism on its side wall and on its cap', async ({ page }) => {
    await open(page, 'regions');
    // The cap: half a radius above the middle of the tower.
    await moveTo(page, await at(page, REGIONS.TOWER.at, heightOf('TOWER')));
    await expectHover(page, 'TOWER');
    // Its west wall faces the viewer: halfway up the middle of the tower's west edge. The
    // surface under that pixel is not the tower's.
    await events(page, true);
    await moveTo(page, await at(page, [-20, -40]));
    await expect
      .poll(async () => (await events(page)).some((e) => e.name === 'unhover'), {
        timeout: 15_000,
      })
      .toBe(true);
    await events(page, true);
    await moveTo(page, await at(page, [30, 0], heightOf('TOWER') / 2));
    await expectHover(page, 'TOWER');
    // The low prism in the west, on its cap and on the wall that faces the viewer (its east).
    await moveTo(page, await at(page, REGIONS.WEST.at, heightOf('WEST')));
    await expectHover(page, 'WEST');
    await moveTo(page, await at(page, [-40, 20], heightOf('WEST') / 2));
    await expectHover(page, 'WEST');
  });

  test('a prism in front hides the region behind it from the pick', async ({ page }) => {
    await open(page, 'regions');
    // A point of the flat region behind the tower, on the tower's side of it: the tower's cap is
    // drawn over it.
    const covered = await at(page, [52, 0]);
    expect(covered.hidden).toBe(false);
    await moveTo(page, covered);
    await expectHover(page, 'TOWER');
    // The same region where the tower does not reach.
    await moveTo(page, await at(page, [57, 15]));
    await expectHover(page, 'BEHIND');
  });

  test('after a drag the pick follows the new view', async ({ page }) => {
    await open(page, 'regions');
    const before = await view(page);
    const stale = await at(page, REGIONS.MID.at);
    // Turn the globe by a drag over the ocean: the middle region goes east.
    const from = await at(page, [-20, -40]);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 140, from.y, { steps: 8 });
    await page.mouse.up();
    await expect
      .poll(async () => (await events(page)).some((e) => e.name === 'relayout'))
      .toBe(true);
    const after = await view(page);
    expect(Math.abs(after.rotation.lon - before.rotation.lon)).toBeGreaterThan(20);
    // The region that was in the middle is where the view now has it, and is hit there.
    const mid = await at(page, REGIONS.MID.at);
    expect(mid.hidden).toBe(false);
    expect(Math.abs(mid.x - stale.x)).toBeGreaterThan(60);
    await events(page, true);
    await moveTo(page, mid);
    await expectHover(page, 'MID');
    // A prism too, on its cap.
    await moveTo(page, await at(page, REGIONS.WEST.at, heightOf('WEST')));
    await expectHover(page, 'WEST');
    // Where the middle region was before the drag it is no longer hit.
    await events(page, true);
    await moveTo(page, stale);
    await page.waitForTimeout(1500);
    expect(latestPoint(await events(page), 'hover')?.['location']).not.toBe('MID');
  });

  test('exports the regions and the prisms with toImage', async ({ page }) => {
    await open(page, 'regions');
    const url = await page.evaluate(() =>
      (window as unknown as GlobeWindow).__interaction.globe.toImage('regions'),
    );
    const png = PNG.sync.read(Buffer.from(url.split(',')[1]!, 'base64'));
    expect([png.width, png.height]).toEqual([640, 400]);
    const colorAt = async (lonlat: readonly [number, number], height = 0): Promise<number[]> => {
      // The image is the page's figure: the same px, from the canvas' corner.
      const p = await at(page, lonlat, height);
      const box = (await page.locator('canvas').first().boundingBox())!;
      const k = (Math.round(p.y - box.y) * png.width + Math.round(p.x - box.x)) * 4;
      return [png.data[k]!, png.data[k + 1]!, png.data[k + 2]!];
    };
    expect(isRegion(await colorAt(REGIONS.MID.at))).toBe(true);
    expect(isRegion(await colorAt(REGIONS.TOWER.at, heightOf('TOWER')))).toBe(true);
    expect(isRegion(await colorAt([30, 0], heightOf('TOWER') / 2))).toBe(true);
    expect(isRegion(await colorAt([-20, -40]))).toBe(false);
  });

  test("a relayout between 'globe3d' and 'orthographic' draws the other way, both ways", async ({
    page,
  }) => {
    await open(page, 'regions');
    await park(page);
    const cap = await at(page, REGIONS.TOWER.at, heightOf('TOWER'));
    const wall = await at(page, [30, 0], heightOf('TOWER') / 2);
    const base = await at(page, REGIONS.TOWER.at);
    // Between the tower's footprint and the region east of it: no region on the surface there,
    // and the tower's wall is drawn over it.
    const gap = await at(page, [42.5, 0]);
    expect(isRegion(await pixel(page, wall))).toBe(true);
    expect(isRegion(await pixel(page, gap))).toBe(true);

    // Flat: the regions are 2D fills, the tower is its footprint and has no wall.
    await callChart(page, 'relayout', { 'geo.projection.type': 'orthographic' });
    expect(await view(page)).toMatchObject({ globe: false, viewports: ['2d'] });
    await park(page);
    expect(isRegion(await pixel(page, base))).toBe(true);
    expect(isRegion(await pixel(page, gap))).toBe(false);
    // Hover is the flat map's, at once.
    await events(page, true);
    await moveTo(page, base);
    await expectHover(page, 'TOWER');

    // And the globe again: prisms, picked on the GPU.
    await callChart(page, 'relayout', { 'geo.projection.type': 'globe3d' });
    expect(await view(page)).toMatchObject({ globe: true, viewports: ['3d', '2d'] });
    await park(page);
    expect(isRegion(await pixel(page, gap))).toBe(true);
    expect(isRegion(await pixel(page, cap))).toBe(true);
    await events(page, true);
    await moveTo(page, wall);
    await expectHover(page, 'TOWER');
  });

  test('starts on the flat map and goes to the globe (the globe’s code loads on the way)', async ({
    page,
  }) => {
    await open(page, 'flat');
    expect(await view(page)).toMatchObject({ globe: false, viewports: ['2d'] });
    await callChart(page, 'relayout', { 'geo.projection.type': 'globe3d' });
    expect(await view(page)).toMatchObject({ globe: true, viewports: ['3d', '2d'] });
    await park(page);
    expect(isRegion(await pixel(page, await at(page, [42.5, 0])))).toBe(true);
    await moveTo(page, await at(page, REGIONS.TOWER.at, heightOf('TOWER')));
    await expectHover(page, 'TOWER');
  });
});

test.describe('scattergeo on a 3D globe', () => {
  /** The highest point of a route, and the point of its ground track under it. */
  async function route(page: Page, which: 'front' | 'back') {
    const { from, to } = ROUTES[which];
    return page.evaluate(
      ([a, b, lift]) => {
        const globe = (window as unknown as GlobeWindow).__interaction.globe;
        return { top: globe.arcTop(a!, b!, lift!)!, ground: globe.arcTop(a!, b!, 0)! };
      },
      [from, to, ROUTES.lift] as const,
    );
  }

  test('draws an arc above the surface, off its ground track, and hides one behind the globe', async ({
    page,
  }) => {
    await open(page, 'arcs');
    expect(await view(page)).toMatchObject({ globe: true, viewports: ['3d', '2d'] });
    await park(page);
    const front = await route(page, 'front');
    // 68° of arc at a lift of 0.3: the top is 0.36 radii up, 38 px above its ground track.
    expect(front.ground.y - front.top.y).toBeGreaterThan(30);
    expect(isArc(await pixel(page, front.top))).toBe(true);
    expect(isArc(await pixel(page, front.ground))).toBe(false);
    // The route on the far side: its top is inside the disc, behind the globe.
    const back = await route(page, 'back');
    expect(back.top.hidden).toBe(true);
    expect(isArc(await pixel(page, back.top))).toBe(false);
    expect(isArc(await pixel(page, back.ground))).toBe(false);
  });

  test('keeps the arcs on the globe when it turns, and its markers hover as on a flat globe', async ({
    page,
  }) => {
    await open(page, 'arcs');
    const from = await at(page, [0, -40]);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x - 90, from.y + 30, { steps: 8 });
    await page.mouse.up();
    await expect
      .poll(async () => (await events(page)).some((e) => e.name === 'relayout'))
      .toBe(true);
    await park(page);
    const front = await route(page, 'front');
    expect(front.top.hidden).toBe(false);
    expect(isArc(await pixel(page, front.top))).toBe(true);
    // A marker at the end of the route: scattergeo's CPU hover.
    await events(page, true);
    await moveTo(page, await at(page, ROUTES.front.to));
    await expect
      .poll(async () => latestPoint(await events(page), 'hover'), { timeout: 15_000 })
      .toMatchObject({ curveNumber: 1, pointNumber: 1, text: 'a1' });
  });

  test('exports the arcs with toImage, and a relayout to the flat globe draws the ground track', async ({
    page,
  }) => {
    await open(page, 'arcs');
    const front = await route(page, 'front');
    const url = await page.evaluate(() =>
      (window as unknown as GlobeWindow).__interaction.globe.toImage('arcs'),
    );
    const png = PNG.sync.read(Buffer.from(url.split(',')[1]!, 'base64'));
    const box = (await page.locator('canvas').first().boundingBox())!;
    const inImage = (p: Pt): number[] => {
      const k = (Math.round(p.y - box.y) * png.width + Math.round(p.x - box.x)) * 4;
      return [png.data[k]!, png.data[k + 1]!, png.data[k + 2]!];
    };
    expect(isArc(inImage(front.top))).toBe(true);
    expect(isArc(inImage(front.ground))).toBe(false);

    await callChart(page, 'relayout', { 'geo.projection.type': 'orthographic' });
    await park(page);
    expect(isArc(await pixel(page, front.ground))).toBe(true);
    expect(isArc(await pixel(page, front.top))).toBe(false);
    await callChart(page, 'relayout', { 'geo.projection.type': 'globe3d' });
    await park(page);
    expect(isArc(await pixel(page, front.top))).toBe(true);
    expect(isArc(await pixel(page, front.ground))).toBe(false);
  });
});

test.describe('a globe next to a 3D scene', () => {
  test('both are hovered through their own GPU picks on the one render root', async ({ page }) => {
    await open(page, 'both');
    // A region of the globe (trace 1)…
    await moveTo(page, await at(page, REGIONS.MID.at));
    await expectHover(page, 'MID');
    expect(latestPoint(await events(page), 'hover')).toMatchObject({ curveNumber: 1 });
    // …a point of the scene (trace 0). The scene is the left 46 % of the plot area and its
    // middle marker is near the scene's middle: sweep outwards from there until one is hit.
    await events(page, true);
    const canvas = (await page.locator('canvas').first().boundingBox())!;
    const middle = { x: 20 + 0.23 * 600, y: 200 };
    const spots: Pt[] = [];
    for (let y = 80; y <= 320; y += 16) for (let x = 40; x <= 280; x += 16) spots.push({ x, y });
    spots.sort(
      (a, b) =>
        Math.hypot(a.x - middle.x, a.y - middle.y) - Math.hypot(b.x - middle.x, b.y - middle.y),
    );
    let hit: Record<string, unknown> | undefined;
    for (const spot of spots) {
      await page.mouse.move(canvas.x + spot.x, canvas.y + spot.y, { steps: 2 });
      await page.waitForTimeout(250);
      hit = latestPoint(await events(page), 'hover');
      if (hit?.['curveNumber'] === 0) break;
    }
    expect(hit).toMatchObject({ curveNumber: 0 });
    // …and the globe again.
    await events(page, true);
    await moveTo(page, await at(page, REGIONS.TOWER.at, heightOf('TOWER')));
    await expectHover(page, 'TOWER');
  });
});
