/** A small, metadata-derived home payload; catalog browsing does not mount live charts. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineLoader } from 'vitepress';
import { chartFamilies, type ChartFamily } from '../../../../../examples/_lib/families.ts';
import type { GalleryExample } from './gallery.data.ts';

export type HomeExample = Pick<
  GalleryExample,
  | 'id'
  | 'title'
  | 'description'
  | 'primaryFamily'
  | 'thumbnail'
  | 'thumbnailSize'
  | 'contentKind'
  | 'chartTypes'
>;
export interface HomeFamily {
  family: ChartFamily;
  count: number;
  preview: HomeExample | null;
}
export interface HomeDemo {
  title: string;
  link: string;
  count: number;
  preview: HomeExample;
}
export interface HomeData {
  count: number;
  previews: HomeExample[];
  families: HomeFamily[];
  starter: { example: HomeExample; code: string } | null;
  recipes: HomeExample[];
  demos: HomeDemo[];
}
declare const data: HomeData;
export { data };

function concise(e: GalleryExample): HomeExample {
  const {
    id,
    title,
    description,
    primaryFamily,
    thumbnail,
    thumbnailSize,
    contentKind,
    chartTypes,
  } = e;
  return {
    id,
    title,
    description,
    primaryFamily,
    thumbnail,
    thumbnailSize,
    contentKind,
    chartTypes,
  };
}

function starterCode(): string {
  const source = readFileSync(
    fileURLToPath(new URL('../../../../../examples/bar/basic.ts', import.meta.url)),
    'utf8',
  );
  // Reuse the canonical figure instead of hand-maintaining a second data/styling specimen.
  const call = source.match(/ {2}const chart = createChart\(el, \{[\s\S]*?\n {2}\}\);/)?.[0];
  if (!call)
    throw new Error(
      'Home starter: bar/basic createChart call changed; update the source extraction.',
    );
  const chartCode = call
    .split('\n')
    .map((line) => line.replace(/^ {2}/, ''))
    .join('\n');
  return [
    "import { createChart } from '@mk7s/holochart';",
    '',
    "const el = document.createElement('div');",
    "el.style.height = '320px';",
    'document.body.appendChild(el);',
    '',
    chartCode,
    'await chart.ready;',
    '',
    '// When removing this view: chart.destroy();',
  ].join('\n');
}

export default defineLoader({
  // Keep watches under the docs root: VitePress 1.6's globber can follow repository
  // dependency symlinks when an outside-root watch expands the crawl base.
  watch: ['../../../public/gallery/manifest.json', '../../../demos/*.md'],
  load(watchedFiles: string[]): HomeData {
    const docsRoot = fileURLToPath(new URL('../../../', import.meta.url));
    const manifest = JSON.parse(
      readFileSync(path.join(docsRoot, 'public/gallery/manifest.json'), 'utf8'),
    ) as { version: number; examples: GalleryExample[] };
    if (manifest.version !== 2)
      throw new Error('Home requires gallery manifest v2. Run the gallery migration.');
    const examples = manifest.examples;
    const demoPages = watchedFiles
      .filter((file) => file.endsWith('.md'))
      .map((file) => {
        const source = readFileSync(file, 'utf8');
        const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source)?.[1] ?? '';
        const title = /^title:\s*(.+)$/m
          .exec(frontmatter)?.[1]
          ?.trim()
          .replace(/^(['"])(.*)\1$/, '$2');
        const link = `/${path.relative(docsRoot, file).split(path.sep).join('/').replace(/\.md$/, '')}`;
        const ids = new Set(
          [...source.matchAll(/<Example\b[^>]*?\bid=(["'])(.+?)\1/g)].map((match) => match[2]),
        );
        return { title: title ?? link, link, ids };
      });
    const rank = (e: GalleryExample): number => e.curatedRank ?? Number.MAX_SAFE_INTEGER;
    const ordered = [...examples].sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id));
    const previews = ordered
      .filter((e) => e.contentKind === 'chart' && e.curatedRank !== null)
      .slice(0, 6);
    const families = chartFamilies.map((family) => {
      const members = ordered.filter(
        (e) => e.primaryFamily === family.id || e.secondaryFamilies.includes(family.id),
      );
      const preview =
        members.find((e) => e.contentKind === 'chart' && e.primaryFamily === family.id) ??
        members.find((e) => e.contentKind === 'chart');
      return { family, count: members.length, preview: preview ? concise(preview) : null };
    });
    const recipes = ordered
      .filter((e) => e.contentKind === 'recipe' && e.traceTypes.length <= 2)
      .slice(0, 4)
      .map(concise);
    const demosByPage = new Map<string, { title: string; examples: typeof examples }>();
    for (const e of ordered.filter((e) => e.contentKind === 'demo')) {
      for (const p of demoPages.filter((p) => p.ids.has(e.id))) {
        const link = p.link.split('#')[0]!;
        const group = demosByPage.get(link) ?? { title: p.title, examples: [] };
        group.examples.push(e);
        demosByPage.set(link, group);
      }
    }
    const demos = [...demosByPage.entries()]
      .sort(
        (a, b) =>
          new Set(b[1].examples.map((e) => e.primaryFamily)).size -
            new Set(a[1].examples.map((e) => e.primaryFamily)).size || a[0].localeCompare(b[0]),
      )
      .slice(0, 3)
      .map(([link, group]) => ({
        title: group.title,
        link,
        count: group.examples.length,
        preview: concise(group.examples[0]!),
      }));
    const starter = examples.find((e) => e.id === 'bar/basic');
    return {
      count: examples.length,
      previews: previews.map(concise),
      families,
      recipes,
      demos,
      starter: starter ? { example: concise(starter), code: starterCode() } : null,
    };
  },
});
