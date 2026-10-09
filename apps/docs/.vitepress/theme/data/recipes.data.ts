import { fileURLToPath } from 'node:url';
import { defineLoader } from 'vitepress';
import { buildCookbookCatalog, type RecipeCard } from '../../../scripts/cookbook-catalog.ts';
declare const data: RecipeCard[];
export { data };
const docsRoot = fileURLToPath(new URL('../../../', import.meta.url));
export default defineLoader({
  watch: [
    '../../../cookbook/catalog.json',
    '../../../cookbook/*.md',
    '../../../public/gallery/manifest.json',
  ],
  load: () => buildCookbookCatalog(docsRoot),
});
