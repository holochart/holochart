---
title: Direct widgets & Python updates
description: Display dictionaries, JSON strings and Plotly Figures, replace state, size outputs and drive one chart from an ipywidgets slider.
status: complete
---

<script setup>
import NotebookLinks from '../.vitepress/theme/components/NotebookLinks.vue';
</script>

# Direct widgets & Python updates

Use a direct widget when Python should update an existing chart output. It accepts a JSON-safe
dictionary, a JSON object string or a Plotly Figure. Basic dictionary/string inputs need only
the base bridge; Plotly is optional until your code uses Plotly Figures or its encoder for
NumPy/date values. Start with the [Python environment setup](/getting-started/python-jupyter).

<InstallStatus ecosystem="python" />

## Inputs and replacement state

<NotebookLinks slug="widgets" />

The first chart matches [the gallery's basic bar example](/gallery/example/bar/basic), including its
Holochart-specific rounded ends. The complete notebook also demonstrates a Plotly Figure, so
it uses the `[plotly]` extra. Run these cells in order in the selected notebook kernel:

<!--@include: ../.vitepress/generated/notebooks/widgets.md-->

`figure` and `config` are synchronized traits. The bridge copies input into JSON-safe state;
mutating an original dictionary or editing `chart.figure["data"][0]` in place does not emit a
trait change. Build a replacement and assign it. Config assignment replaces the widget's config
dictionary; it is then merged over any figure config in the browser.

## Dimensions, reruns and removal

Width fills the output by default, and height defaults to 450 pixels. A figure's layout width
or height takes precedence over those defaults. Explicit widget dimensions take precedence
over layout: the JSON-string example's `height=340` overrides its layout height of 300.
To return to default sizing, assign `chart.width = None` or `chart.height = None`.

Rerunning a display cell clears its previous notebook output. The creation cells also close
the previous Python widget before replacing its variable. Removing a view disposes its browser
chart and listeners. Call `chart.close()` when you no longer need its Python model. Closing a
widget does not select a different renderer or remove unrelated notebook outputs.

## Python-driven controls

<NotebookLinks slug="widget-controls" />

This notebook needs the base bridge and `ipywidgets`, which anywidget installs as a dependency.
There is no Plotly dependency in its code. Moving **Multiplier** runs a Python observer, assigns
a replacement figure, and updates the same chart. The final test cell sets it to 2, giving bars
6, 10 and 4. Move it to 3 to get 9, 15 and 6.

<!--@include: ../.vitepress/generated/notebooks/widget-controls.md-->

The creation cell removes the previous Python callback, closes its controls and chart, and
clears the output before creating another panel. This makes repeated execution deliberate.
The chart is inside one `VBox` alongside the slider; Python owns the observer.

Browser hover/selection events and browser-driven axis/layout changes do **not** synchronize
back to Python. This example demonstrates Python-to-browser control, not Holochart selection
callbacks or browser-to-Python linked views.

Continue with [NumPy heatmaps](/python/notebooks/heatmap-field),
[environment verification](/python/environments), or [troubleshooting](/python/troubleshooting).
