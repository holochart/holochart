---
title: Animation
description: Animate Express charts over a column with animationFrame and animationGroup, with px's play button and slider.
status: complete
---

# Animation

`animationFrame` turns a column into [frames](/fundamentals/transitions-animation#frames): one
frame per value, played by a ▶ / ◼ button pair and a slider, the way px builds the Gapminder
chart. `animationGroup` names the column that identifies each object across frames, so it moves
from frame to frame instead of being replaced.

<Example id="express/gapminder" :height="560" />

```ts
import { createChart } from '@mk7s/holochart';
import hx from '@mk7s/holochart-express';

declare const gapminder: object[]; // long form: one row per country and year
const figure = hx.scatter(gapminder, {
  x: 'gdpPercap',
  y: 'lifeExp',
  size: 'pop',
  color: 'continent',
  hoverName: 'country',
  animationFrame: 'year',
  animationGroup: 'country',
  logX: true,
  sizeMax: 40,
});
createChart(el, figure);
```

## Frames

Each value of `animationFrame` becomes a frame named after it (`'1952'`), in order of first
appearance or `categoryOrders`; the figure's `data` is the first frame's. Every frame holds the
same traces in the same order, one per group (an empty trace where a group has no rows that
frame), so frame traces match the figure's by index. `animationGroup` sets each trace's `ids`, so
[points are matched by id](/fundamentals/transitions-animation#matching-points-with-ids) between
frames: a country glides from its old position to its new one, and countries that appear or
disappear fade.

The hover template lists the frame value with the groups (`continent=Asia<br>year=1952<br>…`).

With a single frame value, the figure has no frames and no controls.

## The controls

px's controls, unchanged: an update menu with two buttons below the plot, left of the slider.

| Control | Attribute        | What px writes                                                                                                                       |
| ------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| ▶       | `updatemenus[0]` | `animate(null, { frame: { duration: 500 }, transition: { duration: 500, easing: 'linear' }, fromcurrent: true, mode: 'immediate' })` |
| ◼       | `updatemenus[0]` | `animate([null], …)` with zero durations: stops after the current frame                                                              |
| slider  | `sliders[0]`     | one step per frame (`animate([name], …)`, no transition); `currentvalue.prefix` is `year=`                                           |

The slider follows playback. The button labels are the HTML entities `&#9654;` and `&#9724;`, as
px writes them. To change the pace, edit the returned figure:

```ts
import hx from '@mk7s/holochart-express';

declare const rows: object[];
const figure = hx.bar(rows, {
  x: 'continent',
  y: 'pop',
  color: 'continent',
  animationFrame: 'year',
});
const menus = figure.layout['updatemenus'] as { buttons: { args: unknown[] }[] }[];
const play = menus[0]?.buttons[0];
if (play) {
  play.args[1] = {
    frame: { duration: 1000, redraw: false },
    transition: { duration: 800, easing: 'cubic-in-out' },
    fromcurrent: true,
  };
}
```

## Fixed axis ranges

Axes that autoranged per frame would jump while the data move, so Express fixes the ranges of an
animated figure to the data of every frame, unless `rangeX` / `rangeY` are given:

- numeric position axes span the data's extent plus 5% on each side (10% with sized markers), in
  log units on log axes;
- the value axis of bars spans zero and every frame's stacked totals (or largest bar, grouped),
  plus 5%;
- category and date axes, histogram counts and marginal axes keep autoranging.

px itself leaves this to `range_x` / `range_y` (its examples always pass them); give them to fix
the ranges yourself, in data units (also on log axes, as in px).

## What animates

Frames play through [`chart.animate`](/fundamentals/transitions-animation#playing-frames), so what
moves follows its rules: scatter positions, sizes and colors and bar lengths interpolate; category
positions snap; histograms re-bin at each frame. The animation code loads the first time the
chart animates.
