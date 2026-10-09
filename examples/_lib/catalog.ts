/** Shared editorial registry. Browser-safe: the gallery and chart navigation use the same IDs. */
import notebookCatalog from '../notebooks/manifest.json' with { type: 'json' };
import { chartFamilies, subtypeById, type FamilyId } from './families.ts';
import { familyStarters } from './curation.ts';
export { familyStarters } from './curation.ts';
export { chartFamilies, familyById, subtypeById } from './families.ts';
export type { FamilyId, ChartFamily, ChartSubtype } from './families.ts';

export type ContentKind =
  'chart' | 'recipe' | 'theme' | 'interaction' | 'layout' | 'accessibility' | 'demo';
export type Difficulty = 'beginner' | 'intermediate' | 'advanced' | 'unassessed';
export interface LanguageVariant {
  language: 'typescript' | 'javascript' | 'python';
  source: string;
  notebook?: string;
  /** Actual published source URL; nested per-example Python variants retain their directory. */
  download?: string;
  identity?: {
    sourceSha256: string;
    figureSha256: string;
    browserSourceHashes: Record<string, string>;
    expectedWidgetOutputs: number;
  };
  dependencies: string[];
  environments: string[];
  verification: {
    state: 'rendered' | 'executed' | 'unverified';
    method: string;
    artifact?: string;
    artifactBase?: 'repo' | 'public';
    browserVerified?: boolean;
    sourceSha256?: string;
  };
}
export interface ExampleClassification {
  primaryFamily: FamilyId;
  secondaryFamilies: FamilyId[];
  chartTypes: string[];
  contentKind: ContentKind;
  features: string[];
  difficulty: Difficulty;
  curatedRank: number | null;
  docs: string[];
  variants: LanguageVariant[];
  api: 'figure' | 'express';
  renderingDimension: '2d' | 'native-3d' | 'extruded';
}
export interface ClassificationInput {
  id: string;
  tags: readonly string[];
  traceTypes: readonly string[];
  /** Read statically from source, never execute an example while building metadata. */
  modes?: readonly string[];
  filled?: boolean;
  dependencies?: readonly string[];
  thumbnail?: string;
  api?: 'figure' | 'express';
}

/** Central curated exceptions take precedence over inference; add actual variants here only. */
export const exampleOverrides: Readonly<Record<string, Partial<ExampleClassification>>> = {
  'express/ecdf': { primaryFamily: 'statistical', secondaryFamilies: [], chartTypes: ['ecdf'] },
  'recipes/dumbbell': { primaryFamily: 'basic', secondaryFamilies: [], chartTypes: ['dumbbell'] },
  'polar/mixed': { chartTypes: ['line', 'scatterpolar'] },
  'scene/subplots': { primaryFamily: '3d', secondaryFamilies: ['relationships'] },
  'scatter/lines-shapes': { primaryFamily: 'time-series', chartTypes: ['line'] },
  'express/adjacency-matrix': {
    primaryFamily: 'networks',
    secondaryFamilies: ['scientific'],
    chartTypes: ['adjacency-matrix', 'heatmap'],
  },
  'demos/index-funds/candles': {
    primaryFamily: 'financial',
    secondaryFamilies: ['basic', 'time-series'],
  },
  'demos/tqqq-soxl/candles': {
    primaryFamily: 'financial',
    secondaryFamilies: ['basic', 'time-series'],
  },
  'demos/science-basics/pendulum-energy': {
    primaryFamily: 'time-series',
    secondaryFamilies: ['basic', 'relationships'],
    difficulty: 'advanced',
  },
  'line/basic': { curatedRank: 1, difficulty: 'beginner' },
  'scatter/basic': { curatedRank: 2, difficulty: 'beginner' },
  'bar/basic': { curatedRank: 3, difficulty: 'beginner' },
  'box/basic': { curatedRank: 4, difficulty: 'beginner' },
  'heatmap/basic': { curatedRank: 5, difficulty: 'beginner' },
  'scattergeo/basic': { curatedRank: 6, difficulty: 'beginner' },
  'pie/basic': { curatedRank: 7, difficulty: 'beginner' },
  'candlestick/basic': { curatedRank: 8, difficulty: 'intermediate' },
  'polar/basic': { curatedRank: 9, difficulty: 'beginner' },
  'sankey/basic': { curatedRank: 10, difficulty: 'beginner' },
  'scatter3d/basic': { curatedRank: 11, difficulty: 'beginner' },
  'choropleth/basic': { curatedRank: 12, difficulty: 'intermediate' },
  'graph/basic': { curatedRank: 13, difficulty: 'intermediate' },
  'histogram/notebook-starter': { curatedRank: 14, difficulty: 'beginner' },
  'graph/force-atlas2': { difficulty: 'advanced' },
};

/** Deterministic classification independent of folder-derived legacy category filters. */
export function classifyExample(input: ClassificationInput): ExampleClassification {
  const { id, tags } = input;
  const category = id.split('/')[0] ?? '';
  const words = new Set(tags);
  const modes = input.modes ?? [];
  const lines =
    ['line', 'area', 'timeseries', 'uncertainty'].includes(category) ||
    tags.some((t) => ['line', 'lines', 'time-series'].includes(t)) ||
    modes.some((m) => m.includes('lines'));
  const types = new Set(input.traceTypes.filter((t) => subtypeById(t)));
  if (types.size === 0) {
    for (const tag of tags) if (subtypeById(tag)) types.add(tag);
  }
  if (types.has('scatter')) {
    if (category === 'strip' || words.has('strip')) {
      types.delete('scatter');
      types.add('strip');
    } else if (words.has('dot') || words.has('lollipop')) {
      types.delete('scatter');
      types.add(words.has('lollipop') ? 'lollipop' : 'dot');
    } else if (category === 'bubble' || words.has('bubble')) {
      types.delete('scatter');
      types.add('bubble');
    } else if (lines) {
      types.delete('scatter');
      types.add(category === 'area' || input.filled ? 'area' : 'line');
      // Marker-only traces in a mixed figure still belong in relationships too.
      if (modes.some((m) => m.includes('markers') && !m.includes('lines'))) types.add('scatter');
    }
  }
  // The strip helper emits a box trace with jittered points, but the public pattern is a strip.
  if (category === 'strip') {
    if (id !== 'strip/with-box') types.delete('box');
    types.add('strip');
  }
  if (category === 'gantt') types.add('gantt');
  if (category === 'log') types.add('log');
  if (category === 'area' && (words.has('stacked') || words.has('stackgroup')))
    types.add('stacked-area');
  if (category === 'uncertainty' || id === 'area/band') types.add('range-band');
  if (id === 'line/step') types.add('step-line');
  if (types.has('pie') && (words.has('donut') || id.includes('donut'))) types.add('donut');
  if (types.has('bar')) {
    if (words.has('horizontal')) types.add('horizontal-bar');
    if (words.has('grouped')) types.add('grouped-bar');
    if (words.has('stacked') || words.has('stack')) types.add('stacked-bar');
  }
  if (types.has('scatterpolar') && lines) {
    types.delete('scatterpolar');
    types.add('polar-line');
  }
  const override = exampleOverrides[id] ?? {};
  const chartTypes = override.chartTypes ?? [...types].sort();
  const families = chartFamilies
    .filter((f) => f.chartTypes.some((t) => chartTypes.includes(t.id)))
    .map((f) => f.id);
  if (chartTypes.includes('graph3d')) families.push('networks');
  const categoryFamily = chartFamilies.find(
    (f) => f.id === category || f.chartTypes.some((t) => t.id === category),
  )?.id;
  const primaryFamily =
    override.primaryFamily ??
    (['line', 'area', 'timeseries', 'uncertainty'].includes(category)
      ? 'time-series'
      : ((categoryFamily && families.includes(categoryFamily) ? categoryFamily : families[0]) ??
        'relationships'));
  const secondaryFamilies =
    override.secondaryFamilies ?? [...new Set(families)].filter((f) => f !== primaryFamily);
  const kinds: Record<string, ContentKind> = {
    recipes: 'recipe',
    themes: 'theme',
    animation: 'interaction',
    interaction: 'interaction',
    selections: 'interaction',
    controls: 'interaction',
    accessibility: 'accessibility',
    demos: 'demo',
    reports: 'demo',
    axes: 'layout',
    layout: 'layout',
    legends: 'layout',
    colorbars: 'layout',
    shapes: 'layout',
    'layout-images': 'layout',
    text: 'layout',
    scene: 'layout',
    view3d: 'layout',
  };
  const contentKind = kinds[category] ?? 'chart';
  const traceNames = new Set(input.traceTypes);
  const features = [...new Set(tags.filter((t) => !traceNames.has(t) && t !== category))].sort();
  return {
    primaryFamily,
    secondaryFamilies,
    chartTypes,
    contentKind,
    features,
    difficulty: Object.values(familyStarters).some((tasks) => tasks.some((task) => task.id === id))
      ? 'beginner'
      : 'unassessed',
    curatedRank: null,
    docs: [...new Set(chartTypes.map((t) => subtypeById(t)?.docs).filter((d): d is string => !!d))],
    variants: [
      {
        language: 'typescript',
        source: `examples/${id}.ts`,
        dependencies: [...(input.dependencies ?? [])].sort(),
        environments: ['repository-sandbox'],
        verification: {
          state: 'rendered',
          method: 'gallery-thumbnail',
          ...(input.thumbnail ? { artifact: input.thumbnail } : {}),
        },
      },
      ...notebookCatalog.notebooks
        .filter((n) => n.galleryExamples.some((exampleId: string) => exampleId === id))
        .map((n): LanguageVariant => {
          const variant =
            'galleryVariants' in n ? n.galleryVariants?.find((v) => v.id === id) : undefined;
          const verification = variant?.verification ?? n.verification;
          return {
            language: 'python',
            source: variant?.source ?? n.source,
            notebook: n.notebook,
            ...(variant
              ? {
                  download: variant.download,
                  identity: {
                    sourceSha256: variant.sourceSha256,
                    figureSha256: variant.figureSha256,
                    browserSourceHashes: Object.fromEntries(
                      Object.entries(variant.browserSourceHashes).filter(
                        ([, value]) => typeof value === 'string',
                      ),
                    ),
                    expectedWidgetOutputs: variant.expectedWidgetOutputs,
                  },
                }
              : {}),
            dependencies:
              variant && 'dependencies' in variant ? variant.dependencies : n.dependencies,
            environments: n.environments,
            verification: {
              ...verification,
              state: verification.state as LanguageVariant['verification']['state'],
              method:
                verification.method ??
                'Exact source execution and notebook-host rendering have not yet been verified.',
              artifactBase: 'repo',
              browserVerified:
                'browserVerified' in verification && verification.browserVerified === true,
            },
          };
        }),
    ],
    api: input.api ?? (category === 'express' || tags.includes('express') ? 'express' : 'figure'),
    renderingDimension: input.traceTypes.some((t) =>
      [
        'scatter3d',
        'bar3d',
        'surface',
        'mesh3d',
        'cone',
        'streamtube',
        'volume',
        'isosurface',
        'graph3d',
      ].includes(t),
    )
      ? 'native-3d'
      : tags.some((t) => ['2.5d', 'depth', 'extrusion', 'view3d'].includes(t))
        ? 'extruded'
        : '2d',
    ...override,
  };
}

/** Cross-listing counts unique IDs per family; these counts intentionally do not sum to the total. */
export function exampleFamilyCounts(
  entries: readonly (Pick<ExampleClassification, 'primaryFamily' | 'secondaryFamilies'> & {
    id: string;
  })[],
): Record<FamilyId, number> {
  return Object.fromEntries(
    chartFamilies.map((f) => [
      f.id,
      new Set(
        entries
          .filter((e) => e.primaryFamily === f.id || e.secondaryFamilies.includes(f.id))
          .map((e) => e.id),
      ).size,
    ]),
  ) as Record<FamilyId, number>;
}
