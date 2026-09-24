/**
 * Shared bar grouping and stacking (plan E9.9), used by `bar` and later by `histogram`, `funnel`
 * and `waterfall`; and stacked areas (plan E9.4), used by `scatter`.
 */
export { distinctValues, layoutBars } from './stack.ts';
export type { BarMode, BarNorm, StackInput, StackOptions, StackOutput } from './stack.ts';
export { stackAreas } from './area.ts';
export type {
  AreaGroupNorm,
  AreaStackGaps,
  AreaStackInput,
  AreaStackOptions,
  AreaStackOutput,
} from './area.ts';
