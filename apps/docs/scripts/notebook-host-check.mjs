/** Real notebook-manager check. Start an isolated local Jupyter server; see docs/site. */
import process from 'node:process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';

const origin = process.env.HOLOCHART_NOTEBOOK_ORIGIN ?? 'http://127.0.0.1:8897';
const token = process.env.HOLOCHART_NOTEBOOK_TOKEN ?? 'holochart-wave2-local';
const host = process.argv[2] ?? 'lab';
const slugs = process.argv.slice(3);
const output = path.resolve(process.env.HOLOCHART_NOTEBOOK_OUTPUT ?? 'docs/site/wave2/notebooks');
const kernel = process.env.HOLOCHART_NOTEBOOK_KERNEL ?? 'holochart-wave2';
const runDate = process.env.HOLOCHART_NOTEBOOK_DATE ?? '2026-10-09';
if (!['lab', 'notebooks'].includes(host)) throw new Error('Expected lab or notebooks.');
const manifest = JSON.parse(await readFile('examples/notebooks/manifest.json', 'utf8'));
const inputs = process.env.HOLOCHART_NOTEBOOK_INPUTS
  ? JSON.parse(await readFile(process.env.HOLOCHART_NOTEBOOK_INPUTS, 'utf8'))
  : Object.fromEntries(manifest.notebooks.map((item) => [item.slug, item]));
const hashSource = async (file) =>
  createHash('sha256')
    .update(await readFile(file))
    .digest('hex');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
  ],
});
async function api(route, init = {}) {
  const response = await fetch(`${origin}/api/${route}`, {
    ...init,
    headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json' },
  });
  if (!response.ok) throw new Error(`${route}: HTTP ${response.status}`);
  return response.status === 204 ? null : response.json();
}
const results = [];
async function saveResults() {
  const resultFile = path.join(output, `${host}.json`);
  let previous = [];
  try {
    previous = JSON.parse(await readFile(resultFile, 'utf8'));
  } catch {
    /* First run. */
  }
  const merged = new Map([...previous, ...results].map((record) => [record.slug, record]));
  await writeFile(resultFile, `${JSON.stringify([...merged.values()], null, 2)}\n`);
}
try {
  for (const slug of slugs) {
    const input = inputs[slug];
    if (!input) throw new Error(`Missing verification input for ${slug}.`);
    const sourceSha256 = await hashSource(input.source);
    if (input.sourceSha256 && input.sourceSha256 !== sourceSha256)
      throw new Error(`${slug}: canonical source changed since host preparation.`);
    const file = `${slug}-${host}.ipynb`;
    const session = await api('sessions', {
      method: 'POST',
      body: JSON.stringify({
        path: file,
        name: file,
        type: 'notebook',
        kernel: { name: kernel },
      }),
    });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    const errors = [];
    const hostWarnings = [];
    page.on('pageerror', (e) => {
      // Notebook 7.6.3 emits this same startup error in the empty baseline notebook.
      // Keep it in the evidence; never classify bridge or other host exceptions as this warning.
      if (
        host === 'notebooks' &&
        e.message === "Cannot read properties of undefined (reading 'schema')" &&
        e.stack.includes('/static/notebook/notebook_core.')
      )
        hostWarnings.push(e.message);
      else errors.push(e.message);
    });
    try {
      const route =
        host === 'lab' ? `lab/workspaces/holochart-${slug}-${Date.now()}/tree` : 'notebooks';
      await page.goto(`${origin}/${route}/${file}?token=${token}`);
      await page.locator('.jp-CodeCell').first().waitFor({ timeout: 60_000 });
      // Cells appear before the frontend finishes connecting to the kernel.
      await expect(page.locator('.jp-Notebook-ExecutionIndicator')).toHaveAttribute(
        'data-status',
        'idle',
        { timeout: 60_000 },
      );
      // The session API created a fresh kernel for this clean notebook. Run it directly:
      // restarting again races the host's pending debugger/subshell initialization.
      await page.getByRole('menuitem', { name: 'Run', exact: true }).click();
      await page.getByRole('menuitem', { name: 'Run All Cells', exact: true }).click();
      await expect(
        page.locator('.jp-OutputArea').getByText(`HOLOCHART_COMPLETE_${slug}`, { exact: false }),
      ).toBeVisible({ timeout: 90_000 });
      await expect(page.locator('.jp-OutputArea canvas').first()).toBeVisible({ timeout: 60_000 });
      await expect(page.locator('.jp-OutputArea [role="alert"]:visible')).toHaveCount(0);
      await expect(page.locator('.jp-OutputArea-error')).toHaveCount(0);
      const canvases = page.locator('.jp-OutputArea canvas');
      await expect(canvases).toHaveCount(input.expectedWidgetOutputs, { timeout: 60_000 });
      const count = await canvases.count();
      let controlChanged = null;
      let rerunViews = null;
      if (slug === 'widget-controls') {
        const canvas = canvases.first();
        await canvas.scrollIntoViewIfNeeded();
        const before = (await canvas.screenshot()).toString('base64');
        await canvas.evaluate((el) => (el.dataset.hostMarker = 'retained'));
        const slider = page.getByRole('slider');
        await expect.poll(async () => Number(await slider.getAttribute('aria-valuenow'))).toBe(2);
        const handle = await slider.boundingBox();
        const track = await slider.evaluate(
          (el) => el.closest('.noUi-base').getBoundingClientRect().width,
        );
        if (!handle) throw new Error('Slider is not visible.');
        const x = handle.x + handle.width / 2;
        const y = handle.y + handle.height / 2;
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x + track / 3, y, { steps: 5 });
        await page.mouse.up();
        await expect.poll(async () => Number(await slider.getAttribute('aria-valuenow'))).toBe(3);
        await expect
          .poll(async () => (await canvas.screenshot()).toString('base64'), { timeout: 30_000 })
          .not.toBe(before);
        await expect(canvas).toHaveAttribute('data-host-marker', 'retained');
        await expect(canvases).toHaveCount(1);
        controlChanged = true;
        // Run the creation cell again in the same kernel, using the real notebook toolbar.
        await page.locator('.jp-CodeCell').nth(1).locator('.cm-content').click();
        await page.getByRole('button', { name: /^Run this cell and advance/ }).click();
        await expect
          .poll(async () => Number(await slider.getAttribute('aria-valuenow')), {
            timeout: 30_000,
          })
          .toBe(1);
        await expect(canvases).toHaveCount(1);
        await expect(page.locator('[data-host-marker="retained"]')).toHaveCount(0);
        rerunViews = 1;
      }
      // Notebook can replace a virtualized widget view as screenshot scrolls it into view.
      // Resolve the canvas again on detachment; keep all output and page-error checks strict.
      await expect(async () => {
        await canvases.first().screenshot({ path: path.join(output, `${host}-${slug}.png`) });
      }).toPass({ timeout: 30_000 });
      if (errors.length) throw new Error(errors.join('; '));
      if ((await hashSource(input.source)) !== sourceSha256)
        throw new Error(`${slug}: source changed during browser verification.`);
      results.push({
        host,
        slug,
        canvases: count,
        controlChanged,
        rerunViews,
        errors,
        hostWarnings,
        browser: browser.version(),
        date: runDate,
        source: input.source,
        sourceSha256,
        kind: input.kind ?? 'notebook',
        ...(input.exampleId ? { exampleId: input.exampleId } : {}),
        expectedWidgetOutputs: input.expectedWidgetOutputs,
      });
      await saveResults();
      console.log(
        `${host}/${slug}: ${count} canvas output(s), control=${controlChanged ?? 'n/a'}, no errors`,
      );
    } finally {
      await page.close();
      await api(`sessions/${session.id}`, { method: 'DELETE' });
    }
  }
  await saveResults();
} finally {
  await browser.close();
}
