---
title: Conditional styling
description: Style points by their data with serializable style rules, or with JavaScript style functions on any per-point attribute.
status: complete
---

# Conditional styling

Any attribute that takes one value per point (a per-point or `arrayOk` attribute, such as
`marker.color`, `marker.size`, `marker.symbol`, `marker.line.width`, `text` or `hovertext`) can be
set from the data itself. Holochart gives you two ways to do it:

- **Style rules** (`styleRules`): conditions and values written as plain JSON, such as "points
  with `y > 10` are gold". They survive `chartToJSON(chart)`, can be stored and sent over the wire, and are
  validated like the rest of the figure.
- **Style functions**: a JavaScript function in place of the value, called once per point, as in
  d3. The most flexible option, but a function cannot be saved as JSON.

Both turn into plain per-point arrays before the trace sees the data. A trace draws a rule or a
function exactly as it would draw the array you could have computed yourself, so they work on
every trace type and every per-point attribute, with no extra code in the trace.

## Style rules

`styleRules` is a trace attribute: a list of rules, each with a condition (`when`) and the values
to give the points that match it (`set`):

<Example id="scatter/style-rules" />

```ts
const x = [0, 1, 2, 3];
const y = [1.2, 2.4, 0.1, -0.3];
const customdata = [
  ['s1', 'A'],
  ['s2', 'C'],
  ['s3', 'B'],
  ['s4', 'D'],
]; // [sensor, site]

createChart(el, {
  data: [
    {
      type: 'scatter',
      mode: 'markers',
      x,
      y,
      customdata,
      marker: { size: 5, color: '#64748b' },
      styleRules: [
        { when: { y: { gt: 2 } }, set: { 'marker.color': '#ef4444', 'marker.size': 10 } },
        {
          when: { y: { between: [-0.5, 0.5] }, 'customdata[1]': { in: ['A', 'B'] } },
          set: { 'marker.symbol': 'square', 'marker.color': '#3b82f6' },
        },
        { when: { pointNumber: { lt: 10 } }, set: { 'marker.color': '#facc15' } },
      ],
    },
  ],
});
```

How rules combine:

- A rule's `set` **merges over the trace's own value**, point by point. Points that no rule
  matches keep what they would have had without rules: the trace's `marker.color`, a per-point
  array you gave, a template value or the colorway color.
- **Later rules win.** When two rules set the same attribute on a point, the last one applies. A
  rule only changes the attributes it sets: above, the first ten points turn gold, and those of
  them that the second rule matched stay squares.
- A rule without `when` applies to every point.
- `set` takes **per-point attributes only**, each with a single value (a color, a number, a
  symbol name…). A rule cannot set `mode` or `type`.

### Conditions

`when` maps **fields** of the point to a test. Several fields in one `when` must all hold.

A field is any per-point value of the trace, named by its attribute path:

| Field                             | Value for point `i`                                                       |
| --------------------------------- | ------------------------------------------------------------------------- |
| `'x'`, `'y'`, `'z'`, `'text'`, …  | The `i`-th value of that data array or per-point attribute.               |
| `'customdata[1]'`                 | Item `1` of `customdata[i]` (arrays of arrays, like Plotly's hover data). |
| `'customdata.kind'`               | Key `kind` of `customdata[i]` when it holds objects.                      |
| `'marker.size'`, `'marker.color'` | The value in use, per point, or the single value shared by every point.   |
| `'pointNumber'`                   | `i` itself.                                                               |

A test is either a value (short for `eq`) or an object of operators, all of which must hold:

| Operator    | Matches when the field…                                                                |
| ----------- | -------------------------------------------------------------------------------------- |
| `eq`, `ne`  | equals (does not equal) the value. `{ eq: null }` matches missing values.              |
| `gt`, `gte` | is greater than (or equal to) a number or string.                                      |
| `lt`, `lte` | is less than (or equal to) a number or string.                                         |
| `between`   | lies in `[low, high]`, both ends included.                                             |
| `in`, `nin` | is (is not) one of a list of values.                                                   |
| `regex`     | is a string (or number) matching a pattern: `'^A'` or `{ pattern: '^a', flags: 'i' }`. |

Numbers compare as numbers (numeric strings and `Date`s too). Strings compare in alphabetical
order, which puts ISO dates (`'2024-03-01'`) in time order, so a date axis can be tested with
plain strings: `{ x: { gte: '2024-01-01' } }`. A missing value (a `customdata` row that is too
short, `null`, `NaN`) never matches a comparison.

Combine conditions with `and`, `or` and `not`:

```ts
const rules = [
  {
    when: {
      or: [{ y: { lt: 0 } }, { not: { text: { regex: { pattern: '^ok', flags: 'i' } } } }],
    },
    set: { 'marker.color': 'red' },
  },
  {
    when: { and: [{ x: { gte: '2024-01-01' } }, { 'customdata[0]': { in: ['A', 'B'] } }] },
    set: { 'marker.size': 12 },
  },
];
chart.restyle({ styleRules: [rules] }, 0);
```

### Validation

Rules are checked when the chart draws them. A mistake is reported once in the console, with the
path of the problem and, for typos, a suggestion; the rule it is in is skipped and the other rules
still apply. With `config.strict: true`, the update rejects instead:

```text
[holochart] data[0].styleRules[0].when.y.gtt: unknown operator 'gtt'; did you mean 'gt'? (the rule is ignored); operators: eq, ne, gt, gte, lt, lte, in, nin, between, regex
[holochart] data[0].styleRules[1].set.mode: 'mode' is not a per-point (arrayOk) attribute; style rules can only set those (ignored)
```

Unknown fields (`{ yy: 1 }`), bad operands (`between: [1]`, an invalid `regex`), values that the
attribute does not accept (`'marker.size': -1`) and unknown attributes in `set` are reported the
same way. In TypeScript, `StyleRule`, `StyleCondition` and `StyleOperators` (from
`@mk7s/holochart`) type the rules.

## Style functions

Pass a function wherever a per-point attribute takes an array. It is called once per point with
the point, its index and the trace, and returns that point's value:

<Example id="bar/style-functions" />

```ts
const months = ['Jan', 'Feb', 'Mar', 'Apr'];
const profit = [12, -8, 31, -2];

createChart(el, {
  data: [
    {
      type: 'bar',
      x: months,
      y: profit,
      marker: { color: (p: { y: number }) => (p.y < 0 ? '#ef4444' : '#10b981') },
      text: (p: { y: number }, i: number) => (i % 3 === 0 ? `${p.y}` : ''),
      textposition: 'outside',
    },
  ],
});
```

The **point** holds `pointNumber` (the index) and the point's value in each of the trace's data
arrays (`x`, `y`, `z`, `customdata`, `ids`, …) and top-level per-point arrays (`text`,
`hovertext`, …), with dataset `'@column'` references resolved. The third argument is the trace
as you gave it, for anything else. Its type is `StylePoint`, and a function is a
`StyleFunction`.

A function behaves like the array of its results in every way. A function returning numbers for
`marker.color` goes through the colorscale, like numeric colors do:

```ts
const trace = {
  type: 'scatter',
  mode: 'markers',
  x: [-2, -1, 0, 1, 2],
  y: [1, -2, 0, 2, 1],
  marker: {
    color: (p: { x: number; y: number }) => Math.hypot(p.x, p.y),
    colorscale: 'Viridis',
    showscale: true,
    size: (_p: unknown, i: number) => 4 + (i % 5),
  },
};
```

Functions are only accepted on per-point attributes. Elsewhere validation says so, and the
attribute keeps its default:

```text
[holochart] data[0].mode: invalid value a function; expected any combination of 'lines', 'markers', 'text' joined with '+', or 'none' (ignored; style functions work only on per-point (arrayOk) attributes)
```

A function that throws is reported once, and the attribute takes its default.

### Functions and JSON

A figure with functions cannot be saved as it is. `chartToJSON(chart)` evaluates each function
into its array and warns once per attribute; the saved figure draws the
same, but the function is gone. Use style rules when the styling must survive saving, sharing or
a server round trip:

```ts
import { chartToJSON } from '@mk7s/holochart';

const saved = JSON.stringify(chartToJSON(chart));
// console: holochart: toJSON: data[0].marker.color: style function evaluated into 12 per-point values (functions are not serializable)
```

## Updates

Rules and functions are part of the figure, so every update call handles them:

- `restyle({ styleRules: [rules] }, 0)`, `update` and `react` with new rules redraw the points.
  A rules change costs what changing the attributes it sets costs: rules that set colors restyle
  in place, without recomputing the trace; rules that set `marker.size` recompute it, since sizes
  move the autorange.
- New data (`y`, `customdata`, …) re-evaluates the rules and functions with it. Updates that
  don't touch the trace (zoom, pan, a new title, hover) reuse the arrays already computed.
- A new function is a new value: `restyle({ 'marker.color': (p) => … })` restyles.
- [Transitions](/fundamentals/transitions-animation) interpolate between what the rules give
  before and after the change, point by point, and end exactly on the new rules.

## Performance

A rule's condition is compiled once into a test per point, and each rule makes one pass over the
points, so a million points with a few rules resolve in tens of milliseconds. Numeric attributes
(`marker.size`, `marker.line.width`) come out as typed arrays when every value a rule sets is a
number. Functions cost one call per point.

The code that compiles and applies rules and functions loads the first time a trace uses one, so
charts without them don't download it.

## When to use which

| You want…                                                              | Use               |
| ---------------------------------------------------------------------- | ----------------- |
| A fixed color or size per point, computed once                         | A per-point array |
| Highlights from thresholds, categories, dates or labels, saved as JSON | `styleRules`      |
| Anything a function can compute (scales, lookups, formatting)          | A style function  |

See also [Colors & colorscales](/fundamentals/colors-colorscales),
[Updating charts](/fundamentals/updating-charts) and the `styleRules` entry of each trace in the
[attribute reference](/reference/attributes/scatter).
