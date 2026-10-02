/**
 * A compact form of an attribute schema, shared by the vendored copy of plotly.js' schema and by
 * Holochart's own `plot-schema.json`, so that the two can be compared path by path
 * (`compare.ts`). Only what the comparison needs is kept: attribute names, value types, the values
 * of enumerations and flag lists, and whether per-point arrays are accepted.
 */

/** A leaf attribute. */
export interface Leaf {
  /** Value type (`valType`). */
  t: string;
  /** Values of an `enumerated` attribute (regular expressions as `'/…/'` strings, as in Plotly). */
  v?: (string | number | boolean | null)[];
  /** Flags of a `flaglist` attribute. */
  f?: string[];
  /** Extra values of a `flaglist` attribute (`'none'`, `'all'`, …). */
  x?: (string | number | boolean | null)[];
  /** True when the attribute also takes one value per point (`arrayOk`). */
  a?: true;
}

/** A container (`marker`, `xaxis`): its children by name. */
export interface Branch {
  [name: string]: Tree;
}

/** A node of a compact schema: a leaf, a container, or an array of containers under `'[]'`. */
export type Tree = Leaf | Branch;

/** Key under which an array container (`annotations`, `tickformatstops`) holds its item's tree. */
export const ITEMS = '[]';

export function isLeaf(node: Tree): node is Leaf {
  return typeof (node as Leaf).t === 'string';
}

type Json = Record<string, unknown>;

/** Object-valued metadata keys of Plotly's schema nodes, which are not attributes. */
const METADATA: ReadonlySet<string> = new Set(['impliedEdits']);

function isObject(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

type Scalar = string | number | boolean | null;

function scalars(v: unknown): Scalar[] {
  return Array.isArray(v)
    ? v.filter((x): x is Scalar => x === null || ['string', 'number', 'boolean'].includes(typeof x))
    : [];
}

function leaf(node: Json): Leaf {
  const out: Leaf = { t: String(node['valType']) };
  if (out.t === 'enumerated') out.v = scalars(node['values']);
  if (out.t === 'flaglist') {
    out.f = scalars(node['flags']).map(String);
    const extras = scalars(node['extras']);
    if (extras.length > 0) out.x = extras;
  }
  if (node['arrayOk'] === true) out.a = true;
  return out;
}

/**
 * Compact form of a schema node in plot-schema layout: Plotly's (`{ role: 'object', … }`, arrays as
 * `{ items: { <name>: { … } } }`) or Holochart's (arrays as `{ role: 'items', items: { … } }`).
 * Metadata (`description`, `editType`, `dflt`, `impliedEdits`, …), private keys (`_isSubplotObj`)
 * and Plotly's `_deprecated` attributes are dropped. Returns `undefined` for metadata.
 */
export function compactNode(node: unknown): Tree | undefined {
  if (!isObject(node)) return undefined;
  if (typeof node['valType'] === 'string') return leaf(node);
  const items = node['items'];
  if (isObject(items)) {
    // Holochart: the item's container itself. Plotly: `{ <itemName>: container }`.
    const item =
      node['role'] === 'items'
        ? items
        : Object.values(items).find((v) => isObject(v) && v['role'] === 'object');
    const tree = compactNode(item);
    return tree && !isLeaf(tree) ? { [ITEMS]: tree } : undefined;
  }
  if (node['role'] !== 'object') return undefined;
  const out: Branch = {};
  for (const [key, child] of Object.entries(node)) {
    if (key.startsWith('_') || METADATA.has(key)) continue;
    const tree = compactNode(child);
    // A container without attributes is metadata too.
    if (tree && (isLeaf(tree) || Object.keys(tree).length > 0)) out[key] = tree;
  }
  return out;
}

/** Compact form of a top-level attribute map, which has no `role` of its own in Plotly's schema. */
export function compactAttributes(attributes: unknown): Branch {
  if (!isObject(attributes)) return {};
  const tree = compactNode({ ...attributes, role: 'object' });
  return tree && !isLeaf(tree) ? tree : {};
}

/** A reference to a shared subtree of a {@link pack}ed file. */
interface Ref {
  $: number;
}
type Packed = Leaf | Ref | { [name: string]: Packed };

/**
 * Replace containers that occur more than once (`font`, `colorbar`, `hoverlabel`, … are the same in
 * most trace types) by `{ $: index }` references into a shared list. Returns the list and the
 * packed trees, in the order given.
 */
export function pack(trees: readonly Branch[]): { defs: unknown[]; trees: unknown[] } {
  const count = new Map<string, number>();
  const visit = (node: Tree): void => {
    if (isLeaf(node)) return;
    const key = JSON.stringify(node);
    count.set(key, (count.get(key) ?? 0) + 1);
    // The children of a repeated container repeat with it: count them once.
    if (count.get(key) === 1) for (const child of Object.values(node)) visit(child);
  };
  trees.forEach(visit);

  const defs: Packed[] = [];
  const index = new Map<string, number>();
  const packNode = (node: Tree, top: boolean): Packed => {
    if (isLeaf(node)) return node;
    const key = JSON.stringify(node);
    const shared = !top && key.length >= 64 && (count.get(key) ?? 0) > 1;
    const known = shared ? index.get(key) : undefined;
    if (known !== undefined) return { $: known };
    const out: { [name: string]: Packed } = {};
    for (const [name, child] of Object.entries(node)) out[name] = packNode(child, false);
    if (!shared) return out;
    index.set(key, defs.length);
    defs.push(out);
    return { $: defs.length - 1 };
  };
  const packed = trees.map((tree) => packNode(tree, true));
  return { defs, trees: packed };
}

/** Undo {@link pack} for one tree. */
export function unpack(tree: unknown, defs: readonly unknown[]): Branch {
  const expand = (node: unknown): Tree => {
    const n = node as Record<string, unknown>;
    if (typeof n['$'] === 'number') return expand(defs[n['$']]);
    if (typeof n['t'] === 'string') return n as unknown as Leaf;
    const out: Branch = {};
    for (const [name, child] of Object.entries(n)) out[name] = expand(child);
    return out;
  };
  return expand(tree) as Branch;
}
