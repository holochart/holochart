/** Small SSR directory payload: selected reports and an explicitly live application. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineLoader } from 'vitepress';
import { buildDemoDirectory, type DemoEntry } from '../../../scripts/demo-catalog.ts';
import type { GalleryExample } from './gallery.data.ts';
declare const data: { entries: DemoEntry[] };
export { data };
const DOCS_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export default defineLoader({
  watch: ['../../../demos/*.md', '../../../public/gallery/manifest.json'],
  load() {
    const manifest = JSON.parse(
      readFileSync(path.join(DOCS_ROOT, 'public/gallery/manifest.json'), 'utf8'),
    ) as { examples: GalleryExample[] };
    return { entries: buildDemoDirectory(DOCS_ROOT, manifest.examples) };
  },
});
