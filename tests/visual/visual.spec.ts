import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type TestInfo } from '@playwright/test';
import type { ExampleTestResult } from '../../apps/sandbox/src/test-protocol.ts';
import {
  comparePng,
  DEFAULT_TILE_TOLERANCE,
  DEFAULT_TOLERANCE,
  domMask,
  type CompareResult,
} from './compare.ts';
import { listExampleIds } from './examples.ts';
import {
  BOOT_TIMEOUT_MS,
  openExample,
  parkPointer,
  screenshotDomLayers,
  screenshotExample,
} from './harness.ts';
import { DIFF_REPORT_DIR, reportFileFor, type DiffRecord } from './report-data.ts';

/**
 * Visual regression suite (plan E20.3, ADR-018).
 *
 * Example ids come from the filesystem (Node can't evaluate the Vite registry). Each example is
 * its own test: open `?example=<id>&test=1` in the sandbox, await `window.__exampleReady`, and
 * screenshot the container (steps shared with the gallery generator in `harness.ts`). Meta
 * (tolerances, `no-visual-test` tag) is read in the page, where the sandbox has imported the
 * module, so example code never runs in Node.
 *
 * Two limits gate each example (`compare.ts`): the fraction of differing pixels over the whole
 * image, and in every 32 px window, so a moved title or label fails although it changes few
 * pixels overall. DOM-drawn parts (hover labels, menus, sliders), whose text the OS rasterizes,
 * are exempt from the window limit: they are found with two more screenshots, with the canvases
 * hidden and with everything hidden.
 */
const ROOT = path.resolve(import.meta.dirname, '../..');
const EXAMPLES_DIR = path.join(ROOT, 'examples');
const VISUAL_DIR = path.join(ROOT, 'tests/visual');
const BASELINES_DIR = path.join(VISUAL_DIR, '__baselines__');
const ACTUAL_DIR = path.join(VISUAL_DIR, '__actual__');
const DIFF_DIR = path.join(VISUAL_DIR, '__diff__');

const exampleIds = listExampleIds(EXAMPLES_DIR);

function isUpdateMode(testInfo: TestInfo): boolean {
  const mode = testInfo.config.updateSnapshots;
  return process.env.UPDATE_BASELINES === '1' || mode === 'all' || mode === 'changed';
}

function writeFile(file: string, data: Buffer | string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, data);
}

/**
 * Records the pixelmatch count and the exact diff (plan E20.9) as an annotation and as a JSON
 * record that `tests/visual/report.ts` turns into the CI job summary.
 */
function recordDiff(
  testInfo: TestInfo,
  id: string,
  tolerance: number,
  tileTolerance: number,
  c: CompareResult,
): void {
  const percent = (c.ratio * 100).toFixed(4);
  testInfo.annotations.push({
    type: 'diff',
    description:
      `pixelmatch ${c.diffPixels} px (${percent}%, tolerance ${(tolerance * 100).toFixed(4)}%), ` +
      `worst window ${c.tileDiffPixels} px; exact ${c.exactPixels} px, max Δ ${c.maxDelta}`,
  });
  const record: DiffRecord = {
    id,
    pass: c.pass,
    tolerance,
    tileTolerance,
    totalPixels: c.totalPixels,
    diffPixels: c.diffPixels,
    ratio: c.ratio,
    tileDiffPixels: c.tileDiffPixels,
    exactPixels: c.exactPixels,
    maxDelta: c.maxDelta,
  };
  writeFile(reportFileFor(path.join(ROOT, DIFF_REPORT_DIR), id), JSON.stringify(record));
}

test('example registry matches the filesystem', async ({ page }) => {
  await page.goto('/?test=1');
  await page.waitForFunction(() => Array.isArray(window.__exampleIds), undefined, {
    timeout: BOOT_TIMEOUT_MS,
  });
  const registryIds = await page.evaluate(() => [...(window.__exampleIds ?? [])]);
  expect([...registryIds].sort((a, b) => a.localeCompare(b))).toEqual(exampleIds);
});

for (const id of exampleIds) {
  test(id, async ({ page }, testInfo) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.stack ?? error.message));
    page.on('console', (message) => {
      if (message.type() === 'error')
        testInfo.annotations.push({ type: 'console.error', description: message.text() });
    });

    let result: ExampleTestResult;
    try {
      result = await openExample(page, id);
    } catch (error) {
      const detail = pageErrors.length ? `\nPage errors:\n${pageErrors.join('\n')}` : '';
      throw new Error(`Example "${id}" failed to load or render: ${String(error)}${detail}`, {
        cause: error,
      });
    }
    test.skip(result.skipped, `"${id}" is tagged no-visual-test`);

    // Shared with the gallery generator (tools/gallery-gen): pointer off the example, then the
    // container screenshot at CSS size.
    await parkPointer(page);
    const screenshot = await screenshotExample(page);

    const baselinePath = path.join(BASELINES_DIR, `${id}.png`);
    const actualPath = path.join(ACTUAL_DIR, `${id}.png`);
    const diffPath = path.join(DIFF_DIR, `${id}.png`);
    rmSync(actualPath, { force: true });
    rmSync(diffPath, { force: true });

    const tolerance = result.meta.testTolerance ?? DEFAULT_TOLERANCE;
    const tileTolerance = result.meta.testTileTolerance ?? DEFAULT_TILE_TOLERANCE;
    // Both are fractions of the pixels. A pixel count (`testTileTolerance: 96`) is above every
    // possible fraction, so it would switch the check off without anyone noticing.
    for (const [name, value] of [
      ['testTolerance', tolerance],
      ['testTileTolerance', tileTolerance],
    ] as const) {
      expect(value >= 0 && value <= 1, `meta.${name} of "${id}" is a fraction (0 to 1)`).toBe(true);
    }
    const baseline = existsSync(baselinePath) ? readFileSync(baselinePath) : undefined;
    let comparison: CompareResult | undefined;
    if (baseline) {
      const layers = await screenshotDomLayers(page);
      const exempt = domMask(layers.withoutCanvas, layers.withoutAnything);
      comparison = comparePng(screenshot, baseline, {
        tolerance,
        tileTolerance,
        ...(exempt ? { exempt } : {}),
      });
      recordDiff(testInfo, id, tolerance, tileTolerance, comparison);
    }

    if (isUpdateMode(testInfo)) {
      // Only rewrite when something changed, so unrelated baselines don't churn.
      if (!comparison || comparison.diffPixels > 0) {
        writeFile(baselinePath, screenshot);
        testInfo.annotations.push({
          type: 'baseline',
          description: comparison ? `updated (${comparison.message})` : 'created',
        });
      }
    } else if (!comparison) {
      writeFile(actualPath, screenshot);
      await testInfo.attach('actual', { path: actualPath, contentType: 'image/png' });
      throw new Error(
        `No baseline for "${id}" (expected ${path.relative(ROOT, baselinePath)}). ` +
          `Review ${path.relative(ROOT, actualPath)} and run \`pnpm test:visual:update -g ${id}\`.`,
      );
    } else if (!comparison.pass) {
      writeFile(actualPath, screenshot);
      await testInfo.attach('baseline', { path: baselinePath, contentType: 'image/png' });
      await testInfo.attach('actual', { path: actualPath, contentType: 'image/png' });
      if (comparison.diffPng) {
        writeFile(diffPath, comparison.diffPng);
        await testInfo.attach('diff', { path: diffPath, contentType: 'image/png' });
      }
    }

    expect(pageErrors, 'uncaught errors in the page').toEqual([]);
    if (comparison && !isUpdateMode(testInfo)) {
      expect(comparison.pass, `"${id}" differs from its baseline: ${comparison.message}`).toBe(
        true,
      );
    }
  });
}
