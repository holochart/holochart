/**
 * `layout.updatemenus[]` attributes and defaults (plan E5.10), following plotly.js
 * `components/updatemenus/attributes.js` and `defaults.js`.
 */
import { attr, fontSchema, isPlainObject, type FullLayout } from '@mk7s/holochart-core';
import { widgetInk } from '../shared/dom-colors.ts';
import { inheritFont, type FullFont } from '../shared/text.ts';

/** Anything that changes a control's size or position re-runs layout (margins). */
const LAYOUT = ['layout'] as const;
/** Colors and the active item only restyle the DOM (the controls' own stage). */
const DOM = ['modebar'] as const;

const METHOD_DESCRIPTION =
  "Chart API method the item calls: `restyle`, `relayout`, `update` (Plotly's `update`, i.e. `chart.updateAttributes`), `animate` (frames, plan E7.4) or `skip` (only the event).";

const ARGS = attr.infoArray({
  items: attr.any({ dflt: null, description: 'An argument (`null` allowed).' }),
  freeLength: true,
  description:
    "Arguments of `method`, as in Plotly: `['attr', value, traces?]` or `[{ attr: value }, traces?]` for `restyle`, `['attr', value]` or `[{ attr: value }]` for `relayout`, `[traceUpdate, layoutUpdate, traces?]` for `update`, `[frames, options]` for `animate`.",
});

/** Padding (px) around a control, `t`/`r`/`b`/`l`. */
export function padSchema(description: string, dflt: { t?: number } = {}) {
  return attr.object(
    {
      t: attr.number({ dflt: dflt.t ?? 0, description: 'Padding above, in px.' }),
      r: attr.number({ dflt: 0, description: 'Padding on the right, in px.' }),
      b: attr.number({ dflt: 0, description: 'Padding below, in px.' }),
      l: attr.number({ dflt: 0, description: 'Padding on the left, in px.' }),
    },
    { description, editType: LAYOUT },
  );
}

/** One button of an update menu. */
export const updatemenuButtonAttributes = {
  visible: attr.boolean({
    description:
      'Show this button. Default: `true` when it has `args` (or `method: skip`), else `false`.',
  }),
  method: attr.enumerated({
    values: ['restyle', 'relayout', 'animate', 'update', 'skip'],
    dflt: 'restyle',
    description: METHOD_DESCRIPTION,
  }),
  args: ARGS,
  args2: attr.infoArray({
    items: attr.any({ dflt: null, description: 'An argument (`null` allowed).' }),
    freeLength: true,
    description:
      'Arguments of `method` for a second click: with `args2`, clicking the active button calls `method` with `args2` and deactivates it (a toggle).',
  }),
  label: attr.string({
    dflt: '',
    description: 'Button text (Plotly pseudo-HTML tags are removed).',
  }),
  execute: attr.boolean({
    dflt: true,
    description:
      'Call `method` on click. `false` only emits `buttonclicked` (and leaves `active` alone), for apps that handle the click themselves.',
  }),
} as const;

/** `layout.updatemenus`. */
export const updatemenusAttributes = attr.items(
  {
    visible: attr.boolean({
      description: 'Show this menu. Default: `true` when it has a visible button.',
    }),
    type: attr.enumerated({
      values: ['dropdown', 'buttons'],
      dflt: 'dropdown',
      description:
        '`dropdown`: a button showing the active item that opens a list; `buttons`: every button side by side.',
    }),
    direction: attr.enumerated({
      values: ['left', 'right', 'up', 'down'],
      dflt: 'down',
      description:
        'Where the buttons go: in a row (`left`, `right`) or a column (`up`, `down`); for dropdowns, the side the list opens on.',
    }),
    active: attr.integer({
      min: -1,
      dflt: 0,
      editType: DOM,
      description:
        'Index of the active button (`-1`: none). Clicking a button sets it; it also follows the figure when every button sets the same single attribute.',
    }),
    showactive: attr.boolean({
      dflt: true,
      editType: DOM,
      description:
        'Highlight the active button (and mark it `aria-pressed`). Turn off for action buttons.',
    }),
    buttons: attr.items(updatemenuButtonAttributes, {
      itemName: 'button',
      editType: LAYOUT,
      description: 'The buttons of the menu.',
    }),
    x: attr.number({
      min: -2,
      max: 3,
      dflt: -0.05,
      description: 'Horizontal position, in plot-area (paper) fractions.',
    }),
    xanchor: attr.enumerated({
      values: ['auto', 'left', 'center', 'right'],
      dflt: 'right',
      description:
        'Which side of the menu sits at `x`; `auto` picks `left`, `center` or `right` from `x`.',
    }),
    y: attr.number({
      min: -2,
      max: 3,
      dflt: 1,
      description: 'Vertical position, in plot-area (paper) fractions.',
    }),
    yanchor: attr.enumerated({
      values: ['auto', 'top', 'middle', 'bottom'],
      dflt: 'top',
      description:
        'Which side of the menu sits at `y`; `auto` picks `top`, `middle` or `bottom` from `y`.',
    }),
    pad: padSchema('Padding around the menu, in px.'),
    font: fontSchema('Button font. Defaults to `layout.font`.'),
    bgcolor: attr.color({
      editType: DOM,
      description:
        'Button background. Default: `paper_bgcolor`, or a tint of it on dark papers (the default look).',
    }),
    bordercolor: attr.color({
      editType: DOM,
      description:
        "Button border color. Default: Plotly's `#BEC8D9`, or a tint of the paper on dark papers.",
    }),
    borderwidth: attr.number({ min: 0, dflt: 1, description: 'Button border width, in px.' }),
  },
  {
    itemName: 'updatemenu',
    editType: LAYOUT,
    description:
      'Buttons and dropdowns over the chart that call `restyle`, `relayout`, `update` or `animate` (plan E5.10).',
  },
);

/** A defaulted update-menu button. */
export interface FullUpdatemenuButton {
  _index: number;
  visible: boolean;
  method: 'restyle' | 'relayout' | 'animate' | 'update' | 'skip';
  args?: unknown[];
  args2?: unknown[];
  label: string;
  execute: boolean;
  name?: string;
  templateitemname?: string;
}

/** A defaulted update menu. */
export interface FullUpdatemenu {
  _index: number;
  visible: boolean;
  type: 'dropdown' | 'buttons';
  direction: 'left' | 'right' | 'up' | 'down';
  active: number;
  showactive: boolean;
  buttons: FullUpdatemenuButton[];
  x: number;
  xanchor: 'auto' | 'left' | 'center' | 'right';
  y: number;
  yanchor: 'auto' | 'top' | 'middle' | 'bottom';
  pad: { t: number; r: number; b: number; l: number };
  font: FullFont;
  bgcolor: string;
  bordercolor: string;
  borderwidth: number;
  name?: string;
  templateitemname?: string;
  /** Background of the active and hovered button (Plotly's `#F4FAFF`, or a paper tint). */
  _activecolor: string;
  _hovercolor: string;
}

/** Plotly's update-menu colors on light papers (`updatemenus/constants.js`). */
export const UPDATEMENU_LIGHT = {
  bordercolor: '#BEC8D9',
  activecolor: '#F4FAFF',
  hovercolor: '#F4FAFF',
} as const;

/**
 * Plotly's defaults that depend on other values: a button without `args` (and not `skip`) is
 * hidden, a menu without visible buttons is hidden, the font inherits `layout.font`, and colors
 * follow the paper (see `shared/dom-colors.ts`). Fills unset values only (idempotent).
 */
export function supplyUpdatemenuDefaults(
  _layoutIn: Readonly<Record<string, unknown>>,
  layoutOut: FullLayout,
): void {
  const menus = layoutOut['updatemenus'];
  if (!Array.isArray(menus)) return;
  const ink = widgetInk(layoutOut);
  const base = layoutOut.font as FullFont;
  for (const m of menus as Partial<FullUpdatemenu>[]) {
    const buttons = Array.isArray(m.buttons) ? m.buttons : [];
    m.buttons = buttons;
    for (const b of buttons) {
      b.visible ??= b.method === 'skip' || Array.isArray(b.args);
    }
    m.visible ??= buttons.some((b) => b.visible);
    m.font = inheritFont(isPlainObject(m.font) ? m.font : undefined, base);
    m.bgcolor ??= ink.dark ? ink.tint(0.07) : (layoutOut.paper_bgcolor as string);
    m.bordercolor ??= ink.dark ? ink.tint(0.26) : UPDATEMENU_LIGHT.bordercolor;
    m._activecolor = ink.dark ? ink.tint(0.2) : UPDATEMENU_LIGHT.activecolor;
    m._hovercolor = ink.dark ? ink.tint(0.13) : UPDATEMENU_LIGHT.hovercolor;
  }
}
