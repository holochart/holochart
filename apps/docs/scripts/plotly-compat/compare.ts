/**
 * Compares plotly.js' attribute schema with Holochart's, attribute by attribute, for the
 * compatibility table (`gen-plotly-compat.ts`).
 *
 * The unit is the leaf attribute, named by its path (`marker.line.width`, `annotations[].text`).
 * A Plotly attribute is:
 *
 * - `supported` when Holochart's schema has the same path, with the same value type, every
 *   enumeration value and flag, and per-point arrays where Plotly takes them;
 * - `partial` when the path exists but accepts less (fewer values or flags, no per-point arrays, a
 *   different value type), or when Holochart's own description says the attribute is accepted
 *   without effect ({@link CAVEAT});
 * - `missing` when the path does not exist.
 *
 * This compares what the two libraries accept, not what they draw: see the page for that caveat.
 */
import { ITEMS, isLeaf, type Branch, type Leaf, type Tree } from './schema-tree.ts';

export type Status = 'supported' | 'partial' | 'missing';

/** A Plotly attribute, or a whole Plotly container that Holochart lacks, and its status. */
export interface Finding {
  /** Attribute path; a missing container ends with `.*`. */
  path: string;
  status: Status;
  /** Number of leaf attributes the finding stands for (more than 1 for a missing container). */
  count: number;
  /** Why the attribute is partial. */
  note?: string;
}

/** Counts of leaf attributes by status. */
export interface Tally {
  supported: number;
  partial: number;
  missing: number;
  total: number;
}

/**
 * Wording that Holochart's attribute descriptions use for attributes that are accepted (so that
 * Plotly figures validate) but do nothing, or less than in Plotly.
 */
export const CAVEAT =
  /\b(declared; |reserved; |not (?:drawn|used|implemented) yet|accepted for plotly compatibility)/i;

type Json = Record<string, unknown>;

function isObject(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Split a description into clauses at `. ` and `; ` outside parentheses and code spans. */
function clauses(description: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let code = false;
  let start = 0;
  for (let i = 0; i < description.length; i++) {
    const c = description[i];
    if (c === '`') code = !code;
    else if (code) continue;
    else if (c === '(') depth++;
    else if (c === ')') depth = Math.max(0, depth - 1);
    else if ((c === '.' || c === ';') && depth === 0 && description[i + 1] === ' ') {
      out.push(description.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(description.slice(start).trim().replace(/\.$/, ''));
  return out.filter((clause) => clause !== '');
}

/**
 * The attributes of a Holochart schema node (plot-schema layout) whose description matches
 * {@link CAVEAT}: path → the clause of the description that says so. A container's caveat applies
 * to every attribute below it.
 */
export function caveatPaths(
  node: unknown,
  path = '',
  out = new Map<string, string>(),
): Map<string, string> {
  if (!isObject(node)) return out;
  const description = node['description'];
  if (path !== '' && typeof description === 'string' && CAVEAT.test(description)) {
    const parts = clauses(description);
    const first = parts.findIndex((clause) => CAVEAT.test(clause));
    let note = parts[first] ?? description;
    // "Accepted for Plotly compatibility; has no effect": the next clause says what happens.
    const next = parts[first + 1];
    if (/compatibility$/i.test(note) && next !== undefined) note = `${note}; ${next}`;
    out.set(path, note);
  }
  if (typeof node['valType'] === 'string') return out;
  if (node['role'] === 'items') return caveatPaths(node['items'], `${path}[]`, out);
  for (const [key, child] of Object.entries(node)) {
    if (isObject(child)) caveatPaths(child, path === '' ? key : `${path}.${key}`, out);
  }
  return out;
}

function join(path: string, key: string): string {
  if (key === ITEMS) return `${path}[]`;
  return path === '' ? key : `${path}.${key}`;
}

/** Number of leaf attributes under a node. */
export function leafCount(node: Tree): number {
  if (isLeaf(node)) return 1;
  let n = 0;
  for (const child of Object.values(node)) n += leafCount(child);
  return n;
}

function quote(v: unknown): string {
  return `\`${typeof v === 'string' ? `'${v}'` : String(v)}\``;
}

/** Enumeration values given as regular expressions (`'/^x([2-9]|[1-9][0-9]+)?$/'`: axis ids, …). */
function isPattern(v: unknown): boolean {
  return typeof v === 'string' && v.length > 2 && v.startsWith('/') && v.endsWith('/');
}

/** Value types that take anything, so nothing Plotly accepts is refused. */
const OPEN_TYPES: ReadonlySet<string> = new Set(['any']);

/** True when `ours`, of another value type than `plotly`, still accepts every Plotly value. */
function widens(plotly: Leaf, ours: Leaf): boolean {
  if (plotly.t === 'integer' && ours.t === 'number') return true;
  if (plotly.t === 'enumerated') {
    const values = plotly.v ?? [];
    // Ids of axes and subplots are pattern enumerations in Plotly's schema.
    if (ours.t === 'subplotid') return values.some(isPattern);
    if (ours.t === 'string') return values.every((v) => typeof v === 'string');
  }
  return false;
}

function shapeGap(plotly: Leaf, note: string): string | undefined {
  return OPEN_TYPES.has(plotly.t) ? undefined : note;
}

/** What Holochart's leaf accepts less than Plotly's, or `undefined` when nothing. */
export function leafGap(plotly: Leaf, ours: Leaf): string | undefined {
  // Plotly's `any` says nothing about the values, so there is nothing to compare.
  if (OPEN_TYPES.has(ours.t) || OPEN_TYPES.has(plotly.t)) return undefined;
  const notes: string[] = [];
  if (plotly.t !== ours.t) {
    if (!widens(plotly, ours)) notes.push(`value type \`${ours.t}\` (Plotly: \`${plotly.t}\`)`);
  } else if (plotly.t === 'enumerated') {
    const have = new Set((ours.v ?? []).map((v) => JSON.stringify(v)));
    const hasPattern = (ours.v ?? []).some(isPattern);
    const lacking = (plotly.v ?? []).filter(
      (v) => !have.has(JSON.stringify(v)) && !(isPattern(v) && hasPattern),
    );
    if (lacking.length > 0) notes.push(`without ${lacking.map(quote).join(', ')}`);
  } else if (plotly.t === 'flaglist') {
    const have = new Set([...(ours.f ?? []), ...(ours.x ?? []).map(String)]);
    const lacking = [...(plotly.f ?? []), ...(plotly.x ?? []).map(String)].filter(
      (v) => !have.has(v),
    );
    if (lacking.length > 0) notes.push(`without ${lacking.map(quote).join(', ')}`);
  }
  if (plotly.a && !ours.a && ours.t !== 'data_array' && ours.t !== 'info_array') {
    notes.push('one value only, no array');
  }
  return notes.length > 0 ? notes.join('; ') : undefined;
}

/**
 * Status of every Plotly attribute under `plotly`, in schema order. `ours` is the Holochart node at
 * the same path (`undefined`: the whole container is missing) and `caveats` the result of
 * {@link caveatPaths}.
 */
export function compareTrees(
  plotly: Branch,
  ours: Branch | undefined,
  caveats: ReadonlyMap<string, string> = new Map(),
  path = '',
  caveat?: string,
): Finding[] {
  const out: Finding[] = [];
  for (const [key, node] of Object.entries(plotly)) {
    const at = join(path, key);
    const mine = ours?.[key];
    const flagged = caveat ?? caveats.get(at);
    if (mine === undefined) {
      const count = leafCount(node);
      out.push({ path: isLeaf(node) ? at : `${at}.*`, status: 'missing', count });
    } else if (isLeaf(node)) {
      // A free-form Plotly attribute (`any`) that has a schema of its own here is supported.
      const gap =
        flagged ?? (isLeaf(mine) ? leafGap(node, mine) : shapeGap(node, 'a container here'));
      out.push({
        path: at,
        status: gap ? 'partial' : 'supported',
        count: 1,
        ...(gap ? { note: gap } : {}),
      });
    } else if (isLeaf(mine)) {
      // A container in Plotly that is one free-form attribute here.
      const open = OPEN_TYPES.has(mine.t) && !flagged;
      out.push({
        path: `${at}.*`,
        status: open ? 'supported' : 'partial',
        count: leafCount(node),
        ...(open ? {} : { note: `one \`${mine.t}\` attribute here` }),
      });
    } else {
      out.push(...compareTrees(node, mine, caveats, at, flagged));
    }
  }
  return out;
}

export function tally(findings: readonly Finding[]): Tally {
  const t: Tally = { supported: 0, partial: 0, missing: 0, total: 0 };
  for (const f of findings) {
    t[f.status] += f.count;
    t.total += f.count;
  }
  return t;
}

/** Status of a group of attributes (a trace type, a top-level layout key). */
export function overall(t: Tally): Status {
  if (t.total > 0 && t.missing === t.total) return 'missing';
  return t.supported === t.total ? 'supported' : 'partial';
}

/** Findings grouped by their top-level key (`xaxis`, `annotations`, `barmode`), in order. */
export function byTopLevelKey(findings: readonly Finding[]): Map<string, Finding[]> {
  const out = new Map<string, Finding[]>();
  for (const f of findings) {
    const key = /^[^.[]+/.exec(f.path)?.[0] ?? f.path;
    const list = out.get(key) ?? [];
    list.push(f);
    out.set(key, list);
  }
  return out;
}
