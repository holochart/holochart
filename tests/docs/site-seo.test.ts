import { describe, expect, it } from 'vitest';
import { canonicalUrl } from '../../apps/docs/.vitepress/site-seo.ts';

describe('public canonical URLs', () => {
  it.each([
    ['index.md', '/holochart/', 'https://mk7s.dev/holochart/'],
    [
      'gallery/statistical/index.md',
      '/holochart/',
      'https://mk7s.dev/holochart/gallery/statistical/',
    ],
    [
      'gallery/example/bar/basic.md',
      '/holochart/',
      'https://mk7s.dev/holochart/gallery/example/bar/basic',
    ],
    [
      'gallery/all/index.md?language=python#bar/basic',
      '/holochart/',
      'https://mk7s.dev/holochart/gallery/all/',
    ],
    ['reference/scatter.md', '/holochart/v1/', 'https://mk7s.dev/holochart/v1/reference/scatter'],
    ['python/api.md', '/', 'https://mk7s.dev/python/api'],
  ])('%s under %s identifies one document', (file, base, expected) => {
    expect(canonicalUrl(file, base, 'https://mk7s.dev')).toBe(expected);
  });
});
