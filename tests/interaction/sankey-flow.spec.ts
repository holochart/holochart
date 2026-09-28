import { expect, test, type Page } from '@playwright/test';
import { openInteraction } from './helpers.ts';

/**
 * Sankey flow particles on `_dev/sankey-flow` (plan E13.5c, E20.4): the particles move from frame
 * to frame (their animation time advances and the particle positions, computed like the vertex
 * shader does, change), and hold still under `prefers-reduced-motion: reduce`, from the start or
 * once the preference changes.
 */
const EXAMPLE = '_dev/sankey-flow';

interface Sample {
  time: number;
  count: number;
  /** World px of the first particles, placed like the vertex shader places them. */
  points: [number, number][];
}

/** The particles' time uniform and the positions of their first few particles. */
async function sample(page: Page): Promise<Sample> {
  // Let a frame render first, so the time uniform is the one just drawn.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(undefined))));
  return page.evaluate(() => {
    interface Particles {
      material?: { uniforms?: Record<string, { value: unknown }> };
      geometry?: {
        instanceCount?: number;
        attributes?: Record<string, { array: ArrayLike<number> }>;
      };
    }
    const hook = (
      window as unknown as {
        __interaction: { chart: { getTraceObjects(i: number): Particles[] } };
      }
    ).__interaction;
    const mesh = hook.chart.getTraceObjects(0).find((o) => o.material?.uniforms?.['uTime']);
    if (!mesh) throw new Error('no flow particles');
    const uniforms = mesh.material!.uniforms!;
    const time = uniforms['uTime']!.value as number;
    const paths = (uniforms['uPath']!.value as { image: { data: Float32Array } }).image.data;
    const motion = mesh.geometry!.attributes!['iMotion']!.array;
    const count = mesh.geometry!.instanceCount ?? 0;
    const S = 64;
    const points: [number, number][] = [];
    for (let p = 0; p < Math.min(count, 8); p++) {
      const [slot, phase, rate, lane] = [0, 1, 2, 3].map((c) => motion[p * 4 + c]!);
      const u = (((phase! + time * rate!) % 1) + 1) % 1;
      const f = u * (S - 1);
      const i = Math.min(Math.floor(f), S - 2);
      const a = (slot! * S + i) * 4;
      const at = (c: number): number =>
        paths[a + c]! + (paths[a + 4 + c]! - paths[a + c]!) * (f - i);
      points.push([at(0) + at(2) * lane!, at(1) + at(3) * lane!]);
    }
    return { time, count, points };
  });
}

async function canvasShot(page: Page): Promise<Buffer> {
  return page.locator('canvas').first().screenshot();
}

const pause = (page: Page, ms: number) => page.waitForTimeout(ms);

test.describe('sankey flow particles', () => {
  test('move over time', async ({ page }) => {
    await openInteraction(page, EXAMPLE);
    const a = await sample(page);
    expect(a.count).toBeGreaterThan(0);
    const shotA = await canvasShot(page);
    await pause(page, 400);
    const b = await sample(page);
    expect(b.time).toBeGreaterThan(a.time + 0.1);
    // At 80 px/s, 0.4 s moves every particle by about 32 px along its link.
    const moved = a.points.map(([x, y], i) => Math.hypot(b.points[i]![0] - x, b.points[i]![1] - y));
    expect(moved.filter((d) => d > 5).length).toBeGreaterThan(moved.length / 2);
    expect((await canvasShot(page)).equals(shotA)).toBe(false);
  });

  test('hold still with prefers-reduced-motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openInteraction(page, EXAMPLE);
    const a = await sample(page);
    expect(a.count).toBeGreaterThan(0);
    const shotA = await canvasShot(page);
    await pause(page, 400);
    const b = await sample(page);
    expect(b.time).toBe(a.time);
    expect(b.points).toEqual(a.points);
    expect((await canvasShot(page)).equals(shotA)).toBe(true);
  });

  test('stop when the preference changes, and go on from there when it is lifted', async ({
    page,
  }) => {
    await openInteraction(page, EXAMPLE);
    await pause(page, 200);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const a = await sample(page);
    await pause(page, 400);
    const b = await sample(page);
    expect(b.time).toBe(a.time);
    expect(b.points).toEqual(a.points);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await pause(page, 300);
    const c = await sample(page);
    // The clock resumes where it stopped (no jump by the time spent still).
    expect(c.time).toBeGreaterThan(b.time);
    expect(c.time).toBeLessThan(b.time + 0.6);
  });
});
