/**
 * `fromDot`: a graph from Graphviz DOT text (backlog G9). It reads the part of the language that
 * describes a graph's structure: `graph` and `digraph` (and `strict`), node and edge statements,
 * edge chains (`a -> b -> c`) and node sets (`{a b} -> c`), attribute lists, the `node` / `edge` /
 * `graph` default statements, subgraphs, quoted strings with `+` and line continuations, HTML
 * strings (kept as text) and the three comment forms. Ports (`a:port:n`) are read and dropped.
 *
 * What it keeps: `label`, `color` (or `fillcolor` for nodes), `weight` / `penwidth` as a link's
 * value, `pos` as a node's position, and a `cluster…` subgraph as the group of the nodes first
 * named in it (the subgraph's `label`, else its name). Every other attribute goes to `customdata`.
 * It does not lay anything out: Graphviz's layout attributes (`rank`, `rankdir`, `constraint`, …)
 * are only passed through.
 */
import { GraphBuilder, toNumber, type LinkInput, type NodeInput } from './build.ts';
import type { GraphData } from './types.ts';

type Attributes = Record<string, string>;

interface Token {
  readonly kind: 'id' | 'punct' | 'end';
  readonly value: string;
  /** A quoted or HTML string: never a keyword. */
  readonly quoted: boolean;
  readonly at: number;
}

const PUNCT = ['->', '--', '{', '}', '[', ']', '=', ';', ',', ':', '+'] as const;
const BARE = /[A-Za-z0-9_.\u0080-￿-]/;

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i] as string;
    if (/\s/.test(c)) {
      i++;
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < n && text[i] !== '\n') i++;
    } else if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end < 0 ? n : end + 2;
    } else if (c === '#' && (i === 0 || text[i - 1] === '\n')) {
      // A line a C preprocessor would have written.
      while (i < n && text[i] !== '\n') i++;
    } else if (c === '"') {
      const at = i++;
      let value = '';
      while (i < n && text[i] !== '"') {
        if (text[i] === '\\' && i + 1 < n) {
          const next = text[i + 1] as string;
          // `\"` is a quote and a backslash before a newline joins lines; other escapes (`\n`,
          // `\l`, `\N`) are Graphviz's to read, so they stay as written.
          if (next === '"') value += '"';
          else if (next !== '\n') value += '\\' + next;
          i += 2;
        } else {
          value += text[i++];
        }
      }
      i++;
      tokens.push({ kind: 'id', value, quoted: true, at });
    } else if (c === '<') {
      const at = i;
      let depth = 0;
      let j = i;
      for (; j < n; j++) {
        if (text[j] === '<') depth++;
        else if (text[j] === '>' && --depth === 0) break;
      }
      tokens.push({ kind: 'id', value: text.slice(i + 1, j), quoted: true, at });
      i = j + 1;
    } else {
      const punct = PUNCT.find((p) => text.startsWith(p, i));
      // A lone `-` is not punctuation: it starts a number (`-1.5`).
      if (punct !== undefined) {
        tokens.push({ kind: 'punct', value: punct, quoted: false, at: i });
        i += punct.length;
      } else if (BARE.test(c)) {
        const at = i;
        const edge = (j: number): boolean => text.startsWith('->', j) || text.startsWith('--', j);
        while (i < n && BARE.test(text[i] as string) && !edge(i)) i++;
        tokens.push({ kind: 'id', value: text.slice(at, i), quoted: false, at });
      } else {
        throw new SyntaxError(`fromDot: unexpected '${c}' at offset ${i}`);
      }
    }
  }
  tokens.push({ kind: 'end', value: '', quoted: false, at: n });
  return tokens;
}

/** Defaults in force where a statement is read: `node [...]`, `edge [...]` and the cluster. */
interface Scope {
  readonly node: Attributes;
  readonly edge: Attributes;
  readonly group: string | undefined;
}

class Parser {
  readonly #tokens: Token[];
  #pos = 0;
  readonly #builder = new GraphBuilder();
  /** Nodes that already have a group: the innermost cluster that names a node first keeps it. */
  readonly #grouped = new Set<string>();
  /** The node sets of the subgraphs being read, innermost last (for `{a b} -> c`). */
  readonly #members: Set<string>[] = [];
  #directed = false;

  constructor(text: string) {
    this.#tokens = tokenize(text);
  }

  parse(): GraphData {
    if (this.#word('strict')) this.#pos++;
    if (this.#word('digraph')) this.#directed = true;
    else if (!this.#word('graph')) this.#fail("expected 'graph' or 'digraph'");
    this.#pos++;
    if (this.#peek().kind === 'id') this.#pos++;
    this.#expect('{');
    this.#statements({ node: {}, edge: {}, group: undefined });
    this.#expect('}');
    return this.#builder.build(this.#directed);
  }

  #peek(offset = 0): Token {
    return this.#tokens[Math.min(this.#pos + offset, this.#tokens.length - 1)] as Token;
  }

  #is(punct: string, offset = 0): boolean {
    const t = this.#peek(offset);
    return t.kind === 'punct' && t.value === punct;
  }

  /** An unquoted keyword, whatever its case. */
  #word(word: string, offset = 0): boolean {
    const t = this.#peek(offset);
    return t.kind === 'id' && !t.quoted && t.value.toLowerCase() === word;
  }

  #expect(punct: string): void {
    if (!this.#is(punct)) this.#fail(`expected '${punct}'`);
    this.#pos++;
  }

  #fail(message: string): never {
    const t = this.#peek();
    const found = t.kind === 'end' ? 'the end of the text' : `'${t.value}'`;
    throw new SyntaxError(`fromDot: ${message}, found ${found} at offset ${t.at}`);
  }

  /** An id: one string, or strings joined with `+`. */
  #id(): string {
    const t = this.#peek();
    if (t.kind !== 'id') this.#fail('expected a name');
    this.#pos++;
    let value = t.value;
    while (this.#is('+') && this.#peek(1).kind === 'id') {
      value += this.#peek(1).value;
      this.#pos += 2;
    }
    return value;
  }

  #statements(scope: Scope): void {
    let current = scope;
    while (!this.#is('}') && this.#peek().kind !== 'end') {
      if (this.#is(';')) {
        this.#pos++;
        continue;
      }
      current = this.#statement(current);
    }
  }

  /** One statement; returns the scope for the statements after it (defaults may have changed). */
  #statement(scope: Scope): Scope {
    for (const kind of ['node', 'edge', 'graph'] as const) {
      if (this.#word(kind) && this.#is('[', 1)) {
        this.#pos++;
        const attributes = this.#attributes();
        if (kind === 'graph') return scope;
        return { ...scope, [kind]: { ...scope[kind], ...attributes } };
      }
    }
    // `name = value` sets a graph attribute; nothing here reads it.
    if (this.#peek().kind === 'id' && this.#is('=', 1)) {
      this.#pos += 2;
      this.#id();
      return scope;
    }
    const plainNode = !this.#is('{') && !this.#word('subgraph');
    const ends: string[][] = [this.#operand(scope)];
    while (this.#is('->') || this.#is('--')) {
      this.#pos++;
      ends.push(this.#operand(scope));
    }
    const attributes = this.#is('[') ? this.#attributes() : {};
    if (ends.length === 1) {
      // A node statement: its attributes are the node's. The defaults were applied when the node
      // was first named (`#declare`), as Graphviz does; a subgraph alone has nothing to give.
      if (plainNode) this.#builder.node((ends[0] as string[])[0] as string, nodeInput(attributes));
    } else {
      const fields = linkInput({ ...scope.edge, ...attributes });
      for (let k = 0; k + 1 < ends.length; k++) {
        for (const s of ends[k] as string[]) {
          for (const t of ends[k + 1] as string[]) this.#builder.link(s, t, fields);
        }
      }
    }
    return scope;
  }

  /** One end of an edge, or a node statement's subject: a node, or the nodes of a subgraph. */
  #operand(scope: Scope): string[] {
    if (this.#is('{') || this.#word('subgraph')) return this.#subgraph(scope);
    const id = this.#id();
    // Ports: `:name` and `:name:compass`.
    while (this.#is(':')) {
      this.#pos++;
      this.#id();
    }
    this.#declare(id, scope);
    return [id];
  }

  /** Make sure node `id` exists, with the defaults and the cluster of where it is first named. */
  #declare(id: string, scope: Scope): void {
    const known = this.#builder.has(id);
    this.#builder.node(id, known ? undefined : nodeInput(scope.node));
    for (const members of this.#members) members.add(id);
    if (scope.group !== undefined && !this.#grouped.has(id)) {
      this.#grouped.add(id);
      this.#builder.node(id, { group: scope.group });
    }
  }

  #subgraph(scope: Scope): string[] {
    let name: string | undefined;
    if (this.#word('subgraph')) {
      this.#pos++;
      if (this.#peek().kind === 'id') name = this.#id();
    }
    this.#expect('{');
    // A cluster is a group, named by its `label` (which may come after its nodes) or its name.
    const group =
      name?.startsWith('cluster') === true ? (this.#clusterLabel() ?? name) : scope.group;
    const members = new Set<string>();
    this.#members.push(members);
    this.#statements({ ...scope, group });
    this.#members.pop();
    this.#expect('}');
    return [...members];
  }

  /** The `label` of the subgraph whose statements start here, read ahead without consuming. */
  #clusterLabel(): string | undefined {
    let depth = 0;
    let label: string | undefined;
    const tokens = this.#tokens;
    const word = (t: Token | undefined, w: string): boolean =>
      t?.kind === 'id' && !t.quoted && t.value.toLowerCase() === w;
    const punct = (t: Token | undefined, p: string): boolean =>
      t?.kind === 'punct' && t.value === p;
    const value = (i: number): string | undefined =>
      punct(tokens[i + 1], '=') && tokens[i + 2]?.kind === 'id' ? tokens[i + 2]?.value : undefined;
    for (let i = this.#pos; i < tokens.length; i++) {
      const t = tokens[i] as Token;
      if (punct(t, '{') || punct(t, '[')) {
        // `graph [label="…"]` directly inside the cluster.
        if (punct(t, '[') && depth === 0 && word(tokens[i - 1], 'graph')) {
          for (let j = i + 1; j < tokens.length && !punct(tokens[j], ']'); j++) {
            if (word(tokens[j], 'label')) label = value(j) ?? label;
          }
        }
        depth++;
      } else if (punct(t, ']')) {
        depth--;
      } else if (punct(t, '}')) {
        if (depth === 0) break;
        depth--;
      } else if (depth === 0 && word(t, 'label')) {
        label = value(i) ?? label;
      }
    }
    return label === '' ? undefined : label;
  }

  #attributes(): Attributes {
    const out: Attributes = {};
    while (this.#is('[')) {
      this.#pos++;
      while (!this.#is(']')) {
        if (this.#peek().kind === 'end') this.#fail("expected ']'");
        if (this.#is(';') || this.#is(',')) {
          this.#pos++;
          continue;
        }
        const key = this.#id();
        if (this.#is('=')) {
          this.#pos++;
          out[key] = this.#id();
        } else {
          out[key] = 'true';
        }
      }
      this.#pos++;
    }
    return out;
  }
}

const omit = (attributes: Attributes, keys: readonly string[]): Attributes | undefined => {
  const out: Attributes = {};
  let any = false;
  for (const [k, v] of Object.entries(attributes)) {
    if (keys.includes(k)) continue;
    out[k] = v;
    any = true;
  }
  return any ? out : undefined;
};

function nodeInput(attributes: Attributes): NodeInput {
  const input: NodeInput = {};
  if (attributes['label'] !== undefined && attributes['label'] !== '\\N') {
    input.label = attributes['label'];
  }
  const color = attributes['fillcolor'] ?? attributes['color'];
  if (color !== undefined) input.color = color;
  // `pos="x,y"` (a trailing `!` pins it in Graphviz), in points with y up.
  const pos = attributes['pos']?.replace(/!$/, '').split(',');
  if (pos && pos.length >= 2) {
    input.x = toNumber(pos[0]);
    input.y = toNumber(pos[1]);
  }
  const customdata = omit(attributes, ['label', 'pos']);
  if (customdata) input.customdata = customdata;
  return input;
}

function linkInput(attributes: Attributes): LinkInput {
  const input: LinkInput = {};
  const value = toNumber(attributes['weight']) ?? toNumber(attributes['penwidth']);
  if (value !== undefined) input.value = value;
  if (attributes['label'] !== undefined) input.label = attributes['label'];
  if (attributes['color'] !== undefined) input.color = attributes['color'];
  const customdata = omit(attributes, ['label']);
  if (customdata) input.customdata = customdata;
  return input;
}

/**
 * Parse DOT text into a graph. Throws a `SyntaxError` that names the offset when the text is not
 * DOT. See the module comment for what is read and what is kept.
 */
export function fromDot(text: string): GraphData {
  return new Parser(text).parse();
}
