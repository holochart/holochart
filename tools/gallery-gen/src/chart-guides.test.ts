import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildChartGuideCatalog } from '../../../apps/docs/scripts/chart-guide-catalog.ts';
import { listExampleIds } from '../../../tests/visual/examples.ts';
import { familyStarters, chartFamilies } from '../../../examples/_lib/catalog.ts';
import { exampleIds, lintPage, parsePage } from '../../../apps/docs/scripts/lint-pages.ts';
import { migrateManifest, readManifest, REPO_ROOT } from './manifest.ts';
const manifest = migrateManifest(readManifest()!);
const docsRoot = path.join(REPO_ROOT, 'apps/docs');
const catalog = buildChartGuideCatalog(docsRoot, manifest.examples);
describe('compact chart guides and actual launch coverage', () => {
  it('preserves one canonical live embed and real linked variations on all public guides', () => {
    const known = new Set(listExampleIds(path.join(REPO_ROOT, 'examples')));
    expect(Object.keys(catalog.guides)).toHaveLength(47);
    for (const [file, guide] of Object.entries(catalog.guides)) {
      const source = readFileSync(path.join(docsRoot, file), 'utf8');
      expect([...source.matchAll(/<Example\b/g)], file).toHaveLength(1);
      expect(source, file).toContain('<ChartOverview />');
      expect(source, file).toContain('<ChartVariations />');
      for (const id of exampleIds(parsePage(file, source).body)) {
        if (manifest.examples.some((entry) => entry.id === id))
          expect(catalog.examples[id], `${file}: ${id}`).toBeDefined();
      }
      expect(guide.dataShape.length, file).toBeGreaterThan(10);
      expect(lintPage(parsePage(file, source), known), file).toEqual([]);
      expect(
        guide.variations.every((id) => id !== guide.minimal && known.has(id)),
        file,
      ).toBe(true);
    }
  });
  it('counts unique nonminimal substantive examples for every launch-featured guide', () => {
    const featured = Object.values(catalog.guides).filter((g) => g.featured);
    expect(featured).toHaveLength(15);
    for (const guide of featured) {
      expect(guide.variations.length, guide.title).toBeGreaterThanOrEqual(5);
      expect(new Set(guide.variations).size, guide.title).toBe(guide.variations.length);
      expect(
        guide.variations.every((id) => (catalog.examples[id]?.description.length ?? 0) > 20),
      ).toBe(true);
    }
  });
  it('provides three reviewed, existing, family-relevant beginner tasks rather than inferring levels', () => {
    for (const family of chartFamilies) {
      const tasks = familyStarters[family.id];
      expect(tasks, family.id).toHaveLength(3);
      expect(new Set(tasks.map((task) => task.id)).size).toBe(3);
      for (const task of tasks) {
        const entry = manifest.examples.find((e) => e.id === task.id);
        expect(entry, task.id).toBeDefined();
        expect(entry!.difficulty, task.id).toBe('beginner');
        expect([entry!.primaryFamily, ...entry!.secondaryFamilies], task.id).toContain(family.id);
      }
    }
    expect(manifest.examples.find((e) => e.id === 'graph/force-atlas2')?.difficulty).toBe(
      'advanced',
    );
  });
  it('validates lightweight references and rejects missing linked examples', () => {
    expect(exampleIds('<Example id="bar/basic" /><ExampleLink id="bar/stacked" />')).toEqual([
      'bar/basic',
      'bar/stacked',
    ]);
    const source = '---\ntitle: Task\nstatus: complete\n---\n<ExampleLink id="missing/source" />';
    expect(
      lintPage(parsePage('guides/task.md', source), new Set()).some((f) => f.level === 'error'),
    ).toBe(true);
  });
});
