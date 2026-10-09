---
title: Plotly Express & graph_objects
description: Use DataFrames, NumPy, dates, categories, missing observations and mixed traces with the notebook renderer.
status: complete
---

<script setup>
import NotebookLinks from '../.vitepress/theme/components/NotebookLinks.vue';
</script>

# Plotly Express & graph_objects

Create supported figures with Python's existing Plotly APIs, then display them through
Holochart. Python **`plotly.express`** is separate from
[Holochart's TypeScript Express API](/express/). The bridge accepts a figure specification;
accepted Plotly objects do not establish full feature parity.

<InstallStatus ecosystem="python" />

## Dependencies and setup

Complete the [Python quick start](/getting-started/python-jupyter) first. The Express notebook
also needs pandas and NumPy. In its selected **notebook kernel**, run:

```python
%pip install pandas numpy
```

Restart the kernel after installing dependencies, then run the notebook from the first cell.
The `graph_objects` notebook needs only the bridge's `[plotly]` extra. Both notebooks supply
all data explicitly and make no data requests.

## Plotly Express

<NotebookLinks slug="plotly-express" />

The five cells demonstrate a colored scatter, ordered categories, a date line with a visible
missing-data gap, a histogram and a scalar heatmap. A two-dimensional scalar array produces a
heatmap; RGB/RGBA image arrays are a different case and are not demonstrated here.

<!--@include: ../.vitepress/generated/notebooks/plotly-express.md-->

The serializer uses Plotly's encoder for NumPy scalars/arrays, dates and missing values.
Non-finite values become JSON-safe missing values. Recent Plotly may emit encoded arrays with
`dtype`, `bdata` and `shape`; the bundled browser bridge decodes those arrays. `connectgaps=False`
keeps the missing date observation visible as a gap, rather than interpolating across it.

## graph_objects and mixed traces {#graph-objects-and-mixed-traces}

<NotebookLinks slug="graph-objects" />

Use explicit traces when you need a mixed figure or direct control over the layout. The first
figure is the same chart as [the browser tutorial](/getting-started/javascript): visits and
signups share axes and have separate legend entries.

<!--@include: ../.vitepress/generated/notebooks/graph-objects.md-->

## Defaults and per-output overrides

`register_renderer(default=True, config=..., width=..., height=...)` records defaults for later
outputs. Importing the package does not select the renderer. With `default=False` (the default),
registration leaves the current Plotly renderer alone; pass `renderer="holochart"` to `show()`
for one output. Restarting a kernel removes registration and defaults.

Per-show `width` and `height` override the renderer's dimensions. **Per-show config replaces the
renderer default config**, so `fig.show(config={"displayModeBar": False})` does not retain a
previous renderer `scrollZoom=False`. In direct widgets, the widget's config is merged over
any config already stored in the figure; keys in the widget config win. Default widget height
is 450 pixels, layout dimensions can override defaults, and explicit dimensions override layout.

## Check compatibility before migrating

- Check the [generated Plotly compatibility reference](/reference/plotly-compat) for each trace
  and attribute you use; recognized figure input is not automatic conversion of unsupported features.
- Browser geo and graph/chord/graph3d extensions are absent from the notebook bundles. A Python
  figure cannot enable them with an npm import.
- Tile-map traces, static notebook exports and browser-to-Python interaction events are outside
  this bridge's current support.
- A Plotly renderer output is a new widget view. For repeated data updates in one output,
  use [a direct widget](/python/widgets) and assign replacement state.

See [verified environments](/python/environments) and
[Python troubleshooting](/python/troubleshooting) when an accepted figure does not render.
