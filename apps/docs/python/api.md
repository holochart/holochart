---
title: Python API reference
description: Public notebook bridge inputs, synchronized properties, renderer registration, dimensions and lifecycle.
status: complete
---

# Python API reference

This reference follows the development bridge's public `holochart` exports and its widget and
renderer implementation. Complete [source installation](/getting-started/installation#python-and-jupyter-from-source)
before using these imports. The current distribution version is `0.0.0`; it identifies a
development package and is not a published release.

<InstallStatus ecosystem="python" />

## HolochartWidget

```python
from holochart import HolochartWidget

chart = HolochartWidget(
    {"data": [{"type": "bar", "x": ["A", "B"], "y": [3, 5]}]},
    config={"displayModeBar": False},
    width=None,
    height=360,
)
```

Signature: `HolochartWidget(figure=None, *, config=None, width=None, height=None, **kwargs)`.
Additional keyword arguments are forwarded to the underlying anywidget/ipywidgets constructor.
Display with `display(chart)` in a notebook cell. A normal terminal can create the Python object
but cannot display its browser view.

| Input/property | Accepted value                                                 | Behavior                                                                                  |
| -------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `figure`       | Mapping, JSON object string, or object with `to_plotly_json()` | Serialized to a JSON-safe dictionary; an omitted figure becomes `{}`.                     |
| `config`       | Mapping or JSON object string                                  | Serialized to a dictionary; widget config overrides matching keys in `figure.config`.     |
| `width`        | Positive integer or `None`                                     | Widget value overrides `figure.layout.width`; otherwise the output fills available width. |
| `height`       | Positive integer or `None`                                     | Widget value overrides `figure.layout.height`; otherwise height is 450 pixels.            |

`figure`, `config`, `width` and `height` synchronize with the browser view. Assign a replacement
value to update an existing output; nested in-place mutations do not emit traitlets changes.

```python
chart.figure = {"data": [{"type": "bar", "x": ["A", "B"], "y": [6, 10]}]}
chart.config = {"displayModeBar": True}
chart.height = 420
```

The bridge serializes inputs immediately. When Plotly is installed it uses `PlotlyJSONEncoder`,
including its NumPy/date handling. Otherwise it uses standard JSON encoding. Nonfinite numeric
values become `None` in synchronized state. Passing a JSON array, scalar, or a malformed JSON
string fails in Python; accepting a figure object does not verify browser trace compatibility.

The view coalesces changes while a render is pending. It mounts with the public plotting API and
updates with `react`. A browser render exception displays an alert beginning with `Holochart:`;
the next successful replacement hides that alert. See [troubleshooting](/python/troubleshooting)
for host, data and bundle checks.

## register_renderer

```python
import plotly.graph_objects as go
from holochart import register_renderer

renderer = register_renderer(default=False, height=360, config={"displayModeBar": False})
fig = go.Figure(go.Scatter(x=[1, 2, 3], y=[3, 1, 4]))
fig.show(renderer="holochart")
```

Signature: `register_renderer(*, default=False, **kwargs)`. Requires the `[plotly]` extra.
Supported renderer options are `config`, `width` and `height`, passed to each created widget.
It installs a renderer at `plotly.io.renderers["holochart"]` and returns that renderer object.
`default=True` also selects it as Plotly's default for subsequent `fig.show()` calls in this
kernel. Importing `holochart` alone does not register it or change Plotly defaults. Re-register
after a kernel restart; calling it again replaces the registered renderer.

Each `fig.show()` creates a new widget output. Keep a `HolochartWidget` when you need to replace
data in one existing output; changing the original Plotly Figure does not update a previous
renderer output. The renderer's implementation class is not a top-level public export.

## Close and rerun

`chart.close()` is inherited from ipywidgets. Close the old widget before recreating it, and
remove observers from controls that you created. The browser disposes its chart and listeners
when the view is removed. Closing the Python widget does not clear the notebook cell's output
area; use notebook output controls or `clear_output(wait=True)` for that separate step.

```python
from IPython.display import clear_output

chart.close()
clear_output(wait=True)
```

The [slider notebook](/python/notebooks/widget-controls) demonstrates observer removal, view
cleanup, replacement updates and repeated execution in one kernel.

## Capabilities and runtime

The wheel embeds the matching 2D runtime, 3D add-on and default fonts. A completed wheel does
not need Node or a runtime CDN at display time. Missing Unicode glyphs can still trigger fallback
font downloads; see [font troubleshooting](/python/troubleshooting#missing-characters-or-unexpected-font-requests).
An active notebook widget manager and WebGL2 remain
required. Geo/graph extension bundles, tile maps, static notebook export and browser-to-Python
selection/hover callbacks are not provided by this bridge. Consult the
[compatibility reference](/reference/plotly-compat) and [environment matrix](/python/environments).

Source definitions: `packages/holochart-py/src/holochart/__init__.py`, `widget.py`, `renderer.py`
and `packages/holochart-py/frontend/widget.js`. The public exports are `HolochartWidget` and
`register_renderer`; `holochart.__version__` reports the development version.
