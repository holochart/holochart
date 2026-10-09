import { describe, expect, it } from 'vitest';
import { docsPages, liveExampleIds } from '../../apps/docs/scripts/render-check/pages.ts';

describe('rendered chart discovery', () => {
  it('counts actual charts while excluding detail links and fenced demonstrations', () => {
    expect(
      liveExampleIds(
        '<Example id="bar/basic" />\n<ExampleLink id="bar/stacked" />\n```md\n<Example id="fake/code" />\n```\n<Example id="line/basic" />',
      ),
    ).toEqual(['bar/basic', 'line/basic']);
  });
  it('the compact guide suite expects one live chart per guide', () => {
    const guides = docsPages('charts/').filter((page) => !page.file.endsWith('/index.md'));
    expect(guides).toHaveLength(47);
    for (const guide of guides) expect(guide.examples, guide.file).toHaveLength(1);
    expect(docsPages('charts/3d/index.md')[0]?.examples).toEqual(['scene/subplots']);
  });
  it('does not navigate literal dynamic route templates, which have dedicated route tests', () => {
    expect(docsPages().every((page) => !page.route.includes('['))).toBe(true);
    expect(docsPages().some((page) => page.route === 'gallery/')).toBe(true);
  });
});
