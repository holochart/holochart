/**
 * Offline link check for the docs quality gates. Internal links (`/path#anchor`, `./page`) are
 * resolved against the Markdown sources; anchors are checked against the target's headings (report
 * only). External links are counted per host and never fetched.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { lineAt, proseView } from './markdown.ts';

/** A link found in a page. */
export interface Link {
  page: string;
  line: number;
  target: string;
}

/** Markdown links and images `[text](target "title")` and reference definitions `[id]: target`. */
export function extractLinks(page: string, source: string): Link[] {
  const prose = proseView(source);
  const out: Link[] = [];
  const inline = /!?\[(?:[^\]\\]|\\.)*\]\(\s*<?([^\s)>]+)>?(?:\s+["'(][^)]*)?\)/g;
  const refDef = /^ {0,3}\[[^\]]+\]:\s*<?(\S+?)>?(?:\s+.*)?$/gm;
  for (const re of [inline, refDef]) {
    for (const m of prose.matchAll(re)) {
      out.push({ page, line: lineAt(prose, m.index), target: m[1] as string });
    }
  }
  return out.sort((a, b) => a.line - b.line);
}

/** VitePress's heading slug (`@mdit-vue/shared` `slugify`). */
export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036F]/g, '')
    .replace(/\p{Cc}/gu, '')
    .replace(/[\s~`!@#$%^&*()\-_+=[\]{}|\\;:"'“”‘’<>,.?/]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/^(\d)/, '_$1')
    .toLowerCase();
}

/** Anchors a page defines: heading slugs, `{#custom}` ids and raw HTML `id="…"` attributes. */
export function anchorsOf(source: string): Set<string> {
  const out = new Set<string>();
  const counts = new Map<string, number>();
  const body = source.replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\s*$/gm, '');
  for (const m of body.matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gm)) {
    let text = m[1] as string;
    const custom = /\s*\{#([^}]+)\}\s*$/.exec(text);
    if (custom) {
      out.add(custom[1] as string);
      continue;
    }
    text = text
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/<[^>]+>/g, '')
      .replace(/[`*_]/g, '');
    const slug = slugify(text);
    const n = counts.get(slug) ?? 0;
    counts.set(slug, n + 1);
    out.add(n === 0 ? slug : `${slug}-${n}`);
  }
  for (const m of source.matchAll(/\bid=(["'])([^"']+)\1/g)) out.add(m[2] as string);
  return out;
}

/** Outcome of checking one internal link. */
export type LinkStatus =
  { kind: 'ok'; file: string } | { kind: 'dead' } | { kind: 'skipped'; reason: string };

/**
 * Resolve an internal site path (no base, no extension) to a Markdown file under `docsRoot`.
 * Pages generated at build time (`/reference/<name>` from `reference/attributes/`, and
 * `/reference/api/**`) are only checked when their directory exists.
 */
export function resolveInternal(docsRoot: string, fromPage: string, target: string): LinkStatus {
  let p = target.replace(/[?#].*$/, '');
  if (p === '') return { kind: 'ok', file: fromPage };
  if (!p.startsWith('/')) p = path.posix.join('/', path.posix.dirname(fromPage), p);
  p = decodeURI(p).replace(/\.(md|html)$/, '');

  const candidates = p.endsWith('/') ? [`${p}index.md`] : [`${p}.md`, `${p}/index.md`];
  for (const c of candidates) {
    if (existsSync(path.join(docsRoot, c))) return { kind: 'ok', file: c.slice(1) };
  }
  // Static files served from public/.
  if (/\.[a-z0-9]+$/i.test(p) && existsSync(path.join(docsRoot, 'public', p))) {
    return { kind: 'ok', file: '' };
  }
  const skip = (what: string): LinkStatus => ({
    kind: 'skipped',
    reason: `generated at build time (${what} not present)`,
  });
  if (p === '/plot-schema.json') return skip('public/plot-schema.json');
  if (p.startsWith('/reference/api/') || p === '/reference/api') {
    if (!existsSync(path.join(docsRoot, 'reference/api'))) return skip('reference/api/');
  }
  const ref = /^\/reference\/([^/]+)$/.exec(p);
  if (ref) {
    const attrs = path.join(docsRoot, 'reference/attributes');
    if (!existsSync(attrs)) return skip('reference/attributes/');
    if (existsSync(path.join(attrs, `${ref[1]}.md`))) {
      return { kind: 'ok', file: `reference/attributes/${ref[1]}.md` };
    }
  }
  return { kind: 'dead' };
}

/** Result of gate 5. */
export interface LinkReport {
  internal: number;
  dead: string[];
  skipped: string[];
  /** Anchors that match no heading or id in the target page (report only). */
  badAnchors: string[];
  external: number;
  /** Host → number of links. */
  hosts: Record<string, number>;
}

/** Check every link in `pages` (path relative to `docsRoot` → source). */
export function checkLinks(docsRoot: string, pages: ReadonlyMap<string, string>): LinkReport {
  const report: LinkReport = {
    internal: 0,
    dead: [],
    skipped: [],
    badAnchors: [],
    external: 0,
    hosts: {},
  };
  const anchorCache = new Map<string, Set<string>>();
  const anchorsFor = (file: string): Set<string> | undefined => {
    if (!anchorCache.has(file)) {
      const src = pages.get(file) ?? readFileSync(path.join(docsRoot, file), 'utf8');
      anchorCache.set(file, anchorsOf(src));
    }
    return anchorCache.get(file);
  };

  for (const [page, source] of pages) {
    for (const link of extractLinks(page, source)) {
      const where = `${page}:${link.line} → ${link.target}`;
      if (/^[a-z][a-z0-9+.-]*:/i.test(link.target)) {
        if (/^https?:/i.test(link.target)) {
          report.external++;
          const host = new URL(link.target).host;
          report.hosts[host] = (report.hosts[host] ?? 0) + 1;
        }
        continue;
      }
      report.internal++;
      const status = resolveInternal(docsRoot, page, link.target);
      if (status.kind === 'dead') report.dead.push(where);
      else if (status.kind === 'skipped') report.skipped.push(`${where} (${status.reason})`);
      else {
        const hash = /#(.+)$/.exec(link.target)?.[1];
        if (hash && status.file.endsWith('.md')) {
          const anchors = anchorsFor(status.file);
          if (anchors && !anchors.has(decodeURIComponent(hash))) report.badAnchors.push(where);
        }
      }
    }
  }
  return report;
}
