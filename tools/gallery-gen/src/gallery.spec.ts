import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { TEST_CONTAINER_ID } from '../../../apps/sandbox/src/test-protocol.ts';
import { listExampleIds } from '../../../tests/visual/examples.ts';
import { openExample, parkPointer, screenshotExample } from '../../../tests/visual/harness.ts';
import {
  EXAMPLES_DIR,
  PUBLIC_DIR,
  THUMBNAIL,
  isExcluded,
  isThreeD,
  recordFile,
  thumbnailPath,
  writeBinary,
  type GalleryEntry,
  type GalleryRecord,
} from './manifest.ts';

/**
 * Gallery generator (plan E19.5). Same pipeline as the visual suite (`tests/visual/harness.ts`):
 * open the example in the sandbox's test mode, wait for it to render, screenshot the container.
 * Instead of comparing with a baseline, the PNG is re-encoded as WebP in the page (canvas, no
 * image dependency) and written to `apps/docs/public/gallery/thumbs/<id>.webp`, and a record with
 * the example's meta and rendered trace types goes to the output folder for `teardown.ts`.
 */
const exampleIds = listExampleIds(EXAMPLES_DIR);

function writeRecord(outputDir: string, record: GalleryRecord): void {
  writeBinary(recordFile(outputDir, record.id), Buffer.from(JSON.stringify(record)));
}

/**
 * Trace types of every chart inside the example container, read from the runtime's own
 * `getChart(el).fullData`. The runtime module is imported by the exact URL the example loaded, so
 * it is the same module instance (and chart registry). Examples that draw with the render package
 * directly have no charts and report no trace types.
 */
function renderedTraceTypes(page: Page): Promise<string[]> {
  return page.evaluate(async (containerId) => {
    const url = performance
      .getEntriesByType('resource')
      .map((e) => e.name)
      .find((name) => /\/packages\/runtime\/src\/index\.ts(\?|$)/.test(name));
    if (!url) return [];
    type Runtime = {
      getChart(el: HTMLElement): { fullData: readonly { type: string }[] } | undefined;
    };
    const runtime = (await import(/* @vite-ignore */ url)) as Runtime;
    const root = document.getElementById(containerId);
    if (!root) return [];
    const types = new Set<string>();
    for (const el of [root, ...root.querySelectorAll<HTMLElement>('*')]) {
      for (const trace of runtime.getChart(el)?.fullData ?? []) types.add(trace.type);
    }
    return [...types].sort();
  }, TEST_CONTAINER_ID);
}

/** Re-encode a PNG as WebP in the page (scaled down to `maxWidth`). Returns the bytes and size. */
async function encodeWebp(
  page: Page,
  png: Buffer,
): Promise<{ data: Buffer; width: number; height: number }> {
  const out = await page.evaluate(
    async ({ b64, maxWidth, quality }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const scale = Math.min(1, maxWidth / img.naturalWidth);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('No 2D canvas context.');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/webp', quality),
      );
      if (!blob || blob.type !== 'image/webp') throw new Error('This browser cannot encode WebP.');
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = '';
      for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      }
      return { b64: btoa(binary), width: canvas.width, height: canvas.height };
    },
    { b64: png.toString('base64'), maxWidth: THUMBNAIL.maxWidth, quality: THUMBNAIL.quality },
  );
  return { data: Buffer.from(out.b64, 'base64'), width: out.width, height: out.height };
}

for (const id of exampleIds) {
  test(id, async ({ page }, testInfo) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.stack ?? error.message));
    const outputDir = testInfo.project.outputDir;

    const result = await openExample(page, id);
    const { meta } = result;
    if (result.skipped || isExcluded(meta.tags)) {
      writeRecord(outputDir, { id, skipped: true });
      test.skip(true, `"${id}" is tagged ${meta.tags.filter((t) => isExcluded([t])).join(', ')}`);
      return;
    }

    await parkPointer(page);
    const png = await screenshotExample(page);
    const traceTypes = await renderedTraceTypes(page);
    const webp = await encodeWebp(page, png);
    expect(pageErrors, 'uncaught errors in the page').toEqual([]);

    const thumbnail = thumbnailPath(id);
    writeBinary(path.join(PUBLIC_DIR, thumbnail), webp.data);
    const entry: GalleryEntry = {
      id,
      title: meta.title,
      description: meta.description,
      tags: [...meta.tags],
      category: id.split('/')[0] ?? id,
      traceTypes,
      size: { width: result.width, height: result.height },
      threeD: isThreeD(traceTypes, meta.tags),
      thumbnail,
      thumbnailSize: { width: webp.width, height: webp.height },
    };
    writeRecord(outputDir, { id, entry });
  });
}
