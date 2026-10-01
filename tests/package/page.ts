import { expect, type Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { BASE } from './server.ts';

/** What a fixture page draws (`window.holochartFixture`, see the fixtures' pages). */
export interface FixtureResult {
  viewports2d: number;
  viewports3d: number;
  webgl2: boolean;
}

/**
 * Open the fixture page at `path` (on the fixtures' server), wait for its 2D and 3D charts to be
 * ready, and check: no page errors or `console.error`, nothing requested from another origin, and
 * both charts drew something (not a blank canvas).
 */
export async function checkFixturePage(page: Page, path: string): Promise<string[]> {
  const errors: string[] = [];
  const requests: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('request', (req) => requests.push(req.url()));
  // No network beyond the fixtures' server.
  await page.route(
    (url) => url.origin !== BASE,
    (route) => route.abort('internetdisconnected'),
  );

  await page.goto(`${BASE}${path}`);
  await page.waitForFunction(() => 'holochartFixture' in window);
  const result = await page.evaluate(
    () => (window as unknown as { holochartFixture: Promise<FixtureResult> }).holochartFixture,
  );
  expect(result).toEqual({
    viewports2d: expect.any(Number),
    viewports3d: expect.any(Number),
    webgl2: true,
  });
  expect(result.viewports2d).toBeGreaterThan(0);
  expect(result.viewports3d).toBeGreaterThan(0);

  for (const id of ['chart2d', 'chart3d']) {
    const png = PNG.sync.read(await page.locator(`#${id}`).screenshot());
    const colors = new Set<number>();
    for (let i = 0; i < png.data.length; i += 4) colors.add(png.data.readUInt32BE(i));
    expect(colors.size, `${id} drew something`).toBeGreaterThan(20);
  }

  expect(errors).toEqual([]);
  expect(requests.filter((url) => !url.startsWith(`${BASE}/`))).toEqual([]);
  return requests;
}
