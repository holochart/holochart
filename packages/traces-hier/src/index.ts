/**
 * @mk7s/holochart-traces-hier — hierarchical and flow trace types (plan E13, milestone M5):
 * `sunburst`, `treemap`, `icicle` and `sankey`. Register them like any trace module
 * (`register(...hierTraces)`); the `@mk7s/holochart` bundle registers them for you.
 */
import type { Registrable } from '@mk7s/holochart-runtime';
import { icicle } from './icicle/index.ts';
import { sankey } from './sankey/index.ts';
import { sunburst } from './sunburst/index.ts';
import { treemap } from './treemap/index.ts';

export * from './sunburst/index.ts';
export * from './treemap/index.ts';
export * from './icicle/index.ts';
export * from './sankey/index.ts';
// The hierarchy engine (E13.1): what the sunburst, treemap and icicle traces build their trees
// with, for code that prepares their data (Express' `path`) or reads their event payloads.
export {
  buildHierarchy,
  drillEntry,
  findEntry,
  formatNodePercent,
  formatNodeValue,
  levelWindow,
  nodePath,
  partition,
  type Hierarchy,
  type HierarchyInput,
  type HierarchyResult,
  type HierNode,
  type LevelWindow,
  type PartitionCell,
} from './hierarchy/index.ts';

/** Every hierarchical and flow trace module, for `register(...hierTraces)`. */
export const hierTraces: readonly Registrable[] = [sunburst, treemap, icicle, sankey];
