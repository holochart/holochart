/** Offline content inventory for SITE-01. Run from any directory with Node's TS support. */
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { format } from 'prettier';
import { releaseState, sourceInstallState } from '../.vitepress/release-state.ts';
import { chartFamilies, exampleFamilyCounts } from '../../../examples/_lib/catalog.ts';
import { listExampleIds } from '../../../tests/visual/examples.ts';
import {
  isExcluded,
  isInternalExample,
  readManifest,
} from '../../../tools/gallery-gen/src/manifest.ts';
import { staticMeta } from '../../../tools/gallery-gen/src/check.ts';
import { codeBlocks, frontmatter, listDocsPages } from './quality/markdown.ts';

const repo = path.resolve(import.meta.dirname, '../../..');
const docs = path.join(repo, 'apps/docs');
const output = path.join(repo, 'docs/site');
const routeOf = (file: string) => `/${file.replace(/(^|\/)index\.md$/, '$1').replace(/\.md$/, '')}`;
const count = (values: readonly string[]) =>
  Object.fromEntries(
    [...new Set(values)].sort().map((value) => [value, values.filter((v) => v === value).length]),
  );
const row = (cells: readonly (string | number)[]) => `| ${cells.join(' | ')} |`;

async function findNotebooks(dir: string, rel = ''): Promise<string[]> {
  const out: string[] = [];
  for (const item of await readdir(path.join(dir, rel), { withFileTypes: true })) {
    if (item.name.startsWith('.') || item.name === 'node_modules') continue;
    const file = rel ? `${rel}/${item.name}` : item.name;
    if (item.isDirectory()) out.push(...(await findNotebooks(dir, file)));
    else if (item.name.endsWith('.ipynb')) out.push(`examples/${file}`);
  }
  return out.sort();
}

async function main(): Promise<void> {
  const manifest = readManifest();
  if (!manifest) throw new Error('Gallery manifest missing; generate it before the audit.');
  const entries = manifest.examples;
  const ids = listExampleIds(path.join(repo, 'examples'));
  const allExamples = ids.map((id) => {
    const source = readFileSync(path.join(repo, 'examples', `${id}.ts`), 'utf8');
    const meta = staticMeta(source, `${id}.ts`);
    return {
      id,
      internal: isInternalExample(id),
      excluded: isExcluded(meta?.tags ?? []),
      literalMeta: !!meta,
      usesInternalHelpers: /['"][^'"]*_lib\//.test(source),
      listed: entries.some((e) => e.id === id),
    };
  });
  const pages = await Promise.all(
    (await listDocsPages(docs)).map(async (file) => {
      const source = readFileSync(path.join(docs, file), 'utf8');
      const fm = frontmatter(source);
      const embeds = [...source.matchAll(/<Example\b[^>]*?\bid=(["'])(.+?)\1/g)].map((m) => m[2]!);
      return {
        file: `apps/docs/${file}`,
        route: routeOf(file),
        title: fm['title'] ?? file,
        status: fm['status'] ?? 'unspecified',
        internal: path.basename(file).startsWith('_'),
        chart: fm['chart'] ?? null,
        embeds,
        snippets: count(codeBlocks(source).map((b) => b.lang)),
      };
    }),
  );
  const publicPages = pages.filter((p) => !p.internal);
  const notebooks = await findNotebooks(path.join(repo, 'examples'));
  const missingThumbnails = entries
    .filter((e) => !existsSync(path.join(docs, 'public', e.thumbnail)))
    .map((e) => e.id);
  const missingSources = entries
    .filter((e) => !existsSync(path.join(repo, 'examples', `${e.id}.ts`)))
    .map((e) => e.id);
  const missingEmbeds = publicPages.flatMap((p) =>
    p.embeds.filter((id) => !ids.includes(id)).map((id) => `${p.file}: ${id}`),
  );
  const embedded = new Set(publicPages.flatMap((p) => p.embeds));
  const familyCounts = exampleFamilyCounts(entries);
  const coverage = chartFamilies.map((family) => {
    const pool = entries.filter(
      (e) => e.primaryFamily === family.id || e.secondaryFamilies.includes(family.id),
    );
    return {
      id: family.id,
      label: family.label,
      examples: familyCounts[family.id],
      chartExamples: pool.filter((e) => e.contentKind === 'chart').length,
      primary: pool.filter((e) => e.primaryFamily === family.id).length,
      subtypes: family.chartTypes.map((type) => {
        const examples = pool.filter((e) => e.chartTypes.includes(type.id));
        return {
          id: type.id,
          docs: type.docs,
          count: examples.length,
          levels: count(examples.map((e) => e.difficulty)),
          variants: count(examples.flatMap((e) => e.variants.map((v) => v.language))),
          exampleIds: examples.map((e) => e.id),
        };
      }),
    };
  });
  const summary = {
    publicPages: publicPages.length,
    pageStatus: count(publicPages.map((p) => p.status)),
    templates: pages.length - publicPages.length,
    galleryEntries: entries.length,
    categoryCounts: count(entries.map((e) => e.category)),
    contentKinds: count(entries.map((e) => e.contentKind)),
    allExampleSources: ids.length,
    internalExamples: allExamples.filter((e) => e.internal).length,
    excludedPublicExamples: allExamples.filter((e) => !e.internal && e.excluded).length,
    harnessesWithInternalHelpers: allExamples.filter((e) => e.listed && e.usesInternalHelpers)
      .length,
    examplesEmbeddedInDocs: entries.filter((e) => embedded.has(e.id)).length,
    examplesWithoutEmbed: entries.filter((e) => !embedded.has(e.id)).length,
    pythonVariants: entries.filter((e) => e.variants.some((v) => v.language === 'python')).length,
    notebooks: notebooks.length,
    missingThumbnails,
    missingSources,
    missingEmbeds,
  };
  const inventory = {
    schemaVersion: 1,
    scope: 'current working tree; static source inventory, not deployed support verification',
    installAvailability: { registries: releaseState, sources: sourceInstallState },
    summary,
    coverage,
    pages,
    examples: entries.map((e) => ({
      id: e.id,
      category: e.category,
      primaryFamily: e.primaryFamily,
      secondaryFamilies: e.secondaryFamilies,
      chartTypes: e.chartTypes,
      contentKind: e.contentKind,
      difficulty: e.difficulty,
      variants: e.variants,
      embeddedBy: publicPages.filter((p) => p.embeds.includes(e.id)).map((p) => p.route),
    })),
    allExamples,
    notebookFiles: notebooks,
  };

  const lines = [
    '# Website content audit',
    '',
    'Generated with `node apps/docs/scripts/site-audit.ts` from the current working tree.',
    'Re-run after changing pages, examples, or gallery metadata. The full inventory is in',
    '[inventory.json](./inventory.json). Screenshot measurements describe the pre-Wave-1 site;',
    'content counts below describe the current source tree. No registry or hosted-notebook support is inferred.',
    '',
    '## Inventory',
    '',
    row(['Measure', 'Count']),
    row(['---', '---']),
    row(['Public hand-written pages', summary.publicPages]),
    ...Object.entries(summary.pageStatus).map(([status, n]) => row([`Pages: ${status}`, n])),
    row(['Excluded page templates', summary.templates]),
    row(['Gallery entries', summary.galleryEntries]),
    row(['All example sources (including internal)', summary.allExampleSources]),
    row(['Internal example sources', summary.internalExamples]),
    row(['Public examples excluded by tags', summary.excludedPublicExamples]),
    row(['Gallery entries embedded in a public guide', summary.examplesEmbeddedInDocs]),
    row(['Gallery entries without a guide embed', summary.examplesWithoutEmbed]),
    row(['Gallery harnesses importing internal helpers', summary.harnessesWithInternalHelpers]),
    row(['Gallery entries with Python artifacts', summary.pythonVariants]),
    row(['Downloadable notebooks under examples/', summary.notebooks]),
    row([
      'Missing thumbnails / sources / embed IDs',
      `${missingThumbnails.length} / ${missingSources.length} / ${missingEmbeds.length}`,
    ]),
    '',
    'Counts distinguish available TypeScript repository harnesses from complete independent user snippets.',
    'A thumbnail proves browser rendering only; it does not prove Python execution or notebook-host compatibility.',
    '',
    '## Family coverage',
    '',
    'Examples cross-listed in multiple families count once per family; these totals intentionally overlap.',
    'The chart-only column excludes complete demos and feature collections.',
    '',
    row(['Family', 'Primary', 'All including cross-listing', 'Chart-only']),
    row(['---', '---', '---', '---']),
    ...coverage.map((f) => row([f.label, f.primary, f.examples, f.chartExamples])),
    '',
    '## Family × subtype × language × level',
    '',
    'Language counts describe registered artifacts. “Unassessed” is deliberately distinct from beginner.',
    'Rendered TS variants target the repository sandbox, not a verified standalone install.',
    '',
    row([
      'Family / subtype',
      'Examples',
      'TS',
      'JS',
      'Python',
      'Beginner',
      'Intermediate',
      'Advanced',
      'Unassessed',
    ]),
    row(['---', '---', '---', '---', '---', '---', '---', '---', '---']),
    ...coverage.flatMap((f) =>
      f.subtypes.map((t) =>
        row([
          `${f.id} / ${t.id}`,
          t.count,
          t.variants['typescript'] ?? 0,
          t.variants['javascript'] ?? 0,
          t.variants['python'] ?? 0,
          t.levels['beginner'] ?? 0,
          t.levels['intermediate'] ?? 0,
          t.levels['advanced'] ?? 0,
          t.levels['unassessed'] ?? 0,
        ]),
      ),
    ),
    '',
    '## Stub and draft pages',
    '',
    ...publicPages
      .filter((p) => p.status === 'stub' || p.status === 'draft')
      .map((p) => `- \`${p.file}\`: ${p.status}.`),
    '',
    '## Priority gaps',
    '',
    '- Python cells in a guide are not downloadable notebook artifacts. Deliver the notebook collection and',
    '  tested Python gallery variants in Waves 2–3; leave Python variant availability false until verified.',
    '- Separate reusable beginner variations from complete demos. A large demo collection must not dominate',
    '  curated family previews or inflate beginner coverage.',
    '- Assess uncurated learning levels and source completeness before featuring them as quick starts.',
    '- Add contextual explanations to examples without guide embeds and complete the cookbook stub.',
    '- Keep source-install status visible until the corresponding registry artifact is verified.',
    '- The Python bridge currently requires a development checkout; a public source revision is',
    '  a separate release dependency. See [install-verification.md](./install-verification.md).',
    '',
    '## Prioritized starter tasks',
    '',
    row(['Task', 'Existing example to reuse', 'Next deliverable']),
    row(['---', '---', '---']),
    row([
      'Notebook scatter',
      '`scatter/basic`',
      'Python quick start and executable notebook; no Python artifact currently registered.',
    ]),
    row([
      'Grouped comparison',
      '`bar/grouped`',
      'Complete browser snippet plus supported Python counterpart.',
    ]),
    row([
      'Time series with gaps',
      '`line/gaps`, `timeseries/date-formatting`',
      'Dates, missing data, and units recipe.',
    ]),
    row([
      'Distribution comparison',
      '`violin/grouped`, `box/basic`',
      'Notebook explaining groups and interpretation.',
    ]),
    row([
      'Labeled matrix',
      '`heatmap/annotated`',
      'NumPy/DataFrame notebook with data-shape explanation.',
    ]),
    row([
      'Browser-only geographic view',
      '`choropleth/basic`',
      'Map quick path with extension requirement; no Python claim.',
    ]),
    '',
    'These selections reuse real example IDs. Their future language variants still require execution tests.',
    '',
    '## Visual baseline and journey observations',
    '',
    'Captured 2026-10-09 on Chromium with SwiftShader and reduced motion, before modifying existing',
    'site templates. Screenshots show the initial viewport, not the full page. Measurements are in',
    '[baseline/viewports.json](./baseline/viewports.json).',
    '',
    '- Desktop: 1440 × 900. Tablet: 820 × 1180. Mobile: 390 × 844.',
    '- The desktop homepage shows one hero chart. The desktop gallery shows no fully visible cards:',
    '  category and trace filter chips occupy the initial screen.',
    '- At 820 px all four baseline pages have a 921 px document width, indicating shared navigation overflow.',
    '- Starting from home, the existing notebook path requires opening Guide, expanding Guides, then selecting',
    '  Python notebooks. There is no direct Python homepage action or primary navigation item.',
    '- Chart discovery requires opening Gallery and navigating a long folder-derived chip list before',
    '  selecting a preview; users must distinguish API/demo categories from chart types themselves.',
    '- Time to first runnable chart has not been measured with users. The current browser tutorial states',
    '  about five minutes, excluding clone/build/install setup. The notebook guide has no timed trial.',
    '  Record actual task times during SITE-25; do not treat a source-build estimate as observed performance.',
    '',
    row(['Surface', 'Desktop', 'Tablet', 'Mobile']),
    row(['---', '---', '---', '---']),
    ...['home', 'gallery', 'chart', 'notebooks'].map((slug) =>
      row([
        slug,
        ...['desktop', 'tablet', 'mobile'].map(
          (size) => `[Screenshot](./baseline/${slug}-${size}.png)`,
        ),
      ]),
    ),
    '',
  ];
  await mkdir(output, { recursive: true });
  await writeFile(
    path.join(output, 'inventory.json'),
    await format(JSON.stringify(inventory), { parser: 'json' }),
  );
  await writeFile(
    path.join(output, 'content-audit.md'),
    await format(`${lines.join('\n')}\n`, { parser: 'markdown' }),
  );
  console.log(
    `site audit: ${summary.publicPages} pages, ${entries.length} gallery entries, ${notebooks.length} notebooks.`,
  );
  if (missingThumbnails.length || missingSources.length || missingEmbeds.length)
    process.exitCode = 1;
}

await main();
