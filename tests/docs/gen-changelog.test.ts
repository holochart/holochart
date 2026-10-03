import { describe, expect, it } from 'vitest';
import {
  compareVersionsDesc,
  mergeChangelogs,
  parseChangelog,
  parseChangeset,
  pendingEntries,
  renderChangelog,
} from '../../apps/docs/scripts/gen-changelog.ts';

/** A package changelog as `changeset version` writes it (`@changesets/changelog-git`). */
const CORE_CHANGELOG = `# @mk7s/holochart-core

## 0.1.0-alpha.1

### Patch Changes

- 1a2b3c4: Hover reads \`text\` when \`hovertext\` is empty.

## 0.1.0-alpha.0

### Minor Changes

- 9f8e7d6: First public alpha.

  #### Install

  - \`npm i @mk7s/holochart three\`

- 0a0a0a0: New \`config.maxPixelRatio\`.

### Patch Changes

- Updated dependencies [9f8e7d6]
  - @mk7s/holochart-render@0.1.0-alpha.0
`;

const RENDER_CHANGELOG = `# @mk7s/holochart-render

## 0.1.0-alpha.1

### Patch Changes

- Updated dependencies [1a2b3c4]
  - @mk7s/holochart-core@0.1.0-alpha.1

## 0.1.0-alpha.0

### Minor Changes

- 9f8e7d6: First public alpha.

  #### Install

  - \`npm i @mk7s/holochart three\`

### Patch Changes

- 0a0a0a0: New \`config.maxPixelRatio\`.
`;

describe('parseChangeset', () => {
  it('reads the packages, their bump types and the summary', () => {
    const c = parseChangeset(
      'shared-renderer',
      '---\n\'@mk7s/holochart-core\': minor\n"@mk7s/holochart-render": patch\n---\n\nOne renderer.\n\nMore.\n',
    );
    expect(c).toEqual({
      id: 'shared-renderer',
      releases: [
        { name: '@mk7s/holochart-core', type: 'minor' },
        { name: '@mk7s/holochart-render', type: 'patch' },
      ],
      summary: 'One renderer.\n\nMore.',
    });
  });

  it('skips empty changesets and files without frontmatter', () => {
    expect(parseChangeset('empty', '---\n---\n\nNothing released.\n')).toBeUndefined();
    expect(parseChangeset('readme', '# Changesets\n')).toBeUndefined();
  });
});

describe('pendingEntries', () => {
  it('uses the highest bump type a changeset names', () => {
    const c = parseChangeset('x', "---\n'b': patch\n'a': minor\n---\n\nText.\n");
    expect(pendingEntries(c ? [c] : [])).toEqual([
      { type: 'minor', summary: 'Text.', packages: ['a', 'b'] },
    ]);
  });
});

describe('parseChangelog', () => {
  it('reads versions, bump types and multi-line entries, without commits or dependency lines', () => {
    expect(parseChangelog(CORE_CHANGELOG)).toEqual([
      {
        version: '0.1.0-alpha.1',
        entry: { type: 'patch', summary: 'Hover reads `text` when `hovertext` is empty.' },
      },
      {
        version: '0.1.0-alpha.0',
        entry: {
          type: 'minor',
          summary: 'First public alpha.\n\n#### Install\n\n- `npm i @mk7s/holochart three`',
        },
      },
      {
        version: '0.1.0-alpha.0',
        entry: { type: 'minor', summary: 'New `config.maxPixelRatio`.' },
      },
    ]);
  });
});

describe('compareVersionsDesc', () => {
  it('sorts newest first, a release after its prereleases', () => {
    const versions = ['0.1.0-alpha.2', '0.1.0', '0.1.0-alpha.10', '0.2.0-beta.0', '0.1.1'];
    expect([...versions].sort(compareVersionsDesc)).toEqual([
      '0.2.0-beta.0',
      '0.1.1',
      '0.1.0',
      '0.1.0-alpha.10',
      '0.1.0-alpha.2',
    ]);
  });
});

describe('mergeChangelogs', () => {
  const releases = mergeChangelogs(
    new Map([
      ['@mk7s/holochart-core', CORE_CHANGELOG],
      ['@mk7s/holochart-render', RENDER_CHANGELOG],
    ]),
  );

  it('lists each change once per version with the packages that carry it', () => {
    expect(releases.map((r) => r.version)).toEqual(['0.1.0-alpha.1', '0.1.0-alpha.0']);
    expect(releases[0]?.entries).toEqual([
      {
        type: 'patch',
        summary: 'Hover reads `text` when `hovertext` is empty.',
        packages: ['@mk7s/holochart-core'],
      },
    ]);
    expect(releases[1]?.entries.map((e) => [e.type, e.packages.length])).toEqual([
      ['minor', 2],
      // Minor in core, patch in render: listed under the higher type.
      ['minor', 2],
    ]);
  });

  it('renders versions after the unreleased changes', () => {
    const all = ['@mk7s/holochart-core', '@mk7s/holochart-render'];
    const text = renderChangelog({
      pending: [{ type: 'patch', summary: 'A fix.', packages: ['@mk7s/holochart-core'] }],
      releases,
      allPackages: all,
      preTag: 'alpha',
    });
    const headings = text.split('\n').filter((l) => l.startsWith('## '));
    expect(headings).toEqual(['## Unreleased', '## 0.1.0-alpha.1', '## 0.1.0-alpha.0']);
    expect(text).toContain('`alpha` npm dist-tag');
    expect(text).toContain('  Packages: all packages.');
    expect(text).toContain('  Packages: `@mk7s/holochart-core`.');
    expect(text).not.toContain('No version has been published yet');
    expect(text).not.toContain('Updated dependencies');
  });

  it('says so when nothing is published or pending', () => {
    expect(renderChangelog({ pending: [], releases: [], allPackages: [] })).toBe(
      'No version has been published yet.\n',
    );
  });
});
