import { expect, test, type Page } from '@playwright/test';
import { callChart, dragBetween, events, openInteraction, type LoggedEvent } from './helpers.ts';

/**
 * 3D camera animation on `_dev/interaction-scene-animation` (plan E7.5, E20.4):
 * `chart.animateCamera` orbits to the target and resolves after one `relayout` with the final
 * `scene.camera`; a drag interrupts it (the promise rejects with `AnimationInterrupted`) and
 * commits the dragged view; `scene.autorotate` turns the live camera over time without relayouts,
 * and stops (reporting the view it left) under `prefers-reduced-motion: reduce`, where flights jump.
 *
 * The example: 640×400 px, 20 px margins, one scene over the plot area (center (320, 200)),
 * Plotly's default camera (eye 1.25, 1.25, 1.25; z up; turntable).
 */
const EXAMPLE = '_dev/interaction-scene-animation';

interface Vec {
  x: number;
  y: number;
  z: number;
}

type Hook = {
  __interaction: {
    chart: {
      three: {
        root: { canvas: HTMLCanvasElement };
        viewports: readonly {
          kind: string;
          camera: { position: { x: number; y: number; z: number } };
        }[];
      };
      animateCamera(camera: unknown, options?: unknown): Promise<unknown>;
      fullLayout: Record<string, Record<string, unknown>>;
    };
  };
  __flight?: string;
};

async function at(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  const o = await page.evaluate(() => {
    const box = (window as unknown as Hook).__interaction.chart.three.root.canvas;
    const r = box.getBoundingClientRect();
    return { x: r.left, y: r.top };
  });
  return { x: o.x + x, y: o.y + y };
}

/** The scene camera's eye as drawn (the 3D viewport's three.js camera). */
async function liveEye(page: Page): Promise<Vec> {
  return page.evaluate(() => {
    const vp = (window as unknown as Hook).__interaction.chart.three.viewports.find(
      (v) => v.kind === '3d',
    )!;
    const p = vp.camera.position;
    return { x: p.x, y: p.y, z: p.z };
  });
}

/** Start a flight without waiting for it; its outcome lands in `window.__flight`. */
async function fly(page: Page, camera: unknown, options: unknown): Promise<void> {
  await page.evaluate(
    ([c, o]) => {
      const w = window as unknown as Hook;
      w.__flight = 'flying';
      w.__interaction.chart.animateCamera(c, o).then(
        () => (w.__flight = 'resolved'),
        (e: Error) => (w.__flight = e.name),
      );
    },
    [camera, options] as const,
  );
}

async function flight(page: Page): Promise<string | undefined> {
  return page.evaluate(() => (window as unknown as Hook).__flight);
}

function cameraRelayouts(all: LoggedEvent[]): Record<string, Vec>[] {
  return all
    .filter((e) => e.name === 'relayout' && 'scene.camera' in e.payload)
    .map((e) => e.payload['scene.camera'] as Record<string, Vec>);
}

const dist = (a: Vec, b: Vec): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

test.beforeEach(async ({ page }) => {
  await openInteraction(page, EXAMPLE);
});

test('animateCamera orbits to the target, then emits relayout and resolves', async ({ page }) => {
  await fly(page, { eye: { x: 2, y: 0, z: 0.5 } }, { duration: 800, easing: 'linear' });
  // Midway it is on the way round (not yet there, not on a straight line through the scene).
  await page.waitForTimeout(350);
  const mid = await liveEye(page);
  expect(await flight(page)).toBe('flying');
  expect(dist(mid, { x: 2, y: 0, z: 0.5 })).toBeGreaterThan(0.1);
  expect(Math.hypot(mid.x, mid.y, mid.z)).toBeGreaterThan(1.9);
  await expect.poll(() => flight(page), { timeout: 10_000 }).toBe('resolved');
  const [camera, ...more] = cameraRelayouts(await events(page));
  expect(more).toHaveLength(0);
  expect(camera!['eye']).toEqual({ x: 2, y: 0, z: 0.5 });
  expect(camera!['up']).toEqual({ x: 0, y: 0, z: 1 });
  const eye = await liveEye(page);
  expect(dist(eye, { x: 2, y: 0, z: 0.5 })).toBeLessThan(1e-6);
});

test('a drag interrupts a flight and commits the dragged view', async ({ page }) => {
  await fly(page, { eye: { x: -2, y: -2, z: 0.3 } }, { duration: 5000 });
  await page.waitForTimeout(300);
  await dragBetween(page, await at(page, 320, 200), await at(page, 400, 200), 8);
  await expect.poll(() => flight(page), { timeout: 10_000 }).toBe('AnimationInterrupted');
  await expect.poll(async () => cameraRelayouts(await events(page)).length).toBe(1);
  const eye = await liveEye(page);
  await page.waitForTimeout(400);
  // The flight is over: the camera stays where the drag left it.
  expect(dist(await liveEye(page), eye)).toBeLessThan(1e-9);
});

test('auto-rotation turns the camera over time and stops under reduced motion', async ({
  page,
}) => {
  await callChart(page, 'relayout', { 'scene.autorotate': { speed: 90 } });
  await events(page, true);
  const a = await liveEye(page);
  await page.waitForTimeout(500);
  const b = await liveEye(page);
  // About z: height and distance kept, the azimuth moved.
  expect(b.z).toBeCloseTo(a.z, 6);
  expect(Math.hypot(b.x, b.y)).toBeCloseTo(Math.hypot(a.x, a.y), 6);
  expect(dist(a, b)).toBeGreaterThan(0.1);
  expect(cameraRelayouts(await events(page))).toHaveLength(0);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  // It stops where it is and reports that view once.
  await expect.poll(async () => cameraRelayouts(await events(page)).length).toBe(1);
  const c = await liveEye(page);
  await page.waitForTimeout(400);
  expect(dist(await liveEye(page), c)).toBeLessThan(1e-9);
  const [reported] = cameraRelayouts(await events(page));
  expect(dist(reported!['eye']!, c)).toBeLessThan(1e-6);

  // Flights jump under reduced motion.
  await fly(page, { eye: { x: 0, y: 2, z: 1 } }, { duration: 5000 });
  await expect.poll(() => flight(page), { timeout: 5000 }).toBe('resolved');
  expect(dist(await liveEye(page), { x: 0, y: 2, z: 1 })).toBeLessThan(1e-6);
});
