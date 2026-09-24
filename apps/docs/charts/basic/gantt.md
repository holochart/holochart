---
title: Gantt
description: Show tasks as bars from their start to their finish date, like a project plan or a schedule.
status: complete
chart: bar
---

# Gantt

## Overview

A Gantt chart (or timeline) draws one horizontal bar per task, from its start date to its finish
date, with one row per task. Use it for project plans, schedules, shifts, and any list of
intervals where you want to see order, overlap, and duration at a glance.

Holochart has no separate Gantt trace: a Gantt chart is a horizontal [bar](/charts/basic/bar)
chart on a date axis, where each bar starts at its `base` (the start date) and its length is the
duration in milliseconds. The `timeline` helper builds that figure from a table, like plotly.py's
`px.timeline`.

Pick a different chart when:

- you compare durations, not when things happen: a sorted
  [horizontal bar chart](/charts/basic/horizontal-bar) of the durations reads better;
- you show a quantity over time (how many tasks are open each day): use a
  [line](/charts/basic/line) or an [area chart](/charts/basic/area);
- you have thousands of short intervals on few rows (event logs): consider a scatter of start
  times, or aggregate first.

## Minimal example

```ts
import { createChart, timeline } from '@mk7s/holochart';

const figure = timeline({
  data: [
    { Task: 'Research', Start: '2026-01-05', Finish: '2026-01-23' },
    { Task: 'UX design', Start: '2026-02-02', Finish: '2026-02-27' },
    { Task: 'Backend', Start: '2026-02-16', Finish: '2026-04-03' },
  ],
  xStart: 'Start',
  xEnd: 'Finish',
  y: 'Task',
});
const chart = createChart(document.getElementById('chart')!, figure);
```

`timeline` returns a plain figure (`{ data, layout }`) that you can adjust before passing it to
`createChart`. The first task is at the top, and each bar spans its dates exactly:

<Example id="gantt/timeline" />

The same chart without the helper is one `bar` trace:

```ts
createChart(el, {
  data: [
    {
      type: 'bar',
      orientation: 'h',
      y: ['Research', 'UX design', 'Backend'],
      base: ['2026-01-05', '2026-02-02', '2026-02-16'], // start dates
      x: [18 * 86_400_000, 25 * 86_400_000, 46 * 86_400_000], // durations in ms
    },
  ],
  layout: {
    barmode: 'overlay',
    xaxis: { type: 'date' },
    yaxis: { categoryorder: 'array', categoryarray: ['Backend', 'UX design', 'Research'] },
  },
});
```

## Data format

With the helper, `data` is a table: an array of row objects, or an object of equally long
columns (`{ Task: [...], Start: [...], Finish: [...] }`). The options name the columns:

| Option                   | Meaning                                                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `xStart`, `xEnd`         | Start and finish dates: date strings (`'2026-03-02'`, `'2026-03-02 09:30'`), `Date` objects, or ms since the epoch                               |
| `y`                      | The row label (task) of each bar                                                                                                                 |
| `color`                  | Group by this column: one trace, color and legend item per value                                                                                 |
| `text`                   | Labels drawn on the bars (`textposition: 'auto'`)                                                                                                |
| `hoverName`, `hoverData` | A bold hover title, and extra hover lines (passed as `customdata`)                                                                               |
| `labels`                 | Display names of columns, for hover lines, the legend title and the y axis title                                                                 |
| `colorDiscreteMap`       | Fixed colors per `color` value                                                                                                                   |
| `colorDiscreteSequence`  | Colors for the other values, in order (default: the template's colorway)                                                                         |
| `categoryOrders`         | Orders per column: `{ Team: [...] }` orders the traces and the legend, `{ Task: [...] }` the rows (rows listed here are kept even without a bar) |
| `reverseY`               | `true` (the default) lists rows top-down; `false` keeps the category axis' bottom-up order                                                       |
| `title`, `opacity`       | Figure title and `marker.opacity`                                                                                                                |

Rows whose start or finish is not a valid date are skipped. A finish before the start gives a
bar that grows to the left.

### Date widths on bars

The helper only fills in attributes that every `bar` trace has, so you can build or change Gantt
figures by hand:

- On a date axis, a bar spans from `base` to `base + length`, where `base` is a date (a string, a
  `Date` or ms) and the length (`x` for horizontal bars) is a duration in **milliseconds**:
  `86_400_000` is one day, `3_600_000` one hour. `base` is one value for every bar or one per bar.
- Set `xaxis.type: 'date'` yourself when you build the bars by hand: the lengths are numbers, so
  the axis would otherwise be detected as linear.
- The axis autorange covers every bar from its start to its end, plus 5% padding; bars with a
  base never pull the range back to 1970.
- On vertical bars over a date x axis, `width` (and `offset`) are in ms too:
  `width: 2 * 86_400_000` draws two-day-wide bars. The default width is 80% of the smallest gap
  between dates (`bargap`).
- Hover reports the end of a bar with a base (`base + length`, as Plotly does), so `%{x}` is the
  finish date and `%{base|%Y-%m-%d}` the start date in a `hovertemplate`.

## Variations

### Colored by resource

`color: 'Team'` makes one trace per team, with the column name as the legend title. The traces
follow `categoryOrders.Team`, then first appearance. Colors come from the theme's colorway;
clicking a legend item hides all tasks of that team.

<Example id="gantt/resources" />

### Milestones

Milestones are points in time, so draw them as a `scatter` trace of diamond markers
(`marker.symbol: 'diamond'`) at their dates. Give them rows of their own and list every row in
`categoryOrders` to place them between the tasks:

```ts
import { timeline } from '@mk7s/holochart';

declare const tasks: { Task: string; Start: string; Finish: string }[];

const figure = timeline({
  data: tasks,
  xStart: 'Start',
  xEnd: 'Finish',
  y: 'Task',
  categoryOrders: { Task: ['Kickoff', 'Research', 'UX design', 'Design sign-off', 'Build'] },
});
figure.data.push({
  type: 'scatter',
  mode: 'markers',
  name: 'Milestone',
  x: ['2026-01-05', '2026-02-20'],
  y: ['Kickoff', 'Design sign-off'],
  marker: { symbol: 'diamond', size: 11 },
});
```

<Example id="gantt/milestones" />

To put a milestone on a task's row instead, use that task's name as its `y`.

### Dependencies

Draw a finish-to-start dependency as an annotation arrow without text: the head (`x`, `y`) at the
next task's start and the tail (`ax`, `ay`) at the previous task's end, both in data coordinates
with `axref: 'x'` and `ayref: 'y'`. The arrows then follow the bars when you zoom or pan.

```ts
interface Task {
  Task: string;
  Start: string;
  Finish: string;
}
declare const prev: Task;
declare const next: Task;

const arrow = {
  x: next.Start,
  y: next.Task,
  ax: prev.Finish,
  ay: prev.Task,
  axref: 'x',
  ayref: 'y',
  text: '',
  showarrow: true,
  arrowhead: 2,
};
```

<Example id="gantt/dependencies" />

### Today line

`addVline(chart, date, options)` (plotly.py's `add_vline`) adds a vertical line across the plot
height at a date, with an optional `label`. Here the tasks are also colored by their status on
that date, with `colorDiscreteMap` pinning a color per status. In an app, pass today's date; the
example uses a fixed one so it renders the same every day.

<Example id="gantt/today-line" />

The same line as a static shape, for a figure you build up front:
`{ type: 'line', xref: 'x', yref: 'paper', x0: day, x1: day, y0: 0, y1: 1, line: { dash: 'dash' } }`.

## Styling

- **Colors.** Without `color`, every bar takes the first colorway color. With `color`, each group
  takes the next colorway color unless `colorDiscreteMap` or `colorDiscreteSequence` sets it. To
  style bars one by one, set `marker.color` to an array on the trace the helper returns.
- **Bars.** Every [bar style](/charts/basic/bar#styling) applies: `marker.opacity`,
  `marker.line`, `marker.cornerradius` (rounded task bars), and `layout.bargap` for the row
  spacing (default 0.2 of a row).
- **Labels.** `text` puts a label inside each bar when it fits, else past its end; set
  `textposition: 'inside'` and `insidetextanchor: 'start'` on the traces to left-align them.
- **Rows.** The y axis is a category axis: `categoryorder` and `categoryarray` order the rows, and
  `yaxis.title` is the `y` column name (clear it with `title: { text: '' }`).
- **Date axis.** `xaxis.tickformat` (`'%b %d'`), `dtick` (`'M1'` for months, `7 * 86_400_000`
  for weeks) and `range` (two dates) control the time axis; see
  [Dates and time series](/fundamentals/dates-time-series).

## Interactivity

- **Hover.** The helper's `hovertemplate` lists the group, the start and finish dates, and the
  task, like `px.timeline`: `Start=%{base|%Y-%m-%d}<br>Finish=%{x|%Y-%m-%d}<br>Task=%{y}`. When
  some start or finish has a time of day, both dates show hours and minutes. In your own templates,
  `%{x}` is the finish and `%{base}` the start of the hovered bar; give `%{base}` a date format
  (`%{base|%b %d}`), since without one it prints milliseconds.
- **Zoom and pan.** Drag along the x axis to zoom into a period; the bars, milestones, arrows,
  and the today line all stay on their dates. Double-click to reset.
- **Legend.** With `color`, a legend click hides every task of that group, and a double-click
  isolates it.
- **Events.** `click` points carry `x` (the finish), `base`, `y` (the task), and `customdata`
  (`hoverData`), so a click can open the task:

  ```ts
  declare function openTask(task: unknown): void;

  chart.on('click', (e) => openTask(e.points[0]?.y));
  ```

## Performance notes

- Task bars are instanced rectangles, so a chart with thousands of tasks still draws in a few
  draw calls. Each `color` group is one trace.
- Rows are categories: hundreds of rows need a tall chart (or zooming along y) to stay readable.
- The helper is a plain function: rebuild the figure and call `chart.react(figure)` when the
  plan changes.

## Accessibility notes

- **Screen readers:** the chart is a `<canvas>`; see the [accessibility guide](/guides/accessibility)
  for what the DOM mirror describes. A schedule is also a table: show the tasks with their dates
  next to the chart, or in a disclosure.
- **Keyboard:** there is no keyboard navigation between bars yet.
- **Color:** don't encode status or team in color alone. Put the status in the row label or in
  `text`, and keep a legend or labels for the groups. Diamonds for milestones differ from bars by
  shape as well as color.

## Attribute reference

A Gantt chart is a `bar` chart: see the [bar attribute reference](/reference/bar) (`base`,
`width`, `orientation`) and the [layout reference](/reference/layout) for `barmode`, `xaxis`,
`shapes`, and `annotations`.

## Related charts

- [Bar](/charts/basic/bar): the trace behind Gantt charts, with every style and layout option
- [Horizontal bar](/charts/basic/horizontal-bar): compare durations rather than dates
- [Scatter](/charts/basic/scatter): point events and milestones on a time axis

## Plotly migration notes

- Hand-built Plotly Gantt figures (`bar` with `orientation: 'h'`, date `base`, lengths in ms,
  `xaxis.type: 'date'`) carry over unchanged, including the hover value of the bar end.
- `timeline` follows `px.timeline`, with camelCase options (`x_start` → `xStart`,
  `color_discrete_map` → `colorDiscreteMap`, `category_orders` → `categoryOrders`, …) and a table
  given as rows or columns instead of a DataFrame. It returns a figure object, not a `Figure`
  class. Differences:
  - Rows read **top-down by default** (`reverseY: true`); px keeps the category axis' bottom-up
    order unless `category_orders` names the rows (the usual fix in px is
    `fig.update_yaxes(autorange="reversed")`).
  - Colors come from the active template's colorway (the dark default look) unless you pass
    `colorDiscreteMap` / `colorDiscreteSequence`; px writes the colors into every trace.
  - Rows with a start or finish that isn't a date are skipped; px raises an error.
  - Hover dates are formatted `%Y-%m-%d` (with `%H:%M` when some date has a time); px shows them
    with the axis' hover format.
  - Not supported: `facet_row`/`facet_col`, `pattern_shape`, `animation_frame`, `range_x`,
    `width`/`height` and `template` options (set them on the returned figure instead).
