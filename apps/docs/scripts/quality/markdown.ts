/**
 * Markdown helpers for the docs quality gates: page listing, fenced code blocks (with the
 * `docs-gates` opt-out marker), and a prose view of a page with code, comments and tags blanked out
 * so line numbers stay valid.
 */
import { readdir } from 'node:fs/promises';
import path from 'node:path';

/** Directories that are not hand-written docs pages. */
const SKIP_DIRS = new Set(['node_modules', 'public', 'scripts']);
/** Generated trees (gitignored), relative to the docs root. */
export const GENERATED_PATHS = ['reference/api/', 'reference/attributes/'];

/**
 * Hand-written Markdown files under `root` (relative, `/`-separated, sorted): every `.md` except
 * `README.md`, dot-directories (`.vitepress`), `node_modules`, `public`, `scripts` and generated
 * reference trees.
 */
export async function listDocsPages(root: string, rel = ''): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(path.join(root, rel), { withFileTypes: true })) {
    const child = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name) || e.name.startsWith('.')) continue;
      if (GENERATED_PATHS.some((p) => `${child}/`.startsWith(p))) continue;
      out.push(...(await listDocsPages(root, child)));
    } else if (e.name.endsWith('.md') && child !== 'README.md') {
      out.push(child);
    }
  }
  return out.sort();
}

/** Marker that excludes the next fenced block from the snippet type-check. */
export const NO_TYPECHECK = 'docs-gates: no-typecheck';

/** A fenced code block. */
export interface CodeBlock {
  /** Language: the first word of the info string (`ts`, `sh`, …), lowercased. */
  lang: string;
  /** Rest of the info string (`[npm]`, `{1,3}`, …). */
  meta: string;
  /** Block content with the fence's indentation removed. */
  code: string;
  /** 1-based line of the opening fence. */
  line: number;
  /** True when a `<!-- docs-gates: no-typecheck -->` comment precedes the fence. */
  noTypecheck: boolean;
}

const OPEN_FENCE = /^(\s*)(`{3,}|~{3,})\s*([^\s`{[]*)(.*)$/;

/** Length of the frontmatter block in lines (0 when there is none). */
function frontmatterLines(lines: readonly string[]): number {
  if (lines[0]?.trim() !== '---') return 0;
  for (let i = 1; i < lines.length; i++) if (lines[i]?.trim() === '---') return i + 1;
  return 0;
}

/**
 * True when the paragraph just before line `index` (blank lines skipped) ends with an HTML comment
 * containing the opt-out marker.
 */
function hasOptOut(lines: readonly string[], index: number): boolean {
  let i = index - 1;
  while (i >= 0 && (lines[i] ?? '').trim() === '') i--;
  const chunk: string[] = [];
  for (; i >= 0 && (lines[i] ?? '').trim() !== ''; i--) chunk.unshift(lines[i] ?? '');
  const m = /<!--((?:(?!<!--)[\s\S])*?)-->\s*$/.exec(chunk.join('\n'));
  return m !== null && (m[1] ?? '').includes(NO_TYPECHECK);
}

/** Fenced code blocks of a Markdown source, in order. Frontmatter is skipped. */
export function codeBlocks(source: string): CodeBlock[] {
  const lines = source.split(/\r?\n/);
  const blocks: CodeBlock[] = [];
  for (let i = frontmatterLines(lines); i < lines.length; i++) {
    const m = OPEN_FENCE.exec(lines[i] ?? '');
    if (!m) continue;
    const indent = (m[1] ?? '').length;
    const fence = m[2] as string;
    const close = new RegExp(`^\\s*${fence[0] === '`' ? '`' : '~'}{${fence.length},}\\s*$`);
    const body: string[] = [];
    let j = i + 1;
    for (; j < lines.length && !close.test(lines[j] ?? ''); j++) {
      const text = lines[j] ?? '';
      const lead = /^\s*/.exec(text)?.[0].length ?? 0;
      body.push(text.slice(Math.min(indent, lead)));
    }
    blocks.push({
      lang: (m[3] ?? '').toLowerCase(),
      meta: (m[4] ?? '').trim(),
      code: body.join('\n'),
      line: i + 1,
      noTypecheck: hasOptOut(lines, i),
    });
    i = j;
  }
  return blocks;
}

/**
 * The prose of a page, same length and line layout as `source`: frontmatter, fenced code, inline
 * code, HTML comments and HTML/Vue tags are replaced with `fill` (newlines are kept, so offsets and
 * line numbers stay valid). Markdown link syntax is kept.
 */
export function proseView(source: string, fill = ' '): string {
  const blank = (s: string): string => s.replace(/[^\n]/g, fill);
  const lines = source.split('\n');
  const fm = frontmatterLines(lines.map((l) => l.replace(/\r$/, '')));
  const blocks = codeBlocks(source);
  const fenced = new Set<number>();
  for (const b of blocks) {
    const n = b.code === '' ? 0 : b.code.split('\n').length;
    for (let k = b.line - 1; k <= b.line + n; k++) fenced.add(k);
  }
  const text = lines.map((l, i) => (i < fm || fenced.has(i) ? blank(l) : l)).join('\n');
  return text
    .replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/(`+)[\s\S]*?\1/g, blank)
    .replace(/<\/?[A-Za-z][^>]*>/g, blank);
}

/** 1-based line number of a character offset. */
export function lineAt(text: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

/** Frontmatter `key: value` pairs (flat YAML). */
export function frontmatter(source: string): Record<string, string> {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source);
  const out: Record<string, string> = {};
  for (const line of (fm?.[1] ?? '').split(/\r?\n/)) {
    const m = /^([\w-]+):\s*(.*)$/.exec(line);
    if (m) out[m[1] as string] = (m[2] as string).trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}
