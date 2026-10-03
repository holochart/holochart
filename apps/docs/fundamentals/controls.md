---
title: Buttons, dropdowns & sliders
description: In-chart update menus and sliders that call restyle, relayout, update or animate, with Plotly's attributes, events and keyboard support.
status: complete
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
row (`'left'`, `'right'`) or a column (`'up'`, `'down'`, the default). `x` and `y` place the menu
in plot-area fractions, and `xanchor` / `yanchor` choose which side of the menu sits at that
point. The defaults (`x: -0.05`, `xanchor: 'right'`, `y: 1`, `yanchor: 'top'`) put it left of the
plot, at the top. A menu that reaches outside the plot area pushes the margin on that side so it
stays inside the figure, like the legend does. `pad` adds space around it, in px.

The example has three traces and two menus. The row above the plot restyles `visible` to show
every trace or one of them. The column on the right relayouts `yaxis.type`, and pushes the right
margin.

<Example id="controls/buttons" :height="420" />

```ts
createChart(el, {
  data, // three traces: Revenue, Costs, Margin
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
          { label: 'All', method: 'restyle', args: ['visible', [true, true, true]] },
          { label: 'Revenue', method: 'restyle', args: ['visible', [true, false, false]] },
          { label: 'Costs', method: 'restyle', args: ['visible', [false, true, false]] },
          { label: 'Margin', method: 'restyle', args: ['visible', [false, false, true]] },
        ],
      },
      {
        type: 'buttons',
        direction: 'down',
        x: 1.02,
        xanchor: 'left',
        y: 1,
        yanchor: 'top',
        buttons: [
          { label: 'Linear', method: 'relayout', args: ['yaxis.type', 'linear'] },
          { label: 'Log', method: 'relayout', args: ['yaxis.type', 'log'] },
        ],
      },
    ],
  },
});
```

## Dropdowns

`type: 'dropdown'` (the default) shows a single button labeled with the active choice. Clicking it
opens the list on the `direction` side (`'down'` by default). Choosing an item, pressing Escape or
clicking elsewhere closes it. Only the closed button pushes margins; the open list overlaps the
chart.

The example has two dropdowns in the top margin. The right one restyles `type` and `mode` to
switch between a line, markers and bars. The left one calls `update` to change the trace color
and the title together.

<Example id="controls/dropdowns" :height="420" />

## Methods and arguments

`method` names the chart call a button or step makes (`'restyle'` by default). `args` holds its
arguments in Plotly's order:

| `method`   | `args`                                                     | Calls                                                       |
| ---------- | ---------------------------------------------------------- | ----------------------------------------------------------- |
| `restyle`  | `['attr', value, traces?]` or `[{ attr: value }, traces?]` | `chart.restyle(update, traces)`                             |
| `relayout` | `['attr', value]` or `[{ attr: value }]`                   | `chart.relayout(update)`                                    |
| `update`   | `[traceUpdate, layoutUpdate, traces?]`                     | `chart.updateAttributes(traceUpdate, layoutUpdate, traces)` |
| `animate`  | `[frames, animationOptions]`                               | `chart.animate(frames, animationOptions)`                   |
| `skip`     | none                                                       | nothing, only the event                                     |

In a `restyle`, an array value holds one value per trace. That is why `visible: [true, false]`
shows the first trace and hides the second, and why data arrays have to be wrapped: to set
`y` on one trace, write `['y', [[1, 2, 3]]]`. [Updating charts](/fundamentals/updating-charts)
explains what each call accepts.

A few more button attributes:

- `args2` turns a button into a toggle. Clicking the active button calls `method` with `args2`
  and turns the button off (`active: -1`).
- `execute: false` skips the call and leaves `active` as it is. The button only emits
  `buttonclicked`, so your code can handle the click.
- `visible: false` hides a button. A button without `args` is hidden too, unless its method is
  `skip`.

## Play, pause and sliders over frames

With `method: 'animate'` a button or step plays [animation frames](/fundamentals/transitions-animation).
Plotly's Play / Pause pair works as is. Play (`args: [null, …]` with `fromcurrent: true`) plays
the frames after the current one, or every frame when no frame is shown yet or the current one
is the first or the last. Pause (`args: [[null], { mode: 'immediate' }]`) drops the frames still
queued; the one playing finishes. A slider with one step per frame moves to each frame as it
plays.

<Example id="animation/gapminder" :height="560" />

```ts
const years = ['2000', '2001', '2002'];
createChart(el, {
  data,
  frames: years.map((year, i) => ({ name: year, data: [{ y: [i, i + 2, i + 1] }] })),
  layout: {
    updatemenus: [
      {
        type: 'buttons',
        showactive: false,
        buttons: [
          {
            label: 'Play',
            method: 'animate',
            args: [null, { frame: { duration: 500, redraw: false }, fromcurrent: true }],
          },
          {
            label: 'Pause',
            method: 'animate',
            args: [
              [null],
              { mode: 'immediate', frame: { duration: 0 }, transition: { duration: 0 } },
            ],
          },
        ],
      },
    ],
    sliders: [
      {
        currentvalue: { prefix: 'Year: ' },
        steps: years.map((year) => ({
          label: year,
          method: 'animate',
          args: [[year], { mode: 'immediate', transition: { duration: 300 } }],
        })),
      },
    ],
  },
});
```

A slider or menu whose steps each animate to one frame (`args: [['2001'], …]`) follows playback:
when a frame starts (`animatingframe`), the step for that frame becomes active, without running
it again, and `sliderchange` reports `interaction: false`. Menus follow the same way: the name
of the frame shown last is in `chart.fullLayout._currentFrame`, as in Plotly. Play and Pause
buttons (`null` and `[null]`) are never tracked, so give them `showactive: false`. Pausing is not
an error: the Play call's promise rejects (as in Plotly), and the button ignores that rejection
without a warning. Any other rejected call logs one console warning.

## The active button

`active` is the index of the highlighted button (`0` by default, `-1` for none). A click sets it,
and it is stored in the layout with a user-interaction `relayout`
(`{ 'updatemenus[0].active': 1 }`, which also emits a `relayout` event), so
[`uirevision`](/fundamentals/updating-charts#keeping-interactions-with-uirevision) keeps it
across `react`. Set `showactive: false` for plain action buttons such as "Reset".

When every button sets the same single attribute, the menu also follows that attribute however
it changes: through another control, `chart.relayout`, or `react`. The Linear / Log buttons in
the [first example](#buttons) stay in sync when you change `yaxis.type` in code. This is Plotly's
"simple binding" rule. Buttons that set several attributes, or one attribute to a different
value on each trace (the `visible` buttons of that example), are not tracked.

## Sliders

A slider steps through a list of `steps`, each with a `label`, a `method` and `args`. By default
it spans the plot area's width below the plot (`x: 0`, `y: 0`, `yanchor: 'top'`, `len: 1`) and
pushes the bottom margin by its height. `len` is a fraction of the plot area's width, or px with
`lenmode: 'pixels'`. `pad.t` (20 px by default) keeps it clear of the x-axis tick labels. Above
the rail, `currentvalue` shows `prefix + label + suffix`. Tick labels are thinned out when they
would overlap. Sliders are horizontal, and a slider with fewer than two visible steps is not
shown.

The example sweeps 21 frequencies; each step restyles `y`:

<Example id="controls/slider" :height="440" />

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
calls only the latest step, as in Plotly. `transition.duration` (150 ms by default) and
`transition.easing` animate the handle (not during a drag). A step with `execute: false` moves
the handle and emits `sliderchange` without calling its method.

Like menus, a slider follows the figure when all its steps set one attribute: here, restyling
`y` from code would move the handle to the matching step.

## Events

| Event           | Plotly alias           | When                                                                      | Payload                                         |
| --------------- | ---------------------- | ------------------------------------------------------------------------- | ----------------------------------------------- |
| `buttonclicked` | `plotly_buttonclicked` | a menu button was clicked (after its method started)                      | `{ menu, button, active, event }`               |
| `sliderchange`  | `plotly_sliderchange`  | the active step changed; `interaction: false` when it followed the figure | `{ slider, step, interaction, previousActive }` |
| `sliderstart`   | `plotly_sliderstart`   | a pointer was pressed on a slider                                         | `{ slider }`                                    |
| `sliderend`     | `plotly_sliderend`     | the pointer was released                                                  | `{ slider, step }`                              |

`menu`, `button`, `slider` and `step` are the items after defaults. `event` is the DOM event behind
the click. Keyboard steps emit `sliderchange` only. See [Events](/reference/events) for the full
list.

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

An open dropdown list also closes on Tab and on a click outside it.

Name controls with `name` on the menu or slider; it becomes the accessible name (`Menu 1`,
`Slider 1` otherwise, or the current-value prefix for sliders). Each control has a visible focus
ring in the text color. With `showactive: false`, buttons are plain action buttons without
`aria-pressed`. The slider's handle glide is turned off when the user prefers reduced motion.

The chart's data, the legend, the modebar and the range selectors are reachable from the keyboard
too: see [Keyboard access](/guides/accessibility#keyboard-access) for their keys and the chart's
tab order (plot area, legend, update menus, sliders, modebar, range selectors).

## Styling

`bgcolor`, `bordercolor`, `borderwidth` and `font` style menus and sliders. Sliders also have
`activebgcolor` (handle while dragged or hovered), `tickcolor`, `tickwidth`, `ticklen` and
`minorticklen`, and `currentvalue.font` for the current value. Unset colors follow the resolved
layout: on a light paper they are Plotly's own widget colors, on a dark paper (the default look)
they are tints of the paper color toward the text color. Sizes follow the font size, so the
default look (9 px text) gets the compact controls of the examples above.

With `template: 'plotly-classic'` the same controls take Plotly's colors and, at 12 px text,
Plotly's sizes. The example has a button menu, a dropdown and a slider in that look:

<Example id="controls/plotly-look" :height="460" />

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
- Labels are plain text: Plotly's pseudo-HTML tags are removed, not rendered. `<br>` still breaks
  the line.
- Long dropdown lists don't get Plotly's scroll box.
- Keyboard support, ARIA roles and focus rings are Holochart additions.
- Sizes scale with the font size, starting from Plotly's sizes at 12 px.

See the attribute reference for [`updatemenus`](/reference/layout#updatemenus) and
[`sliders`](/reference/layout#sliders).
