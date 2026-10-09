---
title: Python troubleshooting
description: Resolve kernel mismatch, missing widget managers, disabled WebGL2, absent bundle assets and unsupported notebook traces.
status: complete
---

# Python troubleshooting

Start from the [environment matrix](/python/environments) and
[complete setup](/getting-started/installation#python-and-jupyter-from-source). Browser
rendering requires both an ipywidgets manager and WebGL2; a successful Python import does not
verify either one.

## Symptom, check and fix

| Symptom                                                   | Check                                                                                      | Fix                                                                                                      |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `ModuleNotFoundError: holochart`                          | Print `sys.executable` and the installed distribution version in this kernel.              | Select the installed development kernel, or install the local bridge with this kernel's `%pip`; restart. |
| Plotly renderer named `holochart` is missing              | Inspect `plotly.io.renderers` after a kernel restart.                                      | Import and call `register_renderer()` again; import alone does not register it.                          |
| Renderer registration raises an optional-dependency error | Check whether this kernel can import `plotly`.                                             | Reinstall the local development package with its `[plotly]` extra; restart.                              |
| Output is widget text or a placeholder                    | Display a basic `IntSlider` in the same host.                                              | Repair the host's widget manager before changing figures. A working kernel is insufficient.              |
| Slider renders, chart is blank                            | Check the chart's visible alert and browser console; try a three-value bar dictionary.     | Check WebGL2, the embedded frontend assets and supported trace types separately.                         |
| Missing notebook bundle error                             | Check the exact source checkout and whether package assets were built before installation. | Build matching packages, reinstall the local bridge, restart the kernel and reload the page.             |
| NumPy or date values cannot serialize                     | Check installed Plotly and declared example dependencies.                                  | Use the `[plotly]` encoder extra, or convert to JSON-safe lists/numbers/strings.                         |
| `TraitError` or JSON decoding error                       | Check that `figure` is an object, not a list/scalar, and that JSON uses valid syntax.      | Pass a figure dictionary or supported Plotly Figure; replace malformed JSON.                             |
| Heatmap rows or scatter observations appear wrong         | Check row lengths and x/y/z array shapes before display.                                   | Align observations; use either coordinate centers or supported edge arrays consistently.                 |
| Mutated data never appears                                | Check whether a nested dictionary was edited in place.                                     | Assign replacement `chart.figure`, `chart.config`, dimensions or a fresh Figure.                         |
| Rerunning a cell adds old controls or views               | Check that the old observer and widgets were retained in Python variables.                 | Unobserve callbacks, close old widgets and clear the previous output before recreating them.             |
| A static export loses the chart                           | Check whether a live widget manager and kernel exist in the export.                        | Open the live notebook; standalone notebook HTML/PDF export is outside current bridge support.           |
| A geo/graph figure fails while a bar works                | Compare the trace to the compatibility reference.                                          | Use the browser extension workflow; those extension bundles are absent from this bridge.                 |

Work through checks in order: interpreter and installation, widget host, browser capabilities,
then figure shape and compatibility. Keep the first visible `Holochart:` alert or the first
browser exception when investigating a failure; a later kernel printout cannot explain a
frontend exception by itself.

## Wrong kernel or missing import

Run this in the notebook:

```python
import sys
from importlib.metadata import version
print(sys.executable)
print(version("holochart-py"))
```

Choose the `.venv-holochart` interpreter or **Python (Holochart)** kernel where you installed
the bridge. If the distribution is missing, first ensure the development checkout contains
`packages/holochart-py`, build the browser assets in a terminal, and use the selected kernel's
`%pip` with the absolute package path shown in the installation guide. Restart after installing,
then rerun imports and renderer registration.

## Text or empty output instead of a widget

Confirm the host has a functioning ipywidgets manager by displaying a basic control:

```python
import ipywidgets as widgets
from IPython.display import display
display(widgets.IntSlider(description="Widget check"))
```

If this control does not render, resolve the host's widget manager before changing chart data.
Notebook editors differ; do not assume a host is supported because its Python kernel works.
If the slider renders but the chart does not, check browser console errors, WebGL2 and trace
support. Static HTML notebook exports do not provide this live widget environment.

## WebGL2 is disabled or unavailable

Enable browser hardware acceleration, then reload and rerun the display cell. A blocklisted GPU,
disabled WebGL or a browser without WebGL2 can prevent chart creation. The bridge shows an alert
when rendering throws. It has no SVG, Canvas 2D or WebGL1 fallback.

## Missing bundled scripts or stale frontend

A source installation needs `pnpm build:packages` before pip can embed the scripts/fonts. A
complete built wheel needs no Node/npm at runtime. If the package reports a missing notebook
bundle, rebuild the matching source tree and reinstall using the kernel's interpreter.
Restart the kernel, reload the notebook page, and rerun all cells after reinstalling changed
frontend assets. Restart alone does not replace assets already embedded in an installed wheel.

## Data changes but the chart does not update

Assign a **replacement** `chart.figure` or `chart.config`; editing a nested dictionary in place
does not notify traitlets. Use the [direct-widget examples](/python/widgets) for the full pattern.
For a Plotly renderer output, call `fig.show()` again to create another output, or retain a
`HolochartWidget` when you need updates in one output.

## Unsupported traces or attributes

Check the [compatibility reference](/reference/plotly-compat). Geo, graph, chord and graph3d
extensions are not included in these notebook IIFEs; tile-map traces are not implemented.
Accepted Plotly Figure input does not translate unsupported attributes. Try the small
[first-chart notebook](/getting-started/python-jupyter) to separate a host problem from a
figure compatibility problem.

## Validate data before rendering

This diagnostic creates a complete small figure and checks its coordinate lengths:

```python
from IPython.display import display
from holochart import HolochartWidget

x = [1, 2, 3]
y = [3, None, 4]
assert len(x) == len(y)
small_chart = HolochartWidget(
    {"data": [{"type": "scatter", "mode": "lines+markers", "x": x, "y": y}]},
    height=300,
)
display(small_chart)
```

`None` means a missing observation; `connectgaps` controls whether lines bridge it. Keep the
x observation when its y value is missing. Do not drop just one coordinate array's rows.
For a rectangular heatmap, each row needs the same column count. Edge-coordinate heatmaps
have one more x edge than columns and one more y edge than rows. The
[data checks notebook](/python/notebooks/data-troubleshooting) exercises these distinctions.

The dictionary path needs only the base bridge for JSON-safe inputs. Plotly's encoder handles
NumPy scalars/arrays and date inputs when installed; Plotly's encoded binary-array figure form
is decoded by the bundled frontend. A successful serialization proves neither supported
attributes nor host rendering. See [API inputs](/python/api#holochartwidget).

## Minimum ranges and exact tested versions

The package declares Python `>=3.10`, anywidget `>=0.9,<1`, traitlets `>=5`, and optional Plotly
`>=5,<8`. Those ranges describe dependency constraints. They do not mean every combination has
been exercised. The [environment matrix](/python/environments) records the exact Python, browser,
host and library versions actually used, along with its warning and unsupported-host scope.

The repository includes `examples/notebooks/requirements-verified.txt` with the exercised Python
library versions. In an existing development venv, run this from the **repository root terminal**:

```sh
python -m pip install -r examples/notebooks/requirements-verified.txt
```

This file pins notebook hosts and sample/verification dependencies; it does not install the
unpublished bridge. Complete the [local bridge installation](/getting-started/installation#python-and-jupyter-from-source)
in the same environment and select its kernel. The Python interpreter and browser/OS are recorded
separately in the matrix, rather than managed by this requirements file. Restart and run all after
changing dependencies. Pinning versions helps reproduce the exercised setup; it does not verify
a different editor, GPU or operating system.

## Missing characters or unexpected font requests

Default fonts are embedded with the notebook bundle. A character absent from those fonts can
trigger the renderer's Unicode fallback font download. If only particular labels fail offline,
try the same chart with simple Latin labels and inspect font requests in the browser console.
Use available glyphs or provide the required font resources through the supported browser font
workflow. An embedded runtime and deterministic local data do not promise unconditional offline
rendering for every Unicode string. The bridge does not expose a Python font-registration API.
