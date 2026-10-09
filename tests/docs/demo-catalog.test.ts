import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildDemoDirectory } from '../../apps/docs/scripts/demo-catalog.ts';
import { demoChoices } from '../../apps/docs/.vitepress/theme/demo-catalog.ts';
import type { GalleryExample } from '../../apps/docs/.vitepress/theme/data/gallery.data.ts';
const docsRoot = path.resolve('apps/docs');
const manifest = JSON.parse(
  readFileSync(path.join(docsRoot, 'public/gallery/manifest.json'), 'utf8'),
) as { examples: GalleryExample[] };
const entries = buildDemoDirectory(docsRoot, manifest.examples);

describe('curated complete demo reports and reusable starters', () => {
  it('preserves all eleven original destinations with actual static previews and data notes', () => {
    expect(new Set(entries.map((entry) => entry.route))).toEqual(
      new Set([
        '/demos/science-basics',
        '/demos/dallas-weather',
        '/demos/live-weather',
        '/demos/airline-globe',
        '/demos/tqqq-soxl',
        '/demos/index-funds',
        '/demos/openrouter',
        '/demos/repo-graphs',
        '/demos/tirzepatide',
        '/demos/thc-gummies',
        '/demos/usc-texas',
      ]),
    );
    for (const entry of entries) {
      expect(entry.thumbnail).toMatch(/^gallery\/thumbs\/.+\.webp$/);
      expect(entry.title).toBeTruthy();
      expect(entry.notesRoute).toContain('#');
      expect(entry.familyLinks.length).toBeGreaterThan(1);
      expect(entry.reuse.id).not.toMatch(/^demos\//);
    }
  });
  it('separates bundled reports from the on-request live app without inventing forecast imagery', () => {
    expect(entries.filter((entry) => entry.dataMode === 'bundled')).toHaveLength(10);
    const live = entries.filter((entry) => entry.dataMode === 'live');
    expect(live.map((entry) => entry.slug)).toEqual(['live-weather']);
    expect(live[0]?.previewKind).toBe('technique');
    expect(live[0]?.previewId).toBe('line/basic');
    expect(live[0]?.provenance).toContain('Internet required');
    expect(readFileSync(path.resolve('examples/demos/live-weather/data.mts'), 'utf8')).toContain(
      'api.open-meteo.com',
    );
    expect(readFileSync(path.join(docsRoot, 'demos/components/LiveWeather.vue'), 'utf8')).toContain(
      'loadWeather(code',
    );
  });
  it('rejects broken evidence, wrong report previews and non-reusable demo starters', () => {
    const choice = demoChoices[0]!;
    const build = (changed: Partial<typeof choice>) =>
      buildDemoDirectory(docsRoot, manifest.examples, [{ ...choice, ...changed }]);
    expect(() => build({ previewId: 'missing/source' })).toThrow(
      /thumbnail is not an example|thumbnail missing/,
    );
    expect(() => build({ previewId: 'demos/repo-graphs/packages-dag' })).toThrow(
      /not an example in this report/,
    );
    expect(() => build({ reuse: { id: choice.previewId, label: 'Invalid starter' } })).toThrow(
      /non-demo starter/,
    );
    expect(() => build({ notesAnchor: 'missing-data-notes' })).toThrow(/anchor missing/);
    expect(() => build({ sourcePath: 'examples/demos/missing/SOURCES.md' })).toThrow(
      /evidence missing/,
    );
    expect(() => build({ families: ['maps'] })).toThrow(/Unsupported curated demo family/);
  });
  it('retains research source tiers and dated snapshot limitations in visible directory metadata', () => {
    expect(entries.find((entry) => entry.slug === 'tirzepatide')?.provenance).toMatch(
      /abstracts, registries and labels/,
    );
    expect(entries.find((entry) => entry.slug === 'thc-gummies')?.provenance).toMatch(
      /named reviews/,
    );
    expect(entries.find((entry) => entry.slug === 'airline-globe')?.provenance).toMatch(
      /June 2014/,
    );
    expect(entries.find((entry) => entry.slug === 'repo-graphs')?.provenance).toMatch(
      /not a live GitHub feed/,
    );
  });
});
