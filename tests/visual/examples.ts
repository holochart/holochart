import { readdirSync } from 'node:fs';
import path from 'node:path';

/**
 * Node-side enumeration of example ids. Mirrors the rules of the Vite registry in
 * `examples/index.ts` (every `.ts` file except `_lib/**`, the root `index.ts`, and `.d.ts`);
 * `visual.spec.ts` cross-checks both lists so they cannot drift apart.
 */
export function listExampleIds(examplesDir: string): string[] {
  const ids: string[] = [];
  const walk = (dir: string, rel: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        if (relPath === '_lib') continue;
        walk(path.join(dir, entry.name), relPath);
      } else if (entry.isFile() && isExampleFile(relPath)) {
        ids.push(relPath.replace(/\.ts$/, ''));
      }
    }
  };
  walk(examplesDir, '');
  return ids.sort((a, b) => a.localeCompare(b));
}

function isExampleFile(relPath: string): boolean {
  return relPath.endsWith('.ts') && !relPath.endsWith('.d.ts') && relPath !== 'index.ts';
}
