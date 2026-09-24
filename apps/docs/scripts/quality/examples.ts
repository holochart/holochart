/**
 * Static scan of `examples/` for the docs quality gates. Examples export `run(el)` and need a
 * browser, so they are never executed: the TypeScript compiler API parses each file and collects
 * the object-literal key paths it writes (`marker.line.width`, `xaxis.title.text`, …), plus the
 * trace types it creates.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import { listExampleIds, traceTypesInSource } from '../../../../tools/schema-gen/src/docs/scan.ts';
import type { Namespace } from './schema.ts';

/**
 * A key path written in an example. `scope` is the namespace the literal belongs to when the scan
 * can tell (`layout`, `config`, or a trace type); `null` when it can't (e.g. a standalone
 * `const marker = { … }`).
 */
export interface KeyPath {
  scope: string | null;
  path: string[];
}

/** Numbered subplot and component ids (`xaxis2`, `scene3`, `coloraxis2`) → their base name. */
const NUMBERED =
  /^(xaxis|yaxis|zaxis|coloraxis|legend|scene|polar|geo|ternary|mapbox|map|smith)\d+$/;

/** Normalize one key segment: numbered ids lose their number, `[]` markers are dropped. */
export function normalizeSegment(key: string): string {
  const k = key.replace(/\[\d*\]$/, '');
  return NUMBERED.exec(k)?.[1] ?? k;
}

/** Split a (possibly dotted, Plotly-style `'xaxis.range'`) key into normalized segments. */
export function keySegments(key: string): string[] {
  return key
    .split('.')
    .filter((s) => s !== '')
    .map(normalizeSegment);
}

interface Ctx {
  scope: string | null;
  path: string[];
}

const ROOT: Ctx = { scope: null, path: [] };

function propName(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNoSubstitutionTemplateLiteral(name))
    return name.text;
  return undefined;
}

function unwrap(e: ts.Expression): ts.Expression {
  while (
    ts.isParenthesizedExpression(e) ||
    ts.isAsExpression(e) ||
    ts.isSatisfiesExpression(e) ||
    ts.isNonNullExpression(e) ||
    ts.isTypeAssertionExpression(e)
  ) {
    e = e.expression;
  }
  return e;
}

/** Callees whose arguments keep the surrounding context (`data: xs.map(…)`, `sp.place(trace)`). */
const TRANSPARENT_CALLS = /(^|\.)(map|flatMap|from|of|concat|place)$/;

/**
 * Collect object-literal key paths from a TypeScript source.
 *
 * - Arrays, parentheses, `as`/`satisfies`, spreads, ternaries and `.map(() => ({ … }))` callbacks
 *   are transparent.
 * - A literal with `type: '<known trace>'` starts that trace's scope; elements of a `data: [...]`
 *   array without a `type` are `scatter` (Plotly's default type).
 * - `layout: …`, `config: …`, `const layout = …`, `const config = …` and the first argument of
 *   `relayout(…)` start the layout/config scope; template `data: { bar: [...] }` starts `bar`.
 * - `export const meta = …` (the example's metadata) is skipped.
 */
export function collectKeyPaths(source: string, traceTypes: ReadonlySet<string>): KeyPath[] {
  const sf = ts.createSourceFile('example.ts', source, ts.ScriptTarget.ES2022, true);
  const out: KeyPath[] = [];

  const visitObject = (obj: ts.ObjectLiteralExpression, ctx: Ctx, ret: Ctx): void => {
    let base = ctx;
    for (const p of obj.properties) {
      if (ts.isPropertyAssignment(p) && propName(p.name) === 'type') {
        const init = unwrap(p.initializer);
        if (ts.isStringLiteralLike(init) && traceTypes.has(init.text)) {
          base = { scope: init.text, path: [] };
        }
      }
    }
    for (const p of obj.properties) {
      if (ts.isSpreadAssignment(p)) {
        visitExpr(p.expression, base, ret);
        continue;
      }
      if (!ts.isPropertyAssignment(p) && !ts.isShorthandPropertyAssignment(p)) {
        visitNode(p, ret);
        continue;
      }
      const name = propName(p.name);
      const init = ts.isPropertyAssignment(p) ? p.initializer : undefined;
      if (name === undefined) {
        if (init) visitExpr(init, ROOT, ret);
        continue;
      }
      const segs = keySegments(name);
      const child: Ctx = { scope: base.scope, path: [...base.path, ...segs] };
      if (!init) {
        out.push(child);
        continue;
      }
      const value = unwrap(init);
      if (name === 'layout' || name === 'config') {
        visitExpr(init, { scope: name, path: [] }, ret);
      } else if (name === 'data' && ts.isArrayLiteralExpression(value)) {
        visitExpr(init, { scope: 'scatter', path: [] }, ret);
      } else if (name === 'data' && ts.isObjectLiteralExpression(value)) {
        // Template trace defaults: `data: { scatter: [{ … }], bar: [{ … }] }`.
        for (const q of value.properties) {
          const key = ts.isPropertyAssignment(q) ? propName(q.name) : undefined;
          if (ts.isPropertyAssignment(q) && key !== undefined && traceTypes.has(key)) {
            visitExpr(q.initializer, { scope: key, path: [] }, ret);
          } else {
            visitNode(q, ret);
          }
        }
      } else {
        out.push(child);
        visitExpr(init, child, ret);
      }
    }
  };

  const visitExpr = (expr: ts.Expression, ctx: Ctx, ret: Ctx): void => {
    const e = unwrap(expr);
    if (ts.isObjectLiteralExpression(e)) return visitObject(e, ctx, ret);
    if (ts.isArrayLiteralExpression(e)) {
      for (const el of e.elements) {
        visitExpr(ts.isSpreadElement(el) ? el.expression : el, ctx, ret);
      }
      return;
    }
    if (ts.isConditionalExpression(e)) {
      visitExpr(e.condition, ROOT, ret);
      visitExpr(e.whenTrue, ctx, ret);
      visitExpr(e.whenFalse, ctx, ret);
      return;
    }
    if (ts.isArrowFunction(e) || ts.isFunctionExpression(e)) {
      if (ts.isBlock(e.body)) visitNode(e.body, ctx);
      else visitExpr(e.body, ctx, ctx);
      return;
    }
    if (ts.isCallExpression(e)) {
      const callee = e.expression.getText(sf);
      visitExpr(e.expression, ROOT, ret);
      e.arguments.forEach((a, i) => {
        let argCtx = ROOT;
        if (/(^|\.)relayout$/.test(callee) && i === 0) argCtx = { scope: 'layout', path: [] };
        else if (TRANSPARENT_CALLS.test(callee)) argCtx = ctx;
        visitExpr(a, argCtx, ret);
      });
      return;
    }
    visitNode(e, ret);
  };

  /** Generic statement/expression walk: context resets; `return x` uses the function's context. */
  const visitNode = (node: ts.Node, ret: Ctx): void => {
    if (ts.isReturnStatement(node)) {
      if (node.expression) visitExpr(node.expression, ret, ret);
      return;
    }
    if (ts.isVariableDeclaration(node) && node.initializer) {
      const name = ts.isIdentifier(node.name) ? node.name.text : '';
      if (name === 'meta' && isTopLevelExport(node)) return;
      const scope = name === 'layout' || name === 'config' ? name : null;
      visitExpr(node.initializer, { scope, path: [] }, ret);
      return;
    }
    if (ts.isFunctionLike(node)) {
      ts.forEachChild(node, (c) => visitNode(c, ROOT));
      return;
    }
    if (ts.isExpression(node) && !ts.isIdentifier(node)) {
      if (ts.isObjectLiteralExpression(node) || ts.isCallExpression(node)) {
        visitExpr(node, ROOT, ret);
        return;
      }
    }
    ts.forEachChild(node, (c) => visitNode(c, ret));
  };

  visitNode(sf, ROOT);
  return out;
}

function isTopLevelExport(decl: ts.VariableDeclaration): boolean {
  const stmt = decl.parent.parent;
  return (
    ts.isVariableStatement(stmt) &&
    ts.isSourceFile(stmt.parent) &&
    (stmt.modifiers ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
  );
}

/**
 * True when an example trace literal without `type` exists, i.e. the example draws a `scatter`
 * (Plotly's default trace type).
 */
function usesDefaultScatter(paths: readonly KeyPath[]): boolean {
  return paths.some((k) => k.scope === 'scatter' && k.path.length === 1);
}

/** Per-example scan result. */
export interface ExampleScan {
  id: string;
  keyPaths: KeyPath[];
  /**
   * Trace types the example creates: every `type: '<name>'` string (registered or not, so draft
   * chart pages of unregistered types are counted too), plus `scatter` for untyped traces.
   */
  traceTypes: Set<string>;
}

/** Scan every example (ids as in `examples/index.ts`). */
export async function scanExamples(
  examplesDir: string,
  traceTypes: readonly string[],
): Promise<ExampleScan[]> {
  const known = new Set(traceTypes);
  const out: ExampleScan[] = [];
  for (const id of await listExampleIds(examplesDir)) {
    // `listExampleIds` skips node_modules at any depth; examples/index.ts does the same.
    const source = await readFile(path.join(examplesDir, `${id}.ts`), 'utf8');
    const keyPaths = collectKeyPaths(source, known);
    const types = traceTypesInSource(source);
    if (usesDefaultScatter(keyPaths)) types.add('scatter');
    out.push({ id, keyPaths, traceTypes: types });
  }
  return out;
}

/** Attribute path as matched against key paths: `annotations[].text` → `annotations.text`. */
export function attributeSegments(attrPath: string): string[] {
  return keySegments(attrPath.replace(/\[\]/g, ''));
}

function endsWith(path: readonly string[], suffix: readonly string[]): boolean {
  if (suffix.length > path.length) return false;
  const offset = path.length - suffix.length;
  return suffix.every((s, i) => path[offset + i] === s);
}

/**
 * True when some key path uses an attribute: an exact match inside the attribute's own namespace,
 * or a suffix match for key paths whose namespace is unknown.
 */
export function isUsed(namespace: string, attrPath: string, keyPaths: readonly KeyPath[]): boolean {
  const segs = attributeSegments(attrPath);
  return keyPaths.some((k) =>
    k.scope === null
      ? endsWith(k.path, segs)
      : k.scope === namespace && k.path.length === segs.length && endsWith(k.path, segs),
  );
}

/** Coverage of one group of attributes. */
export interface Coverage {
  name: string;
  used: number;
  total: number;
}

/** Result of gate 2. */
export interface UsageReport {
  overall: Coverage;
  /** Per namespace (layout, config, each trace). */
  namespaces: Coverage[];
  /** Per top-level attribute group (`layout.xaxis`, `scatter.marker`, …) with ≥ 5 attributes. */
  groups: Coverage[];
}

/** Gate 2 (report only): share of leaf attributes used in at least one example. */
export function attributeUsage(
  namespaces: readonly Namespace[],
  keyPaths: readonly KeyPath[],
): UsageReport {
  // Index key paths by last segment so each attribute only tests plausible candidates.
  const byLast = new Map<string, KeyPath[]>();
  for (const k of keyPaths) {
    const last = k.path[k.path.length - 1];
    if (last !== undefined) byLast.set(last, [...(byLast.get(last) ?? []), k]);
  }
  const overall: Coverage = { name: 'all', used: 0, total: 0 };
  const perNs: Coverage[] = [];
  const groups = new Map<string, Coverage>();
  for (const ns of namespaces) {
    const cov: Coverage = { name: ns.name, used: 0, total: 0 };
    for (const e of ns.entries) {
      if (e.kind !== 'attr') continue;
      const segs = attributeSegments(e.path);
      const used = isUsed(ns.name, e.path, byLast.get(segs[segs.length - 1] ?? '') ?? []);
      const groupName = `${ns.name}.${segs[0] ?? ''}`;
      const group = groups.get(groupName) ?? { name: groupName, used: 0, total: 0 };
      groups.set(groupName, group);
      for (const c of [overall, cov, group]) {
        c.total++;
        if (used) c.used++;
      }
    }
    perNs.push(cov);
  }
  return {
    overall,
    namespaces: perNs,
    groups: [...groups.values()].filter((g) => g.total >= 5),
  };
}

/** Result of gate 3 for one trace type. */
export interface TraceExamples {
  type: string;
  /** Example ids that create this trace type. */
  examples: string[];
  /** `released` (a `status: complete` chart page names it) or `draft` (only draft pages). */
  status: 'released' | 'draft';
  /** Chart pages naming this type in `chart:` frontmatter. */
  pages: string[];
}

/** Gate 3: example ids per trace type named by a docs chart page. */
export function examplesPerTrace(
  scans: readonly ExampleScan[],
  chartPages: readonly { file: string; chart: string; status: string }[],
): TraceExamples[] {
  const byType = new Map<string, TraceExamples>();
  for (const page of chartPages) {
    const entry = byType.get(page.chart) ?? {
      type: page.chart,
      examples: scans.filter((s) => s.traceTypes.has(page.chart)).map((s) => s.id),
      status: 'draft' as const,
      pages: [],
    };
    entry.pages.push(page.file);
    if (page.status === 'complete') entry.status = 'released';
    byType.set(page.chart, entry);
  }
  return [...byType.values()].sort((a, b) => a.type.localeCompare(b.type));
}
