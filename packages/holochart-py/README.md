# holochart-py

An [anywidget](https://anywidget.dev/) bridge for Holochart in JupyterLab, Jupyter Notebook,
and notebook editors with an ipywidgets manager. The Python distribution is `holochart-py`;
the import is `holochart`.

This package is implemented in the repository and has not been published to PyPI yet.
It ships Holochart's 2D IIFE, the matching 3D add-on, and all four default font faces in the
wheel. It needs no npm installation or CDN at runtime. Unicode characters missing from the
default font can still trigger Holochart's fallback font downloads.

## Use existing Plotly code

After installing `holochart-py[plotly]` (see the source install below), select the renderer
once per kernel:

```python
import holochart
import plotly.graph_objects as go

holochart.register_renderer(default=True)
fig = go.Figure(go.Scatter(x=[1, 2, 3], y=[2, 1, 4]))
fig.show()
```

Registration does not change Plotly's default unless `default=True` is passed. To use it for
one output, call `holochart.register_renderer()` then `fig.show(renderer="holochart")`.
Importing `holochart` alone does not register or select a renderer. The renderer also works
with figures created by Plotly Express and with Plotly's implicit notebook display.

`fig.show(config={"displayModeBar": False}, width=800, height=400)` forwards config and
dimensions to the widget. `register_renderer(config=..., width=..., height=...)` sets defaults
for subsequent outputs; a per-show config replaces that renderer default.

## Use a widget directly

Plotly is optional when using JSON-safe dictionaries or JSON strings:

```python
from IPython.display import display
from holochart import HolochartWidget

chart = HolochartWidget(
    {"data": [{"type": "bar", "x": ["A", "B"], "y": [3, 5]}]},
    height=400,
)
display(chart)

# Replace the trait to redraw the existing output.
chart.figure = {"data": [{"type": "bar", "x": ["A", "B"], "y": [6, 2]}]}
chart.config = {"displayModeBar": False}
```

`HolochartWidget(fig)` also accepts a Plotly Figure. NumPy values, dates and missing values
are serialized with Plotly's encoder when installed, and Plotly's `{dtype, bdata, shape}`
arrays are decoded by Holochart. Figure/config dictionaries are copied into JSON-safe state;
mutating them in place does not notify the widget. Assign a replacement to trigger an update.
Updates use `Holochart.react`, and removing a view releases its chart and model listeners.

Width fills the output by default; height defaults to 450 pixels. Figure layout dimensions
are respected unless the widget's `width` or `height` is set. Browser interaction events and
layout edits are not synchronized back to Python in this first bridge.

This uses the same supported figure attributes as Holochart's browser bundle. It is not a
compatibility importer: unsupported Plotly traces/attributes retain Holochart's existing
behavior. Geo and graph extensions are not in these IIFEs. A working WebGL2 context and a
notebook widget manager are required; static notebook exports are not a supported target.

## Build and test from this repository

```sh
pnpm build:packages
python3 -m venv /tmp/holochart-py-dev
/tmp/holochart-py-dev/bin/python -m pip install -e 'packages/holochart-py[dev]'
/tmp/holochart-py-dev/bin/python -m pytest packages/holochart-py
/tmp/holochart-py-dev/bin/python -m build packages/holochart-py
pnpm exec playwright test -c tests/bundle/playwright.config.ts notebook.spec.ts
```

The Hatch build hook embeds the already-built npm assets without running Node or downloading
anything. Both wheel and sdist contain the generated module; building a wheel from the sdist
works outside this repository. Changes to the frontend require restaging/reinstalling:

```sh
python3 packages/holochart-py/build_assets.py
```

After the first npm release, assets can also come from an unpacked `@mk7s/holochart` tarball:
`python3 packages/holochart-py/build_assets.py --package /path/to/package`. The package directory
must include `package.json`, `dist/`, and `THIRD_PARTY_NOTICES.md`. Keep both IIFEs from the same
release. Source builds fail clearly if the assets are missing. PyPI publishing is a separate
release step; building this bridge does not publish either package.
