# Installation verification — 2026-10-09

These checks used the local development working tree on `codex`, with existing changes and
the untracked `packages/holochart-py` bridge. The working tree HEAD was
`3a01ba5ef741ddf6634e5ddca99ad2ced0b657ea`; that commit alone does not contain the bridge tested
here. Local source installation, kernel output generation and an isolated browser renderer were
verified in Wave 1. That initial check did not verify a complete notebook-host session.
Subsequent [Wave 2 host checks](./wave2/notebooks/README.md) verify seven actual JupyterLab and
Notebook sessions, including live updates and view disposal; notebook editors remain unverified.

## Public checkout availability

Read-only remote checks on 2026-10-09 returned public `main` at
`15251ef05d3453f4253e4c08d25a91596ca9ac3b`:

```sh
git ls-remote --heads origin
git ls-tree --name-only 15251ef05d3453f4253e4c08d25a91596ca9ac3b packages/holochart-py
gh api 'repos/holochart/holochart/contents/packages/holochart-py?ref=15251ef05d3453f4253e4c08d25a91596ca9ac3b' --jq '.[].name'
```

The tree listing contained no matching path; GitHub's contents API returned `404 Not Found`.
No shared-checkout fetch, publication or remote mutation was performed. A separate temporary
clone was subsequently tested below. Other remote branches were listed but
their bridge contents were not verified. No public branch containing the bridge is advertised.
A fresh public-main clone cannot follow the Python source installation yet. Python instructions
therefore require an existing development checkout containing the bridge and matching browser
source. A publicly obtainable Python source revision remains a release dependency.

## Verification environment

| Tool/package | Version / environment                       |
| ------------ | ------------------------------------------- |
| Host         | macOS, Apple silicon                        |
| Node         | 26.8.1                                      |
| pnpm         | 11.15.1                                     |
| Python       | 3.14.8                                      |
| holochart-py | 0.0.0, wheel built by pip from local source |
| JupyterLab   | 4.6.4                                       |
| ipykernel    | 7.4.0                                       |
| anywidget    | 0.11.0                                      |
| ipywidgets   | 8.1.9                                       |
| Plotly       | 7.1.0                                       |
| nbformat     | 5.11.1                                      |
| nbclient     | 0.11.0                                      |
| Playwright   | 1.63.0, Chromium with SwiftShader           |

These are measured smoke-test versions, not a tested minimum-version matrix. Python 3.10 is
the package's declared minimum; this session did not execute Python 3.10 or Windows.

## Fresh public JavaScript checkout

A new temporary directory held a shallow clone of public `main` and a separate empty pnpm
store. No working-tree changes, installed dependencies, Turbo cache or browser build artifacts
were copied from the development checkout. With Node 26.8.1 and pnpm 11.15.1, the executed
commands were equivalent to the documented clone/install/build path:

```sh
git clone --depth 1 --branch main https://github.com/holochart/holochart.git "$verification_root/checkout"
cd "$verification_root/checkout"
pnpm install --store-dir "$verification_root/pnpm-store"
pnpm build:packages
pnpm dev
```

The clone resolved to `15251ef05d3453f4253e4c08d25a91596ca9ac3b`. Its package-manager pin and
Node minimum matched the installation guide. Installation exited successfully: 410 packages
downloaded and added, zero reused, 4.4 seconds. Package build exited successfully: 14/14 tasks,
zero cache hits, 18.894 seconds. The matching 2D/3D IIFEs and default OTF font were present in
`packages/holochart/dist`. `git status --short` showed no tracked or untracked changes after
installation/build (generated artifacts remained ignored).

The documented `pnpm dev` command started Vite 8.3.0 successfully. Ports 5173 and 5174 were
already occupied, so Vite selected the next available port; this was a non-fatal startup notice.
Playwright Chromium with SwiftShader visited `?example=scatter/basic` in that fresh sandbox,
found one chart canvas and no visible error panel or browser page errors. This verifies the
public browser source entry path separately from the modified development-tree examples.

Public `main` did not contain `packages/holochart-py`, `packages/traces-geo` or
`packages/traces-graph`. The bridge and map/graph extension instructions therefore require a
development checkout containing those packages. The public clone check does not establish
public availability for them. The temporary server, clone, dependency store and logs were
removed after recording these results; no ignored build artifacts were retained. Stopping the
development server with Ctrl+C returned the expected pnpm wrapper exit 130 / `SIGINT`.

## Browser build and isolated Python installation

From the development repository root:

```sh
pnpm build:packages
```

Result: 16 successful package builds, 14 using Turbo cache. This verified the current workspace
build, not a fresh dependency installation from a clean remote clone.

A new temporary Python virtual environment was created with `python3 -m venv`. No preinstalled
Python packages were reused. The executed installation arguments were:

```sh
python -m pip install 'packages/holochart-py[plotly]' jupyterlab ipykernel pytest build
```

`python` above denotes the temporary environment's interpreter. Pip built and installed a
`holochart_py-0.0.0-py3-none-any.whl` from the local bridge using its Hatch build hook. The
matching browser assets were included successfully. `python -m jupyterlab --version` returned
`4.6.4`; that command verifies the installed CLI, not notebook-host rendering. `pytest` and
`build` were installed as verification tools; no Python pytest suite or sdist rebuild was run
as part of this website task.

## Isolated kernel notebook smoke

The environment's interpreter registered an isolated kernel with these arguments:

```sh
python -m ipykernel install --prefix "$verification_root/kernel" --name holochart-site08 --display-name 'Python (Holochart smoke test)'
```

`verification_root` refers to a fresh temporary directory. Its kernelspec directory was passed
to nbclient through `JUPYTER_PATH="$verification_root/kernel/share/jupyter"`; no persistent user
kernelspec was added. A one-cell notebook executed through
`NotebookClient(notebook, kernel_name="holochart-site08", timeout=60).execute()` ran:

```python
import sys
import holochart
import plotly.graph_objects as go
from IPython.display import display
from holochart import HolochartWidget

print(sys.executable)
print(holochart.__file__)
holochart.register_renderer(default=True)
fig = go.Figure(go.Scatter(x=[1, 2, 3], y=[2, 1, 4]))
fig.show()
chart = HolochartWidget({"data": [{"type": "bar", "y": [3, 5, 2]}]}, height=400)
display(chart)
chart.figure = {"data": [{"type": "bar", "y": [4, 2, 6]}]}
assert chart.figure["data"][0]["y"] == [4, 2, 6]
```

Assertions checked that the executable and import resolved to the isolated environment and
its installed `site-packages`, both displays emitted
`application/vnd.jupyter.widget-view+json`, and replacement state contained the new values.
All assertions passed. The executed notebook remained a temporary smoke artifact; this does
not supply one of the downloadable starter notebooks required by later waves.

Observed non-fatal warnings: the isolated kernelspec prefix was outside the default search
paths (resolved using the explicit `JUPYTER_PATH`), and ipykernel warned that its local TCP
transport did not use encryption. Neither warning prevented execution.

## Browser renderer and local HTML checks

```sh
pnpm exec playwright test -c tests/bundle/playwright.config.ts notebook.spec.ts
```

Both existing tests passed:

- Bundled module renders encoded 2D/3D figures with external requests blocked, updates state
  and disposes charts.
- Updates coalesce, errors are visible, and disposal during asynchronous mounting releases
  the view.

These tests use a fixture widget model and view interface. They verify the bundled frontend
independently of anywidget's real notebook widget manager. Combined with the kernel check,
they provide separate backend and frontend evidence, not full notebook-host integration.

The plain HTML example was extracted verbatim from the installation guide. The complete
`packages/holochart/dist/` directory was copied into a temporary directory and served using
`python3 -m http.server 8876 --bind 127.0.0.1 --directory <temporary-directory>`. Playwright
Chromium used `--enable-webgl --use-gl=angle --use-angle=swiftshader
--enable-unsafe-swiftshader`. The check waited for the chart's `ready` promise, found one chart
canvas and a successful relative `fonts/texgyreheros-regular.otf` request, and asserted no page
errors or HTTP error responses. It passed; the temporary server was stopped.

## Documentation checks and remaining verification

Eight release-command gating unit tests, focused ESLint, Prettier and page lint passed. The
gating tests cover independent npm/PyPI availability, smoke-test requirements, exact versions
and pinned npm peer installation. An intermediate docs typecheck failed while another worker's
`examples/_lib/catalog.ts` was not yet present; a repeat after that module landed passed.
Final browser/build integration checks belong to the parent task and are reported separately.

No npm/PyPI publication, registry install of Holochart, verified public Python checkout, full
interactive notebook-host session, Windows install, Python minimum-version matrix or human
time-to-first-chart measurement was performed.
Keep these limitations visible when marking SITE-08 acceptance and the later onboarding work.
