import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { GEN_COMMAND, generateAll, REPO_ROOT } from './generate.ts';

async function readOrEmpty(abs: string): Promise<string> {
  try {
    return await readFile(abs, 'utf8');
  } catch {
    return '';
  }
}

describe('generated files', async () => {
  const files = await generateAll();

  it('produces layout, config and plot-schema outputs', () => {
    expect(Object.keys(files).sort()).toEqual([
      'packages/core/src/generated/config.ts',
      'packages/core/src/generated/layout.ts',
      'packages/core/src/generated/plot-schema.json',
    ]);
  });

  it.each(Object.entries(files))('%s is up to date', async (rel, expected) => {
    const actual = await readOrEmpty(path.join(REPO_ROOT, rel));
    expect(actual, `${rel} is stale: run \`${GEN_COMMAND}\``).toBe(expected);
  });

  it('is deterministic', async () => {
    expect(await generateAll()).toEqual(files);
  });
});
