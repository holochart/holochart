/**
 * Build-time data for the gallery page (plan E19.5): the committed thumbnail manifest written by
 * `tools/gallery-gen` (`public/gallery/manifest.json`) joined with the docs pages that embed each
 * example (`<Example id="…">`), so every card can link to its documentation.
 *
 * VitePress runs this loader in Node when the page is built (and again in `dev` when a watched
 * file changes); the page receives plain JSON.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineLoader } from 'vitepress';
import { exampleAnchor } from '../example-anchor.ts';

/** One thumbnail entry, as written by `tools/gallery-gen/manifest.ts` (`GalleryEntry`). */
export interface GalleryExample {
  id: string;
  title: string;
  description: string;
  tags: string[];
  category: string;
  traceTypes: string[];
  size: { width: number; height: number };
  threeD: boolean;
  thumbnail: string;
  thumbnailSize: { width: number; height: number };
}

/** A docs page that embeds an example; `link` points at the embed's anchor. */
export interface GalleryPageLink {
  title: string;
  link: string;
}

export interface GalleryData {
  examples: (GalleryExample & { pages: GalleryPageLink[] })[];
}

declare const data: GalleryData;
export { data };

const DOCS_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const MANIFEST = path.join(DOCS_ROOT, 'public/gallery/manifest.json');

/** Pages that are not hand-written content (generated reference, templates, readme). */
function isContentPage(rel: string): boolean {
  return (
    !rel.startsWith('reference/api/') &&
    !rel.startsWith('reference/attributes/') &&
    !rel.startsWith('public/') &&
    !path.basename(rel).startsWith('_') &&
    rel !== 'README.md'
  );
}

/** Site route of a Markdown file (`charts/basic/scatter.md` → `/charts/basic/scatter`). */
function routeOf(rel: string): string {
  return `/${rel.replace(/(^|\/)index\.md$/, '$1').replace(/\.md$/, '')}`;
}

function frontmatterTitle(source: string): string | undefined {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source)?.[1] ?? '';
  return /^title:\s*(.+)$/m
    .exec(fm)?.[1]
    ?.trim()
    .replace(/^(['"])(.*)\1$/, '$2');
}

export default defineLoader({
  watch: ['../../../public/gallery/manifest.json', '../../../**/*.md'],
  load(watchedFiles: string[]): GalleryData {
    let manifest: { examples: GalleryExample[] };
    try {
      manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as { examples: GalleryExample[] };
    } catch {
      // No thumbnails generated yet: the page shows an empty state instead of failing the build.
      manifest = { examples: [] };
    }

    const pagesById = new Map<string, GalleryPageLink[]>();
    for (const file of watchedFiles) {
      if (!file.endsWith('.md')) continue;
      const rel = path.relative(DOCS_ROOT, file).split(path.sep).join('/');
      if (!isContentPage(rel)) continue;
      const source = readFileSync(file, 'utf8');
      const title = frontmatterTitle(source) ?? routeOf(rel);
      const seen = new Set<string>();
      for (const m of source.matchAll(/<Example\b[^>]*?\bid=(["'])(.+?)\1/g)) {
        const id = m[2] as string;
        if (seen.has(id)) continue;
        seen.add(id);
        const list = pagesById.get(id) ?? [];
        list.push({ title, link: `${routeOf(rel)}#${exampleAnchor(id)}` });
        pagesById.set(id, list);
      }
    }

    return {
      examples: manifest.examples.map((e) => ({
        ...e,
        // Chart pages first, then the rest, each alphabetically.
        pages: (pagesById.get(e.id) ?? []).sort(
          (a, b) =>
            Number(!a.link.startsWith('/charts/')) - Number(!b.link.startsWith('/charts/')) ||
            a.title.localeCompare(b.title),
        ),
      })),
    };
  },
});
