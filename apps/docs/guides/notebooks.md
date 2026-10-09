---
title: Python notebooks
description: Display Plotly figures and JSON dictionaries with Holochart using anywidget and a plotly.io renderer.
status: complete
---

# Python notebooks

`holochart-py` is the Python distribution; `holochart` is the import. It wraps Holochart's
browser bundle in an [anywidget](https://anywidget.dev/), for JupyterLab, Jupyter Notebook and
notebook editors with an ipywidgets manager.

<InstallStatus ecosystem="python" />

For the complete learning path, start with the [Python quick start](/getting-started/python-jupyter),
then [Plotly workflows](/python/plotly), [direct widgets and controls](/python/widgets), and
[downloadable learning notebooks](/python/notebooks/). This page preserves the concise bridge
API overview. [Environment verification](/python/environments) distinguishes tested hosts from
prospective notebook editors.

## Set up the notebook environment

Follow the [Python/Jupyter development installation](/getting-started/installation#python-and-jupyter-from-source)
first. It requires an existing development checkout containing `packages/holochart-py`; a fresh
clone of public `main` does not currently include the bridge. In that checkout, install Node/pnpm
dependencies, build browser assets, create an isolated Python environment, install the bridge
and JupyterLab, and register/select its kernel.
The one-time source setup is separate from the few minutes needed to create a chart below.
Python 3.10 or newer, a widget manager, and a WebGL2-capable browser are required.

Run terminal commands in the cloned repository root. Run every Python example below in a
**notebook cell** using **Python (Holochart)** (or the same environment in your notebook
editor). Confirm `sys.executable` points at that environment before troubleshooting imports.
For an existing kernel, the installation guide shows `%pip` with an absolute source path;
restart the kernel after package installation changes, then rerun imports and registration.

## Existing Plotly figures

Register the renderer once per kernel, then keep the figure code unchanged:

```python
import holochart
import plotly.graph_objects as go

holochart.register_renderer(default=True)
fig = go.Figure(go.Scatter(x=[1, 2, 3], y=[2, 1, 4]))
fig.show()
```

This also accepts Plotly Express figures. Importing the package does not change Plotly's
default renderer. To select Holochart for one figure, register with
`holochart.register_renderer()` and call `fig.show(renderer="holochart")`.

Pass config and dimensions per output with
`fig.show(config={"displayModeBar": False}, width=800, height=400)`, or set renderer defaults
in `register_renderer(config=..., width=..., height=...)`.

## Live widgets

For JSON-safe dictionaries or JSON strings, Plotly is optional. The widget also accepts a
Plotly Figure directly:

```python
from IPython.display import display
from holochart import HolochartWidget

chart = HolochartWidget({"data": [{"type": "bar", "y": [3, 5, 2]}]}, height=400)
display(chart)
chart.figure = {"data": [{"type": "bar", "y": [4, 2, 6]}]}
```

Assign a replacement `figure` or `config` to redraw the existing output. Editing a dictionary
in place does not notify the widget. Figures are copied into JSON-safe state; Plotly's encoded
NumPy arrays are decoded in the browser. The view updates through `Holochart.react` and releases
its chart when removed. Interaction events and browser layout edits do not sync back to Python.

Width fills the output by default, and height defaults to 450 pixels. Dimensions in the figure
layout take precedence over these defaults; explicit widget dimensions override the layout.

## Bundled assets and compatibility

The wheel and sdist include the 2D IIFE, matching 3D add-on and four default font faces, so
rendering supported charts needs no npm installation or CDN requests. Characters missing from
the default font can still trigger Unicode fallback downloads. The bridge requires WebGL2 and
a widget manager; static notebook exports are not supported.

The bridge supports the same attributes as the browser bundle; the
[Plotly compatibility table](/reference/plotly-compat) describes that coverage. It does not
convert unsupported Plotly attributes, and the separate geo and graph extensions are not in
these IIFEs.

For build, test and release details, see the
[package README](https://github.com/holochart/holochart/blob/main/packages/holochart-py/README.md).
