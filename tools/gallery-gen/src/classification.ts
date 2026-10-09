/** Node-only source inspection. Classification lives in the browser-safe shared registry. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import {
  classifyExample,
  type ClassificationInput,
  type ExampleClassification,
} from '../../../examples/_lib/catalog.ts';

export function sourceHints(
  source: string,
): Pick<ClassificationInput, 'modes' | 'filled' | 'dependencies' | 'api'> {
  const sf = ts.createSourceFile('example.ts', source, ts.ScriptTarget.Latest, true);
  const modes = new Set<string>();
  const dependencies = new Set<string>();
  let filled = false;
  let api: 'express' | 'figure' = 'figure';
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const name = node.moduleSpecifier.text;
      if (name === '@mk7s/holochart-express') api = 'express';
      if (
        name === '@mk7s/holochart' &&
        node.importClause?.namedBindings &&
        ts.isNamedImports(node.importClause.namedBindings) &&
        node.importClause.namedBindings.elements.some((e) =>
          ['strip', 'gantt', 'ecdf', 'distplot'].includes(e.propertyName?.text ?? e.name.text),
        )
      )
        api = 'express';
      if (!name.startsWith('.') && !name.startsWith('/')) {
        dependencies.add(
          name.startsWith('@') ? name.split('/').slice(0, 2).join('/') : name.split('/')[0]!,
        );
      }
    }
    if (ts.isPropertyAssignment(node)) {
      const key = ts.isIdentifier(node.name) || ts.isStringLiteral(node.name) ? node.name.text : '';
      if (ts.isStringLiteral(node.initializer)) {
        if (key === 'mode') modes.add(node.initializer.text);
        if (key === 'fill' && node.initializer.text !== 'none') filled = true;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { modes: [...modes].sort(), filled, dependencies: [...dependencies].sort(), api };
}

/** Metadata generation does not render charts or modify thumbnail bytes. */
export function classificationFor(
  input: ClassificationInput,
  examplesDir: string,
): ExampleClassification {
  const source = readFileSync(path.join(examplesDir, `${input.id}.ts`), 'utf8');
  return classifyExample({ ...input, ...sourceHints(source) });
}
