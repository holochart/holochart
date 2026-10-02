import { expect, test } from '@playwright/test';
import { dragBetween } from './helpers.ts';

/**
 * Container edge cases on `_dev/interaction-containers` (backlog S2.3): a chart created in a
 * hidden element takes the element's size when it is first shown, and a chart in an iframe's
 * document, created by the parent page's script, handles drags that listen on the window.
 */
const EXAMPLE = '_dev/interaction-containers';

interface Sized {
  size: { width: number; height: number };
  ready: Promise<unknown>;
  three: { root: { canvas: HTMLCanvasElement } };
}

declare global {
  interface Window {
    __containers?: {
      hidden: Sized;
      framed: Sized;
      frame: HTMLIFrameElement;
      show(): void;
      relayouts: Record<string, unknown>[];
    };
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto(`/?example=${EXAMPLE}&size=meta`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__containers !== undefined, undefined, {
    timeout: 30_000,
  });
  await page.evaluate(async () => {
    const hook = window.__containers!;
    await Promise.all([hook.hidden.ready, hook.framed.ready]);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
});

test('a chart created in a hidden element takes its size when first shown', async ({ page }) => {
  const size = () => page.evaluate(() => ({ ...window.__containers!.hidden.size }));
  // Nothing to measure yet: the default size.
  expect(await size()).toEqual({ width: 700, height: 450 });
  await page.evaluate(() => window.__containers!.show());
  await expect.poll(size).toEqual({ width: 400, height: 250 });
  const canvas = await page.evaluate(() => {
    const c = window.__containers!.hidden.three.root.canvas;
    const box = c.getBoundingClientRect();
    return { width: box.width, height: box.height, drawn: c.width > 0 && c.height > 0 };
  });
  expect(canvas).toEqual({ width: 400, height: 250, drawn: true });
  // Not `responsive`: it does not keep following the element.
  await page.evaluate(() => {
    const el = window.__containers!.hidden.three.root.canvas.parentElement!;
    el.style.width = '500px';
  });
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
  expect(await size()).toEqual({ width: 400, height: 250 });
});

test('a polar zoom-box drag works in an iframe created by the parent page', async ({ page }) => {
  const frame = await page.evaluate(() => {
    const box = window.__containers!.frame.getBoundingClientRect();
    return { x: box.left, y: box.top };
  });
  // The circle: radius 130 px around (200, 150). Drag from 30 px to 100 px out, along 200°.
  const along = (r: number): { x: number; y: number } => ({
    x: frame.x + 200 + r * Math.cos((200 * Math.PI) / 180),
    y: frame.y + 150 - r * Math.sin((200 * Math.PI) / 180),
  });
  await dragBetween(page, along(30), along(100), 10);
  await expect
    .poll(() => page.evaluate(() => window.__containers!.relayouts.length))
    .toBeGreaterThan(0);
  const range = await page.evaluate(
    () => window.__containers!.relayouts.at(-1)!['polar.radialaxis.range'] as number[],
  );
  expect(range[0]).toBeCloseTo((30 / 130) * 10, 0);
  expect(range[1]).toBeCloseTo((100 / 130) * 10, 0);
});
