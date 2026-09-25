/**
 * `layout.sliders[]` attributes and defaults (plan E5.11), following plotly.js
 * `components/sliders/attributes.js` and `defaults.js`.
 */
import { attr, EASINGS, fontSchema, isPlainObject, type FullLayout } from '@mk7s/holochart-core';
import { widgetInk } from '../shared/dom-colors.ts';
import { inheritFont, type FullFont } from '../shared/text.ts';
import { padSchema } from '../updatemenus/schema.ts';

const LAYOUT = ['layout'] as const;
const DOM = ['modebar'] as const;

/** One step of a slider. */
export const sliderStepAttributes = {
  visible: attr.boolean({
    dflt: true,
    description:
      'Include this step. Steps without `args` (and not `method: skip`) are always hidden, like in Plotly.',
  }),
  method: attr.enumerated({
    values: ['restyle', 'relayout', 'animate', 'update', 'skip'],
    dflt: 'restyle',
    description:
      "Chart API method the step calls: `restyle`, `relayout`, `update` (Plotly's `update`), `animate` (frames, plan E7.4) or `skip` (only the events).",
  }),
  args: attr.infoArray({
    items: attr.any({ dflt: null, description: 'An argument (`null` allowed).' }),
    freeLength: true,
    description:
      "Arguments of `method`, as in Plotly: `['attr', value, traces?]` or `[{ attr: value }, traces?]` for `restyle`, `[{ attr: value }]` for `relayout`, `[traceUpdate, layoutUpdate, traces?]` for `update`, `[frames, options]` for `animate`.",
  }),
  label: attr.string({
    description: 'Tick label and current-value text of the step. Default: `step-<index>`.',
  }),
  value: attr.string({
    description: 'A value identifying the step (in events). Default: `label`.',
  }),
  execute: attr.boolean({
    dflt: true,
    description:
      'Call `method` when the step becomes active through the slider. `false` only moves the slider and emits `sliderchange`.',
  }),
} as const;

/** `layout.sliders`. */
export const slidersAttributes = attr.items(
  {
    visible: attr.boolean({
      dflt: true,
      description: 'Show this slider (sliders with fewer than two visible steps are hidden).',
    }),
    active: attr.number({
      min: 0,
      dflt: 0,
      editType: DOM,
      description:
        'Index of the active step. Moving the slider sets it; it also follows the figure when every step sets the same single attribute.',
    }),
    steps: attr.items(sliderStepAttributes, {
      itemName: 'step',
      editType: LAYOUT,
      description: 'The steps of the slider.',
    }),
    lenmode: attr.enumerated({
      values: ['fraction', 'pixels'],
      dflt: 'fraction',
      description: 'Unit of `len`: a fraction of the plot-area width or px.',
    }),
    len: attr.number({ min: 0, dflt: 1, description: 'Length of the slider, in `lenmode` units.' }),
    x: attr.number({
      min: -2,
      max: 3,
      dflt: 0,
      description: 'Horizontal position, in plot-area (paper) fractions.',
    }),
    xanchor: attr.enumerated({
      values: ['auto', 'left', 'center', 'right'],
      dflt: 'left',
      description: 'Which side of the slider sits at `x`; `auto` picks one from `x`.',
    }),
    y: attr.number({
      min: -2,
      max: 3,
      dflt: 0,
      description: 'Vertical position, in plot-area (paper) fractions.',
    }),
    yanchor: attr.enumerated({
      values: ['auto', 'top', 'middle', 'bottom'],
      dflt: 'top',
      description: 'Which side of the slider sits at `y`; `auto` picks one from `y`.',
    }),
    pad: padSchema('Padding around the slider, in px.', { t: 20 }),
    transition: attr.object(
      {
        duration: attr.number({
          min: 0,
          dflt: 150,
          description: 'Duration of the handle animation when the active step changes, in ms.',
        }),
        easing: attr.enumerated({
          values: EASINGS,
          dflt: 'cubic-in-out',
          description: 'Easing of the handle animation.',
        }),
      },
      { editType: DOM, description: 'How the handle moves to a new step (not while dragging).' },
    ),
    currentvalue: attr.object(
      {
        visible: attr.boolean({
          dflt: true,
          description: 'Show the current value above the slider.',
        }),
        xanchor: attr.enumerated({
          values: ['left', 'center', 'right'],
          dflt: 'left',
          description: 'Alignment of the current value over the slider.',
        }),
        offset: attr.number({
          dflt: 10,
          description: 'Gap between the current value and the slider, in px.',
        }),
        prefix: attr.string({ description: 'Text before the value (e.g. `Year: `).' }),
        suffix: attr.string({ description: 'Text after the value.' }),
        font: fontSchema('Current-value font. Defaults to the slider font.'),
      },
      { editType: LAYOUT, description: 'The current-value label.' },
    ),
    font: fontSchema('Tick-label font. Defaults to `layout.font`.'),
    bgcolor: attr.color({
      editType: DOM,
      description:
        "Rail and handle background. Default: Plotly's `#f8fafc`, or a tint of the paper on dark papers.",
    }),
    activebgcolor: attr.color({
      editType: DOM,
      description:
        "Handle background while dragged or hovered. Default: Plotly's `#dbdde0`, or a tint of the paper on dark papers.",
    }),
    bordercolor: attr.color({
      editType: DOM,
      description:
        "Rail and handle border color. Default: Plotly's `#bec8d9`, or a tint of the paper on dark papers.",
    }),
    borderwidth: attr.number({
      min: 0,
      dflt: 1,
      description: 'Rail and handle border width, in px.',
    }),
    ticklen: attr.number({ min: 0, dflt: 7, description: 'Length of labeled step ticks, in px.' }),
    tickcolor: attr.color({
      editType: DOM,
      description: "Tick color. Default: Plotly's `#333`, or a tint of the paper on dark papers.",
    }),
    tickwidth: attr.number({ min: 0, dflt: 1, description: 'Tick width, in px.' }),
    minorticklen: attr.number({
      min: 0,
      dflt: 4,
      description: 'Length of unlabeled step ticks, in px.',
    }),
  },
  {
    itemName: 'slider',
    editType: LAYOUT,
    description:
      'Sliders that step through `restyle`, `relayout`, `update` or `animate` calls (plan E5.11).',
  },
);

/** A defaulted slider step. */
export interface FullSliderStep {
  _index: number;
  visible: boolean;
  method: 'restyle' | 'relayout' | 'animate' | 'update' | 'skip';
  args?: unknown[];
  label: string;
  value: string;
  execute: boolean;
  name?: string;
  templateitemname?: string;
}

/** A defaulted slider. */
export interface FullSlider {
  _index: number;
  visible: boolean;
  active: number;
  steps: FullSliderStep[];
  lenmode: 'fraction' | 'pixels';
  len: number;
  x: number;
  xanchor: 'auto' | 'left' | 'center' | 'right';
  y: number;
  yanchor: 'auto' | 'top' | 'middle' | 'bottom';
  pad: { t: number; r: number; b: number; l: number };
  transition: { duration: number; easing: string };
  currentvalue: {
    visible: boolean;
    xanchor: 'left' | 'center' | 'right';
    offset: number;
    prefix?: string;
    suffix?: string;
    font: FullFont;
  };
  font: FullFont;
  bgcolor: string;
  activebgcolor: string;
  bordercolor: string;
  borderwidth: number;
  ticklen: number;
  tickcolor: string;
  tickwidth: number;
  minorticklen: number;
  name?: string;
  templateitemname?: string;
}

/** Plotly's slider colors on light papers (`sliders/attributes.js`). */
export const SLIDER_LIGHT = {
  bgcolor: '#f8fafc',
  activebgcolor: '#dbdde0',
  bordercolor: '#bec8d9',
  tickcolor: '#333',
} as const;

/**
 * Plotly's dependent defaults: steps without `args` are hidden, labels default to `step-<i>` and
 * values to labels, a slider with fewer than two visible steps is hidden, an `active` step that is
 * hidden moves to the first visible one, fonts inherit, colors follow the paper. Idempotent.
 */
export function supplySliderDefaults(
  _layoutIn: Readonly<Record<string, unknown>>,
  layoutOut: FullLayout,
): void {
  const sliders = layoutOut['sliders'];
  if (!Array.isArray(sliders)) return;
  const ink = widgetInk(layoutOut);
  const base = layoutOut.font as FullFont;
  for (const sl of sliders as Partial<FullSlider>[]) {
    const steps = Array.isArray(sl.steps) ? sl.steps : [];
    sl.steps = steps;
    steps.forEach((step, i) => {
      if (step.method !== 'skip' && !Array.isArray(step.args)) step.visible = false;
      const index = step._index >= 0 ? step._index : i;
      step.label ??= `step-${index}`;
      step.value ??= step.label;
    });
    const visible = steps.filter((s) => s.visible);
    if (visible.length < 2) sl.visible = false;
    const active = sl.active ?? 0;
    if (!steps[Math.round(active)]?.visible && visible[0]) sl.active = steps.indexOf(visible[0]);
    else sl.active = Math.round(active);
    sl.font = inheritFont(isPlainObject(sl.font) ? sl.font : undefined, base);
    const cv = (sl.currentvalue ??= {} as FullSlider['currentvalue']);
    cv.font = inheritFont(isPlainObject(cv.font) ? cv.font : undefined, sl.font);
    sl.bgcolor ??= ink.dark ? ink.tint(0.1) : SLIDER_LIGHT.bgcolor;
    sl.activebgcolor ??= ink.dark ? ink.tint(0.4) : SLIDER_LIGHT.activebgcolor;
    sl.bordercolor ??= ink.dark ? ink.tint(0.3) : SLIDER_LIGHT.bordercolor;
    sl.tickcolor ??= ink.dark ? ink.tint(0.45) : SLIDER_LIGHT.tickcolor;
  }
}
