import { expect, test } from '@playwright/test';
import { bundleApp, ORIGIN, serveApp } from './esm-app.ts';

/**
 * The built-in default font through an app bundler (plan E2.18): `@mk7s/holochart`'s ESM build is
 * bundled with code splitting (rolldown, the bundler behind Vite 8, as an app would), and the page
 * must draw text with TeX Gyre Heros from the per-face lazy chunks (`data:` URLs, handed to troika
 * as `blob:` URLs): only the faces its text uses are loaded, and nothing is fetched from anywhere
 * but the page's own chunks. Needs the packages built (`pnpm build`).
 */

test('ESM: text draws with the default font from per-face lazy chunks', async ({ page }) => {
  test.setTimeout(60_000);
  const chunks = await bundleApp();
  const fontChunks = [...chunks.keys()].filter((name) => name.startsWith('texgyreheros-'));
  expect(fontChunks).toHaveLength(4);

  const { errors, requests } = await serveApp(page, chunks);

  await page.goto(`${ORIGIN}/`);
  await page.waitForFunction(() => 'Holochart' in window);
  const loadedChunks = () =>
    requests.filter((url) => url.includes('/texgyreheros-')).map((url) => new URL(url).pathname);

  const drawn = await page.evaluate(async () => {
    /* eslint-disable @typescript-eslint/no-explicit-any -- untyped global and troika internals */
    const hc = (window as any).Holochart;
    const chart = hc.createChart(document.getElementById('root'), {
      data: [{ x: [1, 2, 3], y: [2, 1, 3], name: 'Revenue' }],
      layout: {
        width: 400,
        height: 300,
        font: { family: "'Helvetica Neue', Helvetica, Arial, sans-serif" },
        title: { text: 'Quarterly revenue', font: { style: 'italic' } },
      },
    });
    await chart.ready;
    const labels: { text: string; font: string; typeset: boolean }[] = [];
    for (const viewport of chart.three.viewports) {
      viewport.scene.traverse((object: any) => {
        if (object.name !== 'holochart:text-batch') return;
        for (const text of object._members.keys()) {
          labels.push({ text: text.text, font: text.font, typeset: Boolean(text.textRenderInfo) });
        }
      });
    }
    chart.destroy();
    /* eslint-enable @typescript-eslint/no-explicit-any */
    return labels;
  });

  const title = drawn.filter((l) => l.text === 'Quarterly revenue');
  const others = drawn.filter((l) => l.text !== 'Quarterly revenue');
  expect(title).toHaveLength(1);
  expect(others.length).toBeGreaterThan(2);
  expect(title[0]).toMatchObject({ font: expect.stringMatching(/^blob:/), typeset: true });
  for (const label of others) {
    expect(label).toMatchObject({ font: expect.stringMatching(/^blob:/), typeset: true });
  }
  expect(new Set(others.map((l) => l.font)).size).toBe(1);
  expect(others[0]!.font).not.toBe(title[0]!.font);
  // Regular (ticks, legend) and italic (title) only.
  expect(loadedChunks().sort()).toEqual([
    expect.stringMatching(/^\/texgyreheros-italic-/),
    expect.stringMatching(/^\/texgyreheros-regular-/),
  ]);
  expect(requests.filter((url) => !url.startsWith(`${ORIGIN}/`))).toEqual([]);
  expect(errors).toEqual([]);
});
