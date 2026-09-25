/**
 * Slider geometry and step math (plotly.js `sliders/draw.js` `findDimensions`, `handleInput`),
 * pure: the slider's box, step positions, which steps get labels, the current-value text, margin
 * pushes and pointer position → step. The DOM view sizes its elements from this.
 *
 * Plotly's constants are for 12 px text; they scale with the slider font here (see
 * `updatemenus/layout.ts`), so the dense default look gets a compact slider. `ticklen`,
 * `minorticklen`, `tickwidth` and `borderwidth` are attributes and are used as given.
 */
import type { ViewportRect } from '@mk7s/holochart-render';
import type { MarginPush } from '@mk7s/holochart-runtime';
import { anchoredMarginPush, anchoredOrigin, type AnchoredBox } from '../shared/placement.ts';
import {
  LINE_HEIGHT,
  measureBlock,
  plainText,
  textFont,
  type MeasureLine,
} from '../shared/text.ts';
import { resolveXAnchor, resolveYAnchor } from '../updatemenus/layout.ts';
import type { FullSlider, FullSliderStep } from './schema.ts';

/** Geometry constants at 12 px text (`sliders/constants.js`). */
export const SLIDER_METRICS = {
  /** Inset of the first and last step from the ends of the input area. */
  stepInset: 10,
  railWidth: 5,
  railInset: 8,
  gripWidth: 20,
  gripHeight: 20,
  /** From the top of the input area to the ticks. */
  tickOffset: 25,
  labelOffset: 0,
  /** Minimum room between tick labels. */
  labelPadding: 8,
} as const;

/** One tick (every visible step has one; labeled steps get a long one). */
export interface SliderTick {
  /** Position among the visible steps. */
  readonly position: number;
  /** Index in `steps`. */
  readonly index: number;
  readonly x: number;
  readonly length: number;
  /** Label text for labeled steps. */
  readonly label?: string;
}

/** A laid-out slider; x/y are relative to the slider's box (container px otherwise). */
export interface SliderLayout {
  readonly scale: number;
  /** Box size (Plotly's `outerLength` × `height`). */
  readonly width: number;
  readonly height: number;
  readonly xanchor: 'left' | 'center' | 'right';
  readonly yanchor: 'top' | 'middle' | 'bottom';
  /** Indices (in `steps`) of the visible steps, in order. */
  readonly steps: readonly number[];
  /** x of each visible step. */
  readonly positions: readonly number[];
  readonly ticks: readonly SliderTick[];
  readonly labelStride: number;
  readonly rail: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly grip: { readonly width: number; readonly height: number; readonly y: number };
  /** Top of the ticks and of the labels. */
  readonly tickTop: number;
  readonly labelTop: number;
  readonly labelHeight: number;
  /** The current-value label's anchor point and height, when shown. */
  readonly currentValue?: { readonly x: number; readonly y: number; readonly height: number };
  /** The input area (x range) where the pointer picks steps. */
  readonly inputStart: number;
  readonly inputLength: number;
}

/** The current-value text of a step: `prefix + label + suffix` (Plotly `drawCurrentValue`). */
export function currentValueText(slider: FullSlider, step: FullSliderStep | undefined): string {
  const cv = slider.currentvalue;
  return `${cv.prefix ?? ''}${step ? plainText(step.label) : ''}${cv.suffix ?? ''}`;
}

/** The slider's length in px (`len` in `lenmode` units; `plotWidth` for fractions). */
export function sliderLength(slider: FullSlider, plotWidth: number): number {
  return Math.ceil(slider.lenmode === 'fraction' ? Math.round(plotWidth * slider.len) : slider.len);
}

/** Lay out a (visible) slider whose `len` is resolved against `plotWidth`. */
export function layoutSlider(
  slider: FullSlider,
  measure: MeasureLine,
  plotWidth: number,
): SliderLayout {
  const s = slider.font.size / 12;
  const M = SLIDER_METRICS;
  const steps: number[] = [];
  slider.steps.forEach((step, i) => {
    if (step.visible) steps.push(i);
  });
  const n = steps.length;
  const font = textFont(slider.font);
  let maxLabelWidth = 0;
  let labelLines = 0;
  for (const i of steps) {
    const block = measureBlock(plainText((slider.steps[i] as FullSliderStep).label), font, measure);
    maxLabelWidth = Math.max(maxLabelWidth, block.width);
    labelLines = Math.max(labelLines, block.lines);
  }
  const labelHeight = slider.font.size * LINE_HEIGHT * Math.max(1, labelLines);

  let cvHeight = 0;
  if (slider.currentvalue.visible) {
    const cvFont = textFont(slider.currentvalue.font);
    let lines = 1;
    for (const i of steps) {
      const text = currentValueText(slider, slider.steps[i]);
      lines = Math.max(lines, measureBlock(text, cvFont, measure).lines);
    }
    cvHeight = slider.currentvalue.font.size * LINE_HEIGHT * lines;
  }
  const cvTotal = slider.currentvalue.visible ? cvHeight + slider.currentvalue.offset : 0;

  const width = sliderLength(slider, plotWidth);
  const inputStart = slider.pad.l;
  const inputLength = Math.max(0, Math.round(width - slider.pad.l - slider.pad.r));
  const stepInset = M.stepInset * s;
  const textable = inputLength - 2 * stepInset;
  const available = n > 1 ? textable / (n - 1) : textable;
  const labelStride = Math.max(
    1,
    available > 0 ? Math.ceil((maxLabelWidth + M.labelPadding * s) / available) : n,
  );
  const positions = steps.map((_, k) =>
    Math.round(inputStart + stepInset + textable * (n > 1 ? k / (n - 1) : 0)),
  );

  const top = slider.pad.t + cvTotal;
  const gripHeight = Math.round(M.gripHeight * s);
  const gripWidth = Math.round(M.gripWidth * s);
  const railHeight = Math.max(2, Math.round(M.railWidth * s));
  const railInset = M.railInset * s;
  const tickTop = top + Math.round(M.tickOffset * s);
  const labelTop = tickTop + slider.ticklen + M.labelOffset;
  const ticks: SliderTick[] = steps.map((index, k) => {
    const labeled = k % labelStride === 0;
    return {
      position: k,
      index,
      x: positions[k] as number,
      length: labeled ? slider.ticklen : slider.minorticklen,
      ...(labeled ? { label: plainText((slider.steps[index] as FullSliderStep).label) } : {}),
    };
  });
  const height = Math.ceil(
    cvTotal +
      M.tickOffset * s +
      slider.ticklen +
      M.labelOffset +
      labelHeight +
      slider.pad.t +
      slider.pad.b,
  );
  const cvX =
    slider.currentvalue.xanchor === 'center'
      ? inputStart + inputLength / 2
      : slider.currentvalue.xanchor === 'right'
        ? inputStart + inputLength
        : inputStart;
  return {
    scale: s,
    width,
    height,
    xanchor: resolveXAnchor(slider.xanchor, slider.x),
    yanchor: resolveYAnchor(slider.yanchor, slider.y),
    steps,
    positions,
    ticks,
    labelStride,
    rail: {
      x: Math.round(inputStart + railInset),
      y: Math.round(top + (gripHeight - railHeight) / 2),
      width: Math.max(0, Math.round(inputLength - 2 * railInset)),
      height: railHeight,
    },
    grip: { width: gripWidth, height: gripHeight, y: top },
    tickTop,
    labelTop,
    labelHeight,
    ...(slider.currentvalue.visible
      ? { currentValue: { x: cvX, y: slider.pad.t, height: cvHeight } }
      : {}),
    inputStart,
    inputLength,
  };
}

function sliderAnchor(slider: FullSlider, layout: SliderLayout, xref: AnchoredBox['xref']) {
  return {
    x: slider.x,
    y: slider.y,
    xref,
    yref: 'paper' as const,
    xanchor: layout.xanchor,
    yanchor: layout.yanchor,
  };
}

/** Top-left corner of the slider's box, container px. */
export function placeSlider(
  slider: FullSlider,
  layout: SliderLayout,
  size: { width: number; height: number },
  plotArea: Readonly<ViewportRect>,
): { left: number; top: number } {
  const o = anchoredOrigin(sliderAnchor(slider, layout, 'paper'), size, plotArea, layout);
  return { left: Math.round(o.left), top: Math.round(o.top) };
}

/**
 * Margin a slider needs (Plotly's `autoMargin`): vertically its full height; horizontally only in
 * `pixels` mode (a `fraction` slider scales with the plot area, so it pushes nothing sideways).
 */
export function sliderBoxMarginPush(
  slider: FullSlider,
  layout: SliderLayout,
  size: { width: number; height: number },
  margin: { l: number; r: number; t: number; b: number },
): MarginPush | undefined {
  const xref = slider.lenmode === 'pixels' ? 'paper' : 'container';
  return anchoredMarginPush(sliderAnchor(slider, layout, xref), size, margin, layout);
}

/** The visible-step position nearest to `x` (box px), Plotly `handleInput`. */
export function stepPositionAt(layout: SliderLayout, x: number): number {
  const n = layout.steps.length;
  if (n <= 1) return 0;
  const inset = SLIDER_METRICS.stepInset * layout.scale;
  const span = layout.inputLength - 2 * inset;
  const v = span > 0 ? (x - layout.inputStart - inset) / span : 0;
  return Math.round(Math.min(1, Math.max(0, v)) * (n - 1));
}

/** Visible sliders of a layout. */
export function visibleSliders(sliders: unknown): FullSlider[] {
  if (!Array.isArray(sliders)) return [];
  return (sliders as FullSlider[]).filter(
    (s) => s.visible && s.steps.filter((step) => step.visible).length >= 2,
  );
}

/**
 * The step `delta` visible steps away from `active` (keyboard: ±1, PageUp/PageDown: ±10% of the
 * steps, at least 1), clamped to the ends. Returns an index into `steps`.
 */
export function stepBy(layout: SliderLayout, active: number, delta: number): number {
  const n = layout.steps.length;
  if (n === 0) return active;
  const at = layout.steps.indexOf(active);
  const from = at >= 0 ? at : 0;
  const to = Math.min(n - 1, Math.max(0, from + delta));
  return layout.steps[to] as number;
}

/** PageUp / PageDown jump: a tenth of the steps, at least one. */
export function pageSize(layout: SliderLayout): number {
  return Math.max(1, Math.round(layout.steps.length / 10));
}
