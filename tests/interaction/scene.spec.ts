import { expect, test, type Page } from '@playwright/test';
import {
  callChart,
  dragBetween,
  events,
  openInteraction,
  touchGesture,
  waitForEvent,
  type LoggedEvent,
} from './helpers.ts';

/**
 * 3D scene controls on `_dev/interaction-scene` (plan E14.1c, E20.4): turntable, orbit, zoom and
 * pan drags emit `relayouting` while they move and one `relayout` with Plotly's `scene.camera`
 * when the camera comes to rest; double-click goes back to the first view; the wheel zooms when
 * `config.scrollZoom` allows `scene`, orthographic scenes zoom through `scene.aspectratio`; touch
 * orbits with one finger and pinch-zooms with two; the modebar's 3D buttons set `scene.dragmode`
 * and reset the camera.
 *
 * The example: 640×400 px, 20 px margins, one scene over the plot area (center (320, 200)),
 * Plotly's default camera (eye 1.25, 1.25, 1.25; z up; turntable).
 */
const EXAMPLE = '_dev/interaction-scene';

interface Vec {
  x: number;
  y: number;
  z: number;
}
interface Camera {
  eye: Vec;
  center: Vec;
  up: Vec;
  projection: { type: string };
}

async function origin(page: Page): Promise<{ x: number; y: number }> {
  return page.evaluate(() => {
    const hook = (
      window as unknown as {
        __interaction: { chart: { three: { root: { canvas: HTMLCanvasElement } } } };
      }
    ).__interaction;
    const box = hook.chart.three.root.canvas.getBoundingClientRect();
    return { x: box.left, y: box.top };
  });
}

/** Page point at container px `(x, y)`. */
async function at(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  const o = await origin(page);
  return { x: o.x + x, y: o.y + y };
}

/** The last `relayout` carrying `scene.camera`. */
async function cameraRelayout(page: Page): Promise<Camera> {
  let found: LoggedEvent | undefined;
  await expect
    .poll(
      async () => {
        found = (await events(page))
          .filter((e) => e.name === 'relayout' && 'scene.camera' in e.payload)
          .at(-1);
        return found !== undefined;
      },
      { timeout: 10_000 },
    )
    .toBe(true);
  return (found as LoggedEvent).payload['scene.camera'] as Camera;
}

const dist = (a: Vec, b: Vec): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const DEFAULT_DISTANCE = Math.hypot(1.25, 1.25, 1.25);
const ORIGIN = { x: 0, y: 0, z: 0 };

async function fullCamera(page: Page): Promise<Camera> {
  return page.evaluate(() => {
    const hook = (
      window as unknown as {
        __interaction: { chart: { fullLayout: Record<string, Record<string, unknown>> } };
      }
    ).__interaction;
    return JSON.parse(JSON.stringify(hook.chart.fullLayout['scene']?.['camera'])) as Camera;
  });
}

test.beforeEach(async ({ page }) => {
  await openInteraction(page, EXAMPLE);
});

test('turntable drag: relayouting while moving, one relayout with scene.camera at rest', async ({
  page,
}) => {
  await dragBetween(page, await at(page, 320, 200), await at(page, 420, 230), 10);
  const cam = await cameraRelayout(page);
  const all = await events(page);
  expect(all.filter((e) => e.name === 'relayouting').length).toBeGreaterThan(1);
  expect(all.filter((e) => e.name === 'relayout')).toHaveLength(1);
  // Plotly's payload shape: z stays up, the eye turned around the center at the same distance.
  expect(Object.keys(cam).sort()).toEqual(['center', 'eye', 'projection', 'up']);
  expect(cam.up).toEqual({ x: 0, y: 0, z: 1 });
  expect(cam.center).toEqual(ORIGIN);
  expect(cam.projection).toEqual({ type: 'perspective' });
  expect(dist(cam.eye, ORIGIN)).toBeCloseTo(DEFAULT_DISTANCE, 6);
  expect(Math.abs(cam.eye.x - 1.25) + Math.abs(cam.eye.y - 1.25)).toBeGreaterThan(0.3);
  // Dragging down raised the eye.
  expect(cam.eye.z).toBeGreaterThan(1.25);
  expect(await fullCamera(page)).toEqual(cam);
});

test('orbit drag turns the up vector with the view', async ({ page }) => {
  await callChart(page, 'relayout', { 'scene.dragmode': 'orbit' });
  await events(page, true);
  await dragBetween(page, await at(page, 300, 150), await at(page, 360, 260), 10);
  const cam = await cameraRelayout(page);
  expect(dist(cam.eye, ORIGIN)).toBeCloseTo(DEFAULT_DISTANCE, 6);
  expect(cam.up.z).toBeLessThan(0.999);
});

test('zoom drag dollies the eye; pan drag moves eye and center together', async ({ page }) => {
  await callChart(page, 'relayout', { 'scene.dragmode': 'zoom' });
  await events(page, true);
  await dragBetween(page, await at(page, 320, 150), await at(page, 320, 250), 10);
  const zoomed = await cameraRelayout(page);
  expect(dist(zoomed.eye, ORIGIN)).toBeLessThan(DEFAULT_DISTANCE * 0.8);

  await callChart(page, 'relayout', { 'scene.dragmode': 'pan' });
  await events(page, true);
  await dragBetween(page, await at(page, 320, 200), await at(page, 380, 200), 10);
  const panned = await cameraRelayout(page);
  expect(dist(panned.center, ORIGIN)).toBeGreaterThan(0.05);
  expect(dist(panned.eye, panned.center)).toBeCloseTo(dist(zoomed.eye, zoomed.center), 6);
});

test('double-click goes back to the first view', async ({ page }) => {
  await dragBetween(page, await at(page, 320, 200), await at(page, 420, 200), 8);
  await cameraRelayout(page);
  await events(page, true);
  const p = await at(page, 320, 200);
  await page.mouse.dblclick(p.x, p.y);
  await waitForEvent(page, 'doubleclick');
  const cam = await cameraRelayout(page);
  expect(cam.eye.x).toBeCloseTo(1.25, 9);
  expect(cam.eye.y).toBeCloseTo(1.25, 9);
  expect(cam.eye.z).toBeCloseTo(1.25, 9);
});

test('scroll zoom follows config.scrollZoom; orthographic scenes zoom their aspect ratio', async ({
  page,
}) => {
  const p = await at(page, 320, 200);
  await page.mouse.move(p.x, p.y);
  await page.mouse.wheel(0, 300);
  const out = await cameraRelayout(page);
  expect(dist(out.eye, ORIGIN)).toBeGreaterThan(DEFAULT_DISTANCE * 1.2);

  await page.evaluate(async () => {
    const chart = (
      window as unknown as {
        __interaction: {
          chart: {
            data: unknown[];
            layout: unknown;
            react(f: unknown): Promise<unknown>;
          };
        };
      }
    ).__interaction.chart;
    await chart.react({ data: chart.data, layout: chart.layout, config: { scrollZoom: false } });
  });
  await events(page, true);
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(600);
  expect((await events(page)).filter((e) => e.name === 'relayout')).toHaveLength(0);

  await page.evaluate(async () => {
    const chart = (
      window as unknown as {
        __interaction: {
          chart: { data: unknown[]; layout: unknown; react(f: unknown): Promise<unknown> };
        };
      }
    ).__interaction.chart;
    await chart.react({
      data: chart.data,
      layout: {
        ...(chart.layout as object),
        scene: { camera: { projection: { type: 'orthographic' } } },
      },
      config: {},
    });
  });
  await events(page, true);
  const before = await page.evaluate(() => {
    const hook = (
      window as unknown as {
        __interaction: { chart: { fullLayout: Record<string, Record<string, unknown>> } };
      }
    ).__interaction;
    return hook.chart.fullLayout['scene']?.['aspectratio'] as { x: number; y: number; z: number };
  });
  await page.mouse.wheel(0, -300);
  const zoom = await waitForEvent(page, 'relayout');
  const ratio = zoom.payload['scene.aspectratio'] as Vec;
  // Every axis scaled by the same factor, the camera kept.
  const k = ratio.x / before.x;
  expect(k).toBeGreaterThan(1.2);
  expect(ratio.y / before.y).toBeCloseTo(k, 9);
  expect(ratio.z / before.z).toBeCloseTo(k, 9);
  expect(zoom.payload['scene.aspectmode']).toBe('manual');
});

test('modebar: 3D drag buttons set every scene’s dragmode; reset buttons restore the camera', async ({
  page,
}) => {
  await expect(page.locator('button[data-button="tableRotation"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.click('button[data-button="orbitRotation"]');
  const mode = await waitForEvent(page, 'relayout');
  expect(mode.payload).toMatchObject({ 'scene.dragmode': 'orbit', dragmode: 'zoom' });
  await expect(page.locator('button[data-button="orbitRotation"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.click('button[data-button="pan3d"]');
  await expect
    .poll(async () => (await events(page)).at(-1)?.payload)
    .toMatchObject({ 'scene.dragmode': 'pan', dragmode: 'pan' });

  await dragBetween(page, await at(page, 320, 200), await at(page, 400, 240), 8);
  await cameraRelayout(page);
  await events(page, true);
  await page.click('button[data-button="resetCameraLastSave3d"]');
  const reset = await waitForEvent(page, 'relayout');
  expect(reset.payload['scene.camera.eye']).toEqual({ x: 1.25, y: 1.25, z: 1.25 });
  expect(reset.payload['scene.camera.center']).toEqual(ORIGIN);
  expect(await fullCamera(page)).toMatchObject({ eye: { x: 1.25, y: 1.25, z: 1.25 } });
  await events(page, true);
  await page.click('button[data-button="resetCameraDefault3d"]');
  const dflt = await waitForEvent(page, 'relayout');
  expect(dflt.payload['scene.camera.eye']).toBeNull();
});

test.describe('touch', () => {
  test.use({ hasTouch: true });

  test('one finger turns the scene; two fingers pinch-zoom', async ({ page }) => {
    const o = await origin(page);
    await touchGesture(page, [
      [
        { x: o.x + 300, y: o.y + 200 },
        { x: o.x + 400, y: o.y + 200 },
      ],
    ]);
    const turned = await cameraRelayout(page);
    expect(dist(turned.eye, ORIGIN)).toBeCloseTo(DEFAULT_DISTANCE, 6);
    expect(Math.abs(turned.eye.x - turned.eye.y)).toBeGreaterThan(0.2);
    await events(page, true);
    await touchGesture(page, [
      [
        { x: o.x + 300, y: o.y + 200 },
        { x: o.x + 240, y: o.y + 200 },
      ],
      [
        { x: o.x + 340, y: o.y + 200 },
        { x: o.x + 400, y: o.y + 200 },
      ],
    ]);
    const pinched = await cameraRelayout(page);
    // Fingers 40 px apart → 160 px apart: the eye comes about 4 times closer.
    expect(dist(pinched.eye, pinched.center)).toBeLessThan(DEFAULT_DISTANCE * 0.5);
  });
});
