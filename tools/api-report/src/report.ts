/**
 * API report text (backlog S2.13): what `cli.ts` does to an API Extractor report before it is
 * written to `api-reports/`, kept free of I/O so it can be unit-tested.
 *
 * API Extractor knows the release tags `@public`, `@beta`, `@alpha` and `@internal`; Holochart's
 * policy (docs/release/versioning.md) has two levels, stable and `@experimental`, and lets a whole
 * package be experimental. {@link finishReport} maps one onto the other so every top-level
 * declaration of a report carries its effective stability:
 *
 * - `// @public`: stable (SemVer applies).
 * - `// @experimental`: may change in any minor release. Tagged `@experimental` itself, or untagged
 *   in a package whose `@packageDocumentation` comment is tagged `@experimental`; there, `@public`
 *   on a declaration marks an exception.
 *
 * Members are covered by their declaration's tag unless they carry one of their own.
 *
 * {@link finishReport} also sorts the members of every union type. The declaration build does not
 * keep them in a stable order: where a type is inferred (the attribute schemas), TypeScript lists
 * union members in the order it happened to create them, which differs between two builds of the
 * same sources. Sorted, the reports are reproducible.
 */
import ts from 'typescript';

/** A package's default stability: what an export without a tag of its own is. */
export type Stability = 'stable' | 'experimental';

/** A published package, as far as the reports are concerned. */
export interface ReportPackage {
  /** npm name, e.g. `@mk7s/holochart-render`. */
  readonly name: string;
  /** Default stability of its exports ({@link packageStability}). */
  readonly stability: Stability;
  /** Names of its declarations tagged `@public` ({@link publicNames}). */
  readonly publicNames: ReadonlySet<string>;
}

/** File name of a package's report: `@mk7s/holochart-core` → `holochart-core.api.md`. */
export function reportFileName(packageName: string): string {
  return `${packageName.replace(/^@[^/]+\//, '')}.api.md`;
}

/**
 * Default stability of a package, from the source of its entry point: `experimental` when the
 * `@packageDocumentation` comment is tagged `@experimental`, else `stable`. (The comment is read
 * from `src/index.ts` because the declaration bundler drops file-level comments from `dist`.)
 */
export function packageStability(entrySource: string): Stability {
  for (const [comment] of entrySource.matchAll(/\/\*\*[\s\S]*?\*\//g)) {
    if (!/@packageDocumentation\b/.test(comment)) continue;
    return /^\s*\*\s*@experimental\b/m.test(comment) ? 'experimental' : 'stable';
  }
  return 'stable';
}

/**
 * Names of the top-level declarations of a declaration file (`dist/index.d.ts`) whose doc comment
 * is tagged `@public`. API Extractor's report prints `@public` for those and for untagged
 * declarations alike, so the tag is read here.
 */
export function publicNames(declarations: string): Set<string> {
  const source = ts.createSourceFile('index.d.ts', declarations, ts.ScriptTarget.Latest, true);
  const names = new Set<string>();
  for (const statement of source.statements) {
    if (!ts.getJSDocTags(statement).some((tag) => tag.tagName.text === 'public')) continue;
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) names.add(declaration.name.text);
      }
    } else {
      const name = (statement as ts.Statement & { name?: ts.Node }).name;
      if (name && ts.isIdentifier(name)) names.add(name.text);
    }
  }
  return names;
}

/** Text order by UTF-16 code unit: the same on every machine, unlike `localeCompare`. */
function byCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * `code` (the TypeScript of a report) with the members of every union type sorted, nested unions
 * included. A union with comments between its members was written by hand, so its order is
 * already stable: it is left as it is.
 */
export function sortUnions(code: string): string {
  const source = ts.createSourceFile('report.d.ts', code, ts.ScriptTarget.Latest, false);
  /** The text from `start` to `node.end`, with the unions inside `node` rendered. */
  const renderInside = (node: ts.Node, start: number): string => {
    let out = '';
    let pos = start;
    const visit = (child: ts.Node): void => {
      if (ts.isUnionTypeNode(child)) {
        out += code.slice(pos, child.getStart(source)) + renderUnion(child);
        pos = child.end;
      } else {
        ts.forEachChild(child, visit);
      }
    };
    ts.forEachChild(node, visit);
    return out + code.slice(pos, node.end);
  };
  const renderUnion = (union: ts.UnionTypeNode): string => {
    const first = union.types[0]!;
    let plain = /^[\s|]*$/.test(code.slice(union.getStart(source), first.getStart(source)));
    for (let i = 1; plain && i < union.types.length; i++) {
      const gap = code.slice(union.types[i - 1]!.end, union.types[i]!.getStart(source));
      plain = /^[\s|]*$/.test(gap);
    }
    if (!plain) return renderInside(union, union.getStart(source));
    return union.types
      .map((member) => renderInside(member, member.getStart(source)))
      .sort(byCodeUnit)
      .join(' | ');
  };
  return renderInside(source, 0);
}

/** `report` with {@link sortUnions} applied to its fenced TypeScript block. */
function sortReportUnions(report: string): string {
  const open = report.indexOf('```ts\n');
  const close = report.lastIndexOf('\n```');
  if (open < 0 || close <= open) return report;
  const start = open + '```ts\n'.length;
  return report.slice(0, start) + sortUnions(report.slice(start, close)) + report.slice(close);
}

const DO_NOT_EDIT = /^> Do not edit this file\./;
const COMMENT = /^\s*\/\//;
/** A declaration's synopsis line: `// @public @deprecated (undocumented)`. */
const PUBLIC_SYNOPSIS = /^(\s*)\/\/ @public\b ?(.*)$/;
const DECLARATION =
  /^(?:export )?(?:declare )?(?:default )?(?:abstract )?(?:class|interface|type|const|let|var|function|enum|namespace) ([\w$]+)/;
const NAMESPACE_IMPORT = /^import \* as (\w+) from '([^']+)';$/;

function headerNote(pkg: ReportPackage): string[] {
  const policy = '[versioning policy](../docs/release/versioning.md)';
  return pkg.stability === 'experimental'
    ? [
        `> Stability: **experimental**. This package's exports may change in any minor release`,
        `> (${policy}), except those marked \`@public\`.`,
      ]
    : [
        `> Stability: exports are stable (\`@public\`) unless marked \`@experimental\`, which may change`,
        `> in any minor release (${policy}).`,
      ];
}

/** Name of the declaration a comment block starting at `lines[from]` belongs to. */
function declaredName(lines: readonly string[], from: number): string | undefined {
  for (let i = from; i < lines.length; i++) {
    if (COMMENT.test(lines[i]!)) continue;
    return DECLARATION.exec(lines[i]!)?.[1];
  }
  return undefined;
}

/**
 * Turn the report API Extractor wrote for `pkg` into the committed one: LF newlines, sorted union
 * members, a stability note under the header, the effective stability on every top-level
 * declaration (see the module comment), and a note on namespaces re-exported from experimental
 * packages.
 *
 * @param experimentalPackages - Names of the workspace packages that are experimental by default.
 */
export function finishReport(
  report: string,
  pkg: ReportPackage,
  experimentalPackages: ReadonlySet<string>,
): string {
  const lines = sortReportUnions(report.replace(/\r\n?/g, '\n')).split('\n');
  const experimentalNamespaces = new Set<string>();
  for (const line of lines) {
    const match = NAMESPACE_IMPORT.exec(line);
    if (match && experimentalPackages.has(match[2]!)) experimentalNamespaces.add(match[1]!);
  }

  const out: string[] = [];
  for (const [i, line] of lines.entries()) {
    const synopsis = PUBLIC_SYNOPSIS.exec(line);
    if (synopsis) {
      const indent = synopsis[1]!;
      const rest = synopsis[2]!;
      const name = indent === '' ? declaredName(lines, i) : undefined;
      if (/(^| )@experimental\b/.test(rest)) {
        // Tagged `@experimental`: API Extractor's `@public` only says it has no release tag.
        out.push(`${indent}// ${rest}`);
      } else if (
        pkg.stability === 'experimental' &&
        indent === '' &&
        !(name !== undefined && pkg.publicNames.has(name))
      ) {
        out.push(`// @experimental${rest ? ` ${rest}` : ''}`);
      } else {
        out.push(line);
      }
      continue;
    }

    const exported = /^export \{ (\w+) \}$/.exec(line);
    if (exported && experimentalNamespaces.has(exported[1]!)) {
      out.push('// @experimental (every export of the package, unless marked @public there)');
    }
    out.push(line);
    if (DO_NOT_EDIT.test(line)) out.push('>', ...headerNote(pkg));
  }
  return `${out.join('\n').trimEnd()}\n`;
}
