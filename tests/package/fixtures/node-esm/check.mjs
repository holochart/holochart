// Node ESM consumer of the installed tarballs (no DOM, no bundler): every package imports, the
// full bundle has its key exports, its `geo` and `graph` entries add the geo and graph packages,
// and the renderer-free figure pipeline runs.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as hc from '@mk7s/holochart';

const pkg = JSON.parse(readFileSync(new URL('package.json', import.meta.url), 'utf8'));

// Every installed @mk7s package imports on its own and exports something.
for (const name of Object.keys(pkg.dependencies).filter((n) => n.startsWith('@mk7s/'))) {
  const mod = await import(name);
  assert.ok(Object.keys(mod).length > 0, `${name} has no exports`);
}

// Key exports of the full bundle.
for (const name of [
  'createChart',
  'newPlot',
  'react',
  'relayout',
  'restyle',
  'purge',
  'register',
  'supplyDefaults',
  'validate',
  'createRegistry',
  'toImage',
]) {
  assert.equal(typeof hc[name], 'function', `@mk7s/holochart: ${name}`);
}
assert.equal(typeof hc.express?.scatter, 'function', 'express.scatter');
assert.equal(typeof hc.themes, 'object', 'themes');
assert.ok(Array.isArray(hc.traces3d) && hc.traces3d.length > 0, 'traces3d');
assert.ok(Array.isArray(hc.builtins) && hc.builtins.length > 0, 'builtins');

// The full bundle registered the built-ins into the shared registry, 2D and 3D.
const listing = hc.registry.list();
const traces = listing.traces.map((t) => t.type);
for (const type of ['scatter', 'bar', 'heatmap', 'candlestick', 'sunburst', 'scatter3d']) {
  assert.ok(traces.includes(type), `registered trace ${type}`);
}

// Maps are not in the full bundle (ADR-026): its `geo` entry registers the geo package into the
// same registry, and re-exports it.
assert.ok(!traces.includes('scattergeo'), 'the full bundle alone registers no scattergeo');
const geo = await import('@mk7s/holochart/geo');
const geoPackage = await import('@mk7s/holochart-traces-geo');
assert.equal(geo.tracesGeo, geoPackage.tracesGeo, '@mk7s/holochart/geo re-exports the package');
assert.ok(hc.registry.getTrace('scattergeo'), '@mk7s/holochart/geo registers scattergeo');

// Nor are network graphs (ADR-029): the `graph` entry does the same for the graph package.
assert.ok(!traces.includes('graph'), 'the full bundle alone registers no graph');
const graph = await import('@mk7s/holochart/graph');
const graphPackage = await import('@mk7s/holochart-traces-graph');
assert.equal(
  graph.tracesGraph,
  graphPackage.tracesGraph,
  '@mk7s/holochart/graph re-exports the package',
);
assert.equal(
  hc.registry.getTrace('graph'),
  graphPackage.graph,
  '@mk7s/holochart/graph registers graph',
);

// The figure pipeline (core, on the registry's core part) runs in Node.
const core = hc.registry.core;
const figure = {
  data: [{ type: 'scatter', x: [1, 2, 3], y: [2, 1, 3] }],
  layout: { width: 320, height: 200, title: { text: 'Node' } },
};
assert.deepEqual(hc.validate(figure.data, figure.layout, core), []);
const { fullData, fullLayout } = hc.supplyDefaults(figure, core);
assert.equal(fullData[0].type, 'scatter');
assert.equal(fullLayout.width, 320);

console.log(`node-esm: ok (${traces.length} trace types registered)`);
