import { describe, expect, it } from 'vitest';
import {
  chartFamilies,
  classifyExample,
  exampleFamilyCounts,
} from '../../../examples/_lib/catalog.ts';
import { checkClassification } from './check.ts';
import { classificationFor, sourceHints } from './classification.ts';
import {
  EXAMPLES_DIR,
  migrateManifest,
  mergeRecords,
  readManifest,
  type GalleryManifest,
} from './manifest.ts';

const classify = (id: string, traceTypes: string[], tags: string[] = [], modes: string[] = []) =>
  classifyExample({ id, traceTypes, tags, modes });

describe('shared gallery taxonomy', () => {
  it('keeps family/subtype IDs unique and documentation canonical', () => {
    expect(new Set(chartFamilies.map((f) => f.id)).size).toBe(11);
    const types = chartFamilies.flatMap((f) => f.chartTypes);
    expect(new Set(types.map((t) => t.id)).size).toBe(types.length);
    expect(types.every((t) => /^\/(?:charts|express)\//.test(t.docs))).toBe(true);
  });

  it('classifies scatter by display mode instead of its trace or folder name', () => {
    expect(classify('scatter/basic', ['scatter'], [], ['markers']).primaryFamily).toBe(
      'relationships',
    );
    expect(classify('recipes/trend', ['scatter'], [], ['lines']).primaryFamily).toBe('time-series');
    expect(classify('scatter/trend', ['scatter'], [], ['lines']).primaryFamily).toBe('time-series');
    expect(classify('scatter/lines-shapes', ['scatter']).chartTypes).toEqual(['line']);
    const mixed = classify('demos/mixed', ['scatter'], [], ['lines', 'markers']);
    expect(mixed.chartTypes).toEqual(['line', 'scatter']);
    expect(mixed.secondaryFamilies).toContain('relationships');
  });

  it('classifies user-facing patterns even when their underlying trace differs', () => {
    expect(classify('strip/basic', ['box'], ['strip']).chartTypes).toEqual(['strip']);
    expect(classify('strip/with-box', ['box'], ['strip']).chartTypes).toEqual(['box', 'strip']);
    expect(classify('recipes/lollipop', ['scatter'], ['lollipop']).primaryFamily).toBe('basic');
    expect(classify('recipes/dot-plot', ['scatter'], ['dot']).chartTypes).toEqual(['dot']);
  });

  it('curates statistical, comparison and mixed-subplot intent from real examples', () => {
    const ecdf = classify('express/ecdf', ['box', 'scatter']);
    expect(ecdf.primaryFamily).toBe('statistical');
    expect(ecdf.chartTypes).toEqual(['ecdf']);
    expect(ecdf.docs).toEqual(['/express/statistics#ecdf']);
    const dumbbell = classify('recipes/dumbbell', ['scatter'], [], ['lines', 'markers']);
    expect(dumbbell.primaryFamily).toBe('basic');
    expect(dumbbell.chartTypes).toEqual(['dumbbell']);
    const polar = classify('polar/mixed', ['scatterpolar', 'scatter']);
    expect(polar.primaryFamily).toBe('polar');
    expect(polar.secondaryFamilies).toEqual(['time-series']);
    const scene = classify('scene/subplots', ['surface', 'scatter3d', 'scatter']);
    expect(scene.primaryFamily).toBe('3d');
    expect(scene.secondaryFamilies).toEqual(['relationships']);
  });

  it('upgrades untouched legacy entries during a partial merge and retains valid v2 entries', () => {
    const current = readManifest()!;
    const entry = current.examples.find((e) => e.id === 'line/basic')!;
    const legacyEntry = {
      id: entry.id,
      title: entry.title,
      description: entry.description,
      tags: entry.tags,
      category: entry.category,
      traceTypes: entry.traceTypes,
      size: entry.size,
      threeD: entry.threeD,
      thumbnail: entry.thumbnail,
      thumbnailSize: entry.thumbnailSize,
    };
    const migrated = mergeRecords(
      { version: 1, look: 'holochart', examples: [legacyEntry] },
      [],
      new Set([entry.id]),
    );
    expect(migrated.version).toBe(2);
    expect(migrated.examples[0]?.primaryFamily).toBe('time-series');
    expect(migrated.examples[0]?.variants[0]?.source).toBe('examples/line/basic.ts');
    const preserved = mergeRecords(
      { version: 2, look: 'holochart', examples: [entry] },
      [],
      new Set([entry.id]),
    );
    expect(preserved.examples[0]).toBe(entry);
  });

  it('cross-lists graph3d and distinguishes an adjacency matrix from a scalar heatmap', () => {
    const graph = classify('graph3d/basic', ['graph3d']);
    expect(graph.primaryFamily).toBe('3d');
    expect(graph.secondaryFamilies).toEqual(['networks']);
    const adjacency = classify('express/adjacency-matrix', ['heatmap']);
    expect(adjacency.primaryFamily).toBe('networks');
    expect(adjacency.secondaryFamilies).toEqual(['scientific']);
    expect(adjacency.chartTypes).toContain('adjacency-matrix');
    expect(classify('heatmap/basic', ['heatmap']).primaryFamily).toBe('scientific');
  });

  it('puts Sankey in flows and never fabricates Python artifacts from trace compatibility', () => {
    const sankey = classify('sankey/basic', ['sankey']);
    expect(sankey.primaryFamily).toBe('networks');
    expect(sankey.variants.map((v) => v.language)).toEqual(['typescript']);
    expect(sankey.variants[0]?.source).toBe('examples/sankey/basic.ts');
    expect(sankey.variants[0]?.environments).toEqual(['repository-sandbox']);
  });

  it('keeps mixed applications as demos, curates primary intent and counts each ID once', () => {
    const input = {
      id: 'demos/index-funds/candles',
      ...classify('demos/index-funds/candles', ['scatter', 'bar', 'candlestick'], ['line']),
    };
    expect(input.contentKind).toBe('demo');
    expect(input.primaryFamily).toBe('financial');
    expect(input.secondaryFamilies).toEqual(['basic', 'time-series']);
    const counts = exampleFamilyCounts([input, input]);
    expect(counts.financial).toBe(1);
    expect(counts.basic).toBe(1);
    expect(counts['time-series']).toBe(1);
    expect(counts.relationships).toBe(0);
    expect(classify('recipes/gaps', ['scatter']).difficulty).toBe('unassessed');
  });

  it('reads imports/modes statically without running any example code', () => {
    expect(
      sourceHints(`
      import { createChart } from '@mk7s/holochart';
      import type { ExampleMeta } from '../_lib/types.ts';
      import { something } from 'three/addons/thing.js';
      throw new Error('must never execute');
      const data = { mode: 'lines+markers', fill: 'tonexty' };
    `),
    ).toEqual({
      modes: ['lines+markers'],
      filled: true,
      dependencies: ['@mk7s/holochart', 'three'],
      api: 'figure',
    });
  });

  it('migrates the real inventory without altering thumbnail paths/sizes or examples', () => {
    const previous = readManifest()!;
    const legacy = {
      ...previous,
      version: 1 as const,
      examples: previous.examples.map((e) => ({
        id: e.id,
        title: e.title,
        description: e.description,
        tags: e.tags,
        category: e.category,
        traceTypes: e.traceTypes,
        size: e.size,
        threeD: e.threeD,
        thumbnail: e.thumbnail,
        thumbnailSize: e.thumbnailSize,
      })),
    };
    const migrated = migrateManifest(legacy);
    expect(migrated.version).toBe(2);
    expect(
      migrated.examples.map(({ id, thumbnail, thumbnailSize, size }) => ({
        id,
        thumbnail,
        thumbnailSize,
        size,
      })),
    ).toEqual(
      previous.examples.map(({ id, thumbnail, thumbnailSize, size }) => ({
        id,
        thumbnail,
        thumbnailSize,
        size,
      })),
    );
    expect(checkClassification(migrated)).toEqual([]);
    expect(migrated.examples.every((e) => e.chartTypes.length > 0)).toBe(true);
    expect(migrated.examples.every((e) => !e.id.startsWith('_'))).toBe(true);
    expect(
      classificationFor(
        previous.examples.find((e) => e.id === 'scatter/lines-shapes')!,
        EXAMPLES_DIR,
      ).primaryFamily,
    ).toBe('time-series');
  });

  it('rejects unknown taxonomy IDs, duplicate entries and dangling/unsafe variants', () => {
    const original = readManifest()!.examples[0]!;
    const corrupted = {
      ...original,
      primaryFamily: 'missing',
      chartTypes: ['not-a-chart'],
      variants: [
        { language: 'python', source: '../outside.py', dependencies: [], environments: [] },
      ],
    };
    const problems = checkClassification({
      version: 2,
      look: 'holochart',
      examples: [corrupted, corrupted],
    } as unknown as GalleryManifest);
    expect(problems).toContain(`${original.id}: unknown primary family missing.`);
    expect(problems).toContain(`${original.id}: unknown chart subtype not-a-chart.`);
    expect(problems).toContain(`${original.id}: missing or unsafe source artifact ../outside.py.`);
    expect(problems).toContain(`${original.id}: duplicate manifest entry.`);
    expect(problems).toContain(`${original.id}: variant lacks verification state.`);
  });
});
