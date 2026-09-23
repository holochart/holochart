/**
 * Builds every schema-derived artifact checked into the repo (plan E1.2): generated TS input
 * types for layout and config, and `plot-schema.json`. Returns contents instead of writing them so
 * the CLI and the staleness test share one code path.
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as prettier from 'prettier';
import {
  configSchema,
  createRegistry,
  generateTypes,
  layoutSchema,
  plotSchema,
} from '@mk7s/holochart-core';

/** Absolute path of the repository root (this file lives in `tools/schema-gen/src`). */
export const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/** Command that regenerates the checked-in files. */
export const GEN_COMMAND = 'pnpm --filter @mk7s/holochart-schema-gen gen';

/**
 * Format with the repo's Prettier config so `prettier --write` is a no-op on generated files and
 * they never show up as formatting noise in diffs.
 */
async function format(relPath: string, source: string): Promise<string> {
  const filepath = path.join(REPO_ROOT, relPath);
  const config = await prettier.resolveConfig(filepath);
  return prettier.format(source, { ...config, filepath });
}

/**
 * Generate every schema-derived file.
 *
 * @returns Map from path (relative to the repo root, `/`-separated) to formatted file content.
 */
export async function generateAll(): Promise<Record<string, string>> {
  const raw: Record<string, string> = {
    'packages/core/src/generated/layout.ts': generateTypes(layoutSchema, 'Layout'),
    'packages/core/src/generated/config.ts': generateTypes(configSchema, 'Config'),
    'packages/core/src/generated/plot-schema.json': JSON.stringify(
      plotSchema(createRegistry()),
      null,
      2,
    ),
  };
  const out: Record<string, string> = {};
  for (const [rel, source] of Object.entries(raw)) out[rel] = await format(rel, source);
  return out;
}
