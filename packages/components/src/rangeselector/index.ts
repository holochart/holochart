/**
 * The range selector (plan E5.9, `xaxis.rangeselector`): the component, and the pure helpers
 * behind its margins (the button row geometry) for custom controls and tests. The DOM view and
 * the date math of the buttons (`step.ts`) load on first use (`shared/lazy-view.ts`).
 */
export type {
  RangeselectorAxisLike,
  RangeselectorButton,
  RangeselectorDateStep,
  RangeselectorStep,
  RangeselectorStepmode,
} from './step.ts';
export {
  buttonLabel,
  RANGESELECTOR_GAP,
  RANGESELECTOR_MIN_BUTTON_WIDTH,
  layoutRangeselector,
  measureRangeselector,
  rangeselectorMarginPush,
  readRangeselector,
  resolveRangeselectorAnchors,
} from './layout.ts';
export type {
  FullRangeselector,
  RangeselectorAnchors,
  RangeselectorButtonBox,
  RangeselectorLayout,
  RangeselectorSize,
} from './layout.ts';
export { rangeselectorComponent, rangeselectorMarginPushes } from './component.ts';
// The view itself loads on first use (`shared/lazy-view.ts`); its types stay public.
export type {
  RangeselectorChartLike,
  RangeselectorView,
  RangeselectorViewAxis,
  RangeselectorViewContext,
  RangeselectorViewOptions,
} from './rangeselector.ts';
