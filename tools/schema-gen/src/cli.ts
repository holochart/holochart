/**
 * `pnpm --filter @mk7s/holochart-schema-gen gen`: regenerate the schema-derived files checked
 * into the repo (plan E1.2). Run after changing any attribute schema.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { generateAll, REPO_ROOT } from './generate.ts';

const files = await generateAll();
for (const [rel, content] of Object.entries(files)) {
  const abs = path.join(REPO_ROOT, rel);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, content);
  console.log(`wrote ${rel}`);
}
