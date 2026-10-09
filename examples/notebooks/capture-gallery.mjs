/** Read deterministic figure arguments from selected browser examples without rendering them. */
import fs from 'node:fs';
import { captureDifference } from './compare-captures.ts';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import ts from 'typescript';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const groups = {
  widgets: ['bar/basic'],
  'graph-objects': ['line/with-bars'],
  'heatmap-field': ['heatmap/basic'],
  histogram: ['histogram/notebook-starter'],
  'comparison-bars': ['bar/horizontal', 'bar/stacked', 'bar/relative', 'bar/text'],
  'time-series-gaps': ['line/gaps', 'line/step', 'line/dashes'],
  'distribution-starters': [
    'box/precomputed',
    'box/horizontal',
    'violin/basic',
    'histogram/cumulative',
  ],
  'subplot-layouts': ['layout/grid-independent', 'layout/grid-coupled'],
  'themes-labels': ['themes/plotly_white', 'themes/high-contrast', 'scatter/text-labels'],
  'spatial-starters': ['scatter3d/basic', 'surface/basic'],
  'data-troubleshooting': ['heatmap/uneven', 'scatter/error-bars'],
};
async function capture(id) {
  const files = new Map();
  const figures = [];
  const api = {
    createChart(_el, figure) {
      figures.push(figure);
      return {
        ready: Promise.resolve(),
        three: { renderer: {} },
        on: () => () => {},
        destroy() {},
      };
    },
    componentsReady: () => Promise.resolve(),
    render: { preloadTextFont: () => Promise.resolve() },
  };
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const source = fs.readFileSync(file, 'utf8');
    files.set(path.relative(root, file), crypto.createHash('sha256').update(source).digest('hex'));
    const output = ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText;
    const module = { exports: {} };
    cache.set(file, module.exports);
    function requireLocal(name) {
      if (name === '@mk7s/holochart') return api;
      if (name.startsWith('.')) return load(path.resolve(path.dirname(file), name));
      throw new Error(`${id}: unsupported import ${name}`);
    }
    vm.runInNewContext(
      output,
      {
        module,
        exports: module.exports,
        require: requireLocal,
        console,
        performance,
        setTimeout: (fn) => {
          queueMicrotask(fn);
          return 0;
        },
        clearTimeout() {},
        window: {
          setTimeout: (fn) => {
            queueMicrotask(fn);
            return 0;
          },
          clearTimeout() {},
        },
      },
      { filename: file },
    );
    return module.exports;
  }
  const example = load(path.join(root, `examples/${id}.ts`));
  const handle = example.run({});
  await handle.ready;
  if (figures.length !== 1)
    throw new Error(`${id}: expected one synchronous initial figure, got ${figures.length}`);
  const encoded = JSON.stringify(figures[0], (_key, value) => {
    if (typeof value === 'function')
      throw new Error(`${id}: callback inputs need a handwritten Python counterpart`);
    return ArrayBuffer.isView(value) ? Array.from(value) : value;
  });
  return {
    id,
    meta: example.meta,
    figure: JSON.parse(encoded),
    sourceHashes: Object.fromEntries(files),
  };
}
async function main() {
  const result = [];
  for (const [slug, ids] of Object.entries(groups))
    result.push({ slug, examples: await Promise.all(ids.map(capture)) });
  if (process.argv.includes('--check')) {
    const canonical = JSON.parse(fs.readFileSync(path.join(here, 'gallery-captures.json'), 'utf8'));
    const difference = captureDifference(canonical, result);
    if (difference)
      throw new Error(
        `Browser source/figure drift at ${difference}: refresh captures and Python canonical figures, then repeat kernel and notebook-host checks.`,
      );
    console.log('Verified 24 deterministic browser figure captures and source dependency hashes.');
  } else
    fs.writeFileSync(
      path.join(here, 'gallery-captures.json'),
      JSON.stringify(result, null, 2) + '\n',
    );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
