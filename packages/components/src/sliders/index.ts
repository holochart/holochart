/** Sliders (plan E5.11): the component, its attributes and the pure layout / step helpers. */
export type { SliderChangeEvent, SliderEndEvent, SliderStartEvent } from './events.ts';
export {
  currentValueText,
  layoutSlider,
  pageSize,
  placeSlider,
  SLIDER_METRICS,
  sliderLength,
  sliderBoxMarginPush,
  stepBy,
  stepPositionAt,
  visibleSliders,
} from './layout.ts';
export type { SliderLayout, SliderTick } from './layout.ts';
export {
  SLIDER_LIGHT,
  sliderStepAttributes,
  slidersAttributes,
  supplySliderDefaults,
} from './schema.ts';
export type { FullSlider, FullSliderStep } from './schema.ts';
export { slidersComponent, slidersMarginPushes } from './sliders.ts';
// The DOM view loads on first use (`shared/lazy-view.ts`); its types stay public.
export type {
  SlidersChartLike,
  SlidersView,
  SlidersViewContext,
  SlidersViewOptions,
} from './view.ts';
