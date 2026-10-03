/**
 * Which package each built-in trace type ships in, so an unregistered type can say what to
 * install (backlog S2.4). Core cannot import the trace packages; `@mk7s/holochart`'s tests check
 * this table against what they register.
 */
const TRACE_PACKAGES: Readonly<Record<string, string>> = {
  basic: 'scatter bar pie table',
  stats: 'histogram histogram2d histogram2dcontour box violin splom parcoords parcats',
  sci: 'heatmap image contour scatterpolar barpolar',
  finance: 'ohlc candlestick waterfall funnel funnelarea indicator',
  hier: 'sunburst treemap icicle sankey',
  '3d': 'scatter3d surface mesh3d cone bar3d streamtube isosurface volume',
};

/**
 * The npm package that exports the trace module of `type`, or undefined for an unknown type.
 * @internal
 */
export function tracePackage(type: string): string | undefined {
  for (const [name, types] of Object.entries(TRACE_PACKAGES)) {
    if (types.split(' ').includes(type)) return `@mk7s/holochart-traces-${name}`;
  }
  return undefined;
}
