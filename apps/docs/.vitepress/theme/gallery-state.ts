/** Browser-safe gallery filtering, alias search and URL state shared by directory/family/detail. */
import { chartFamilies, subtypeById } from '../../../../examples/_lib/families.ts';
import { familyStarters } from '../../../../examples/_lib/curation.ts';
import type { ExampleClassification } from '../../../../examples/_lib/catalog.ts';

export interface BrowsableExample extends ExampleClassification {
  id: string;
  title: string;
  description: string;
  tags: string[];
  traceTypes: string[];
  category: string;
  threeD: boolean;
  standalone?: { verification: string };
}
export interface GalleryFilters {
  q: string;
  family: string;
  subtype: string;
  kind: string;
  language: string;
  level: string;
  feature: string;
  api: string;
  dimension: string;
  sort: 'recommended' | 'alphabetical';
  category: string;
  trace: string;
  tag: string;
  threeD: boolean;
}
export const emptyFilters = (family = ''): GalleryFilters => ({
  q: '',
  family,
  subtype: '',
  kind: '',
  language: '',
  level: '',
  feature: '',
  api: '',
  dimension: '',
  sort: 'recommended',
  category: '',
  trace: '',
  tag: '',
  threeD: false,
});

// Reuse reviewed analytical task language instead of making visitors guess trace names.
const starterTasks = new Map(
  Object.values(familyStarters).flatMap((tasks) =>
    tasks.map(({ id, task }) => [id, task] as const),
  ),
);

export function hasVerifiedLanguage(e: BrowsableExample, language: string): boolean {
  if (language === 'javascript') return e.standalone?.verification === 'rendered';
  if (language === 'python')
    return e.variants.some(
      (v) =>
        v.language === 'python' &&
        ['rendered', 'executed'].includes(v.verification.state) &&
        v.verification.browserVerified === true,
    );
  return e.variants.some(
    (v) => v.language === language && ['rendered', 'executed'].includes(v.verification.state),
  );
}

/** AND across facets. This UI uses single-select facets, so there is no ambiguous within-facet OR. */
export function filterExamples<T extends BrowsableExample>(
  examples: readonly T[],
  f: GalleryFilters,
): T[] {
  const words = f.q.toLowerCase().split(/\s+/).filter(Boolean);
  return examples
    .filter((e) => {
      if (
        f.family &&
        e.primaryFamily !== f.family &&
        !e.secondaryFamilies.some((id) => id === f.family)
      )
        return false;
      if (f.subtype && !e.chartTypes.includes(f.subtype)) return false;
      if (f.kind && e.contentKind !== f.kind) return false;
      if (f.language && !hasVerifiedLanguage(e, f.language)) return false;
      if (f.level && e.difficulty !== f.level) return false;
      if (f.feature && !e.features.includes(f.feature)) return false;
      if (f.api && e.api !== f.api) return false;
      if (f.dimension && e.renderingDimension !== f.dimension) return false;
      if (f.category && e.category !== f.category) return false;
      if (f.trace && !e.traceTypes.includes(f.trace)) return false;
      if (f.tag && !e.tags.includes(f.tag)) return false;
      if (f.threeD && !e.threeD) return false;
      if (words.length === 0) return true;
      const types = e.chartTypes.map((t) => subtypeById(t)).filter(Boolean);
      const families = chartFamilies.filter(
        (family) => family.id === e.primaryFamily || e.secondaryFamilies.includes(family.id),
      );
      const haystack = [
        e.id,
        e.title,
        e.description,
        starterTasks.get(e.id) ?? '',
        ...e.tags,
        ...e.features,
        ...types.flatMap((t) => [t!.label, ...t!.aliases]),
        ...families.map((family) => family.label),
        ...e.variants.flatMap((v) => [v.language, ...v.environments]),
        ...(e.variants.some((v) => v.language === 'python') ? ['jupyter', 'notebook'] : []),
      ]
        .join(' ')
        .toLowerCase();
      return words.every((word) => haystack.includes(word));
    })
    .sort((a, b) =>
      f.sort === 'alphabetical'
        ? a.title.localeCompare(b.title) || a.id.localeCompare(b.id)
        : (a.curatedRank ?? Infinity) - (b.curatedRank ?? Infinity) ||
          Number(a.contentKind === 'demo') - Number(b.contentKind === 'demo') ||
          Number(!a.id.endsWith('/basic')) - Number(!b.id.endsWith('/basic')) ||
          a.title.localeCompare(b.title) ||
          a.id.localeCompare(b.id),
    );
}

/** Unknown/obsolete facet values recover to a usable view; queries remain user text. */
export function filtersFromSearch(
  search: string,
  examples: readonly BrowsableExample[],
  fixedFamily = '',
): GalleryFilters {
  const q = new URLSearchParams(search);
  const f = emptyFilters(fixedFamily);
  const valid = (key: string, values: Iterable<string>): string => {
    const value = q.get(key) ?? '';
    return new Set(values).has(value) ? value : '';
  };
  f.q = q.get('q') ?? '';
  f.family =
    fixedFamily ||
    valid(
      'family',
      chartFamilies.map((family) => family.id),
    );
  f.subtype = valid(
    'subtype',
    chartFamilies.flatMap((family) => family.chartTypes.map((t) => t.id)),
  );
  if (
    f.family &&
    f.subtype &&
    !chartFamilies
      .find((family) => family.id === f.family)
      ?.chartTypes.some((t) => t.id === f.subtype)
  )
    f.subtype = '';
  f.kind = valid('kind', [
    'chart',
    'recipe',
    'theme',
    'interaction',
    'layout',
    'accessibility',
    'demo',
  ]);
  f.language = valid('language', ['typescript', 'javascript', 'python']);
  f.level = valid('level', ['beginner', 'intermediate', 'advanced', 'unassessed']);
  f.feature = valid(
    'feature',
    examples.flatMap((e) => e.features),
  );
  f.api = valid('api', ['figure', 'express']);
  f.dimension = valid('dimension', ['2d', 'native-3d', 'extruded']);
  f.sort = q.get('sort') === 'alphabetical' ? 'alphabetical' : 'recommended';
  f.category = valid(
    'category',
    examples.map((e) => e.category),
  );
  f.trace = valid(
    'trace',
    examples.flatMap((e) => e.traceTypes),
  );
  f.tag = valid(
    'tag',
    examples.flatMap((e) => e.tags),
  );
  f.threeD = q.get('3d') === '1';
  return f;
}

export function filtersSearch(filters: GalleryFilters, fixedFamily = ''): string {
  const q = new URLSearchParams();
  for (const key of [
    'q',
    'family',
    'subtype',
    'kind',
    'language',
    'level',
    'feature',
    'api',
    'dimension',
    'category',
    'trace',
    'tag',
  ] as const) {
    if (filters[key] && !(key === 'family' && filters[key] === fixedFamily))
      q.set(key, filters[key]);
  }
  if (filters.sort !== 'recommended') q.set('sort', filters.sort);
  if (filters.threeD) q.set('3d', '1');
  return q.toString();
}

export const exampleRoute = (id: string): string => `/gallery/example/${id}`;
export const familyRoute = (id: string): string => `/gallery/${id}/`;

export function curatedExamples<T extends BrowsableExample>(
  examples: readonly T[],
  family: string,
  count = 3,
): T[] {
  const pool = filterExamples(examples, { ...emptyFilters(family), kind: 'chart' });
  const selected: T[] = [];
  const types = new Set<string>();
  for (const entry of pool) {
    if (selected.length >= count) break;
    if (!selected.length || entry.chartTypes.some((t) => !types.has(t))) {
      selected.push(entry);
      entry.chartTypes.forEach((t) => types.add(t));
    }
  }
  for (const entry of pool) {
    if (selected.length >= count) break;
    if (!selected.includes(entry)) selected.push(entry);
  }
  return selected;
}

export function relatedExamples<T extends BrowsableExample>(
  entry: T,
  examples: readonly T[],
): { variations: T[]; alternatives: T[] } {
  const same = examples.filter(
    (e) => e.id !== entry.id && e.chartTypes.some((t) => entry.chartTypes.includes(t)),
  );
  const related = examples.filter(
    (e) => e.id !== entry.id && e.primaryFamily === entry.primaryFamily && !same.includes(e),
  );
  return {
    variations: filterExamples(same, emptyFilters()).slice(0, 4),
    alternatives: filterExamples(related, emptyFilters()).slice(0, 4),
  };
}
