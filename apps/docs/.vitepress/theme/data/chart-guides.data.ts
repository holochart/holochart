/** Shared compact chart metadata, with no example source or runtime imports. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineLoader } from 'vitepress';
import {
  buildChartGuideCatalog,
  type ChartGuideCatalog,
} from '../../../scripts/chart-guide-catalog.ts';
import type { GalleryManifest } from '../../../../../tools/gallery-gen/src/manifest.ts';
declare const data: ChartGuideCatalog;
export { data };
const root = fileURLToPath(new URL('../../../', import.meta.url));
export default defineLoader({
  watch: ['../../../charts/**/*.md', '../../../public/gallery/manifest.json'],
  load(): ChartGuideCatalog {
    const manifest = JSON.parse(
      readFileSync(path.join(root, 'public/gallery/manifest.json'), 'utf8'),
    ) as GalleryManifest;
    return buildChartGuideCatalog(root, manifest.examples);
  },
});
