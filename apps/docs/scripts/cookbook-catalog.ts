/** Small cookbook payload: no full gallery catalog or runnable source enters the directory. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { chartFamilies } from '../../../examples/_lib/families.ts';
import type { GalleryManifest } from '../../../tools/gallery-gen/src/manifest.ts';
import { parsePage } from './lint-pages.ts';

export interface RecipeCard {
  slug: string;
  example: string;
  title: string;
  problem: string;
  thumbnail: string;
  thumbnailSize: { width: number; height: number };
  python: boolean;
  families: { id: string; label: string }[];
}
export function buildCookbookCatalog(docsRoot: string): RecipeCard[] {
  const recipes: { slug: string; example: string; python: boolean; families: string[] }[] =
    JSON.parse(readFileSync(path.join(docsRoot, 'cookbook/catalog.json'), 'utf8'));
  const manifest: GalleryManifest = JSON.parse(
    readFileSync(path.join(docsRoot, 'public/gallery/manifest.json'), 'utf8'),
  );
  return recipes.map((recipe) => {
    const entry = manifest.examples.find((entry) => entry.id === recipe.example);
    if (!entry) throw new Error(`Cookbook example is unpublished: ${recipe.example}.`);
    const page = parsePage(
      `cookbook/${recipe.slug}.md`,
      readFileSync(path.join(docsRoot, `cookbook/${recipe.slug}.md`), 'utf8'),
    );
    const python = entry.variants.some(
      (variant) =>
        variant.language === 'python' &&
        variant.verification.state === 'rendered' &&
        variant.verification.browserVerified === true,
    );
    if (recipe.python !== python)
      throw new Error(`Cookbook Python availability is stale: ${recipe.example}.`);
    return {
      slug: recipe.slug,
      example: entry.id,
      title: page.frontmatter['title']!,
      problem: page.frontmatter['description']!,
      thumbnail: entry.thumbnail,
      thumbnailSize: entry.thumbnailSize,
      python,
      families: recipe.families.map((id) => {
        const family = chartFamilies.find((family) => family.id === id);
        if (!family) throw new Error(`Cookbook family is unknown: ${id}.`);
        return { id, label: family.label };
      }),
    };
  });
}
