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
import type {
  StandaloneArtifact,
  StandaloneIndex,
} from '../../../../../tools/gallery-gen/src/standalone.ts';
import { exampleAnchor } from '../example-anchor.ts';
import { chartFamilies, type ChartFamily } from '../../../../../examples/_lib/families.ts';
import type { ExampleClassification } from '../../../../../examples/_lib/catalog.ts';

/** One thumbnail entry, as written by `tools/gallery-gen/manifest.ts` (`GalleryEntry`). */
export interface GalleryExample extends ExampleClassification {
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
  examples: (GalleryExample & {
    pages: GalleryPageLink[];
    standalone?: Omit<StandaloneArtifact, 'inputs'>;
  })[];
  families: readonly ChartFamily[];
  version: 2;
}

declare const data: GalleryData;
export { data };

const DOCS_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const MANIFEST = path.join(DOCS_ROOT, 'public/gallery/manifest.json');
const SOURCES = path.join(DOCS_ROOT, 'public/gallery/sources.json');

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
  watch: [
    '../../../public/gallery/manifest.json',
    '../../../public/gallery/sources.json',
    '../../../**/*.md',
  ],
  load(watchedFiles: string[]): GalleryData {
    let manifest: { version: number; examples: GalleryExample[] };
    try {
      manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as {
        version: number;
        examples: GalleryExample[];
      };
    } catch {
      // No thumbnails generated yet: the page shows an empty state instead of failing the build.
      manifest = { version: 2, examples: [] };
    }
    if (manifest.version !== 2)
      throw new Error('Gallery manifest must be v2. Run node tools/gallery-gen/src/migrate.ts.');
    let sources: StandaloneIndex = { version: 1, examples: {}, failures: {} };
    try {
      sources = JSON.parse(readFileSync(SOURCES, 'utf8')) as StandaloneIndex;
    } catch {
      /* Standalone exports have not been generated yet. */
    }

    const pagesById = new Map<string, GalleryPageLink[]>();
    for (const file of watchedFiles) {
      if (!file.endsWith('.md')) continue;
      const rel = path.relative(DOCS_ROOT, file).split(path.sep).join('/');
      if (!isContentPage(rel)) continue;
      const source = readFileSync(file, 'utf8');
      const title = frontmatterTitle(source) ?? routeOf(rel);
      const seen = new Set<string>();
      for (const m of source.matchAll(/<(?:Example|ExampleLink)\b[^>]*?\bid=(["'])(.+?)\1/g)) {
        const id = m[2] as string;
        if (seen.has(id)) continue;
        seen.add(id);
        const list = pagesById.get(id) ?? [];
        list.push({ title, link: `${routeOf(rel)}#${exampleAnchor(id)}` });
        pagesById.set(id, list);
      }
    }

    return {
      families: chartFamilies,
      version: 2,
      examples: manifest.examples.map((e) => ({
        ...e,
        ...(sources.examples[e.id]
          ? {
              standalone: {
                source: sources.examples[e.id]!.source,
                javascript: sources.examples[e.id]!.javascript,
                dependencies: sources.examples[e.id]!.dependencies,
                hash: sources.examples[e.id]!.hash,
                verification: sources.examples[e.id]!.verification,
                notes: sources.examples[e.id]!.notes,
                ...(sources.examples[e.id]!.browserEvidence
                  ? { browserEvidence: sources.examples[e.id]!.browserEvidence }
                  : {}),
              },
            }
          : {}),
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
