# Wave 3 real notebook-host verification — 2026-10-09

Fourteen learning notebooks and twenty-four complete single-figure gallery sources ran through
actual JupyterLab and Notebook widget managers: **38 artifacts in each host, 76 final checks**.
Both hosts restart the kernel and run all cells. All expected charts render with no bridge errors.

| Environment             | Measured version                                         |
| ----------------------- | -------------------------------------------------------- |
| OS / architecture       | macOS 26.6.2 / arm64                                     |
| Chromium / WebGL2       | 153.0.8010.12 / Playwright SwiftShader                   |
| Python / ipykernel      | 3.14.8 / 7.4.0                                           |
| JupyterLab / Notebook   | 4.6.4 / 7.6.3                                            |
| Development bridge      | holochart-py 0.0.0, installed from a locally built wheel |
| anywidget / ipywidgets  | 0.11.0 / 8.1.9                                           |
| Plotly / pandas / NumPy | 7.1.0 / 3.0.6 / 2.5.3                                    |

[Lab records](./lab.json) and [Notebook records](./notebooks.json) contain the canonical source
SHA-256, executable-cell SHA-256, exact canvas count, date, browser version and observed exceptions.
The fourteen learning notebooks produce 3/5/2/3/1/1/1/4/4/4/2/3/2/2 chart outputs. Every gallery
source produces exactly one matching chart. [Kernel evidence](../../../../examples/notebooks/verification.json)
separately records fresh-kernel MIME counts and exact figure identities. Browser data is captured
from deterministic public examples, not inferred from trace compatibility.

The verification copies select an isolated temporary kernel and append a completion marker.
Canonical executable cells are unchanged. Generated editorial Markdown adds goals, prerequisites,
time estimates and guide links; executable-cell hashes were checked against the final downloads.
Two notebooks gained a calendar-date example and serialization diagnostics during implementation;
source guards rejected stale evidence, and both were rerun in both hosts after those changes.

The control check changes Multiplier from 2 to 3 with the actual slider, verifies changed pixels
in the same canvas, then reruns the creation cell in the same kernel. The old view is removed;
exactly one slider and one chart remain, reset to 1. Both hosts pass this check.

Screenshots named `<host>-<slug>.png` record actual outputs. The fourteen Lab screenshots are also
published as static notebook previews. These images cannot execute or update widgets.

## Host warning and scope

Notebook 7.6.3 reports `Cannot read properties of undefined (reading 'schema')` from its own
`static/notebook/notebook_core` module during startup. Wave 2 reproduced it in an empty notebook
with no Holochart imports. The same exact warning is retained separately in these records as
`hostWarnings`; other exceptions and visible widget/Python errors fail. Lab reports no such
warning. This is verified chart rendering, not a claim that the whole Notebook app is error-free.

These checks do not establish support for other notebook editors, hosted services, operating
systems, browsers, GPUs or older Python/library combinations. Registry publication is separate.

## Reproduce

Install the development wheel and the pinned tested dependencies, register an isolated kernel,
and serve prepared copies on separate loopback JupyterLab/Notebook ports. The temporary copies
must preserve learning code, select the verification kernel and append the completion marker.
Prepare source-matched copies and input records with:

```sh
python3 examples/notebooks/prepare-host-check.py --root /path/to/isolated-run --kernel holochart-wave3
```

Serve `/path/to/isolated-run/notebooks` in both hosts. The generated
`/path/to/isolated-run/inputs.json` maps each slug to its canonical source, source/code SHA-256,
artifact kind and expected canvas count; gallery records also name their example ID.

```sh
HOLOCHART_NOTEBOOK_ORIGIN=http://127.0.0.1:8907 \
HOLOCHART_NOTEBOOK_KERNEL=holochart-wave3 \
HOLOCHART_NOTEBOOK_INPUTS=/path/to/isolated-run/inputs.json \
HOLOCHART_NOTEBOOK_OUTPUT=docs/site/wave3/notebooks \
node apps/docs/scripts/notebook-host-check.mjs lab first-chart
```

Set `HOLOCHART_NOTEBOOK_TOKEN` to the local test server's token. Use host `notebooks` and its
separate origin for the second run. The runner checks sources before and after execution,
records successful artifacts incrementally, and deletes each test session/kernel afterward.
Only activate browser metadata when both host records match the distributed executable cells.
