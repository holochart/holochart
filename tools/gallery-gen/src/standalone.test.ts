import { readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { bundleStandalone, inputsHash } from './standalone.ts';
import { readManifest, REPO_ROOT } from './manifest.ts';

const entries = readManifest()!.examples;
describe('complete browser source exporter', () => {
  it('inlines private helper dependencies and retains only public package imports plus mounting/cleanup', async () => {
    const entry = entries.find((e) => e.id === 'scatter3d/basic')!;
    const result = await bundleStandalone(entry, REPO_ROOT);
    const sf = ts.createSourceFile('main.js', result.code, ts.ScriptTarget.Latest, true);
    const imports = sf.statements
      .filter(ts.isImportDeclaration)
      .map((node) => (node.moduleSpecifier as ts.StringLiteral).text);
    expect(imports.length).toBeGreaterThan(0);
    expect(imports.every((id) => !id.startsWith('.') && !id.startsWith('/'))).toBe(true);
    expect(result.artifact.inputs).toContain('examples/_lib/rng.ts');
    expect(result.code).toContain('document.body.append(container)');
    expect(result.code).toContain('await example.ready');
    expect(result.code).toContain('example.dispose()');
    expect(result.artifact.verification).toBe('compiled');
    expect(result.artifact.source).toBe(result.artifact.javascript);
    expect(result.artifact.dependencies).toContain('@mk7s/holochart');
  });

  it('embeds local sprite assets rather than leaving dangling repository URLs', async () => {
    const result = await bundleStandalone(
      entries.find((e) => e.id === 'scatter/image-sprites')!,
      REPO_ROOT,
    );
    expect(result.code).toContain('data:image');
    expect(result.code).not.toMatch(/new URL\(["']\.\.\//);
  });

  it('tracks source and helper bytes for incremental generation', () => {
    const files = ['examples/scatter/basic.ts', 'examples/_lib/rng.ts'];
    expect(inputsHash(files, REPO_ROOT)).toBe(inputsHash([...files].reverse(), REPO_ROOT));
    expect(inputsHash(files, REPO_ROOT)).not.toBe(inputsHash(files.slice(0, 1), REPO_ROOT));
    expect(readFileSync(path.join(REPO_ROOT, files[0]!), 'utf8')).toContain('export function run');
  });
});
