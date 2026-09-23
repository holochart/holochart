/**
 * Structural helpers for walking a schema tree: node lookup by path (including subplot container
 * families like `xaxis2`), attribute iteration and edit-type inheritance.
 */
import { parsePath, type PathSegment } from '../path/path.ts';
import type { AttrSpec, EditFlag, ItemsNode, NodeMeta, ObjectNode, SchemaNode } from './types.ts';

/** True for leaf attributes. */
export function isAttr(node: SchemaNode | undefined): node is AttrSpec {
  return node?.kind === 'attr';
}

/** True for nested containers. */
export function isObjectNode(node: SchemaNode | undefined): node is ObjectNode {
  return node?.kind === 'object';
}

/** True for arrays of objects. */
export function isItemsNode(node: SchemaNode | undefined): node is ItemsNode {
  return node?.kind === 'items';
}

const SUFFIX = /^(.*?)([2-9]|[1-9]\d+)$/;

/**
 * Split a container key into its family key and subplot number, e.g. `'xaxis2'` → `['xaxis', 2]`.
 * Keys without a numeric suffix return number 1.
 */
export function splitSubplotKey(key: string): [family: string, n: number] {
  const m = SUFFIX.exec(key);
  return m ? [m[1] as string, Number(m[2])] : [key, 1];
}

/**
 * Find the child of `node` for `key`, following subplot container families: when `xaxis` is
 * declared with `subplot: 'x'`, `xaxis2`, `xaxis3`, … resolve to the same node.
 */
export function resolveChild(node: ObjectNode, key: string): SchemaNode | undefined {
  if (Object.hasOwn(node.children, key)) return node.children[key];
  const [family, n] = splitSubplotKey(key);
  if (n === 1) return undefined;
  const child = Object.hasOwn(node.children, family) ? node.children[family] : undefined;
  return isObjectNode(child) && child.subplot !== undefined ? child : undefined;
}

/**
 * Subplot id for a container key: `('xaxis2', xaxisNode)` → `'x2'`, `('xaxis', xaxisNode)` → `'x'`.
 * Returns `undefined` if `key` is not in the node's family.
 */
export function subplotIdForKey(key: string, familyKey: string, base: string): string | undefined {
  if (key === familyKey) return base;
  const [family, n] = splitSubplotKey(key);
  return family === familyKey && n > 1 ? `${base}${n}` : undefined;
}

/** Container key for a subplot id: `('x2', 'xaxis', 'x')` → `'xaxis2'`. */
export function keyForSubplotId(id: string, familyKey: string, base: string): string {
  return familyKey + id.slice(base.length);
}

/**
 * The node at `path`, or `undefined` if the path leaves the schema. Index segments step into
 * `items` nodes and `info_array` items; an index after an `arrayOk`/`data_array` attribute resolves
 * to that attribute (a per-point value).
 */
export function getNodeAtPath(
  root: ObjectNode,
  path: string | readonly PathSegment[],
): SchemaNode | undefined {
  return walkPath(root, path)?.node;
}

/**
 * Like {@link getNodeAtPath} but also returns the chain of nodes visited (root excluded), for
 * edit-type inheritance.
 */
export function walkPath(
  root: ObjectNode,
  path: string | readonly PathSegment[],
): { node: SchemaNode; chain: SchemaNode[] } | undefined {
  const segs = typeof path === 'string' ? parsePath(path) : path;
  let node = root as SchemaNode;
  const chain: SchemaNode[] = [];
  for (const seg of segs) {
    let next: SchemaNode | undefined;
    if (typeof seg === 'number') {
      if (isItemsNode(node)) next = node.item;
      else if (isAttr(node) && node.valType === 'info_array' && node.items !== undefined) {
        next = Array.isArray(node.items) ? node.items[seg] : (node.items as AttrSpec);
      } else if (isAttr(node) && (node.arrayOk === true || node.valType === 'data_array')) {
        next = node;
      }
    } else if (isObjectNode(node)) {
      next = resolveChild(node, seg);
    }
    if (next === undefined) return undefined;
    if (next !== node) chain.push(next);
    node = next;
  }
  return { node, chain };
}

/**
 * The edit flags in effect at `path`: the node's own `editType`, else the nearest ancestor's.
 * Returns `undefined` if nothing on the path declares one.
 */
export function inheritedEditType(chain: readonly NodeMeta[]): readonly EditFlag[] | undefined {
  for (let i = chain.length - 1; i >= 0; i--) {
    const et = chain[i]?.editType;
    if (et !== undefined) return typeof et === 'string' ? [et] : et;
  }
  return undefined;
}

/**
 * Visit every leaf attribute under `node` depth-first. The callback gets the attribute's path
 * segments (items nodes contribute an index `0` placeholder) and the chain of nodes above it.
 */
export function forEachAttr(
  node: ObjectNode | ItemsNode,
  cb: (path: readonly PathSegment[], spec: AttrSpec, chain: readonly SchemaNode[]) => void,
  prefix: readonly PathSegment[] = [],
  chain: readonly SchemaNode[] = [],
): void {
  if (isItemsNode(node)) {
    forEachAttr(node.item, cb, [...prefix, 0], [...chain, node.item]);
    return;
  }
  for (const [key, child] of Object.entries(node.children)) {
    const path = [...prefix, key];
    const nextChain = [...chain, child];
    if (child.kind === 'attr') cb(path, child, nextChain);
    else forEachAttr(child, cb, path, nextChain);
  }
}
