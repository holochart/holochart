import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FONT_SOURCES,
  FONT_LICENSE_FILE,
  FONT_MODULE_DIR,
  FONT_SOURCE_DIR,
  GEN_COMMAND,
  REPO_ROOT,
  generateFontModules,
} from '../../scripts/fonts/generate-default-fonts.ts';
import { DEFAULT_FONT_FILES } from '../../packages/render/src/fonts/default-font-files.ts';

/**
 * The built-in default font (plan E2.18): the lazy `data:` URL modules are generated from the
 * committed OTF files, and the fonts ship with their license wherever they ship.
 */
const read = (rel: string): string => readFileSync(path.join(REPO_ROOT, rel), 'utf8');
const packageJson = (dir: string) =>
  JSON.parse(read(`packages/${dir}/package.json`)) as {
    files: string[];
    exports: Record<string, unknown>;
    publishConfig: { exports: Record<string, unknown> };
  };

describe('built-in default font modules', () => {
  const files = generateFontModules();

  it.each(Object.entries(files))('%s is up to date', (rel, expected) => {
    const abs = path.join(REPO_ROOT, rel);
    const actual = existsSync(abs) ? readFileSync(abs, 'utf8') : '';
    expect(actual === expected, `${rel} is stale: run \`${GEN_COMMAND}\``).toBe(true);
  });

  it('has no module without a font source', () => {
    const generated = readdirSync(path.join(REPO_ROOT, FONT_MODULE_DIR)).sort();
    expect(generated).toEqual(
      Object.keys(files)
        .map((rel) => path.basename(rel))
        .sort(),
    );
  });

  it('embeds each OTF file unchanged', () => {
    for (const source of DEFAULT_FONT_SOURCES) {
      const otf = readFileSync(path.join(REPO_ROOT, FONT_SOURCE_DIR, source.file));
      const module = Object.entries(files).find(([rel]) =>
        rel.endsWith(`/${source.file}`.replace('.otf', '.ts')),
      );
      const base64 = /'data:font\/otf;base64,([A-Za-z0-9+/=]+)'/.exec(module?.[1] ?? '')?.[1];
      expect(Buffer.from(base64 ?? '', 'base64').equals(otf), source.file).toBe(true);
    }
  });

  it('matches the faces the render package loads', () => {
    expect(DEFAULT_FONT_FILES.map((f) => [f.file, f.weight, f.style])).toEqual(
      DEFAULT_FONT_SOURCES.map((s) => [s.file, s.weight, s.style]),
    );
    const table = read('packages/render/src/fonts/default-font-files.ts');
    for (const rel of Object.keys(files)) {
      expect(table).toContain(`import('./generated/${path.basename(rel)}')`);
    }
  });
});

describe('font files and license ship together', () => {
  it('render ships the OTF sources with the license', () => {
    const sources = readdirSync(path.join(REPO_ROOT, FONT_SOURCE_DIR)).sort();
    expect(sources).toEqual([FONT_LICENSE_FILE, ...DEFAULT_FONT_SOURCES.map((s) => s.file)].sort());
    const pkg = packageJson('render');
    expect(pkg.files).toContain('fonts');
    expect(pkg.exports['./fonts/*']).toBe('./fonts/*');
    expect(pkg.publishConfig.exports['./fonts/*']).toBe('./fonts/*');
  });

  it('the holochart IIFE build copies the fonts and license next to the script', () => {
    const config = read('packages/holochart/tsdown.config.ts');
    expect(config).toContain("copy: [{ from: '../render/fonts/*', to: 'dist/fonts' }]");
    const pkg = packageJson('holochart');
    expect(pkg.files).toContain('dist');
    expect(pkg.exports['./fonts/*']).toBe('./dist/fonts/*');
    expect(pkg.publishConfig.exports['./fonts/*']).toBe('./dist/fonts/*');
  });

  it('both THIRD_PARTY_NOTICES.md copies list TeX Gyre Heros and are identical', () => {
    const root = read('THIRD_PARTY_NOTICES.md');
    expect(read('packages/holochart/THIRD_PARTY_NOTICES.md')).toBe(root);
    expect(root).toContain('TeX Gyre Heros');
    expect(root).toContain('GUST Font License');
  });
});
