// GEO1 (backlog.md, "epic: geographic charts"): sizes of the candidate dependencies and basemap data
// for the geo package, measured the way `pnpm size` measures Holochart's own bundles
// (tests/bundle/size/bundle.ts): bundled with rolldown, tree-shaken, minified, then gzip level 9.
// The results are recorded in docs/release/bundle-size.md ("Geo candidates, measured for GEO1").
//
// Usage (from the repo root; no build needed, nothing is written unless --out is given):
//   node docs/spikes/scripts/geo-sizes.mjs
//   node docs/spikes/scripts/geo-sizes.mjs --out /tmp/geo-sizes            # + results.json
//   node docs/spikes/scripts/geo-sizes.mjs --out /tmp/geo-sizes --plotly   # + Plotly's topojson
//
// Options: --out <dir>  write results.json (every number below, unrounded) into this directory.
//          --plotly     also measure Plotly's own topojson files. Downloads them from cdn.plot.ly
//                       into <out>/plotly/ (needs --out; files already there are reused).
//          --timing     also time evaluating the basemap data as an object literal and as
//                       `JSON.parse` of a string (indicative only: this machine, this V8).
//
// What it reads: d3-geo, d3-geo-projection, topojson-client, world-atlas (Natural Earth as
// TopoJSON) and maplibre-gl from examples/node_modules (devDependencies of the `examples`
// workspace package), and the d3 imports of packages/*/src for the baseline.
//
// "Marginal" is what an entry adds to a bundle that already holds the d3 code Holochart ships: the
// bundle of (Holochart's d3 imports + the entry) minus the bundle of Holochart's d3 imports alone.
// Sizes are decimal kB (1 kB = 1000 bytes), like size-limit.
import { Buffer } from 'node:buffer';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { brotliCompressSync, constants as zlib, gzipSync } from 'node:zlib';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const EXAMPLES = path.join(ROOT, 'examples');
const CORE = path.join(ROOT, 'packages/core');

const { values: args } = parseArgs({
  options: {
    out: { type: 'string' },
    plotly: { type: 'boolean', default: false },
    timing: { type: 'boolean', default: false },
  },
});
const OUT = args.out ? path.resolve(args.out) : undefined;
if (args.plotly && !OUT) {
  console.error('--plotly needs --out <dir> (the files are downloaded into <dir>/plotly/)');
  process.exit(2);
}

// ---------------------------------------------------------------------------------------------
// What is measured

/** The "first step" of GEO2: five projections and the spherical math, without `geoPath`. */
const FIRST_STEP = [
  'geoEquirectangular',
  'geoMercator',
  'geoNaturalEarth1',
  'geoOrthographic',
  'geoAlbersUsa',
  'geoGraticule',
  'geoInterpolate',
  'geoDistance',
  'geoArea',
  'geoCentroid',
  'geoBounds',
  'geoContains',
  'geoStream',
  'geoCircle',
];

/**
 * `layout.geo.projection.type` of plotly.js 4.1.1: the keys of `projNames` in
 * src/plots/geo/constants.js (the schema's enum is `sortObjectKeys(constants.projNames)`), each
 * with the d3 name Plotly maps it to. Plotly bundles d3-geo 1 and d3-geo-projection 2, where
 * `naturalEarth` was an alias of `naturalEarth1`; `winkel tripel` and `winkel3` are one projection.
 */
const PLOTLY_PROJECTIONS = {
  airy: 'airy',
  aitoff: 'aitoff',
  'albers usa': 'albersUsa',
  albers: 'albers',
  august: 'august',
  'azimuthal equal area': 'azimuthalEqualArea',
  'azimuthal equidistant': 'azimuthalEquidistant',
  baker: 'baker',
  bertin1953: 'bertin1953',
  boggs: 'boggs',
  bonne: 'bonne',
  bottomley: 'bottomley',
  bromley: 'bromley',
  collignon: 'collignon',
  'conic conformal': 'conicConformal',
  'conic equal area': 'conicEqualArea',
  'conic equidistant': 'conicEquidistant',
  craig: 'craig',
  craster: 'craster',
  'cylindrical equal area': 'cylindricalEqualArea',
  'cylindrical stereographic': 'cylindricalStereographic',
  eckert1: 'eckert1',
  eckert2: 'eckert2',
  eckert3: 'eckert3',
  eckert4: 'eckert4',
  eckert5: 'eckert5',
  eckert6: 'eckert6',
  eisenlohr: 'eisenlohr',
  'equal earth': 'equalEarth',
  equirectangular: 'equirectangular',
  fahey: 'fahey',
  'foucaut sinusoidal': 'foucautSinusoidal',
  foucaut: 'foucaut',
  ginzburg4: 'ginzburg4',
  ginzburg5: 'ginzburg5',
  ginzburg6: 'ginzburg6',
  ginzburg8: 'ginzburg8',
  ginzburg9: 'ginzburg9',
  gnomonic: 'gnomonic',
  'gringorten quincuncial': 'gringortenQuincuncial',
  gringorten: 'gringorten',
  guyou: 'guyou',
  hammer: 'hammer',
  hill: 'hill',
  homolosine: 'homolosine',
  hufnagel: 'hufnagel',
  hyperelliptical: 'hyperelliptical',
  kavrayskiy7: 'kavrayskiy7',
  lagrange: 'lagrange',
  larrivee: 'larrivee',
  laskowski: 'laskowski',
  loximuthal: 'loximuthal',
  mercator: 'mercator',
  miller: 'miller',
  mollweide: 'mollweide',
  'mt flat polar parabolic': 'mtFlatPolarParabolic',
  'mt flat polar quartic': 'mtFlatPolarQuartic',
  'mt flat polar sinusoidal': 'mtFlatPolarSinusoidal',
  'natural earth': 'naturalEarth',
  'natural earth1': 'naturalEarth1',
  'natural earth2': 'naturalEarth2',
  'nell hammer': 'nellHammer',
  nicolosi: 'nicolosi',
  orthographic: 'orthographic',
  patterson: 'patterson',
  'peirce quincuncial': 'peirceQuincuncial',
  polyconic: 'polyconic',
  'rectangular polyconic': 'rectangularPolyconic',
  robinson: 'robinson',
  satellite: 'satellite',
  'sinu mollweide': 'sinuMollweide',
  sinusoidal: 'sinusoidal',
  stereographic: 'stereographic',
  times: 'times',
  'transverse mercator': 'transverseMercator',
  'van der grinten': 'vanDerGrinten',
  'van der grinten2': 'vanDerGrinten2',
  'van der grinten3': 'vanDerGrinten3',
  'van der grinten4': 'vanDerGrinten4',
  wagner4: 'wagner4',
  wagner6: 'wagner6',
  wiechel: 'wiechel',
  'winkel tripel': 'winkel3',
  winkel3: 'winkel3',
};
/** d3 names that changed between the d3-geo Plotly bundles and d3-geo 3. */
const D3_RENAMED = { naturalEarth: 'naturalEarth1' };

/** Plotly 1.x's projections that are not in d3-geo: the set most figures in the wild use. */
const CLASSIC_NINE = [
  'kavrayskiy7',
  'miller',
  'robinson',
  'eckert4',
  'mollweide',
  'hammer',
  'winkel tripel',
  'aitoff',
  'sinusoidal',
];

const ATLAS_FILES = ['countries-110m', 'land-110m', 'countries-50m', 'land-50m'];
/** world-atlas is quantized to 1e5 steps (0.0036°); Plotly's older topojson to 1e4 (0.036°). */
const COARSE_GRID = 1e4;

/** Plotly's topojson: the default `topojsonURL` of plotly.js 4 (`un/`) and the one before it. */
const PLOTLY_SETS = {
  un: 'https://cdn.plot.ly/un/',
  legacy: 'https://cdn.plot.ly/',
};
const PLOTLY_SCOPES = [
  'world',
  'usa',
  'africa',
  'asia',
  'europe',
  'north-america',
  'south-america',
  'antarctica',
  'oceania',
];

// ---------------------------------------------------------------------------------------------
// Bundling and measuring

/** Loads the rolldown that Vite (a root devDependency) depends on, as tests/bundle/size does. */
async function loadRolldown() {
  const vite = realpathSync(fileURLToPath(import.meta.resolve('vite')));
  const rolldownPath = createRequire(vite).resolve('rolldown');
  return import(pathToFileURL(rolldownPath).href);
}

/** The file an app bundler resolves `name` to (its ESM entry), from `from`'s node_modules. */
function esmEntry(name, from = EXAMPLES) {
  const dir = path.join(from, 'node_modules', name);
  const pkg = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
  const root = pkg.exports?.['.'] ?? pkg.exports;
  const file = pkg.module ?? root?.import ?? root?.default ?? pkg.main;
  if (typeof file !== 'string') throw new Error(`${name}: no ESM entry in package.json`);
  return { dir, file: path.join(dir, file), version: pkg.version, license: pkg.license };
}

const sizes = (data) => {
  const buf = typeof data === 'string' ? Buffer.from(data) : data;
  return {
    bytes: buf.length,
    gzip: gzipSync(buf, { level: 9 }).length,
    brotli: brotliCompressSync(buf, {
      params: { [zlib.BROTLI_PARAM_QUALITY]: 11, [zlib.BROTLI_PARAM_SIZE_HINT]: buf.length },
    }).length,
  };
};
const minus = (a, b) => ({
  bytes: a.bytes - b.bytes,
  gzip: a.gzip - b.gzip,
  brotli: a.brotli - b.brotli,
});
const plus = (...xs) =>
  xs.reduce((a, b) => ({
    bytes: a.bytes + b.bytes,
    gzip: a.gzip + b.gzip,
    brotli: a.brotli + b.brotli,
  }));

const VIRTUAL = '\0geo-size-entry';
const cache = new Map();

/**
 * Bundles `source` (ESM text with absolute import paths), minified; every chunk is counted. With
 * `{ file }` the entry is that file itself, as for a worker script, which is an entry of its own.
 */
async function measure(rd, source) {
  const key = typeof source === 'string' ? source : `file:${source.file}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const build = await rd.rolldown({
    input: typeof source === 'string' ? VIRTUAL : source.file,
    platform: 'browser',
    external: /^three($|\/)/,
    logLevel: 'warn',
    plugins: [
      {
        name: 'geo-size-entry',
        resolveId: (id) => (id === VIRTUAL ? id : null),
        load: (id) => (id === VIRTUAL ? source : null),
      },
    ],
  });
  try {
    const { output } = await build.generate({ format: 'es', minify: true });
    const chunks = output.filter((c) => c.type === 'chunk');
    const code = chunks.map((c) => c.code).join('\n');
    const packages = new Set();
    for (const id of chunks.flatMap((c) => c.moduleIds ?? [])) {
      const nm = /node_modules\/((?:@[^/]+\/)?[^/]+)\/(?!.*node_modules\/)/.exec(id);
      if (nm?.[1]) packages.add(nm[1]);
    }
    const result = { ...sizes(code), packages: [...packages].sort(), code };
    cache.set(key, result);
    return result;
  } finally {
    await build.close();
  }
}

const named = (names, file) => `export { ${names.join(', ')} } from ${JSON.stringify(file)};`;
const whole = (file) => `export * from ${JSON.stringify(file)};`;

/**
 * Holochart's own d3 imports, as one entry: every value import of a `d3-*` module in
 * packages/<name>/src (tests excluded), re-exported under an alias. This is the d3 code a
 * Holochart bundle already contains, so it is the baseline of the marginal sizes.
 */
function holochartD3Baseline() {
  const imports = new Map();
  const packagesDir = path.join(ROOT, 'packages');
  for (const pkg of readdirSync(packagesDir)) {
    const src = path.join(packagesDir, pkg, 'src');
    if (!existsSync(src)) continue;
    for (const rel of readdirSync(src, { recursive: true })) {
      if (!/\.ts$/.test(rel) || /\.(test|d)\.ts$/.test(rel)) continue;
      const text = readFileSync(path.join(src, rel), 'utf8');
      for (const m of text.matchAll(/import\s*\{([^}]*)\}\s*from\s*'(d3-[a-z-]+)'/g)) {
        const names = imports.get(m[2]) ?? new Set();
        for (const spec of m[1].split(',')) {
          const name = spec.trim().split(/\s+as\s+/)[0];
          if (name && !name.startsWith('type ')) names.add(name);
        }
        imports.set(m[2], names);
      }
    }
  }
  const lines = [];
  const list = [];
  for (const [mod, names] of [...imports].sort()) {
    const sorted = [...names].sort();
    const file = esmEntry(mod, CORE).file;
    const aliased = sorted.map((n) => `${n} as holochart_${mod.replaceAll('-', '_')}_${n}`);
    lines.push(named(aliased, file));
    list.push(`${mod}: ${sorted.join(', ')}`);
  }
  return { source: lines.join('\n'), list };
}

// ---------------------------------------------------------------------------------------------
// Basemap geometry

/** Polygons, rings, lines and vertices of a GeoJSON geometry, as decoded (rings are closed). */
function countGeometry(geometry, into) {
  if (!geometry) return into;
  switch (geometry.type) {
    case 'Point':
      into.vertices += 1;
      break;
    case 'MultiPoint':
      into.vertices += geometry.coordinates.length;
      break;
    case 'LineString':
      into.lines += 1;
      into.vertices += geometry.coordinates.length;
      break;
    case 'MultiLineString':
      into.lines += geometry.coordinates.length;
      for (const line of geometry.coordinates) into.vertices += line.length;
      break;
    case 'Polygon':
      into.polygons += 1;
      into.rings += geometry.coordinates.length;
      for (const ring of geometry.coordinates) into.vertices += ring.length;
      break;
    case 'MultiPolygon':
      into.polygons += geometry.coordinates.length;
      for (const polygon of geometry.coordinates) {
        into.rings += polygon.length;
        for (const ring of polygon) into.vertices += ring.length;
      }
      break;
    case 'GeometryCollection':
      for (const g of geometry.geometries) countGeometry(g, into);
      break;
    default:
      throw new Error(`unknown geometry type ${geometry.type}`);
  }
  return into;
}
const emptyCount = () => ({ features: 0, polygons: 0, rings: 0, lines: 0, vertices: 0 });

/** Decodes every object of a topology with topojson-client and counts what comes out. */
function topologyStats(topojson, topology) {
  const objects = {};
  for (const [name, object] of Object.entries(topology.objects)) {
    const decoded = topojson.feature(topology, object);
    const features = decoded.type === 'FeatureCollection' ? decoded.features : [decoded];
    const count = emptyCount();
    count.features = features.length;
    for (const f of features) countGeometry(f.geometry, count);
    objects[name] = count;
  }
  let arcPoints = 0;
  for (const arc of topology.arcs) arcPoints += arc.length;
  // Quantization: the longitude step of the grid the coordinates are rounded to, in degrees.
  const lonStep = topology.transform ? Number(topology.transform.scale[0].toPrecision(3)) : 0;
  return { arcs: topology.arcs.length, arcPoints, lonStep, objects };
}

/**
 * The same topology rounded to a coarser grid of `n` × `n` steps over its bounding box.
 * topojson-client's `quantize` refuses an already quantized topology, so the arcs are decoded to
 * absolute coordinates first. Points that fall on the same grid cell as their predecessor drop out.
 */
function requantize(topojson, topology, n) {
  const toAbsolute = topojson.transform(topology.transform);
  const arcs = topology.arcs.map((arc) => arc.map((point, i) => toAbsolute(point, i)));
  const { transform: _quantized, ...rest } = topology;
  return topojson.quantize({ ...rest, arcs }, n);
}

/** The layers one `countries` + `land` topology can serve beyond its two polygon objects. */
function derivedLayers(topojson, topology) {
  const { countries, land } = topology.objects;
  const line = (mesh) => countGeometry(mesh, emptyCount());
  const out = {};
  if (land) out.coastlines = line(topojson.mesh(topology, land));
  if (countries) {
    out.borders = line(topojson.mesh(topology, countries, (a, b) => a !== b));
    out.countryOutlines = line(topojson.mesh(topology, countries));
    out.mergedLand = countGeometry(topojson.merge(topology, countries.geometries), emptyCount());
  }
  return out;
}

/** A topology with only the objects `names` and the arcs they use: what those layers cost. */
function subTopology(topology, names) {
  const renumbered = new Map();
  const arcs = [];
  const remap = (index) => {
    const old = index < 0 ? ~index : index;
    let fresh = renumbered.get(old);
    if (fresh === undefined) {
      fresh = arcs.length;
      renumbered.set(old, fresh);
      arcs.push(topology.arcs[old]);
    }
    return index < 0 ? ~fresh : fresh;
  };
  const mapArcs = (x) => (Array.isArray(x) ? x.map(mapArcs) : remap(x));
  const mapGeometry = (g) => {
    if (g.type === 'GeometryCollection') return { ...g, geometries: g.geometries.map(mapGeometry) };
    return g.arcs ? { ...g, arcs: mapArcs(g.arcs) } : g;
  };
  const objects = Object.fromEntries(names.map((n) => [n, mapGeometry(topology.objects[n])]));
  return { ...topology, objects, arcs };
}

/** Median wall time in ms of `fn` over `runs` runs. */
function median(runs, fn) {
  const times = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    fn(i);
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(times.length / 2)];
}

// ---------------------------------------------------------------------------------------------
// Output

const kB = (bytes) => `${(bytes / 1000).toFixed(2)} kB`;
const row = (cells) => `| ${cells.join(' | ')} |`;
function table(head, rows) {
  console.log(row(head));
  console.log(row(head.map(() => '---')));
  for (const r of rows) console.log(row(r));
  console.log('');
}
const triple = (s) => [kB(s.bytes), kB(s.gzip), kB(s.brotli)];

// ---------------------------------------------------------------------------------------------

async function main() {
  const rd = await loadRolldown();
  const results = {};

  const geo = esmEntry('d3-geo');
  const geoProjection = esmEntry('d3-geo-projection');
  const topo = esmEntry('topojson-client');
  const maplibre = esmEntry('maplibre-gl');
  const atlasDir = path.join(EXAMPLES, 'node_modules/world-atlas');
  const atlasVersion = JSON.parse(
    readFileSync(path.join(atlasDir, 'package.json'), 'utf8'),
  ).version;
  results.versions = {
    'd3-geo': geo.version,
    'd3-geo-projection': geoProjection.version,
    'topojson-client': topo.version,
    'world-atlas': atlasVersion,
    'maplibre-gl': maplibre.version,
    node: process.version,
    rolldown: rd.VERSION,
  };
  console.log(
    `Versions: ${Object.entries(results.versions)
      .map(([k, v]) => `${k} ${v}`)
      .join(', ')}\n`,
  );

  // --- Baseline: the d3 code Holochart already ships -----------------------------------------
  const baseline = holochartD3Baseline();
  const base = await measure(rd, baseline.source);
  const marginal = async (source) =>
    minus(await measure(rd, `${baseline.source}\n${source}`), base);
  results.baseline = { imports: baseline.list, packages: base.packages, ...sizes(base.code) };
  console.log(`Holochart's d3 imports (the baseline): ${baseline.list.join('; ')}`);
  console.log(`  ${triple(base).join(' / ')} (min / gzip / brotli); ${base.packages.join(', ')}\n`);

  // --- Plotly's projections, split by where d3 has them --------------------------------------
  const geoExports = new Set(Object.keys(await import(pathToFileURL(geo.file).href)));
  const projExports = new Set(Object.keys(await import(pathToFileURL(geoProjection.file).href)));
  const fnOf = (d3Name) => {
    const name = D3_RENAMED[d3Name] ?? d3Name;
    return `geo${name[0].toUpperCase()}${name.slice(1)}`;
  };
  const inGeo = new Map(); // d3 function → Plotly names
  const inProjection = new Map();
  const missing = [];
  for (const [plotlyName, d3Name] of Object.entries(PLOTLY_PROJECTIONS)) {
    const fn = fnOf(d3Name);
    const target = geoExports.has(fn) ? inGeo : projExports.has(fn) ? inProjection : undefined;
    if (!target) missing.push(plotlyName);
    else target.set(fn, [...(target.get(fn) ?? []), plotlyName]);
  }
  results.plotlyProjections = {
    enumLength: Object.keys(PLOTLY_PROJECTIONS).length,
    inD3Geo: Object.fromEntries(inGeo),
    inD3GeoProjection: Object.fromEntries(inProjection),
    missing,
  };

  // --- 1. d3-geo -------------------------------------------------------------------------------
  const allGeo = [...new Set([...FIRST_STEP, ...inGeo.keys()])];
  const classicFns = CLASSIC_NINE.map((n) => fnOf(PLOTLY_PROJECTIONS[n]));
  const allProjFns = [...inProjection.keys()];
  const firstStep = named(FIRST_STEP, geo.file);
  const everyGeo = named(allGeo, geo.file);
  const topoSubset = named(['feature', 'mesh'], topo.file);
  // d3-array is d3-geo's own dependency: resolve it from d3-geo's real location (pnpm layout).
  const d3Array = esmEntry('d3-array', path.resolve(realpathSync(geo.dir), '../..'));

  const code = [
    [
      'd3-array: what d3-geo uses (Adder, merge, range)',
      named(['Adder', 'merge', 'range'], d3Array.file),
    ],
    ['d3-geo: whole module', whole(geo.file)],
    ['d3-geo: one projection (geoMercator)', named(['geoMercator'], geo.file)],
    [`d3-geo: first step (${FIRST_STEP.length} exports, no geoPath)`, firstStep],
    ['d3-geo: first step + geoPath', `${firstStep}\n${named(['geoPath'], geo.file)}`],
    [`d3-geo: first step + every Plotly projection d3-geo has (${inGeo.size})`, everyGeo],
    ['d3-geo-projection: whole module (with the d3-geo it needs)', whole(geoProjection.file)],
    [`d3-geo-projection: the classic nine`, named(classicFns, geoProjection.file)],
    [
      `d3-geo-projection: every Plotly projection d3-geo lacks (${allProjFns.length})`,
      named(allProjFns, geoProjection.file),
    ],
    ['topojson-client: whole module', whole(topo.file)],
    ['topojson-client: feature + mesh', topoSubset],
    ['topojson-client: feature + mesh + merge', named(['feature', 'mesh', 'merge'], topo.file)],
  ];
  results.code = [];
  const codeRows = [];
  for (const [name, source] of code) {
    const alone = await measure(rd, source);
    const added = await marginal(source);
    results.code.push({
      name,
      alone: sizes(alone.code),
      marginal: added,
      packages: alone.packages,
    });
    codeRows.push([name, ...triple(alone), kB(added.bytes), kB(added.gzip)]);
  }
  console.log('## Code, alone and marginal over the d3 code Holochart ships\n');
  table(['Entry', 'Min', 'Gzip', 'Brotli', 'Marginal min', 'Marginal gzip'], codeRows);

  // --- 2. d3-geo-projection, over the d3-geo that the geo package would already hold -----------
  const geoBase = await measure(rd, everyGeo);
  const overGeo = async (source) => minus(await measure(rd, `${everyGeo}\n${source}`), geoBase);
  const groups = [
    ['the classic nine', classicFns],
    [`every Plotly projection d3-geo lacks (${allProjFns.length})`, allProjFns],
    ['whole module', undefined],
  ];
  results.projectionGroups = [];
  const groupRows = [];
  for (const [name, fns] of groups) {
    const added = await overGeo(fns ? named(fns, geoProjection.file) : whole(geoProjection.file));
    results.projectionGroups.push({ name, overD3Geo: added });
    groupRows.push([name, ...triple(added)]);
  }
  console.log('## d3-geo-projection, added to "first step + every Plotly projection d3-geo has"\n');
  table(['Added', 'Min', 'Gzip', 'Brotli'], groupRows);

  results.projections = [];
  for (const [fn, plotlyNames] of inProjection) {
    const added = await overGeo(named([fn], geoProjection.file));
    results.projections.push({
      fn,
      plotly: plotlyNames,
      classic: classicFns.includes(fn),
      ...added,
    });
  }
  results.projections.sort((a, b) => b.gzip - a.gzip);
  console.log('## Each d3-geo-projection projection alone, added to the same d3-geo base\n');
  table(
    ['Plotly `projection.type`', 'd3 function', 'Min', 'Gzip'],
    results.projections.map((p) => [
      p.plotly.join(', ') + (p.classic ? ' (classic)' : ''),
      p.fn,
      kB(p.bytes),
      kB(p.gzip),
    ]),
  );
  const gz = results.projections.map((p) => p.gzip).sort((a, b) => a - b);
  console.log(
    `Range: ${kB(gz[0])} to ${kB(gz.at(-1))} gzip, median ${kB(gz[Math.floor(gz.length / 2)])}; ` +
      `sum of the single costs ${kB(gz.reduce((a, b) => a + b, 0))} (shared helpers counted once per projection).\n`,
  );
  console.log(`Plotly's enum has ${results.plotlyProjections.enumLength} names.`);
  const namesOf = (map) => [...map.values()].flat();
  console.log(
    `In d3-geo (${namesOf(inGeo).length} names, ${inGeo.size} projections): ${namesOf(inGeo).join(', ')}`,
  );
  console.log(
    `Need d3-geo-projection (${namesOf(inProjection).length} names, ${inProjection.size} projections): ${namesOf(inProjection).join(', ')}`,
  );
  console.log(`In neither: ${missing.length ? missing.join(', ') : 'none'}\n`);

  // --- 4. Natural Earth (world-atlas) -----------------------------------------------------------
  const topojson = createRequire(path.join(EXAMPLES, 'package.json'))('topojson-client');
  results.data = [];
  const dataRows = [];
  const geometryRows = [];
  const derivedRows = [];
  const coarseRows = [];
  results.requantized = [];
  for (const name of ATLAS_FILES) {
    const file = path.join(atlasDir, `${name}.json`);
    const raw = readFileSync(file);
    const topology = JSON.parse(raw.toString('utf8'));
    const minified = JSON.stringify(topology);
    const literal = await measure(rd, `export default ${minified};`);
    const parsed = await measure(rd, `export default JSON.parse(${JSON.stringify(minified)});`);
    const imported = await measure(
      rd,
      `import data from ${JSON.stringify(file)};\nexport default data;`,
    );
    const stats = topologyStats(topojson, topology);
    const derived = derivedLayers(topojson, topology);
    const entry = {
      name,
      raw: sizes(raw),
      minifiedJson: sizes(minified),
      chunkLiteral: sizes(literal.code),
      chunkJsonParse: sizes(parsed.code),
      chunkJsonImport: sizes(imported.code),
      ...stats,
      derived,
    };
    if (args.timing) {
      // Both forms are evaluated as scripts, as a chunk would be, so the JSON.parse form pays for
      // scanning its string literal too. A unique suffix per run keeps V8's compilation cache out
      // of the measurement.
      const asLiteral = `(${minified})`;
      const asParse = `JSON.parse(${JSON.stringify(minified)})`;
      const evaluate = (code) => (i) => (0, eval)(`${code}//${i}-${Math.random()}`);
      entry.evalLiteralMs = median(15, evaluate(asLiteral));
      entry.evalJsonParseMs = median(15, evaluate(asParse));
      entry.jsonParseMs = median(15, () => JSON.parse(minified));
      entry.decodeMs = median(15, () => {
        for (const object of Object.values(topology.objects)) topojson.feature(topology, object);
      });
    }
    results.data.push(entry);
    dataRows.push([
      `${name}.json`,
      kB(entry.raw.bytes),
      kB(entry.minifiedJson.bytes),
      kB(entry.minifiedJson.gzip),
      kB(entry.minifiedJson.brotli),
      `${kB(entry.chunkLiteral.bytes)} / ${kB(entry.chunkLiteral.gzip)}`,
      `${kB(entry.chunkJsonParse.bytes)} / ${kB(entry.chunkJsonParse.gzip)}`,
      `${kB(entry.chunkJsonImport.bytes)} / ${kB(entry.chunkJsonImport.gzip)}`,
    ]);
    for (const [object, c] of Object.entries(stats.objects)) {
      geometryRows.push([
        name,
        object,
        stats.lonStep,
        stats.arcs,
        stats.arcPoints,
        c.features,
        c.polygons,
        c.rings,
        c.vertices,
      ]);
    }
    for (const [layer, c] of Object.entries(derived)) {
      derivedRows.push([name, layer, c.lines || c.polygons, c.rings || '', c.vertices]);
    }
    // The same file on the coarser grid Plotly's older topojson uses (lossy; for comparison).
    if (topology.objects.countries) {
      const coarse = requantize(topojson, topology, COARSE_GRID);
      const coarseStats = topologyStats(topojson, coarse);
      const coarseEntry = {
        name,
        grid: COARSE_GRID,
        ...sizes(JSON.stringify(coarse)),
        arcPoints: coarseStats.arcPoints,
        objects: coarseStats.objects,
      };
      results.requantized.push(coarseEntry);
      coarseRows.push([
        `${name}.json`,
        ...triple(coarseEntry),
        coarseStats.arcPoints,
        coarseStats.objects.countries.vertices,
        coarseStats.objects.land.vertices,
      ]);
    }
  }
  console.log('## Natural Earth (world-atlas): bytes\n');
  table(
    [
      'File',
      'Raw',
      'Minified JSON',
      'Gzip',
      'Brotli',
      'Chunk, object literal (min / gzip)',
      'Chunk, JSON.parse string (min / gzip)',
      'Chunk, rolldown JSON import (min / gzip)',
    ],
    dataRows,
  );
  console.log('## Natural Earth (world-atlas): geometry after topojson decode\n');
  table(
    [
      'File',
      'Object',
      'Lon step (°)',
      'Arcs',
      'Arc points',
      'Features',
      'Polygons',
      'Rings',
      'Vertices',
    ],
    geometryRows,
  );
  console.log('## Layers derived from one file (mesh and merge)\n');
  table(['File', 'Derived layer', 'Lines or polygons', 'Rings', 'Vertices'], derivedRows);
  console.log(`## The countries files requantized to a grid of ${COARSE_GRID} steps (lossy)\n`);
  table(
    [
      'File',
      'Minified JSON',
      'Gzip',
      'Brotli',
      'Arc points',
      'Countries vertices',
      'Land vertices',
    ],
    coarseRows,
  );
  if (args.timing) {
    console.log('## Evaluating the data (median of 15, ms)\n');
    table(
      [
        'File',
        'Chunk as object literal',
        'Chunk as JSON.parse string',
        'JSON.parse of fetched text',
        'topojson feature() of every object',
      ],
      results.data.map((d) => [
        d.name,
        d.evalLiteralMs.toFixed(2),
        d.evalJsonParseMs.toFixed(2),
        d.jsonParseMs.toFixed(2),
        d.decodeMs.toFixed(2),
      ]),
    );
  }

  // --- 5. Plotly's topojson ---------------------------------------------------------------------
  if (args.plotly) {
    results.plotly = [];
    const rows = [];
    const layerRows = [];
    for (const [set, baseUrl] of Object.entries(PLOTLY_SETS)) {
      const dir = path.join(OUT, 'plotly', set);
      mkdirSync(dir, { recursive: true });
      for (const scope of PLOTLY_SCOPES) {
        for (const resolution of ['110m', '50m']) {
          const fileName = `${scope}_${resolution}.json`;
          const file = path.join(dir, fileName);
          if (!existsSync(file)) {
            try {
              const response = await fetch(baseUrl + fileName);
              if (!response.ok) throw new Error(`HTTP ${response.status}`);
              writeFileSync(file, Buffer.from(await response.arrayBuffer()));
            } catch (error) {
              console.warn(`[plotly] ${baseUrl}${fileName}: ${error.message}; skipped`);
              results.plotly.push({ set, file: fileName, error: error.message });
              continue;
            }
          }
          const raw = readFileSync(file);
          const topology = JSON.parse(raw.toString('utf8'));
          const stats = topologyStats(topojson, topology);
          const s = sizes(raw);
          const record = { set, file: fileName, ...s, ...stats };
          results.plotly.push(record);
          if (scope === 'world') {
            // What each layer costs on its own: the object and the arcs it uses, nothing else.
            record.layers = {};
            for (const [layer, c] of Object.entries(stats.objects)) {
              const alone = sizes(JSON.stringify(subTopology(topology, [layer])));
              record.layers[layer] = alone;
              layerRows.push([
                `${set}/${fileName}`,
                layer,
                c.features,
                c.vertices,
                ...triple(alone),
              ]);
            }
          }
          rows.push([
            `${set}/${fileName}`,
            ...triple(s),
            stats.lonStep,
            stats.arcs,
            Object.entries(stats.objects)
              .map(([n, c]) => `${n} ${c.features}/${c.vertices}`)
              .join(', '),
          ]);
        }
      }
    }
    console.log("## Plotly's topojson (cdn.plot.ly; `un/` is the default of plotly.js 4)\n");
    table(
      ['File', 'Raw', 'Gzip', 'Brotli', 'Lon step (°)', 'Arcs', 'Objects (features/vertices)'],
      rows,
    );
    console.log("## Plotly's world files, one layer at a time (the layer and the arcs it uses)\n");
    table(['File', 'Layer', 'Features', 'Vertices', 'Minified JSON', 'Gzip', 'Brotli'], layerRows);
  }

  // --- 6. maplibre-gl ---------------------------------------------------------------------------
  const dist = path.join(maplibre.dir, 'dist');
  const shipped = [
    'maplibre-gl.mjs',
    'maplibre-gl-shared.mjs',
    'maplibre-gl-worker.mjs',
    'maplibre-gl.css',
  ];
  const worker = path.join(dist, 'maplibre-gl-worker.mjs');
  const bundles = [
    ['bundled: `export *` (main + shared)', whole(maplibre.file)],
    ['bundled: `Map` only', named(['Map'], maplibre.file)],
    ['bundled: `LngLat` only (tree-shaking check)', named(['LngLat'], maplibre.file)],
    // The worker script is an entry of its own. Imported from another module it would vanish:
    // maplibre-gl's package.json marks everything in dist/ as free of side effects.
    ['bundled: worker as an entry (worker + shared)', { file: worker }],
  ];
  results.maplibre = [];
  const mapRows = [];
  for (const name of shipped) {
    const s = sizes(readFileSync(path.join(dist, name)));
    results.maplibre.push({ name: `dist/${name}`, ...s });
    mapRows.push([`dist/${name} (as shipped)`, ...triple(s)]);
  }
  for (const [name, source] of bundles) {
    const m = await measure(rd, source);
    results.maplibre.push({ name, ...sizes(m.code), packages: m.packages });
    mapRows.push([name, ...triple(m)]);
  }
  console.log(`## maplibre-gl ${maplibre.version}\n`);
  table(['What', 'Min', 'Gzip', 'Brotli'], mapRows);

  // --- 7. The likely initial cost of `traces-geo` -----------------------------------------------
  const geoCode = await marginal(`${firstStep}\n${topoSubset}`);
  const geoCodeAll = await marginal(`${everyGeo}\n${topoSubset}`);
  const geoCodeEvery = await marginal(
    `${everyGeo}\n${named(allProjFns, geoProjection.file)}\n${topoSubset}`,
  );
  const data = Object.fromEntries(results.data.map((d) => [d.name, d.chunkJsonParse]));
  const combined = [
    ['d3-geo first step + topojson-client (feature, mesh)', geoCode],
    ['… + countries-110m (lazy chunk)', plus(geoCode, data['countries-110m'])],
    ['… + countries-50m (lazy chunk)', plus(geoCode, data['countries-50m'])],
    [
      '… + countries-110m and countries-50m',
      plus(geoCode, data['countries-110m'], data['countries-50m']),
    ],
    [`every Plotly projection d3-geo has (${inGeo.size}) + topojson-client`, geoCodeAll],
    [`every Plotly projection (${inGeo.size + inProjection.size}) + topojson-client`, geoCodeEvery],
  ];
  results.combined = combined.map(([name, s]) => ({ name, ...s }));
  console.log('## Likely dependency cost of `traces-geo` (marginal; data as JSON.parse chunks)\n');
  table(
    ['What', 'Min', 'Gzip', 'Brotli'],
    combined.map(([name, s]) => [name, ...triple(s)]),
  );

  if (OUT) {
    mkdirSync(OUT, { recursive: true });
    const file = path.join(OUT, 'results.json');
    writeFileSync(file, `${JSON.stringify(results, null, 2)}\n`);
    console.log(`Wrote ${file}`);
  }
}

await main();
