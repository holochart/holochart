/**
 * The builder every adapter fills (backlog G9): nodes by id in the order they are first seen,
 * links by node id, and columns that exist only once a node or link has a value for them. It
 * turns ids into indices and pads the columns, so the adapters only read their format.
 */
import type { GraphData, GraphLinkData, GraphNodeData } from './types.ts';

/** What an adapter knows about one node. Every field is optional but the id. */
export interface NodeInput {
  label?: string | undefined;
  group?: string | number | null | undefined;
  x?: number | undefined;
  y?: number | undefined;
  value?: number | undefined;
  color?: string | undefined;
  customdata?: unknown;
}

/** What an adapter knows about one link. */
export interface LinkInput {
  value?: number | undefined;
  label?: string | undefined;
  color?: string | undefined;
  customdata?: unknown;
}

/** A node or link id as sources write them. Numbers and strings that print the same are one id. */
export type GraphId = string | number;

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Collects nodes and links and returns a {@link GraphData}. */
export class GraphBuilder {
  readonly #index = new Map<string, number>();
  readonly #ids: GraphId[] = [];
  readonly #nodes: NodeInput[] = [];
  readonly #source: number[] = [];
  readonly #target: number[] = [];
  readonly #links: LinkInput[] = [];

  get nodes(): number {
    return this.#ids.length;
  }

  /** `true` when a node with this id was added (or referred to by a link). */
  has(id: GraphId): boolean {
    return this.#index.has(String(id));
  }

  /**
   * Add node `id`, or add what is known about it: fields given here replace earlier ones, fields
   * left out keep them. Returns its index.
   */
  node(id: GraphId, input?: NodeInput): number {
    const key = String(id);
    let i = this.#index.get(key);
    if (i === undefined) {
      i = this.#ids.length;
      this.#index.set(key, i);
      this.#ids.push(id);
      this.#nodes.push({});
    }
    if (input) {
      const node = this.#nodes[i] as NodeInput;
      for (const [k, v] of Object.entries(input)) {
        if (v !== undefined) (node as Record<string, unknown>)[k] = v;
      }
    }
    return i;
  }

  /** Add a link between two node ids; a node that was not added yet is created. */
  link(source: GraphId, target: GraphId, input?: LinkInput): void {
    this.#source.push(this.node(source));
    this.#target.push(this.node(target));
    this.#links.push(input ?? {});
  }

  build(directed: boolean): GraphData {
    const nodes = this.#nodes;
    const node: GraphNodeData = {
      label: nodes.map((n, i) => n.label ?? String(this.#ids[i])),
    };
    if (nodes.some((n) => n.group !== undefined && n.group !== null)) {
      node.group = nodes.map((n) => n.group ?? null);
    }
    if (nodes.some((n) => finite(n.x) && finite(n.y))) {
      node.x = nodes.map((n) => (finite(n.x) && finite(n.y) ? n.x : NaN));
      node.y = nodes.map((n) => (finite(n.x) && finite(n.y) ? n.y : NaN));
    }
    if (nodes.some((n) => finite(n.value))) {
      node.value = nodes.map((n) => (finite(n.value) ? n.value : NaN));
    }
    if (nodes.some((n) => n.color !== undefined)) node.color = nodes.map((n) => n.color ?? null);
    if (nodes.some((n) => n.customdata !== undefined)) {
      node.customdata = nodes.map((n) => n.customdata ?? null);
    }

    const links = this.#links;
    const link: GraphLinkData = { source: this.#source.slice(), target: this.#target.slice() };
    if (links.some((l) => finite(l.value))) {
      link.value = links.map((l) => (finite(l.value) ? l.value : 1));
    }
    if (links.some((l) => l.label !== undefined)) link.label = links.map((l) => l.label ?? null);
    if (links.some((l) => l.color !== undefined)) link.color = links.map((l) => l.color ?? null);
    if (links.some((l) => l.customdata !== undefined)) {
      link.customdata = links.map((l) => l.customdata ?? null);
    }
    return { node, link, directed };
  }
}

/** A finite number from a number or a numeric string, else `undefined`. */
export function toNumber(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/** A non-empty string from a string or a number, else `undefined`. */
export function toText(v: unknown): string | undefined {
  if (typeof v === 'string') return v === '' ? undefined : v;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return undefined;
}

/** The first of `keys` that `record` has a usable value for, read with `read`. */
export function pick<T>(
  record: Readonly<Record<string, unknown>>,
  keys: readonly string[],
  read: (v: unknown) => T | undefined,
): T | undefined {
  for (const key of keys) {
    const v = read(record[key]);
    if (v !== undefined) return v;
  }
  return undefined;
}

/** `record` without `keys`, or `undefined` when nothing is left. */
export function rest(
  record: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): Record<string, unknown> | undefined {
  const out: Record<string, unknown> = {};
  let any = false;
  for (const [k, v] of Object.entries(record)) {
    if (keys.includes(k)) continue;
    out[k] = v;
    any = true;
  }
  return any ? out : undefined;
}
