/**
 * Tree layouts for the `graph` trace (backlog G4): the tidy tree, the radial tree and the
 * dendrogram, with the forest builder they share.
 */
export type { TreeLayoutResult, TreeOptions, TreeOrientation } from './common.ts';
export { dendrogramLayout, type DendrogramOptions, type DendrogramResult } from './dendrogram.ts';
export {
  buildForest,
  viewForest,
  type CollapsedInput,
  type Forest,
  type TreeSort,
  type TreeView,
  type TreeViewOptions,
} from './forest.ts';
export { radialTreeLayout, type RadialTreeOptions, type RadialTreeResult } from './radial.ts';
export { tidyTreeLayout, type TidyTreeOptions, type TreeLinkShape } from './tidy.ts';
