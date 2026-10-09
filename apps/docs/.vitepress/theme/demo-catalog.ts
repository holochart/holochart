/** Reviewed report/app choices. Runtime data access is independent of static site assets. */
export interface DemoChoice {
  slug: string;
  domain: string;
  previewId: string;
  previewKind: 'report' | 'technique';
  dataMode: 'bundled' | 'live';
  dataLabel: string;
  provenance: string;
  sourcePath: string;
  notesAnchor: string;
  techniques: string[];
  families: string[];
  reuse: { id: string; label: string };
}
export const demoChoices: readonly DemoChoice[] = [
  {
    slug: 'science-basics',
    domain: 'Science',
    previewId: 'demos/science-basics/periodic-table',
    previewKind: 'report',
    dataMode: 'bundled',
    dataLabel: 'Snapshot + seeded models',
    provenance:
      'PubChem elements, NASA planet values and textbook formulas; simulations use fixed seeds.',
    sourcePath: 'examples/demos/science-basics/data/SOURCES.md',
    notesAnchor: 'sources',
    techniques: ['Categorical heatmaps', 'Formula-driven 3D'],
    families: ['scientific', 'statistical', '3d'],
    reuse: { id: 'heatmap/basic', label: 'Reuse a heatmap' },
  },
  {
    slug: 'dallas-weather',
    domain: 'Weather',
    previewId: 'demos/dallas-weather/calendar-heatmap',
    previewKind: 'report',
    dataMode: 'bundled',
    dataLabel: 'Historical snapshot',
    provenance:
      'NOAA GHCN-Daily at Dallas Love Field, 1939–2026; source notes identify missing records.',
    sourcePath: 'examples/demos/dallas-weather/data/SOURCES.md',
    notesAnchor: 'sources',
    techniques: ['Linked time axes', 'Calendar heatmaps'],
    families: ['time-series', 'scientific', 'polar'],
    reuse: { id: 'line/basic', label: 'Reuse a line chart' },
  },
  {
    slug: 'repo-graphs',
    domain: 'Software',
    previewId: 'demos/repo-graphs/packages-dag',
    previewKind: 'report',
    dataMode: 'bundled',
    dataLabel: 'Repository snapshot',
    provenance:
      'Generated from the Holochart working tree and Git history; this is not a live GitHub feed.',
    sourcePath: 'examples/demos/repo-graphs/data/SOURCES.md',
    notesAnchor: 'sources',
    techniques: ['Dependency DAGs', 'Community layouts'],
    families: ['networks', '3d'],
    reuse: { id: 'graph/basic', label: 'Reuse a graph' },
  },
  {
    slug: 'airline-globe',
    domain: 'Geography',
    previewId: 'demos/airline-globe/hub-map',
    previewKind: 'report',
    dataMode: 'bundled',
    dataLabel: 'Historical snapshots',
    provenance:
      'IATA full-year 2025 figures and a selected June 2014 OpenFlights network; not current routes.',
    sourcePath: 'examples/demos/airline-globe/data/SOURCES.md',
    notesAnchor: 'sources-and-method',
    techniques: ['Geographic bubbles', 'Connected graph views'],
    families: ['maps', 'networks', 'relationships'],
    reuse: { id: 'choropleth/basic', label: 'Reuse a map' },
  },
  {
    slug: 'index-funds',
    domain: 'Finance',
    previewId: 'demos/index-funds/asset-growth',
    previewKind: 'report',
    dataMode: 'bundled',
    dataLabel: 'Dated market snapshot',
    provenance: 'Yahoo Finance adjusted prices and State Street holdings, retrieved October 2026.',
    sourcePath: 'examples/demos/index-funds/data/SOURCES.md',
    notesAnchor: 'sources',
    techniques: ['Rebased time series', 'Drawdown comparisons'],
    families: ['time-series', 'financial', 'hierarchical'],
    reuse: { id: 'candlestick/basic', label: 'Reuse candles' },
  },
  {
    slug: 'tqqq-soxl',
    domain: 'Finance',
    previewId: 'demos/tqqq-soxl/monthly-heatmap',
    previewKind: 'report',
    dataMode: 'bundled',
    dataLabel: 'Dated market snapshot',
    provenance:
      'Yahoo Finance prices and issuer holdings, retrieved October 1, 2026; proxy and inference notes retained.',
    sourcePath: 'examples/demos/tqqq-soxl/data/SOURCES.md',
    notesAnchor: 'sources',
    techniques: ['Return distributions', 'Exposure waterfalls'],
    families: ['financial', 'statistical', 'hierarchical'],
    reuse: { id: 'box/basic', label: 'Reuse a box plot' },
  },
  {
    slug: 'openrouter',
    domain: 'Technology',
    previewId: 'demos/openrouter/weekly-tokens',
    previewKind: 'report',
    dataMode: 'bundled',
    dataLabel: 'September 2026 snapshot',
    provenance:
      'Saved public OpenRouter endpoint data and named industry sources; not a live model leaderboard.',
    sourcePath: 'examples/demos/openrouter/data/SOURCES.md',
    notesAnchor: 'sources',
    techniques: ['Log-scale comparisons', 'Exponential fits'],
    families: ['time-series', 'relationships', 'basic'],
    reuse: { id: 'scatter/basic', label: 'Reuse a scatter plot' },
  },
  {
    slug: 'usc-texas',
    domain: 'Sports',
    previewId: 'demos/usc-texas/score-line',
    previewKind: 'report',
    dataMode: 'bundled',
    dataLabel: 'Archived game report',
    provenance:
      'Official USC archive for the January 4, 2006 game, cross-checked against Texas; no tracking data.',
    sourcePath: 'examples/demos/usc-texas/data/SOURCES.md',
    notesAnchor: 'sources-and-accounting',
    techniques: ['Event timelines', 'Possession flows'],
    families: ['basic', 'networks', 'statistical'],
    reuse: { id: 'sankey/basic', label: 'Reuse a flow diagram' },
  },
  {
    slug: 'tirzepatide',
    domain: 'Research',
    previewId: 'demos/tirzepatide/outcomes-forest',
    previewKind: 'report',
    dataMode: 'bundled',
    dataLabel: 'Transcribed research',
    provenance:
      'Published trial endpoints from open papers, abstracts, registries and labels; source tiers are documented.',
    sourcePath: 'examples/demos/tirzepatide/data/SOURCES.md',
    notesAnchor: 'methods-and-limits-of-this-review',
    techniques: ['Forest comparisons', 'Endpoint uncertainty'],
    families: ['relationships', 'time-series', 'basic'],
    reuse: { id: 'scatter/error-bars', label: 'Reuse error bars' },
  },
  {
    slug: 'thc-gummies',
    domain: 'Research',
    previewId: 'demos/thc-gummies/blood-peaks',
    previewKind: 'report',
    dataMode: 'bundled',
    dataLabel: 'Transcribed research',
    provenance:
      'Published studies and labels; some older values come through named reviews. Source tiers are documented.',
    sourcePath: 'examples/demos/thc-gummies/data/SOURCES.md',
    notesAnchor: 'methods-and-limits',
    techniques: ['Dose comparisons', 'Uncertainty ranges'],
    families: ['relationships', 'time-series', 'basic'],
    reuse: { id: 'scatter/error-bars', label: 'Reuse error bars' },
  },
  {
    slug: 'live-weather',
    domain: 'Weather application',
    previewId: 'line/basic',
    previewKind: 'technique',
    dataMode: 'live',
    dataLabel: 'Live fetch on request',
    provenance:
      'Zippopotam.us locates a US ZIP code; Open-Meteo returns the forecast. Internet required; no API key.',
    sourcePath: 'examples/demos/live-weather/data.mts',
    notesAnchor: 'how-it-works',
    techniques: ['Figure updates', 'Cross-chart events'],
    families: ['time-series', 'scientific', 'polar'],
    reuse: { id: 'line/basic', label: 'Reuse a line chart' },
  },
];
