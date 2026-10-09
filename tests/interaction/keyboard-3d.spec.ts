import { expect, test, type Page } from '@playwright/test';
import { events, openInteraction, waitForEvent } from './helpers.ts';
import { anchor, labels, press, tabIntoChart, trackAnchors } from './keyboard-helpers.ts';

/**
 * Keyboard access to 3D scenes (backlog S2.14) with real key presses: point navigation of
 * scatter3d (each stop labelled like its hover), keyboard orbit, dolly and reset of the camera
 * (Shift + arrows, + / -, 0) committed as GUI relayouts of `scene.camera` like drags, on scenes
 * with and without navigable traces, and the descriptions of the 3D traces, whose code loads
 * after the first description.
 */

interface Eye {
  x: number;
  y: number;
  z: number;
}

/** The scene's layout camera eye (Plotly's default: 1.25, 1.25, 1.25). */
async function eye(page: Page, scene = 'scene'): Promise<Eye> {
  return page.evaluate((id) => {
    const chart = (
      window as unknown as {
        __interaction: { chart: { fullLayout: Record<string, { camera: { eye: Eye } }> } };
      }
    ).__interaction.chart;
    const e = chart.fullLayout[id]!.camera.eye;
    return { x: e.x, y: e.y, z: e.z };
  }, scene);
}

const distance = (e: Eye): number => Math.hypot(e.x, e.y, e.z);
const azimuth = (e: Eye): number => (Math.atan2(e.y, e.x) * 180) / Math.PI;

/** The traces' descriptions once their lazily loaded code is there. */
async function descriptions(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const chart = (
      window as unknown as {
        __interaction: { chart: { describe(): Promise<{ traces: string[] } | undefined> } };
      }
    ).__interaction.chart;
    return (await chart.describe())?.traces ?? [];
  });
}

test.describe('scatter3d', () => {
  test.beforeEach(async ({ page }) => {
    await openInteraction(page, 'scatter3d/interaction');
    await tabIntoChart(page);
  });

  test('arrows step through the points, labelled like their hover', async ({ page }) => {
    await trackAnchors(page);
    expect(await press(page, 'ArrowRight')).toBe('alpha: x: 0, y: 0, z: 0, a0, point 1 of 5.');
    await expect(labels(page)).toHaveCount(1);
    await expect(labels(page)).toContainText('z: 0');
    const first = await anchor(page);
    expect(await press(page, 'ArrowRight')).toBe('alpha: x: 1, y: 1, z: 1, a1, point 2 of 5.');
    expect(await press(page, 'End')).toBe('alpha: x: 4, y: 4, z: 4, a4, point 5 of 5.');
    // The next trace has a hovertemplate: its stops read what the template shows.
    expect(await press(page, 'PageDown')).toBe('beta: beta b0: 1.0, point 1 of 3.');
    const hovers = (await events(page)).filter((e) => e.name === 'hover');
    expect(hovers.at(-1)?.payload.points?.[0]).toMatchObject({ curveNumber: 1, pointNumber: 0 });
    await page.keyboard.press('Escape');
    await expect(labels(page)).toHaveCount(0);
    // The first label sat on its point: a pointer there picks that point.
    await page.mouse.move(first.x, first.y);
    await expect(labels(page)).toContainText('a0');
  });

  test('Shift + arrows orbit the camera, + and - dolly it, 0 resets it', async ({ page }) => {
    await press(page, 'ArrowRight');
    const start = await eye(page);
    await events(page, true);
    expect(await press(page, 'Shift+ArrowRight')).toBe('View rotated.');
    const relayout = await waitForEvent(page, 'relayout');
    expect(Object.keys(relayout.payload)).toContain('scene.camera');
    // A turntable: 15° around the vertical, at the same height and distance.
    await expect.poll(async () => azimuth(await eye(page)) - azimuth(start)).toBeCloseTo(15, 3);
    const turned = await eye(page);
    expect(turned.z).toBeCloseTo(start.z, 6);
    expect(distance(turned)).toBeCloseTo(distance(start), 6);
    // The cursor's label follows its point to where it is drawn now.
    await expect(labels(page)).toHaveCount(1);
    expect(await press(page, 'Shift+ArrowUp')).toBe('View rotated.');
    await expect.poll(async () => (await eye(page)).z).toBeGreaterThan(start.z);
    expect(await press(page, '+')).toBe('Zoomed in.');
    await expect.poll(async () => distance(await eye(page))).toBeLessThan(distance(start) - 0.1);
    expect(await press(page, '0')).toBe('View reset.');
    await expect.poll(async () => distance(await eye(page))).toBeCloseTo(distance(start), 6);
    expect((await eye(page)).z).toBeCloseTo(start.z, 6);
    // The cursor is still there: the next arrow goes on from its point.
    expect(await press(page, 'ArrowRight')).toMatch(/^alpha: .*point 2 of 5\.$/);
  });
});

test('a scene without navigable traces still takes the view keys', async ({ page }) => {
  await openInteraction(page, 'surface/interaction');
  await tabIntoChart(page);
  const start = await eye(page);
  expect(await press(page, 'Shift+ArrowLeft')).toBe('View rotated.');
  await expect.poll(async () => azimuth(await eye(page)) - azimuth(start)).toBeCloseTo(-15, 3);
  expect(await press(page, '-')).toBe('Zoomed out.');
  await expect.poll(async () => distance(await eye(page))).toBeGreaterThan(distance(start) + 0.1);
  // Nothing to step through: the arrows say so.
  expect(await press(page, 'ArrowRight')).toBe('No data points to explore.');
});

test('a trace module built on the scene gets the view keys from sceneA11y', async ({ page }) => {
  await openInteraction(page, '_dev/interaction-scene');
  await tabIntoChart(page);
  const start = await eye(page);
  expect(await press(page, 'Shift+ArrowUp')).toBe('View rotated.');
  await expect.poll(async () => (await eye(page)).z).toBeGreaterThan(start.z);
});

test.describe('descriptions', () => {
  const CASES: readonly (readonly [string, RegExp])[] = [
    ['scatter3d/interaction', /^3D scatter 'alpha': 5 points; x 0–4; y 0–4; z 0–4\.$/],
    [
      'surface/interaction',
      /^Surface 'plane': 21 × 21 grid; x 0–20; y 0–20; z 0–12; highest at x 20, y 20\.$/,
    ],
    [
      '_dev/interaction-bar3d',
      /^3D bars 'bars': \d+ bars; x .+; y .+; z .+; tallest .+ at x .+, y .+\.$/,
    ],
    [
      '_dev/interaction-cone',
      /^Cone plot 'default': 3 cones; x .+; y .+; z .+; vector lengths .+–.+\.$/,
    ],
    [
      '_dev/interaction-streamtube',
      /^Streamtubes 'default': \d+ tubes?; x .+; y .+; z .+; speeds .+–.+\.$/,
    ],
    [
      '_dev/interaction-isosurface',
      /^Isosurface 'plane': \d+ × \d+ × \d+ grid; x .+; y .+; z .+; values .+–.+, drawn from .+–.+\.$/,
    ],
    [
      '_dev/interaction-volume',
      /^Volume 'raymarch': \d+ × \d+ × \d+ grid; x .+; y .+; z .+; values .+–.+, drawn from .+–.+\.$/,
    ],
    [
      '_dev/interaction-mesh3d',
      /^3D mesh 'vertex': \d+ vertices, \d+ triangles; x .+; y .+; z .+\.$/,
    ],
  ];
  for (const [example, summary] of CASES) {
    test(`${example} describes its first trace`, async ({ page }) => {
      await openInteraction(page, example);
      const traces = await descriptions(page);
      expect(traces[0]).toMatch(summary);
      // The hidden description (what assistive technology reads) has it too.
      await expect(page.locator('.holochart-a11y')).toContainText(traces[0]!);
    });
  }
});
