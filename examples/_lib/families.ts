/** One browser-safe taxonomy registry shared by navigation, directories and gallery metadata. */
export type FamilyId =
  | 'basic'
  | 'time-series'
  | 'relationships'
  | 'statistical'
  | 'scientific'
  | 'hierarchical'
  | 'financial'
  | 'polar'
  | 'maps'
  | 'networks'
  | '3d';

export interface ChartSubtype {
  id: string;
  label: string;
  aliases: readonly string[];
  /** Existing canonical documentation route; several patterns may share a technique guide. */
  docs: string;
}

export interface ChartFamily {
  id: FamilyId;
  label: string;
  description: string;
  order: number;
  chartTypes: readonly ChartSubtype[];
}

const subtype = (
  id: string,
  label: string,
  docs: string,
  aliases: string[] = [],
): ChartSubtype => ({ id, label, docs, aliases });

export const chartFamilies: readonly ChartFamily[] = [
  {
    id: 'basic',
    label: 'Basic & comparison',
    description: 'Compare values, groups and rankings.',
    order: 0,
    chartTypes: [
      subtype('bar', 'Bar', '/charts/basic/bar'),
      subtype('horizontal-bar', 'Horizontal bar', '/charts/basic/horizontal-bar', ['barh']),
      subtype('grouped-bar', 'Grouped bar', '/charts/basic/bar', ['grouped']),
      subtype('stacked-bar', 'Stacked bar', '/charts/basic/bar', ['stack']),
      subtype('dot', 'Dot', '/charts/basic/scatter'),
      subtype('lollipop', 'Lollipop', '/charts/basic/scatter'),
      subtype('dumbbell', 'Dumbbell', '/charts/basic/scatter#dumbbell'),
      subtype('table', 'Table', '/charts/basic/table'),
    ],
  },
  {
    id: 'time-series',
    label: 'Lines & time series',
    description: 'Follow change, trends and ranges.',
    order: 1,
    chartTypes: [
      subtype('line', 'Line', '/charts/basic/line', ['lines', 'timeseries']),
      subtype('area', 'Area', '/charts/basic/area'),
      subtype('stacked-area', 'Stacked area', '/charts/basic/area', ['stackgroup']),
      subtype('step-line', 'Step line', '/charts/basic/line', ['step']),
      subtype('range-band', 'Range band', '/charts/basic/area', [
        'band',
        'uncertainty',
        'error band',
        'confidence band',
      ]),
    ],
  },
  {
    id: 'relationships',
    label: 'Scatter & relationships',
    description: 'Explore associations and multivariate data.',
    order: 2,
    chartTypes: [
      subtype('scatter', 'Scatter', '/charts/basic/scatter', ['markers']),
      subtype('bubble', 'Bubble', '/charts/basic/bubble'),
      subtype('splom', 'Scatterplot matrix', '/charts/statistical/splom', ['scatter-matrix']),
      subtype('parcoords', 'Parallel coordinates', '/charts/statistical/parallel-coordinates'),
    ],
  },
  {
    id: 'statistical',
    label: 'Distributions & statistics',
    description: 'Compare distributions, density and variation.',
    order: 3,
    chartTypes: [
      subtype('histogram', 'Histogram', '/charts/statistical/histogram'),
      subtype('box', 'Box', '/charts/statistical/box'),
      subtype('violin', 'Violin', '/charts/statistical/violin'),
      subtype('strip', 'Strip', '/charts/statistical/strip'),
      subtype('histogram2d', '2D histogram', '/charts/statistical/histogram2d'),
      subtype('histogram2dcontour', 'Density contours', '/charts/statistical/histogram2d-contour'),
      subtype('ecdf', 'Empirical cumulative distribution', '/express/statistics#ecdf'),
    ],
  },
  {
    id: 'scientific',
    label: 'Heatmaps & scientific',
    description: 'Inspect scalar fields, images and logarithmic scales.',
    order: 4,
    chartTypes: [
      subtype('heatmap', 'Heatmap', '/charts/scientific/heatmap'),
      subtype('contour', 'Contour', '/charts/scientific/contour'),
      subtype('image', 'Image', '/charts/scientific/image', ['imshow']),
      subtype('log', 'Logarithmic plots', '/charts/scientific/log-plots'),
    ],
  },
  {
    id: 'hierarchical',
    label: 'Part-to-whole & hierarchy',
    description: 'Show composition and nested categories.',
    order: 5,
    chartTypes: [
      subtype('pie', 'Pie', '/charts/basic/pie'),
      subtype('donut', 'Donut', '/charts/basic/pie'),
      subtype('treemap', 'Treemap', '/charts/hierarchical/treemap'),
      subtype('sunburst', 'Sunburst', '/charts/hierarchical/sunburst'),
      subtype('icicle', 'Icicle', '/charts/hierarchical/icicle'),
      subtype('funnelarea', 'Funnel area', '/charts/financial/funnelarea'),
    ],
  },
  {
    id: 'financial',
    label: 'Financial & business',
    description: 'Read prices, changes, pipelines and business metrics.',
    order: 6,
    chartTypes: [
      subtype('candlestick', 'Candlestick', '/charts/financial/candlestick'),
      subtype('ohlc', 'OHLC', '/charts/financial/ohlc'),
      subtype('waterfall', 'Waterfall', '/charts/financial/waterfall'),
      subtype('funnel', 'Funnel', '/charts/financial/funnel'),
      subtype('indicator', 'Indicator', '/charts/financial/indicator'),
      subtype('gantt', 'Gantt', '/charts/basic/gantt'),
    ],
  },
  {
    id: 'polar',
    label: 'Polar & radial',
    description: 'Explore angular, radial and cyclic measurements.',
    order: 7,
    chartTypes: [
      subtype('scatterpolar', 'Polar scatter', '/charts/scientific/polar'),
      subtype('polar-line', 'Polar line / radar', '/charts/scientific/polar', ['radar']),
      subtype('barpolar', 'Polar bar', '/charts/scientific/barpolar'),
    ],
  },
  {
    id: 'maps',
    label: 'Maps & geography',
    description: 'Locate observations and regional patterns.',
    order: 8,
    chartTypes: [
      subtype('scattergeo', 'Geographic scatter', '/charts/maps/scattergeo', ['geo']),
      subtype('choropleth', 'Choropleth', '/charts/maps/choropleth'),
    ],
  },
  {
    id: 'networks',
    label: 'Networks & flows',
    description: 'Trace connections, communities and movement.',
    order: 9,
    chartTypes: [
      subtype('graph', 'Graph', '/charts/graphs/graph'),
      subtype('chord', 'Chord', '/charts/graphs/chord'),
      subtype('sankey', 'Sankey', '/charts/hierarchical/sankey'),
      subtype('parcats', 'Parallel categories', '/charts/statistical/parallel-categories'),
      subtype('adjacency-matrix', 'Adjacency matrix', '/charts/scientific/heatmap'),
    ],
  },
  {
    id: '3d',
    label: '3D charts & fields',
    description: 'Explore spatial observations, surfaces and volumes.',
    order: 10,
    chartTypes: [
      subtype('scatter3d', '3D scatter', '/charts/3d/scatter3d'),
      subtype('bar3d', '3D bar', '/charts/3d/bar3d'),
      subtype('surface', 'Surface', '/charts/3d/surface'),
      subtype('mesh3d', '3D mesh', '/charts/3d/mesh3d'),
      subtype('cone', 'Cone', '/charts/3d/cone'),
      subtype('streamtube', 'Streamtube', '/charts/3d/streamtube'),
      subtype('volume', 'Volume', '/charts/3d/volume'),
      subtype('isosurface', 'Isosurface', '/charts/3d/isosurface'),
      subtype('graph3d', '3D graph', '/charts/graphs/graph3d'),
    ],
  },
];

export const familyById = (id: string): ChartFamily | undefined =>
  chartFamilies.find((f) => f.id === id);
export const subtypeById = (id: string): ChartSubtype | undefined =>
  chartFamilies.flatMap((f) => f.chartTypes).find((t) => t.id === id);
