import { describe, expect, it } from 'vitest';
import { readManifest } from './manifest.ts';
import {
  curatedExamples,
  emptyFilters,
  filterExamples,
  filtersFromSearch,
  filtersSearch,
  hasVerifiedLanguage,
  relatedExamples,
} from '../../../apps/docs/.vitepress/theme/gallery-state.ts';

const entries = readManifest()!.examples;
describe('gallery browsing and URL state', () => {
  it('searches descriptions, subtype aliases, family terms and actual notebook artifacts', () => {
    const ids = (q: string) => filterExamples(entries, { ...emptyFilters(), q }).map((e) => e.id);
    expect(ids('radar').some((id) => id.startsWith('polar/'))).toBe(true);
    expect(ids('candles')).toContain('candlestick/basic');
    expect(ids('error band')).toContain('area/band');
    expect(ids('network')).toContain('graph/basic');
    expect(ids('network')).toContain('sankey/basic');
    expect(ids('Jupyter')).toContain('bar/basic');
    expect(
      filterExamples(entries, {
        ...emptyFilters('statistical'),
        subtype: 'histogram',
        language: 'python',
      }).map((e) => e.id),
    ).toContain('histogram/notebook-starter');
    const maps = entries.map((e) =>
      e.id === 'choropleth/basic' ? { ...e, standalone: { verification: 'rendered' } } : e,
    );
    expect(
      filterExamples(maps, { ...emptyFilters('maps'), language: 'javascript' }).map((e) => e.id),
    ).toContain('choropleth/basic');
    expect(ids('forecast interval')).toContain('area/band');
  });

  it('combines facets with AND, keeps extrusion distinct from native3D and orders deterministically', () => {
    const results = filterExamples(entries, {
      ...emptyFilters('basic'),
      dimension: 'extruded',
      api: 'figure',
    });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((e) => e.renderingDimension === 'extruded' && e.api === 'figure')).toBe(
      true,
    );
    expect(results.map((e) => e.id)).toContain('bar/depth');
    expect(
      filterExamples(entries, { ...emptyFilters(), dimension: 'native-3d' }).map((e) => e.id),
    ).not.toContain('bar/depth');
    expect(filterExamples(entries, emptyFilters())[0]?.id).toBe('line/basic');
    const alphabetical = filterExamples(entries, { ...emptyFilters(), sort: 'alphabetical' });
    expect(alphabetical.map((e) => e.title)).toEqual(
      [...alphabetical]
        .sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id))
        .map((e) => e.title),
    );
  });

  it('finds reviewed analytical tasks without bypassing family or verified-language facets', () => {
    const totals = filterExamples(entries, {
      ...emptyFilters('basic'),
      q: 'Compare category totals',
    });
    expect(totals[0]?.id).toBe('bar/basic');
    expect(
      filterExamples(entries, { ...emptyFilters('time-series'), q: 'Compare category totals' }),
    ).toEqual([]);
    const gaps = filterExamples(entries, {
      ...emptyFilters(),
      q: 'Expose missing observations',
      language: 'python',
    });
    expect(gaps[0]?.id).toBe('line/gaps');
    const mapQuery = 'Place measured cities on a world map';
    expect(filterExamples(entries, { ...emptyFilters('maps'), q: mapQuery })[0]?.id).toBe(
      'scattergeo/basic',
    );
    expect(
      filterExamples(entries, { ...emptyFilters('maps'), q: mapQuery, language: 'python' }),
    ).toEqual([]);
  });

  it('roundtrips all facets and repairs obsolete or inconsistent parameters', () => {
    const filters = {
      ...emptyFilters('time-series'),
      q: 'range band',
      subtype: 'range-band',
      language: 'typescript',
      level: 'beginner',
      api: 'figure',
      dimension: '2d',
      sort: 'alphabetical' as const,
    };
    expect(filtersFromSearch(filtersSearch(filters), entries)).toEqual(filters);
    const repaired = filtersFromSearch(
      '?family=gone&subtype=deleted&language=rust&dimension=svg&level=easy&category=unknown',
      entries,
    );
    expect(repaired).toEqual(emptyFilters());
    expect(filtersFromSearch('?family=basic&subtype=surface', entries).subtype).toBe('');
    expect(filtersFromSearch('?family=financial', entries, 'maps').family).toBe('maps');
  });

  it('keeps legacy category/trace/tag/3d state and prevents kernel-only variants being browser verified', () => {
    const legacy = filtersFromSearch('?category=line&trace=scatter&tag=gaps&3d=1', entries);
    expect(filtersSearch(legacy)).toBe('category=line&trace=scatter&tag=gaps&3d=1');
    const bar = entries.find((e) => e.id === 'bar/basic')!;
    expect(hasVerifiedLanguage(bar, 'typescript')).toBe(true);
    const pending = {
      ...bar,
      variants: bar.variants.map((v) =>
        v.language === 'python'
          ? {
              ...v,
              verification: {
                ...v.verification,
                state: 'executed' as const,
                browserVerified: false,
              },
            }
          : v,
      ),
    };
    expect(hasVerifiedLanguage(pending, 'python')).toBe(false);
    expect(
      hasVerifiedLanguage({ ...bar, standalone: { verification: 'compiled' } }, 'javascript'),
    ).toBe(false);
    expect(
      hasVerifiedLanguage({ ...bar, standalone: { verification: 'rendered' } }, 'javascript'),
    ).toBe(true);
  });

  it('curates diverse starters and picks related examples by actual chart metadata', () => {
    const basic = curatedExamples(entries, 'basic');
    expect(basic).toHaveLength(3);
    expect(new Set(basic.flatMap((e) => e.chartTypes)).size).toBeGreaterThan(1);
    const scatter = entries.find((e) => e.id === 'scatter/basic')!;
    const related = relatedExamples(scatter, entries);
    expect(
      related.variations.every(
        (e) =>
          e.id !== scatter.id && e.chartTypes.some((type) => scatter.chartTypes.includes(type)),
      ),
    ).toBe(true);
    expect(
      related.alternatives.every(
        (e) =>
          e.primaryFamily === scatter.primaryFamily &&
          !e.chartTypes.some((type) => scatter.chartTypes.includes(type)),
      ),
    ).toBe(true);
  });
});
