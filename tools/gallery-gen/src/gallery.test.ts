import { describe, expect, it } from 'vitest';
import { checkGallery, staticMeta } from './check.ts';
import {
  isExcluded,
  isThreeD,
  mergeRecords,
  thumbnailPath,
  type GalleryEntry,
} from './manifest.ts';

function entry(id: string, over: Partial<GalleryEntry> = {}): GalleryEntry {
  return {
    id,
    title: `Title ${id}`,
    description: 'Description.',
    tags: ['a'],
    category: id.split('/')[0] ?? id,
    traceTypes: ['scatter'],
    size: { width: 640, height: 400 },
    threeD: false,
    thumbnail: thumbnailPath(id),
    thumbnailSize: { width: 640, height: 400 },
    ...over,
  };
}

describe('mergeRecords', () => {
  it('replaces rendered entries, drops skipped and deleted ones, keeps the rest, sorts by id', () => {
    const previous = {
      version: 1 as const,
      look: 'holochart' as const,
      examples: [entry('b/kept'), entry('a/old', { title: 'Old' }), entry('c/gone'), entry('d/x')],
    };
    const merged = mergeRecords(
      previous,
      [
        { id: 'a/old', entry: entry('a/old', { title: 'New' }) },
        { id: 'd/x', skipped: true },
      ],
      new Set(['a/old', 'b/kept', 'd/x', 'e/new']),
    );
    expect(merged.examples.map((e) => [e.id, e.title])).toEqual([
      ['a/old', 'New'],
      ['b/kept', 'Title b/kept'],
    ]);
  });
});

describe('tags', () => {
  it('excludes no-visual-test and perf examples', () => {
    expect(isExcluded(['bar', 'perf'])).toBe(true);
    expect(isExcluded(['no-visual-test'])).toBe(true);
    expect(isExcluded(['bar'])).toBe(false);
  });

  it('marks 3D trace types and 3d tags as 3D-native', () => {
    expect(isThreeD(['surface'], [])).toBe(true);
    expect(isThreeD(['scatter'], ['3d'])).toBe(true);
    expect(isThreeD(['scatter', 'bar'], ['markers'])).toBe(false);
  });
});

describe('staticMeta', () => {
  it('reads a literal meta', () => {
    const meta = staticMeta(`
      export const meta: ExampleMeta = {
        title: 'Bar: basic',
        description: \`Bars.\`,
        tags: ['bar', 'category'],
        size: { width: 800, height: 440 },
      };
    `);
    expect(meta).toEqual({
      title: 'Bar: basic',
      description: 'Bars.',
      tags: ['bar', 'category'],
      size: { width: 800, height: 440 },
      sizeKnown: true,
    });
  });

  it('treats spreads as unknown size and computed meta as unknown', () => {
    expect(staticMeta(`export const meta = { ...other, title: 'T' };`)).toEqual({
      title: 'T',
      sizeKnown: false,
    });
    expect(staticMeta(`export const meta = sampler.meta;`)).toBeUndefined();
  });
});

describe('checkGallery', () => {
  it('passes when manifest, thumbnails and examples agree', () => {
    const examples = new Map([
      ['a/one', { title: 'Title a/one', tags: ['a'], sizeKnown: true }],
      ['a/perf', { tags: ['perf'], sizeKnown: true }],
      ['themes/x', undefined],
    ]);
    const entries = [entry('a/one'), entry('themes/x')];
    expect(
      checkGallery(
        entries,
        examples,
        entries.map((e) => e.thumbnail),
      ),
    ).toEqual([]);
  });

  it('reports missing, stale, gone and orphaned entries', () => {
    const examples = new Map([
      ['a/missing', { sizeKnown: true }],
      ['a/renamed', { title: 'New title', sizeKnown: true }],
      ['a/resized', { size: { width: 800, height: 400 }, sizeKnown: true }],
      ['a/excluded', { tags: ['no-visual-test'], sizeKnown: true }],
    ]);
    const entries = [entry('a/renamed'), entry('a/resized'), entry('a/excluded'), entry('a/gone')];
    const problems = checkGallery(entries, examples, [
      thumbnailPath('a/renamed'),
      thumbnailPath('a/excluded'),
      thumbnailPath('a/gone'),
      'gallery/thumbs/orphan.webp',
    ]);
    expect(problems).toEqual([
      'a/missing: missing from the gallery manifest.',
      'a/renamed: title changed ("Title a/renamed" → "New title").',
      'a/resized: size changed (640×400 → 800×400).',
      'a/excluded: excluded from the gallery by its tags but in the manifest.',
      'a/gone: in the manifest but the example is gone.',
      'a/resized: thumbnail gallery/thumbs/a/resized.webp is missing.',
      'gallery/thumbs/orphan.webp: thumbnail is not referenced by the manifest.',
    ]);
  });
});
