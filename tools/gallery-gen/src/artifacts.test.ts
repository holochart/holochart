import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { writeExampleArtifacts } from './artifacts.ts';
import { checkClassification } from './check.ts';
import { migrateManifest, readManifest } from './manifest.ts';
const fresh = () => migrateManifest(readManifest()!).examples;
describe('actual runnable language artifact validation', () => {
  it('checks published metadata without rewriting a stale artifact', () => {
    const publicDir = mkdtempSync(path.join(tmpdir(), 'holochart-artifact-check-'));
    const index = { version: 1 as const, examples: {}, failures: {} };
    try {
      writeExampleArtifacts(index, { publicDir });
      expect(() => writeExampleArtifacts(index, { publicDir, check: true })).not.toThrow();
      const file = path.join(publicDir, 'gallery/artifacts/bar/basic.json');
      writeFileSync(file, 'stale metadata\n');
      expect(() => writeExampleArtifacts(index, { publicDir, check: true })).toThrow(
        'Stale example artifacts',
      );
      expect(readFileSync(file, 'utf8')).toBe('stale metadata\n');
    } finally {
      rmSync(publicDir, { recursive: true, force: true });
    }
  });
  it('registers 24 exact single-example Python downloads with source and browser identities', () => {
    const entries = fresh();
    const variants = entries.flatMap((entry) =>
      entry.variants.filter((v) => v.language === 'python').map((variant) => ({ entry, variant })),
    );
    expect(variants).toHaveLength(24);
    expect(new Set(variants.map(({ entry }) => entry.primaryFamily)).size).toBeGreaterThanOrEqual(
      6,
    );
    for (const { entry, variant } of variants) {
      expect(variant.source).toBe(
        `examples/notebooks/variants/${entry.id.replaceAll('/', '-')}.py`,
      );
      expect(variant.download).toBe(`/notebooks/variants/${entry.id.replaceAll('/', '-')}.py`);
      expect(variant.identity?.expectedWidgetOutputs).toBe(1);
      expect(variant.verification.sourceSha256).toBe(variant.identity?.sourceSha256);
    }
    expect(checkClassification({ version: 2, look: 'holochart', examples: entries })).toEqual([]);
  });
  it('rejects stale source claims, undeclared dependencies and mismatched example identity', () => {
    const entries = fresh();
    const bar = entries.find((entry) => entry.id === 'bar/basic')!;
    const python = bar.variants.find((v) => v.language === 'python')!;
    python.verification.sourceSha256 = '0'.repeat(64);
    python.dependencies = [];
    python.identity!.browserSourceHashes = {};
    const problems = checkClassification({ version: 2, look: 'holochart', examples: entries });
    expect(problems).toContain('bar/basic: stale Python source SHA.');
    expect(problems).toContain('bar/basic: undeclared Python dependency holochart-py.');
    expect(problems).toContain('bar/basic: Python figure has no canonical browser identity.');
  });
  it('rejects missing downloads, stale notebook links and unsupported language labels', () => {
    const entries = fresh();
    const python = entries
      .find((entry) => entry.id === 'bar/basic')!
      .variants.find((v) => v.language === 'python')!;
    python.download = '/notebooks/variants/missing.py';
    python.notebook = 'examples/notebooks/missing.ipynb';
    python.language = 'ruby' as typeof python.language;
    const problems = checkClassification({ version: 2, look: 'holochart', examples: entries });
    expect(problems).toContain(
      'bar/basic: missing or unsafe published source /notebooks/variants/missing.py.',
    );
    expect(problems).toContain(
      'bar/basic: missing or unsafe notebook artifact examples/notebooks/missing.ipynb.',
    );
    expect(problems).toContain('bar/basic: unsupported language label ruby.');
  });
});
