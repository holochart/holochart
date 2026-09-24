import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import type { FullConfig } from '@playwright/test';
import { listExampleIds } from '../../../tests/visual/examples.ts';
import {
  EXAMPLES_DIR,
  MANIFEST_FILE,
  REPO_ROOT,
  mergeRecords,
  pruneThumbnails,
  readManifest,
  recordsDir,
  writeManifest,
  type GalleryRecord,
} from './manifest.ts';

/**
 * Global teardown of the gallery run: merge the per-example records into the committed manifest
 * and delete thumbnails that no entry references any more (deleted or newly excluded examples).
 */
export default async function teardown(config: FullConfig): Promise<void> {
  const outputDir = config.projects[0]?.outputDir;
  if (!outputDir) return;
  const dir = recordsDir(outputDir);
  const records: GalleryRecord[] = existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => JSON.parse(readFileSync(path.join(dir, f), 'utf8')) as GalleryRecord)
    : [];
  if (records.length === 0) {
    console.log('gallery: no records (did every test fail?); manifest left unchanged.');
    return;
  }
  const manifest = mergeRecords(readManifest(), records, new Set(listExampleIds(EXAMPLES_DIR)));
  await writeManifest(manifest);
  const removed = pruneThumbnails(manifest);
  const rendered = records.filter((r) => 'entry' in r).length;
  console.log(
    `gallery: ${rendered} rendered, ${records.length - rendered} excluded; ` +
      `${manifest.examples.length} entries in ${path.relative(REPO_ROOT, MANIFEST_FILE)}` +
      (removed.length ? `; removed ${removed.length} stale thumbnails` : ''),
  );
}
