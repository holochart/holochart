/**
 * The pages the render check visits: every hand-written docs page, with the examples it embeds.
 * Generated pages (the attribute and API references) have no embeds and are left out.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exampleIds, parsePage } from '../lint-pages.ts';

export const DOCS_ROOT = fileURLToPath(new URL('../..', import.meta.url));

const SKIP_DIRS = new Set(['node_modules', '.vitepress', 'public', 'scripts']);
const SKIP_PATHS = ['reference/api/', 'reference/attributes/'];

export interface DocsPage {
  /** Markdown file relative to the docs root, `/`-separated. */
  file: string;
  /** Site path without the base: `getting-started/installation`, `charts/` for an index. */
  route: string;
  /** Example ids embedded with `<Example id="…" />`, in page order. */
  examples: string[];
}

function markdownFiles(dir: string, rel = ''): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const relPath = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name) && !SKIP_PATHS.includes(`${relPath}/`)) {
        out.push(...markdownFiles(path.join(dir, entry.name), relPath));
      }
    } else if (
      entry.name.endsWith('.md') &&
      !entry.name.startsWith('_') &&
      relPath !== 'README.md'
    ) {
      out.push(relPath);
    }
  }
  return out.sort();
}

/** Every hand-written page. `filter` (a substring of the file path) narrows the list. */
export function docsPages(filter?: string): DocsPage[] {
  return markdownFiles(DOCS_ROOT)
    .filter((file) => !filter || file.includes(filter))
    .map((file) => {
      const page = parsePage(file, readFileSync(path.join(DOCS_ROOT, file), 'utf8'));
      const route = file.replace(/(^|\/)index\.md$/, '$1').replace(/\.md$/, '');
      return { file, route, examples: exampleIds(page.body) };
    });
}
