/**
 * Build-time removal of attribute-schema `description` strings (plan E21.5, ADR-020).
 *
 * Descriptions stay next to their attributes in the TypeScript sources, where the docs generator
 * (`tools/schema-gen`, which imports sources through the `source` export condition), TypeDoc,
 * vitest and the dev servers read them. Production builds (`dist/index.js` and the IIFE) run this
 * rolldown plugin, which blanks:
 *
 * 1. every `description` property of an object literal passed to an `attr.*()` builder call (leaf
 *    options, and the meta argument of `attr.object`, `attr.subplotObject` and `attr.items`); inside
 *    the module that defines `attr`, bare builder calls (`string({...})`) count too;
 * 2. the argument that feeds a schema helper's `description` parameter (e.g.
 *    `fontSchema('Title font.')`), for helpers declared in the same module or exported from any
 *    workspace package. A helper qualifies when one of its parameters is named `description`; the
 *    plugin fails the build if that parameter is used anywhere except as a stripped description.
 *
 * Module-level constants that only fed descriptions (`const DTICK_DESCRIPTION = …`) become unused
 * and are tree-shaken. Trace `meta.description` is kept: it is part of `registry.list()`.
 *
 * Edits replace characters with spaces (newlines are kept), so every line and column is unchanged
 * and the transform returns `map: null` (existing sourcemaps stay valid).
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** Minimal ESTree node shape (oxc AST as returned by rolldown's `parse`). */
export interface AstNode {
  type: string;
  start: number;
  end: number;
  [key: string]: unknown;
}

/** Parses TypeScript source into an ESTree `Program` (rolldown's `this.parse` or `parseAst`). */
export type Parse = (code: string, options: { lang: 'ts' }) => AstNode;

/** Names of the `attr` builders (packages/core/src/schema/attr.ts). */
const BUILDERS = new Set([
  'number',
  'integer',
  'string',
  'boolean',
  'enumerated',
  'flaglist',
  'color',
  'colorlist',
  'colorscale',
  'angle',
  'subplotId',
  'dataArray',
  'infoArray',
  'any',
  'fn',
  'object',
  'subplotObject',
  'items',
]);

const DESCRIPTION = 'description';

/** Exported helper name → index of its `description` parameter, across the workspace. */
export type HelperIndex = ReadonlyMap<string, number>;

interface Edit {
  start: number;
  end: number;
  /** Text placed at `start`; the rest of the range becomes spaces. */
  replacement: string;
}

/** Result of {@link stripDescriptions}. */
export interface StripResult {
  /** Transformed code; the same length and line structure as the input. */
  code: string;
  /** Number of blanked properties and arguments. */
  removed: number;
  /** Offsets of `description: '…'` properties that were not stripped (outside `meta` objects). */
  leftovers: number[];
}

function isNode(v: unknown): v is AstNode {
  return typeof v === 'object' && v !== null && typeof (v as AstNode).type === 'string';
}

/** Calls `visit(node, parents)` for every node, depth first. */
function walk(root: AstNode, visit: (node: AstNode, parents: readonly AstNode[]) => void): void {
  const parents: AstNode[] = [];
  const go = (node: AstNode): void => {
    visit(node, parents);
    parents.push(node);
    for (const [key, value] of Object.entries(node)) {
      if (key === 'parent') continue;
      if (Array.isArray(value)) {
        for (const item of value) if (isNode(item)) go(item);
      } else if (isNode(value)) {
        go(value);
      }
    }
    parents.pop();
  };
  go(root);
}

function identifierName(node: unknown): string | undefined {
  return isNode(node) && node.type === 'Identifier' ? (node['name'] as string) : undefined;
}

function isDescriptionKey(prop: AstNode): boolean {
  if (prop.type !== 'Property' || prop['computed'] === true) return false;
  const key = prop['key'] as AstNode;
  return (
    identifierName(key) === DESCRIPTION || (key.type === 'Literal' && key['value'] === DESCRIPTION)
  );
}

/** Index of the parameter named `description`, or -1. */
function descriptionParam(fn: AstNode): number {
  const params = (fn['params'] as AstNode[] | undefined) ?? [];
  return params.findIndex((p) => {
    const target = p.type === 'AssignmentPattern' ? p['left'] : p;
    return identifierName(target) === DESCRIPTION;
  });
}

interface FunctionDecl {
  name: string;
  fn: AstNode;
  exported: boolean;
}

/** Top-level function declarations and `const f = () => …` / `function` expressions. */
function topLevelFunctions(program: AstNode): FunctionDecl[] {
  const out: FunctionDecl[] = [];
  for (const stmt of program['body'] as AstNode[]) {
    const exported = stmt.type === 'ExportNamedDeclaration';
    const decl = exported ? (stmt['declaration'] as AstNode | null) : stmt;
    if (!decl) continue;
    if (decl.type === 'FunctionDeclaration') {
      const name = identifierName(decl['id']);
      if (name) out.push({ name, fn: decl, exported });
    } else if (decl.type === 'VariableDeclaration') {
      for (const d of decl['declarations'] as AstNode[]) {
        const init = d['init'] as AstNode | null;
        const name = identifierName(d['id']);
        if (
          name &&
          init &&
          (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression')
        ) {
          out.push({ name, fn: init, exported });
        }
      }
    }
  }
  return out;
}

/** True when the module defines the `attr` DSL itself (then bare builder calls are schema calls). */
function definesAttr(program: AstNode): boolean {
  for (const stmt of program['body'] as AstNode[]) {
    const decl = stmt.type === 'ExportNamedDeclaration' ? (stmt['declaration'] as AstNode) : stmt;
    if (decl?.type !== 'VariableDeclaration') continue;
    for (const d of decl['declarations'] as AstNode[])
      if (identifierName(d['id']) === 'attr') return true;
  }
  return false;
}

/** Local name → description-parameter index of helpers imported from other modules. */
function importedHelpers(program: AstNode, index: HelperIndex): Map<string, number> {
  const out = new Map<string, number>();
  for (const stmt of program['body'] as AstNode[]) {
    if (stmt.type !== 'ImportDeclaration' || stmt['importKind'] === 'type') continue;
    for (const spec of stmt['specifiers'] as AstNode[]) {
      if (spec.type !== 'ImportSpecifier' || spec['importKind'] === 'type') continue;
      const imported = identifierName(spec['imported']);
      const local = identifierName(spec['local']);
      const i = imported === undefined ? undefined : index.get(imported);
      if (local && i !== undefined) out.set(local, i);
    }
  }
  return out;
}

/** Skips whitespace and comments from `pos`; returns the next significant offset. */
function skipTrivia(code: string, pos: number): number {
  let i = pos;
  for (;;) {
    const c = code[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') i++;
    else if (c === '/' && code[i + 1] === '/') {
      while (i < code.length && code[i] !== '\n') i++;
    } else if (c === '/' && code[i + 1] === '*') {
      const close = code.indexOf('*/', i + 2);
      i = close < 0 ? code.length : close + 2;
    } else return i;
  }
}

/** Expressions a helper argument may be when it is replaced (no side effects are dropped). */
function isPlainString(node: AstNode): boolean {
  switch (node.type) {
    case 'Literal':
      return typeof node['value'] === 'string';
    case 'TemplateLiteral':
      return (node['expressions'] as AstNode[]).every(isPlainString);
    case 'Identifier':
      return true;
    case 'BinaryExpression':
      return (
        node['operator'] === '+' &&
        isPlainString(node['left'] as AstNode) &&
        isPlainString(node['right'] as AstNode)
      );
    case 'TSAsExpression':
    case 'TSSatisfiesExpression':
    case 'ParenthesizedExpression':
      return isPlainString(node['expression'] as AstNode);
    default:
      return false;
  }
}

function isBuilderCall(call: AstNode, bareBuilders: boolean): boolean {
  const callee = call['callee'] as AstNode;
  if (callee.type === 'MemberExpression' && callee['computed'] !== true) {
    const prop = identifierName(callee['property']);
    return identifierName(callee['object']) === 'attr' && prop !== undefined && BUILDERS.has(prop);
  }
  const name = identifierName(callee);
  return bareBuilders && name !== undefined && BUILDERS.has(name);
}

/** Error thrown for source patterns the plugin cannot strip safely. */
export class StripDescriptionsError extends Error {
  override name = 'StripDescriptionsError';
}

/**
 * Blank the schema descriptions of one module.
 *
 * @param code - Module source (TypeScript or JavaScript).
 * @param program - `code` parsed as TypeScript.
 * @param helpers - Workspace-wide exported helpers ({@link scanWorkspaceHelpers}).
 * @param id - Module id, used in error messages.
 */
export function stripDescriptions(
  code: string,
  program: AstNode,
  helpers: HelperIndex,
  id = '<module>',
): StripResult {
  const bare = definesAttr(program);
  const locals = topLevelFunctions(program)
    .map((f) => ({ ...f, param: descriptionParam(f.fn) }))
    .filter((f) => f.param >= 0);
  const helperCalls = importedHelpers(program, helpers);
  for (const f of locals) helperCalls.set(f.name, f.param);

  const edits: Edit[] = [];
  const candidates: { prop: AstNode; parents: readonly AstNode[] }[] = [];
  walk(program, (node, parents) => {
    if (node.type === 'Property' && isDescriptionKey(node)) {
      candidates.push({ prop: node, parents: [...parents] });
    }
    if (node.type !== 'CallExpression') return;
    const args = node['arguments'] as AstNode[];
    if (isBuilderCall(node, bare)) {
      for (const arg of args) {
        if (arg.type !== 'ObjectExpression') continue;
        for (const prop of arg['properties'] as AstNode[]) {
          if (!isDescriptionKey(prop)) continue;
          const next = skipTrivia(code, prop.end);
          const end = code[next] === ',' ? next + 1 : prop.end;
          edits.push({ start: prop.start, end, replacement: '' });
        }
      }
      return;
    }
    const helper = helperCalls.get(identifierName(node['callee']) ?? '');
    const arg = helper === undefined ? undefined : args[helper];
    if (!arg) return;
    if (!isPlainString(arg)) {
      throw new StripDescriptionsError(
        `${id}: the description argument of ${identifierName(node['callee'])}() at offset ${arg.start} is not a plain string expression.`,
      );
    }
    // The helper's parameter becomes unused once its own module is stripped; `''` keeps its type.
    edits.push({
      start: arg.start,
      end: arg.end,
      replacement: arg.end - arg.start >= 2 ? "''" : '0',
    });
  });

  edits.sort((a, b) => a.start - b.start);
  const merged: Edit[] = [];
  for (const e of edits) {
    const last = merged[merged.length - 1];
    if (last && e.start < last.end) continue; // nested in an earlier edit
    merged.push(e);
  }
  const inEdit = (pos: number): boolean => merged.some((e) => pos >= e.start && pos < e.end);

  // A helper's `description` parameter may only feed descriptions that were just removed.
  for (const f of locals) {
    walk(f.fn['body'] as AstNode, (node, parents) => {
      if (identifierName(node) !== DESCRIPTION) return;
      const parent = parents[parents.length - 1];
      if (parent?.type === 'MemberExpression' && parent['property'] === node) return;
      if (parent?.type === 'Property' && parent['key'] === node && parent['shorthand'] !== true) {
        return;
      }
      if (!inEdit(node.start)) {
        throw new StripDescriptionsError(
          `${id}: parameter \`description\` of ${f.name}() is used at offset ${node.start} for something other than a schema description; rename it or pass it to an attr builder.`,
        );
      }
    });
  }

  const leftovers = candidates
    .filter(({ prop, parents }) => {
      if (inEdit(prop.start)) return false;
      const value = prop['value'] as AstNode;
      if (value.type !== 'Literal' && value.type !== 'TemplateLiteral') return false;
      // Trace module docs metadata (`meta: { description }`) is kept on purpose.
      return !parents.some((p) => p.type === 'Property' && identifierName(p['key']) === 'meta');
    })
    .map(({ prop }) => prop.start);

  if (merged.length === 0) return { code, removed: 0, leftovers };
  let out = '';
  let pos = 0;
  for (const e of merged) {
    const blank = code.slice(e.start, e.end).replace(/[^\n\r]/g, ' ');
    out += code.slice(pos, e.start) + e.replacement + blank.slice(e.replacement.length);
    pos = e.end;
  }
  out += code.slice(pos);
  return { code: out, removed: merged.length, leftovers };
}

/** Workspace root (this file lives in `scripts/build/`). */
export const WORKSPACE_ROOT = path.resolve(import.meta.dirname, '../..');

const SOURCE_FILE = /^(?!.*\.(test|spec|d)\.ts$).*\.ts$/;

/** Production source files of every workspace package (no tests, fixtures or declarations). */
export function workspaceSources(root = WORKSPACE_ROOT): string[] {
  const files: string[] = [];
  const packagesDir = path.join(root, 'packages');
  for (const pkg of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!pkg.isDirectory()) continue;
    const src = path.join(packagesDir, pkg.name, 'src');
    let entries: string[];
    try {
      entries = readdirSync(src, { recursive: true, encoding: 'utf8' });
    } catch {
      continue;
    }
    for (const rel of entries) {
      if (!SOURCE_FILE.test(rel) || /(^|[\\/])__(testing|fixtures)__[\\/]/.test(rel)) continue;
      files.push(path.join(src, rel));
    }
  }
  return files.sort();
}

/**
 * Index the exported functions of every workspace package that take a `description` parameter.
 * Fails when one name is exported with different parameter layouts, because call sites are matched
 * by imported name.
 */
export function scanWorkspaceHelpers(parse: Parse, root = WORKSPACE_ROOT): HelperIndex {
  const seen = new Map<string, { index: number; file: string }>();
  for (const file of workspaceSources(root)) {
    const code = readFileSync(file, 'utf8');
    if (!code.includes(DESCRIPTION)) continue;
    for (const f of topLevelFunctions(parse(code, { lang: 'ts' }))) {
      if (!f.exported) continue;
      const index = descriptionParam(f.fn);
      const prev = seen.get(f.name);
      if (prev && prev.index !== index && (prev.index >= 0 || index >= 0)) {
        throw new StripDescriptionsError(
          `Exported function ${f.name}() has a \`description\` parameter in one module but not the same one in another (${path.relative(root, prev.file)}, ${path.relative(root, file)}); rename one of them.`,
        );
      }
      if (!prev || index >= 0) seen.set(f.name, { index, file });
    }
  }
  const index = new Map<string, number>();
  for (const [name, v] of seen) if (v.index >= 0) index.set(name, v.index);
  return index;
}

/** Workspace package sources, the modules the plugin transforms. */
export const PACKAGE_SOURCE =
  /[\\/]packages[\\/][^\\/]+[\\/]src[\\/](?!.*\.(test|spec|d)\.ts$).*\.ts$/;

/** The slice of rolldown's plugin API used here (rolldown is not resolvable from `scripts/`). */
interface PluginContext {
  parse(code: string, options: { lang: 'ts' }): AstNode;
  warn(message: string): void;
}

/** A rolldown plugin (tsdown `plugins` entry). */
export interface StripDescriptionsPlugin {
  name: string;
  buildStart(this: PluginContext): void;
  transform: {
    filter: { id: RegExp };
    handler(this: PluginContext, code: string, id: string): { code: string; map: null } | null;
  };
}

let cachedHelpers: HelperIndex | undefined;

/**
 * rolldown plugin: strip schema descriptions from workspace package sources (see the module
 * comment). Add it to production builds only.
 */
export function stripDescriptionsPlugin(): StripDescriptionsPlugin {
  let helpers: HelperIndex = new Map();
  return {
    name: 'holochart:strip-descriptions',
    buildStart() {
      cachedHelpers ??= scanWorkspaceHelpers((code, options) => this.parse(code, options));
      helpers = cachedHelpers;
    },
    transform: {
      filter: { id: PACKAGE_SOURCE },
      handler(code, id) {
        if (!code.includes(DESCRIPTION)) return null;
        const program = this.parse(code, { lang: 'ts' });
        const result = stripDescriptions(code, program, helpers, path.relative(WORKSPACE_ROOT, id));
        for (const offset of result.leftovers) {
          const line = code.slice(0, offset).split('\n').length;
          this.warn(
            `${path.relative(WORKSPACE_ROOT, id)}:${line}: \`description\` not stripped (not an attr.*() option); it ships in production builds.`,
          );
        }
        return result.removed > 0 ? { code: result.code, map: null } : null;
      },
    },
  };
}
