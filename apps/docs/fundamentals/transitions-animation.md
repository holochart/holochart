---
title: Transitions & animation
description: Animate between chart states with layout.transition, and play frames with animate(), Plotly's way.
status: complete
---

# Transitions & animation

Holochart animates changes the way Plotly does, with the same attributes and calls:

- a **transition** animates one update: give `react` a figure with `layout.transition`, and the
  chart moves from what it shows to the new figure over `duration` milliseconds;
- **frames** are named states you define up front (`figure.frames`); `chart.animate` plays them one
  after another, each with a transition into it. Play and Pause buttons and a slider make a
  player out of them.

Both animate the same things: numbers, colors, data points, and axis ranges. The code that does
it loads the first time a chart animates, so charts that never animate don't pay for it.

## Transitions

Set `layout.transition` in the figure you pass to `react`. The chart keeps the new figure, but
draws it frame by frame from the old one:

<Example id="animation/transitions" :height="440" />

```ts
import type { FigureInput } from '@mk7s/holochart';

function ranking(values: number[]): FigureInput {
  return {
    data: [{ type: 'bar', orientation: 'h', ids: ['a', 'b', 'c'], x: values, y: [1, 2, 3] }],
    layout: { transition: { duration: 750, easing: 'cubic-in-out' } },
  };
}

createChart(el, ranking([30, 20, 10]));
await chart.react(ranking([10, 25, 20])); // resolves once the transition has finished
```

`layout.transition` has three attributes:

| Attribute  | Default          | What it does                                                             |
| ---------- | ---------------- | ------------------------------------------------------------------------ |
| `duration` | `500`            | Length in milliseconds. `0` snaps.                                       |
| `easing`   | `'cubic-in-out'` | How progress speeds up and slows down (below).                           |
| `ordering` | `'layout first'` | When axis ranges and traces both change, which of them animates (below). |

Only `react` transitions. `restyle`, `relayout` and `update` apply their change at once, as in
Plotly. A `react` whose changes cannot animate at all (a new title, another marker symbol)
doesn't transition either.

### What animates

Trace modules declare which of their attributes can animate. Those attributes move from their old
value to their new one:

| Trace       | Animated attributes                                                                                                                                     |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scatter`   | `x`, `y`, `x0`, `dx`, `y0`, `dy`, `marker.color`, `marker.size`, `marker.opacity`, `marker.line.color`, `marker.line.width`, `line.color`, `line.width` |
| `bar`       | `x`, `y`, `x0`, `dx`, `y0`, `dy`, `base`, `width`, `offset`, `marker.color`, `marker.opacity`, `marker.line.color`, `marker.line.width`                 |
| `histogram` | `marker.color`, `marker.opacity` (the bins themselves are recomputed, so bar positions snap)                                                            |
| every trace | `opacity`                                                                                                                                               |

- **Numbers** move linearly along the eased progress. Positions on category axes don't
  interpolate (there is nothing between two categories), so they snap.
- **Colors** are mixed in OKLab, so a red-to-blue change passes through purple rather than a
  muddy gray. Numbers mapped through a colorscale interpolate as numbers.
- **Per-point arrays** interpolate point by point.
- **Axis ranges** that the new figure sets (`xaxis.range`) animate. Axes left to autorange follow
  the data as it moves.
- Everything else **snaps** when the transition starts: new symbols, text, templates, visibility.
  When the transition ends, the chart is exactly what `react` would have drawn without one.

The in-between frames are real updates, done incrementally: traces keep their GPU primitives and
upload the changed buffers in place, axes and ticks follow, validation is skipped. That is cheap
for charts up to tens of thousands of points; for very large traces, keep transitions short or
leave them off. Traces of other types (box, pie, heatmap, …) redraw only at the start, with their
`opacity` as the one animated attribute.

### Matching points with `ids`

By default, point `i` of the old data moves to point `i` of the new data. When the old and the
new trace both have `ids`, points are matched by id instead, as in Plotly: in the ranking above,
each product's bar slides to its new rank whatever its position in the arrays.

Points only the new data has **enter**: they appear at their new position, fading in and growing
from size 0. Points only the old data has **exit**: they stay where they were, fading out and
shrinking, and are gone when the transition ends. (Plotly fades them without the size change.)
Traces drawn with lines or fills leave exiting points out from the start: those join every point,
and an extra point would bend them.

### Easing

`easing` is one of `linear`, `quad`, `cubic`, `sin`, `exp`, `circle`, `elastic`, `back` and
`bounce`, each with `-in`, `-out` or `-in-out`, with the curves Plotly uses (d3 v3). A bare name
means `-in`. `back` and `elastic` overshoot: numbers go past their new value before settling,
while colors, opacities and sizes stay in range.

### Ordering

When a change moves axis ranges **and** traces, Plotly animates one of them and snaps the other
at the end, and so does Holochart: with `ordering: 'layout first'` (the default) the axes move
first while the traces keep their old state, then the traces jump to their new one; with
`'traces first'` the traces move inside the old axes, and the axes jump at the end.

## Frames

`figure.frames` holds named states. Each frame changes some traces and the layout, like a
`chart.update`: nested objects merge, arrays replace.

```ts
createChart(el, {
  data: [{ x: [1, 2, 3], y: [2, 1, 3], mode: 'markers' }],
  layout: { yaxis: { range: [0, 10] } },
  frames: [
    { name: 'start', data: [{ y: [2, 1, 3] }] },
    { name: 'end', data: [{ y: [8, 6, 9] }], layout: { title: { text: 'After' } } },
  ],
});
```

| Frame key   | What it is                                                                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `name`      | What `animate` and sliders refer to. Numbers become strings; unnamed frames are `'frame 0'`, …                                                   |
| `group`     | `animate('group')` plays every frame of a group, in order.                                                                                       |
| `data`      | Trace changes, one entry per trace in `traces`.                                                                                                  |
| `traces`    | The trace indices `data` applies to. Default: `data[i]` changes trace `i`.                                                                       |
| `layout`    | Layout changes. Attribute strings (`'xaxis.range'`) work too; `annotations`, `shapes`, `images`, `sliders` and `updatemenus` merge item by item. |
| `baseframe` | The name of a frame this one extends: the base's changes apply first, then this frame's.                                                         |

`chart.addFrames(frames, indices?)` adds frames: a frame whose name exists replaces it, others are
inserted at `indices` (appended by default). `chart.deleteFrames(indices?)` removes frames by
index, or all of them. `chart.frames` lists the frames, and `toJSON` saves them with the figure.
`react` keeps the frames unless the new figure brings its own.

## Playing frames

`chart.animate(target, options)` plays frames:

```ts
await chart.animate(null); // every frame, in order
await chart.animate('intro'); // the frames of group 'intro'
await chart.animate(['end']); // the frame named 'end'
await chart.animate([{ data: [{ y: [5, 5, 5] }] }]); // a frame object, not stored
```

A string or number names a **group**, not a frame; wrap a frame name in a list. Each frame starts
`frame.duration` after the previous one and transitions into its state over
`transition.duration` (capped at the frame's duration):

| Option        | Default                                                               | What it does                                                                                                                                                                             |
| ------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frame`       | `{ duration: 500, redraw: true }`                                     | Time between frame starts. One object, or a list with one per frame.                                                                                                                     |
| `transition`  | `{ duration: 500, easing: 'cubic-in-out', ordering: 'layout first' }` | The transition into each frame. One object, or one per frame.                                                                                                                            |
| `mode`        | `'afterall'`                                                          | With frames still queued by an earlier call: `'afterall'` plays after them, `'next'` drops them and starts when the current frame's time is up, `'immediate'` drops them and starts now. |
| `direction`   | `'forward'`                                                           | `'reverse'` plays the list backwards.                                                                                                                                                    |
| `fromcurrent` | `false`                                                               | Start after the frame shown last, if it is in the list.                                                                                                                                  |

The promise resolves once the last frame has had its time and finished its transition. It rejects
when a later `'next'` or `'immediate'` call drops that frame, which is how a pause works:
`animate([null], { mode: 'immediate' })` plays nothing and drops what was queued; the frame playing
finishes. A name that isn't a frame rejects without changing anything.

`frame.redraw` is accepted for compatibility. Plotly needs `redraw: true` to show changes that
don't animate; Holochart draws every change incrementally, so it makes no difference.

### Play, pause and a slider

With update menus and sliders calling `animate`, frames become a player. This is the Gapminder
pattern from Plotly's examples, unchanged:

<Example id="animation/gapminder" :height="560" />

```ts
const years = ['1952', '1957', '1962'];
createChart(el, {
  data,
  frames: years.map((year, i) => ({ name: year, data: [{ x: [i, i + 1], y: [i, 2 * i] }] })),
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

The slider follows playback: its steps each animate to one frame, so when a frame starts, the
matching step becomes active (without running again). See
[Buttons, dropdowns & sliders](/fundamentals/controls#play-pause-and-sliders-over-frames).

From a long-form table, the [Express API](/express/animation) builds all of this in one call:
`hx.scatter(rows, { x, y, animationFrame: 'year', animationGroup: 'country' })` makes the frames,
the `ids`, the buttons and the slider, as `px.scatter(animation_frame=…)` does.

## Events

| Event                   | Plotly alias                   | When                                                                 |
| ----------------------- | ------------------------------ | -------------------------------------------------------------------- |
| `animating`             | `plotly_animating`             | `animate` starts playing (nothing was playing).                      |
| `animatingframe`        | `plotly_animatingframe`        | A frame starts: `{ name, frame, animation: { frame, transition } }`. |
| `animated`              | `plotly_animated`              | No frame is left to play.                                            |
| `animationinterrupted`  | `plotly_animationinterrupted`  | Queued frames were dropped by a `'next'` or `'immediate'` call.      |
| `transitioning`         | `plotly_transitioning`         | A transition starts (a frame, or `react` with `layout.transition`).  |
| `transitioned`          | `plotly_transitioned`          | A transition finished; its final state is drawn.                     |
| `transitioninterrupted` | `plotly_transitioninterrupted` | Another transition cut this one short.                               |

```ts
chart.on('animatingframe', ({ name }) => {
  console.log('now showing', name);
});
```

`chart.fullLayout._currentFrame` holds the name of the frame shown last, as in Plotly.

## Interruptions

- A new transition (a frame, or a `react` with `layout.transition`) interrupts the running one: it
  starts from what is on screen, so the motion stays continuous.
- Another update of an animating attribute wins: `restyle({ y: … })` during a transition of `y`
  stops animating `y` and keeps your value. Updates of other attributes, adding or moving traces,
  and zooming don't disturb a transition.
- When the user prefers reduced motion (`prefers-reduced-motion: reduce`), transitions snap;
  frames still advance on their schedule.

## Differences from Plotly

- Traces and axes animate on the GPU with the same pipeline as every update, so every trace type
  updates at the start of a transition and `redraw` makes no difference.
- Autoranged axes follow the moving data. Plotly animates to the new autorange and snaps the
  traces (with `redraw: false` it doesn't autorange at all).
- Entering and exiting points also grow and shrink; bars fade in and out too (Plotly shows and
  removes them at once).
- Promises settle when a transition is interrupted (Plotly's may never settle); rejections are
  `Error`s named `AnimationInterrupted` (Plotly rejects with `undefined`).
- `deleteFrames` sorts indices numerically (Plotly's lexicographic sort removes the wrong frames
  from lists such as `[9, 10]`).
- Camera animation for 3D scenes comes with the 3D traces (plan E7.5).

See the [`layout.transition`](/reference/attributes/layout#transition) attributes and
[`Chart`](/reference/api/holochart-runtime/classes/Chart) in the API reference.
