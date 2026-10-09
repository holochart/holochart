/** Publish small per-example metadata: source tabs never download the complete catalog. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PUBLIC_DIR, readManifest } from './manifest.ts';
import type { StandaloneIndex } from './standalone.ts';
export function writeExampleArtifacts(
  index: StandaloneIndex,
  options: { check?: boolean; publicDir?: string } = {},
): void {
  const stale: string[] = [];
  for (const entry of readManifest()?.examples ?? []) {
    const artifact = index.examples[entry.id];
    const standalone = artifact ? (({ inputs: _inputs, ...rest }) => rest)(artifact) : undefined;
    const file = path.join(options.publicDir ?? PUBLIC_DIR, `gallery/artifacts/${entry.id}.json`);
    const contents = `${JSON.stringify({ id: entry.id, title: entry.title, variants: entry.variants, standalone })}\n`;
    if (options.check) {
      if (!existsSync(file) || readFileSync(file, 'utf8') !== contents) stale.push(entry.id);
      continue;
    }
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, contents);
  }
  if (stale.length)
    throw new Error(
      `Stale example artifacts (${stale.length}): ${stale.slice(0, 10).join(', ')}. Run docs gen:sources.`,
    );
}
