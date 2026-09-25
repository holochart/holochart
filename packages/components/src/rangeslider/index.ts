/**
 * The range slider (plan E5.9): the component and the margin math behind it. The view, with the
 * rest of the geometry and the drag math (`geometry.ts`), loads on first use
 * (`shared/lazy-view.ts`).
 */
export { rangesliderComponent } from './rangeslider.ts';
export {
  axisDepth,
  RANGESLIDER_PAD,
  rangesliderOf,
  sliderHeight,
  sliderMarginPush,
} from './margins.ts';
export type { FullRangeslider } from './margins.ts';
export type { RangesliderYaxis, SliderTarget } from './geometry.ts';
