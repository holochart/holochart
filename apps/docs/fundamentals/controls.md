---
title: Buttons, dropdowns & sliders
description: In-chart update menus and sliders that call restyle, relayout, update or animate, with Plotly's attributes, events and keyboard support.
status: draft
---

# Buttons, dropdowns & sliders

`layout.updatemenus` adds buttons and dropdowns to a chart, `layout.sliders` adds sliders. Each
button or slider step names a chart API method and its arguments; clicking the button or moving
the slider calls it. That is enough for most "switch the view" interactions without writing any
UI code. The attributes, the argument format and the events are Plotly's, so a Plotly figure's
`updatemenus` and `sliders` work unchanged.

The controls are real DOM elements placed over the chart, not canvas drawings. You can reach them
with the keyboard, screen readers announce them, and they take their colors and font from the
chart's template.

## Buttons

A menu with `type: 'buttons'` shows all its buttons side by side. `direction` lays them out in a
row (`'left'`, `'right'`) or a column (`'up'`, `'down'`). `x` and `y` place the menu in plot-area
fractions, and `xanchor` / `yanchor` choose which side of the menu sits at that point. A menu
outside the plot area pushes the margins to make room, like the legend does.

<Example id="_dev/updatemenus-buttons" :height="420" />

```ts
createChart(el, {
  data,
  layout: {
    updatemenus: [
      {
        type: 'buttons',
        direction: 'right',
        x: 0,
        xanchor: 'left',
        y: 1.02,
        yanchor: 'bottom',
        buttons: [
          { label: 'All', method: 'restyle', args: ['visible', [true, true]] },
          { label: 'Revenue', method: 'restyle', args: ['visible', [true, false]] },
          { label: 'Costs', method: 'restyle', args: ['visible', [false, true]] },
        ],
      },
    ],
  },
});
```

## Dropdowns

`type: 'dropdown'` (the default) shows a single button labeled with the active choice. Clicking it
opens the list on the `direction` side. Only the closed button pushes margins; the open list
overlaps the chart.

<Example id="_dev/updatemenus-dropdown" :height="420" />

## Methods and arguments

`method` names the chart call a button or step makes. `args` holds its arguments in Plotly's
order:

| `method`   | `args`                                                     | Calls                                                       |
| ---------- | ---------------------------------------------------------- | ----------------------------------------------------------- |
| `restyle`  | `['attr', value, traces?]` or `[{ attr: value }, traces?]` | `chart.restyle(update, traces)`                             |
| `relayout` | `['attr', value]` or `[{ attr: value }]`                   | `chart.relayout(update)`                                    |
| `update`   | `[traceUpdate, layoutUpdate, traces?]`                     | `chart.updateAttributes(traceUpdate, layoutUpdate, traces)` |
| `animate`  | `[frames, animationOptions]`                               | `chart.animate(...)` once frames are available              |
| `skip`     | none                                                       | nothing, only the event                                     |

In a `restyle`, an array value holds one value per trace. That is why `visible: [true, false]`
shows the first trace and hides the second, and why data arrays have to be wrapped: to set
`y` on one trace, write `['y', [[1, 2, 3]]]`.

A few more button attributes:

- `args2` turns a button into a toggle. Clicking the active button calls `method` with `args2`
  and turns the button off (`active: -1`).
- `execute: false` skips the call. The button only emits `buttonclicked`, so your code can handle
  the click.
- `visible: false` hides a button. A button without `args` is hidden too, unless its method is
  `skip`.

::: info Animation
`method: 'animate'` needs frames and `chart.animate`, which arrive with animation support (plan
E7.4). Until then, an `animate` button logs one warning and does nothing.
:::

## The active button

`active` is the index of the highlighted button. A click sets it, and it is stored in the layout
with a user-interaction `relayout`, so `uirevision` keeps it across `react`. Set
`showactive: false` for plain action buttons such as "Reset".

When every button sets the same single attribute, the menu also follows that attribute however
it changes: through another control, `chart.relayout`, or `react`. The linear/log buttons above
stay in sync when you change `yaxis.type` in code. This is Plotly's "simple binding" rule.
Buttons that set several attributes, or one attribute to a different value on each trace, are
not tracked.

## Sliders

A slider steps through a list of `steps`, each with a `label`, a `method` and `args`. By default
it spans the plot area's width below the plot (`x: 0`, `y: 0`, `yanchor: 'top'`) and pushes the
bottom margin by its height. `pad.t` (20 px by default) keeps it clear of the x-axis tick
labels. Above the rail, `currentvalue` shows `prefix + label + suffix`. Tick labels are thinned
out when they would overlap.

<Example id="_dev/sliders-sweep" :height="440" />

```ts
const x = Array.from({ length: 100 }, (_, i) => i / 10);
const wave = (f: number): number[] => x.map((v) => Math.sin(f * v));
const frequencies = [1, 1.5, 2, 2.5, 3];

createChart(el, {
  data: [{ x, y: wave(2) }],
  layout: {
    sliders: [
      {
        active: 2,
        currentvalue: { prefix: 'ƒ = ', suffix: ' Hz' },
        steps: frequencies.map((f) => ({
          label: String(f),
          method: 'restyle',
          args: ['y', [wave(f)]],
        })),
      },
    ],
  },
});
```

A pointer press anywhere on the rail or its labels picks the nearest step, and dragging snaps
from step to step. Steps run their method at most once per animation frame, so a fast drag
calls only the latest step, as in Plotly. `transition.duration` and `transition.easing` animate
the handle (not during a drag).

Like menus, a slider follows the figure when all its steps set one attribute: here, restyling
`y` from code would move the handle to the matching step.

## Events

| Event           | Plotly alias           | When                                                                      | Payload                                         |
| --------------- | ---------------------- | ------------------------------------------------------------------------- | ----------------------------------------------- |
| `buttonclicked` | `plotly_buttonclicked` | a menu button was clicked (after its method started)                      | `{ menu, button, active, event }`               |
| `sliderchange`  | `plotly_sliderchange`  | the active step changed; `interaction: false` when it followed the figure | `{ slider, step, interaction, previousActive }` |
| `sliderstart`   | `plotly_sliderstart`   | a pointer drag on a slider started                                        | `{ slider }`                                    |
| `sliderend`     | `plotly_sliderend`     | the pointer was released                                                  | `{ slider, step }`                              |

```ts
chart.on('buttonclicked', ({ button, active }) => {
  console.log(`"${button.label}" is now button ${active}`);
});
chart.on('sliderchange', ({ step, interaction }) => {
  if (interaction) console.log('moved to', step?.label);
});
```

## Keyboard and screen readers

| Control     | Role                                                        | Keys                                                                                                                          |
| ----------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Button menu | `toolbar` of buttons, `aria-pressed` on the active one      | Tab reaches the menu (one tab stop); arrow keys along the menu's direction, Home and End move; Enter or Space press.          |
| Dropdown    | button with `aria-haspopup="listbox"`, `listbox` of options | Enter, Space or an arrow key opens the list; arrows, Home, End and a first letter move; Enter or Space choose; Escape closes. |
| Slider      | `slider` with `aria-valuetext` set to the current value     | Arrow keys step by one, PageUp and PageDown by a tenth of the steps, Home and End jump to the ends.                           |

Name controls with `name` on the menu or slider; it becomes the accessible name (`Menu 1`,
`Slider 1` otherwise, or the current-value prefix for sliders). Each control has a visible focus
ring in the text color. With `showactive: false`, buttons are plain action buttons without
`aria-pressed`. The slider's handle glide is turned off when the user prefers reduced motion.

## Styling

`bgcolor`, `bordercolor`, `borderwidth` and `font` style menus. Sliders also have
`activebgcolor` (handle while dragged or hovered), `tickcolor`, `tickwidth`, `ticklen` and
`minorticklen`. Unset colors come from the template: on a light paper they are Plotly's own
widget colors, on a dark paper (the default look) they are tints of the background toward the text
color. Sizes follow the font, so the dense default look gets compact controls:

<Example id="_dev/updatemenus-classic" :height="460" />

Templates style every menu and slider through `layout.template.layout.updatemenudefaults` and
`sliderdefaults` (buttons and steps through `buttondefaults` and `stepdefaults` inside them), as in
Plotly:

```ts
createChart(el, {
  data,
  layout: {
    template: {
      layout: {
        updatemenudefaults: { bgcolor: '#1b2230', bordercolor: '#34405a' },
        sliderdefaults: { tickwidth: 0 },
      },
    },
    updatemenus: [
      { buttons: [{ label: 'Reset', method: 'relayout', args: ['xaxis.autorange', true] }] },
    ],
  },
});
```

## Differences from Plotly

- Controls are DOM elements, so `toImage` and `downloadImage` don't include them (the modebar
  isn't included either).
- Labels are plain text: Plotly's pseudo-HTML tags are removed, not rendered.
- Long dropdown lists don't get Plotly's scroll box.
- Keyboard support, ARIA roles and focus rings are Holochart additions.
- Sizes scale with the font size, starting from Plotly's sizes at 12 px.

See the attribute reference for [`updatemenus`](/reference/layout#updatemenus) and
[`sliders`](/reference/layout#sliders).
