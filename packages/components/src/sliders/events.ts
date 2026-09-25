/**
 * `sliderchange`, `sliderstart` and `sliderend` (aliases `plotly_slider*`), emitted by the sliders
 * component. Payloads follow Plotly's.
 */
import type { FullSlider, FullSliderStep } from './schema.ts';

/** Payload of `sliderchange`: the active step changed. */
export interface SliderChangeEvent {
  /** The slider after defaults (its `active` already updated). */
  readonly slider: FullSlider;
  /** The new active step. */
  readonly step: FullSliderStep | undefined;
  /**
   * `true` when the user moved the slider (pointer or keyboard) and the step's method runs;
   * `false` when the slider followed the figure (another control, an update, an animation frame).
   */
  readonly interaction: boolean;
  /** Index of the step that was active before. */
  readonly previousActive: number;
}

/** Payload of `sliderstart`: a pointer pressed on the slider. */
export interface SliderStartEvent {
  readonly slider: FullSlider;
}

/** Payload of `sliderend`: the pointer was released. */
export interface SliderEndEvent {
  readonly slider: FullSlider;
  /** The active step at release. */
  readonly step: FullSliderStep | undefined;
}

declare module '@mk7s/holochart-runtime' {
  interface ChartEvents {
    /** A slider's active step changed (E5.11). */
    sliderchange: SliderChangeEvent;
    /** A pointer drag on a slider started (E5.11). */
    sliderstart: SliderStartEvent;
    /** A pointer drag on a slider ended (E5.11). */
    sliderend: SliderEndEvent;
  }
}
