/**
 * Shared bar grouping and stacking (plan E9.9), used by `bar` and later by `histogram`, `funnel`
 * and `waterfall`.
 */
export { distinctValues, layoutBars } from './stack.ts';
export type { BarMode, BarNorm, StackInput, StackOptions, StackOutput } from './stack.ts';
