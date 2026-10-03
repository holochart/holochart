/**
 * Refreshes the vendored copy of plotly.js' attribute schema that the compatibility table is
 * generated from (`plotly-schema.jsonl`, next to this file). Run it by hand when the comparison
 * should move to a newer plotly.js:
 *
 *   curl -L -o /tmp/plot-schema.json https://cdn.jsdelivr.net/npm/plotly.js@<version>/dist/plot-schema.json
 *   node apps/docs/scripts/plotly-compat/reduce-plotly-schema.ts /tmp/plot-schema.json <version>
 *
 * plotly.js' `dist/plot-schema.json` is about 4 MB, most of it descriptions. Only attribute names,
 * value types and enumeration values are kept (see `schema-tree.ts`), which is what the table
 * compares, and containers that repeat across trace types are stored once. The file is JSON Lines
 * (see `plotly-schema.ts` for the records), so a plotly.js upgrade diffs by trace type.
 * plotly.js is MIT licensed; its copyright and permission notice are the file's first record.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { PLOTLY_SCHEMA_FILE, type PlotlySchemaRecord } from './plotly-schema.ts';
import { compactAttributes, pack, type Branch } from './schema-tree.ts';

const LICENSE = [
  'MIT License',
  'Copyright (c) 2016-2024 Plotly Technologies Inc.',
  'Permission is hereby granted, free of charge, to any person obtaining a copy of this software ' +
    'and associated documentation files (the "Software"), to deal in the Software without ' +
    'restriction, including without limitation the rights to use, copy, modify, merge, publish, ' +
    'distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the ' +
    'Software is furnished to do so, subject to the following conditions:',
  'The above copyright notice and this permission notice shall be included in all copies or ' +
    'substantial portions of the Software.',
  'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING ' +
    'BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND ' +
    'NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, ' +
    'DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING ' +
    'FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.',
];

type Json = Record<string, unknown>;

const [input, version] = process.argv.slice(2);
if (!input || !version) {
  console.error('usage: reduce-plotly-schema.ts <plot-schema.json> <plotly.js version>');
  process.exit(1);
}

const full = JSON.parse(await readFile(input, 'utf8')) as {
  traces: Record<string, { attributes: Json; layoutAttributes?: Json }>;
  layout: { layoutAttributes: Json };
  config: Json;
};

// Every tree of the file, packed together so that shared containers are found across all of them.
const names: { record: 'trace' | 'layout' | 'config'; type?: string; part?: 'layout' }[] = [];
const trees: Branch[] = [];
for (const type of Object.keys(full.traces).sort()) {
  const trace = full.traces[type];
  if (!trace) continue;
  names.push({ record: 'trace', type });
  trees.push(compactAttributes(trace.attributes));
  const layout = compactAttributes(trace.layoutAttributes);
  if (Object.keys(layout).length > 0) {
    names.push({ record: 'trace', type, part: 'layout' });
    trees.push(layout);
  }
}
names.push({ record: 'layout' }, { record: 'config' });
trees.push(compactAttributes(full.layout.layoutAttributes), compactAttributes(full.config));

const packed = pack(trees);
const records: PlotlySchemaRecord[] = [
  {
    record: 'source',
    name: 'plotly.js',
    version,
    file: 'dist/plot-schema.json',
    url: `https://cdn.jsdelivr.net/npm/plotly.js@${version}/dist/plot-schema.json`,
    reducedBy: 'apps/docs/scripts/plotly-compat/reduce-plotly-schema.ts',
    license: LICENSE,
  },
  { record: 'defs', defs: packed.defs },
];
names.forEach((name, i) => {
  const tree = packed.trees[i];
  if (name.record === 'trace' && name.part === 'layout') {
    const trace = records.find((r) => r.record === 'trace' && r.type === name.type);
    if (trace?.record === 'trace') trace.layout = tree;
  } else if (name.record === 'trace') {
    records.push({ record: 'trace', type: name.type ?? '', attributes: tree });
  } else {
    records.push({ record: name.record, attributes: tree });
  }
});

await writeFile(PLOTLY_SCHEMA_FILE, records.map((r) => `${JSON.stringify(r)}\n`).join(''));
console.log(
  `wrote ${PLOTLY_SCHEMA_FILE}: plotly.js ${version}, ` +
    `${records.filter((r) => r.record === 'trace').length} trace types, ` +
    `${packed.defs.length} shared containers`,
);
