import { expect, type Page } from '@playwright/test';
import pngjs from 'pngjs';

/**
 * Pixel and state probes shared by the treemap and icicle specs: container points of the
 * example's fixed geometry, pixel colors, the trace's `level`, and the largest number of rect
 * instances drawn in a frame.
 */
const { PNG } = pngjs;

export type RGB = readonly [number, number, number];

export interface Pt {
  x: number;
  y: number;
}

/** Page point of container point `(x, y)` (the canvas's top-left corner is `(0, 0)`). */
export async function at(page: Page, x: number, y: number): Promise<Pt> {
  const box = await page.evaluate(() => {
    const hook = (
      window as unknown as {
        __interaction: { chart: { three: { root: { canvas: HTMLCanvasElement } } } };
      }
    ).__interaction;
    const b = hook.chart.three.root.canvas.getBoundingClientRect();
    return { left: b.left, top: b.top };
  });
  return { x: box.left + x, y: box.top + y };
}

export async function pixel(page: Page, p: Pt): Promise<RGB> {
  const png = PNG.sync.read(
    await page.screenshot({
      clip: { x: Math.round(p.x), y: Math.round(p.y), width: 1, height: 1 },
    }),
  );
  return [png.data[0] ?? -1, png.data[1] ?? -1, png.data[2] ?? -1];
}

const near = (a: RGB, b: RGB): boolean => a.every((c, k) => Math.abs(c - (b[k] ?? 0)) <= 10);

/** Wait until the pixel at `p` shows `rgb`. */
export async function expectColor(page: Page, p: Pt, rgb: RGB): Promise<void> {
  await expect.poll(async () => near(await pixel(page, p), rgb), { timeout: 10_000 }).toBe(true);
}

/** The first trace's `level` (`null` when unset). */
export async function level(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    const hook = (
      window as unknown as { __interaction: { chart: { data: Record<string, unknown>[] } } }
    ).__interaction;
    return hook.chart.data[0]?.['level'] ?? null;
  });
}

/**
 * From the next `restyle` on, record the largest number of rect instances the trace drew in a
 * frame, read back with {@link maxRects}: a transition draws the leaving tiles too, a snap never.
 */
export async function trackRects(page: Page): Promise<void> {
  await page.evaluate(() => {
    interface Obj {
      geometry?: { instanceCount?: number; attributes?: Record<string, unknown> };
    }
    const w = window as unknown as {
      __maxRects: number;
      __interaction: {
        chart: { on(name: string, fn: () => void): void; getTraceObjects(i: number): Obj[] };
      };
    };
    w.__maxRects = 0;
    let recording = false;
    const { chart } = w.__interaction;
    chart.on('restyle', () => (recording = true));
    chart.on('afterrender', () => {
      if (!recording) return;
      for (const o of chart.getTraceObjects(0)) {
        // The rect primitive's mesh (its instanced rect attribute).
        if (!o.geometry?.attributes?.['iRect']) continue;
        const n = o.geometry.instanceCount;
        if (typeof n === 'number' && n !== Infinity) w.__maxRects = Math.max(w.__maxRects, n);
      }
    });
  });
}

export async function maxRects(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __maxRects: number }).__maxRects);
}

/** Register a listener returning `false` for `name`; `window.__off()` removes it. */
export async function cancelOn(page: Page, name: string): Promise<void> {
  await page.evaluate((event) => {
    const w = window as unknown as {
      __off?: () => void;
      __interaction: { chart: { on(name: string, fn: () => unknown): () => void } };
    };
    w.__off?.();
    w.__off = w.__interaction.chart.on(event, () => false);
  }, name);
}
