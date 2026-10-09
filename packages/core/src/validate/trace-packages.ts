/**
 * Which package each built-in trace type ships in, so an unregistered type can say what to
 * install (backlog S2.4). Core cannot import the trace packages; `@mk7s/holochart`'s tests check
 * this table against what they register (`index.test.ts`, and `geo.test.ts` and `graph.test.ts`
 * for the geo and graph packages).
 */
const TRACE_PACKAGES: Readonly<Record<string, string>> = {
  basic: 'scatter bar pie table',
  stats: 'histogram histogram2d histogram2dcontour box violin splom parcoords parcats',
  sci: 'heatmap image contour scatterpolar barpolar',
  finance: 'ohlc candlestick waterfall funnel funnelarea indicator',
  hier: 'sunburst treemap icicle sankey',
  '3d': 'scatter3d surface mesh3d cone bar3d streamtube isosurface volume',
  geo: 'scattergeo choropleth',
  graph: 'graph graph3d chord',
};

/**
 * The packages above that `@mk7s/holochart` does not register (ADR-026, ADR-029), and the import
 * that registers each on top of it.
 */
const ADD_ON_IMPORTS: Readonly<Record<string, string>> = {
  geo: '@mk7s/holochart/geo',
  graph: '@mk7s/holochart/graph',
};

/** The key of {@link TRACE_PACKAGES} whose package has `type`. */
function packageKey(type: string): string | undefined {
  for (const [name, types] of Object.entries(TRACE_PACKAGES)) {
    if (types.split(' ').includes(type)) return name;
  }
  return undefined;
}

/**
 * The npm package that exports the trace module of `type`, or undefined for an unknown type.
 * @internal
 */
export function tracePackage(type: string): string | undefined {
  const name = packageKey(type);
  return name === undefined ? undefined : `@mk7s/holochart-traces-${name}`;
}

/**
 * The import that adds the package of `type` to the full bundle (`'@mk7s/holochart/geo'`,
 * `'@mk7s/holochart/graph'`), for a built-in type the full bundle leaves out; undefined for every
 * other type.
 */
export function traceAddOnImport(type: string): string | undefined {
  const name = packageKey(type);
  return name === undefined ? undefined : ADD_ON_IMPORTS[name];
}

/** Subplot containers of `layout` (`geo`, `geo2`, …) to the key of the package that defines them. */
const LAYOUT_PACKAGES: readonly (readonly [RegExp, string])[] = [[/^geo([2-9]|[1-9]\d+)?$/, 'geo']];

/**
 * For a `layout` key that a built-in package defines (`geo` and `geo2` are the geo package's): that
 * package, and the import that adds it to the full bundle when the full bundle leaves it out.
 * Undefined for every other key.
 * @internal
 */
export function layoutKeyPackage(
  key: string,
): { pkg: string; addOn: string | undefined } | undefined {
  for (const [pattern, name] of LAYOUT_PACKAGES) {
    if (pattern.test(key)) {
      return { pkg: `@mk7s/holochart-traces-${name}`, addOn: ADD_ON_IMPORTS[name] };
    }
  }
  return undefined;
}
