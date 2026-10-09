# Real notebook-host verification — 2026-10-09

The downloaded learning notebooks were copied into an isolated Jupyter server root. Their kernel
metadata selected a temporary kernelspec for the installed development wheel; one final print
cell marked completion. The learning cells themselves were unchanged. Every check restarted the
kernel and ran all cells through the host's actual browser toolbar and widget manager.

| Environment             | Measured version                                                       |
| ----------------------- | ---------------------------------------------------------------------- |
| OS / architecture       | macOS 26.6.2 / arm64                                                   |
| Browser                 | Playwright Chromium 153.0.8010.12, software WebGL2 through SwiftShader |
| Python / ipykernel      | 3.14.8 / 7.4.0                                                         |
| JupyterLab / Notebook   | 4.6.4 / 7.6.3                                                          |
| Development bridge      | holochart-py 0.0.0, locally built wheel                                |
| anywidget / ipywidgets  | 0.11.0 / 8.1.9                                                         |
| Plotly / pandas / NumPy | 7.1.0 / 3.0.6 / 2.5.3                                                  |

[Lab results](./lab.json) and [Notebook results](./notebooks.json) record exact output counts,
browser versions, dates, exceptions and control assertions. The seven learning notebooks
produced respectively 3, 5, 2, 3, 1, 1 and 1 chart canvases. Screenshots record a real chart output
from each notebook in each host. [Kernel/source evidence](../../../../examples/notebooks/verification.json)
records the canonical Python source hashes, fresh-kernel MIME counts and replacement-state assertions.

The control check drags Multiplier from 2 to 3, verifies the existing canvas is retained and
its pixels change, then reruns the creation cell in the same kernel. The old view disappears;
one slider and one chart remain, with Multiplier reset to 1. This exercises actual anywidget
and ipywidgets communication rather than a fixture widget model.

## Notebook host startup issue

Notebook 7.6.3 emitted `Cannot read properties of undefined (reading 'schema')` from its
`static/notebook/notebook_core` module during startup. The same exception was reproduced in
an otherwise empty baseline notebook containing only Markdown and a print statement, with no
Holochart imports. The baseline executed successfully. The check records this exact upstream
exception separately as `hostWarnings`; it rejects other page exceptions and visible widget
or Python errors. All tested Holochart outputs rendered and the controls updated. Lab emitted
no such exception. This is verified rendering scope with a recorded host startup issue, not a
claim that Notebook's entire application is error-free.

## Reproduce

Install the development bridge and declared notebook dependencies in an isolated Python
environment. Register a temporary kernel named `holochart-wave2`, set `JUPYTER_PATH` to its
prefix's `share/jupyter`, and serve copies named `<slug>-lab.ipynb` and
`<slug>-notebooks.ipynb`. Select that kernel in each copy and append
`print("HOLOCHART_COMPLETE_<slug>")` as a final verification cell. Keep transient outputs out
of distributed notebooks.

Start JupyterLab and Notebook on separate loopback ports with isolated configuration/runtime
directories and a local test token. Set `HOLOCHART_NOTEBOOK_ORIGIN` and
`HOLOCHART_NOTEBOOK_TOKEN` for the [browser check](../../../../apps/docs/scripts/notebook-host-check.mjs):

```sh
node apps/docs/scripts/notebook-host-check.mjs lab first-chart plotly-express graph-objects widgets widget-controls heatmap-field histogram
HOLOCHART_NOTEBOOK_ORIGIN=http://127.0.0.1:8898 node apps/docs/scripts/notebook-host-check.mjs notebooks first-chart plotly-express graph-objects widgets widget-controls heatmap-field histogram
```

The script creates a fresh host session, restarts/runs through the UI, checks output, captures
evidence and removes its session/kernel. The source hash guard invalidates browser claims if
canonical learning cells change. Actual notebook-editor testing, Windows/Linux, other browsers,
hardware GPU combinations and older Python/library versions are outside this verification.
