/** Evidence-driven launch matrix, beginner task choices and practical remaining gaps. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chartFamilies, familyStarters } from '../../../examples/_lib/catalog.ts';
import type { GalleryManifest } from '../../../tools/gallery-gen/src/manifest.ts';
import { buildChartGuideCatalog } from './chart-guide-catalog.ts';
const docsRoot = fileURLToPath(new URL('../', import.meta.url));
const repoRoot = path.resolve(docsRoot, '../..');
const manifest = JSON.parse(
  readFileSync(path.join(docsRoot, 'public/gallery/manifest.json'), 'utf8'),
) as GalleryManifest;
const catalog = buildChartGuideCatalog(docsRoot, manifest.examples);
const matrix = Object.entries(catalog.guides).map(([file, guide]) => ({
  file,
  title: guide.title,
  trace: guide.chart,
  featured: guide.featured,
  minimal: guide.minimal,
  variationCount: guide.variations.length,
  examples: [guide.minimal, ...guide.variations],
  pythonExamples: [guide.minimal, ...guide.variations].filter((id) => catalog.examples[id]?.python),
  variationGap: guide.featured ? Math.max(0, 5 - guide.variations.length) : 0,
}));
const starterCoverage = chartFamilies.map((family) => ({
  family: family.id,
  label: family.label,
  starters: familyStarters[family.id],
  gap: Math.max(0, 3 - familyStarters[family.id].length),
  reason:
    familyStarters[family.id].length < 3
      ? 'Additional tasks need a reviewed beginner path; more advanced examples are kept available without a beginner claim.'
      : 'Three explicitly reviewed beginner tasks available.',
}));
const priorities = [
  {
    task: 'Date handling',
    ids: ['bar/period', 'heatmap/dates', 'histogram/date-months', 'scatter3d/axis-types'],
    gap: 'Publish exact Python date-period counterparts; existing browser variations remain available.',
  },
  {
    task: 'Missing data',
    ids: ['line/gaps', 'surface/connectgaps', 'contour/gaps'],
    gap: 'Python gap source verified separately; remaining field-gap notebooks need exact counterparts.',
  },
  {
    task: 'Ordering and ranking',
    ids: ['bar/sorted', 'recipes/ranked-bars'],
    gap: 'Reviewed raw-category Python ordering tutorial remains a proposed addition.',
  },
  {
    task: 'Annotations and labels',
    ids: ['bar/text', 'scatter/text-labels', 'heatmap/annotated'],
    gap: 'Label variants exist; annotation-specific notebook proof remains a gap.',
  },
  {
    task: 'Error bands and errors',
    ids: ['area/band', 'recipes/error-bands', 'scatter/error-bars'],
    gap: 'Point errors have a counterpart; interval-band Python recipe is not yet claimed.',
  },
  {
    task: 'Normalization',
    ids: ['area/percent', 'histogram/normalized', 'histogram/cumulative'],
    gap: 'Cumulative tutorial exists; normalized area/probability notebook proofs remain proposed.',
  },
  {
    task: 'Subplots',
    ids: ['layout/grid-independent', 'layout/grid-coupled'],
    gap: 'Actual source variants included; host verification governs availability.',
  },
  {
    task: 'Accessible colors',
    ids: ['themes/high-contrast', 'bar/patterns', 'polar/barpolar-patterns'],
    gap: 'High-contrast counterpart exists; pattern-specific Python verification remains proposed.',
  },
  {
    task: 'Responsive sizing',
    ids: ['bar/basic', 'layout/grid-independent'],
    gap: 'Browser responsive config is explicit. Notebook height and rerun cleanup are separately verified; responsive host resizing needs a focused tutorial.',
  },
].map((task) => ({
  ...task,
  existing: task.ids.filter((id) => manifest.examples.some((e) => e.id === id)),
}));
const output = path.join(repoRoot, 'docs/site/wave3');
mkdirSync(output, { recursive: true });
writeFileSync(
  path.join(output, 'chart-coverage.json'),
  `${JSON.stringify({ guideCount: matrix.length, featuredCount: matrix.filter((g) => g.featured).length, matrix, starterCoverage, priorities }, null, 2)}\n`,
);
const md = [
  '# Chart guide launch coverage',
  '',
  `${matrix.length} public guides use one live minimal example, a compact overview, and linked variation thumbnails. The table counts unique **non-minimal** variation examples; it never counts duplicate embeds or source-language tabs as a variation. All original detailed data, styling, interaction, accessibility, reference and migration sections remain. Three existing performance cases (table/virtualized, graph3d/orbit, parcoords/large) retain repository instructions rather than linking to nonexistent gallery detail pages; they are excluded from published thumbnail counts.`,
  '',
  '## Launch-featured guides',
  '',
  '| Guide | Minimal example | Substantive variations | Verified Python examples | Remaining variation gap |',
  '| --- | --- | ---: | ---: | ---: |',
  ...matrix
    .filter((g) => g.featured)
    .map(
      (g) =>
        `| [${g.title}](../../../apps/docs/${g.file}) | \`${g.minimal}\` | ${g.variationCount} | ${g.pythonExamples.length} | ${g.variationGap} |`,
    ),
  '',
  '## Beginner tasks by family',
  '',
  'These selections describe specific tasks and are explicitly classified as beginner. Short lists expose editorial coverage gaps; intermediate and unassessed examples are not relabeled to satisfy a quota. Map and graph extension boundaries remain visible in the guides.',
  '',
  '| Family | Reviewed tasks | Gap to three |',
  '| --- | --- | ---: |',
  ...starterCoverage.map(
    (s) =>
      `| ${s.label} | ${s.starters.map((task) => `\`${task.id}\`: ${task.task}`).join('; ')} | ${s.gap} |`,
  ),
  '',
  '## Practical priorities',
  '',
  '| Task | Existing browser examples | Remaining work |',
  '| --- | --- | --- |',
  ...priorities.map(
    (p) => `| ${p.task} | ${p.existing.map((id) => `\`${id}\``).join(', ')} | ${p.gap} |`,
  ),
  '',
  '## Verification boundaries',
  '',
  'Language availability comes from exact source metadata. A browser thumbnail is canonical-example evidence; a copied bundle has separate compile/render evidence. Python counterpart records include the literal figure SHA, standalone source SHA, canonical browser/helper SHAs, notebook-host proof and one-widget output expectation. Geographic and graph extension traces remain browser-only in the current Python bridge. Source tabs fetch a small per-example metadata file and then the selected complete source; no full source inventory is shipped in page metadata.',
  '',
];
writeFileSync(path.join(output, 'chart-coverage.md'), `${md.join('\n')}\n`);
console.log(
  `Chart coverage: ${matrix.length} guides, ${matrix.filter((g) => g.featured).length} featured; ${matrix.reduce((n, g) => n + g.variationGap, 0)} featured variation gaps; ${starterCoverage.reduce((n, s) => n + s.gap, 0)} beginner task gaps.`,
);
