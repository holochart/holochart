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

  it('produces core, trace package and full bundle types, and plot-schema.json', () => {
    expect(Object.keys(files).sort()).toEqual([
      'packages/core/src/generated/config.ts',
      'packages/core/src/generated/layout.ts',
      'packages/core/src/generated/plot-schema.json',
      'packages/core/src/generated/trace-attributes.ts',
      'packages/holochart/src/generated/figure.ts',
      'packages/traces-3d/src/generated/traces.ts',
      'packages/traces-basic/src/generated/traces.ts',
      'packages/traces-finance/src/generated/traces.ts',
      'packages/traces-hier/src/generated/traces.ts',
      'packages/traces-sci/src/generated/traces.ts',
      'packages/traces-stats/src/generated/traces.ts',
    ]);
  });

  it('types every trace type of the full bundle', () => {
    const figure = files['packages/holochart/src/generated/figure.ts']!;
    const record = /export interface TraceTypes \{([^}]*)\}/.exec(figure)?.[1] ?? '';
    const types = [...record.matchAll(/^\s*(\w+):/gm)].map((m) => m[1]);
    expect(types.length).toBeGreaterThan(30);
    for (const type of ['scatter', 'bar', 'bar3d', 'scatter3d', 'pie', 'sankey', 'splom']) {
      expect(types).toContain(type);
    }
    // The modules the full bundle extends get types of their own, with the 2.5D attributes.
    expect(figure).toMatch(/export type BarTrace = TracesBasicBarTrace & ExtrusionAttributes;/);
  });

  it.each(Object.entries(files))('%s is up to date', async (rel, expected) => {
    const actual = await readOrEmpty(path.join(REPO_ROOT, rel));
    expect(actual, `${rel} is stale: run \`${GEN_COMMAND}\``).toBe(expected);
  });

  it('is deterministic', async () => {
    expect(await generateAll()).toEqual(files);
  });
});
