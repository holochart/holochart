import type { Page } from '@playwright/test';
import { TEST_CONTAINER_ID, type ExampleTestResult } from '../../apps/sandbox/src/test-protocol.ts';

/**
 * Browser-side steps shared by the visual regression suite (`visual.spec.ts`, plan E20.3) and the
 * gallery generator (`tools/gallery-gen`, plan E19.5): one pipeline that opens an example in the
 * sandbox's test mode, waits for it to render, and screenshots its container. The suite compares
 * the screenshot with a baseline; the gallery encodes it as a thumbnail.
 */

/** Time to wait for the sandbox to install `window.__exampleReady` (module graph compile). */
export const BOOT_TIMEOUT_MS = 30_000;

/** Sandbox URL of an example in test mode (relative to the sandbox's base URL). */
export function exampleTestUrl(id: string): string {
  return `/?example=${encodeURIComponent(id)}&test=1`;
}

/** Opens the example in test mode and waits for it to render; retries once if Vite reloads. */
export async function openExample(page: Page, id: string): Promise<ExampleTestResult> {
  const url = exampleTestUrl(id);
  for (let attempt = 1; ; attempt++) {
    await page.goto(url, { waitUntil: 'load' });
    try {
      await page.waitForFunction(() => window.__exampleReady !== undefined, undefined, {
        timeout: BOOT_TIMEOUT_MS,
      });
      return await page.evaluate(() => window.__exampleReady as Promise<ExampleTestResult>);
    } catch (error) {
      // Vite may reload the page once after optimizing a newly discovered dependency.
      const message = error instanceof Error ? error.message : String(error);
      const reloaded = /Execution context was destroyed|navigation/i.test(message);
      if (!reloaded || attempt >= 2) throw error;
    }
  }
}

/**
 * Parks the pointer outside the example so hover-only UI (the modebar, hover labels) stays
 * hidden. Headless Chromium's initial pointer position differs by platform: on Linux CI it starts
 * over the page, so the modebar showed up in CI screenshots but not in macOS baselines.
 */
export async function parkPointer(page: Page): Promise<void> {
  const viewport = page.viewportSize();
  if (viewport) await page.mouse.move(viewport.width - 1, viewport.height - 1);
}

/** PNG screenshot of the example container, at CSS size (the sandbox forces DPR 1). */
export function screenshotExample(page: Page): Promise<Buffer> {
  return page.locator(`#${TEST_CONTAINER_ID}`).screenshot({
    animations: 'disabled',
    caret: 'hide',
    scale: 'css',
  });
}
