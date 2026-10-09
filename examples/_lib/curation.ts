import type { FamilyId } from './families.ts';
/** Reviewed beginner tasks; short lists are explicit coverage gaps, never automatic quotas. */
export const familyStarters: Readonly<Record<FamilyId, readonly { id: string; task: string }[]>> = {
  basic: [
    { id: 'bar/basic', task: 'Compare category totals' },
    { id: 'bar/text', task: 'Label values directly' },
    { id: 'bar/stacked', task: 'Show components of a total' },
  ],
  'time-series': [
    { id: 'line/basic', task: 'Draw a trend' },
    { id: 'line/gaps', task: 'Expose missing observations' },
    { id: 'line/step', task: 'Show discrete state changes' },
  ],
  relationships: [
    { id: 'scatter/basic', task: 'Compare two measurements' },
    { id: 'bubble/basic', task: 'Encode a third value by size' },
    { id: 'scatter/text-labels', task: 'Identify observations with labels' },
  ],
  statistical: [
    { id: 'histogram/notebook-starter', task: 'Bin a small sample' },
    { id: 'box/basic', task: 'Summarize sample spread' },
    { id: 'violin/basic', task: 'Compare distribution shapes' },
  ],
  scientific: [
    { id: 'heatmap/basic', task: 'Display a numeric matrix' },
    { id: 'heatmap/uneven', task: 'Represent uneven coordinate spacing' },
    { id: 'contour/basic', task: 'Draw levels of a field' },
  ],
  hierarchical: [
    { id: 'pie/basic', task: 'Show a part of a whole' },
    { id: 'treemap/basic', task: 'Compare nested amounts' },
    { id: 'sunburst/basic', task: 'Explore levels of a hierarchy' },
  ],
  financial: [
    { id: 'funnel/basic', task: 'Show stage conversion' },
    { id: 'funnel/grouped', task: 'Compare conversion between two cohorts' },
    { id: 'indicator/number', task: 'Present a formatted revenue metric' },
  ],
  polar: [
    { id: 'polar/basic', task: 'Plot angular measurements' },
    { id: 'polar/radar', task: 'Compare category profiles' },
    { id: 'polar/barpolar', task: 'Stack values on a circular category axis' },
  ],
  maps: [
    { id: 'scattergeo/basic', task: 'Place measured cities on a world map' },
    { id: 'scattergeo/europe', task: 'Label capitals in a scoped map' },
    { id: 'scattergeo/usa', task: 'Display state-level locations' },
  ],
  networks: [
    { id: 'sankey/basic', task: 'Show energy flows' },
    { id: 'sankey/vertical', task: 'Explain a household budget' },
    { id: 'parcats/basic', task: 'Trace samples across categorical dimensions' },
  ],
  '3d': [
    { id: 'scatter3d/basic', task: 'Compare spatial observations' },
    { id: 'surface/basic', task: 'Draw a grid height field' },
    { id: 'bar3d/matrix', task: 'Compare revenue across products and regions' },
  ],
};
