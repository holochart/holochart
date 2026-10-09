/** Capture actual deterministic figure inputs without importing a browser runtime or generated files. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

export async function captureCookbookFigure<T>(root: string, id: string): Promise<T> {
  const figures: unknown[] = [];
  const api = {
    createChart(_el: unknown, figure: unknown) {
      figures.push(figure);
      return { ready: Promise.resolve(), three: { renderer: {} }, destroy() {} };
    },
    componentsReady: () => Promise.resolve(),
  };
  const cache = new Map<string, Record<string, unknown>>();
  function load(file: string): Record<string, unknown> {
    if (cache.has(file)) return cache.get(file)!;
    const source = readFileSync(file, 'utf8');
    const output = ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText;
    const module = { exports: {} as Record<string, unknown> };
    cache.set(file, module.exports);
    vm.runInNewContext(
      output,
      {
        module,
        exports: module.exports,
        require: (name: string) => {
          if (name === '@mk7s/holochart') return api;
          if (name.startsWith('.')) return load(path.resolve(path.dirname(file), name));
          throw new Error(`Cookbook source ${id} added an uncaptured dependency: ${name}.`);
        },
      },
      { filename: file },
    );
    return module.exports;
  }
  const example = load(path.join(root, `examples/${id}.ts`)) as unknown as {
    run(el: object): { ready: Promise<unknown>; dispose(): void };
  };
  const handle = example.run({});
  await handle.ready;
  handle.dispose();
  if (figures.length !== 1)
    throw new Error(`Cookbook ${id} must render one complete initial figure.`);
  return figures[0] as T;
}
