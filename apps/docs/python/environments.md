---
title: Tested notebook environments
description: Verified local notebooks, hosted environment blockers, and editor setup checks.
status: complete
---

<script setup>
import NotebookLinks from '../.vitepress/theme/components/NotebookLinks.vue';
</script>

# Tested notebook environments

The learning notebooks were tested on **2026-10-09** using the development build of
`holochart-py`. Both hosts restarted the kernel, ran the downloaded learning cells and displayed
charts through their actual widget managers. These results describe the versions exercised,
rather than minimum versions or a promise about every notebook editor.

<div class="hc-table-scroll hc-environment-table" role="region" aria-label="Notebook host verification status" tabindex="0">

| Host                        | Version              | Verified scope                                                                                                                              |
| --------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| JupyterLab                  | 4.6.4                | 14 learning notebooks and 24 exact gallery variants render; slider updates the existing chart; rerunning the creation cell leaves one view. |
| Jupyter Notebook            | 7.6.3                | The same 38 artifacts and update checks pass; the host emits the startup issue described below.                                             |
| VS Code notebooks           | Unverified           | Local editor setup evaluated; the bounded frontend attempt did not produce observable chart evidence.                                       |
| Google Colab                | Unverified           | Custom widget setup researched; no Holochart runtime has been tested.                                                                       |
| Binder                      | Blocked / unverified | A public, reproducible bridge artifact and notebook revision are needed before a launch can be tested.                                      |
| JupyterLite / other editors | Unverified           | No host session has been tested; the regular CPython installation path is not a browser-Python setup.                                       |

</div>

## Exact test environment

- macOS 26.6.2 on Apple silicon; Chromium 153.0.8010.12 through Playwright, with software WebGL2.
- Python 3.14.8, ipykernel 7.4.0 and locally built `holochart-py` 0.0.0.
- anywidget 0.11.0 and ipywidgets 8.1.9.
- Plotly 7.1.0, pandas 3.0.6 and NumPy 2.5.3 for the examples that need them.

Python 3.10+ is the package's declared requirement; these checks exercised Python 3.14.8.
They do not verify Windows/Linux, every hardware GPU, other browsers or every version of these
dependencies. The data in the learning notebooks is local and deterministic. The bridge bundles
its runtime and default fonts; unavailable Unicode glyphs may still require a fallback download.

The [verified dependency pins](/notebooks/requirements-verified.txt) reproduce the
Python libraries used here. Install the development bridge separately using the source setup;
these pins do not install a published bridge package or select your Python interpreter.
Repository evidence in `docs/site/wave3/notebooks/README.md` records the exact source hashes, expected output counts and real-host runs.

## Choose a host

**Use local JupyterLab or Notebook for the verified learning path.** The
[14 notebook downloads](/python/notebooks/) and
[source installation](/getting-started/installation#python-and-jupyter-from-source)
remain available independently of hosted services. There are no hosted launcher buttons yet.
The following evaluation was updated on **2026-10-09**; an unverified host may be viable, but
its documented widget support is not a Holochart rendering result.

<div class="hc-table-scroll hc-environment-table hc-environment-table--comparison" role="region" aria-label="Notebook environment setup comparison" tabindex="0">

| Environment                 | Widget manager / frontend                                                            | Graphics                                                                           | Package and notebook availability                                                                                   | Data access                                                                    | Startup evidence                                                      |
| --------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| Local JupyterLab / Notebook | Actual managers verified with all 38 artifacts.                                      | WebGL2 verified in the browser version above.                                      | Development wheel installed; downloads and tested pins available.                                                   | All learning data is included in the cells.                                    | No startup-time benchmark recorded.                                   |
| VS Code desktop             | Python/Jupyter extensions and selected kernel needed; Holochart frontend unverified. | Editor webview must provide WebGL2; not checked in this attempt.                   | Install the bridge in the selected local kernel; open a downloaded notebook.                                        | Included data works without a remote dataset account.                          | Not measured; isolated test window could not be observed.             |
| Colab                       | Custom widget manager setup needed; exact anywidget/bridge combination unverified.   | Browser output must provide WebGL2; remote runtime GPU is a separate resource.     | No published bridge install or verified public source revision; a manually supplied built wheel would need testing. | Included data needs no Drive mount; runtime files are temporary.               | Not measured; no remote session started.                              |
| Binder                      | Pinned Jupyter/anywidget setup is a candidate, not a verified Binder image.          | Client browser must provide WebGL2; server Python execution does not establish it. | Public immutable notebook revision plus bridge wheel or complete build inputs required.                             | Included data avoids credentials; save work before the temporary session ends. | Not measured; image build, pull and server start are separate stages. |

</div>

Holochart's Python widget sends synchronized figures to its bundled JavaScript renderer.
Rendering happens in the output frontend. **Inference from the bridge implementation:** enabling
a Colab Python GPU or installing a package on a Binder server cannot repair missing WebGL2 in
the client frontend. The bridge bundles its chart runtime; the host must still load anywidget's
frontend and connect widget messages to the kernel.

## VS Code: setup evaluated, rendering unverified

VS Code's Jupyter extension supports notebook execution and kernel selection. Restricted Mode
prevents execution and rich output; review a downloaded notebook's code before deciding whether
to trust its workspace. [VS Code notebook documentation](https://code.visualstudio.com/docs/datascience/jupyter-notebooks).

For an editor check, first complete the local source installation, then:

1. Open the downloaded [first-chart notebook](/python/notebooks/) in VS Code desktop.
2. Choose **Select Kernel** and the Python environment where the development bridge is installed.
3. In a temporary code cell, run `import sys, holochart; print(sys.executable, holochart.__file__)`.
   Check that both paths belong to that environment, then restart the kernel and run all cells.
4. Check for three rendered charts, rather than only completed Python cells or widget MIME output.
5. Run [widget controls](/python/widgets): change Multiplier and confirm the chart
   updates; rerun the creation cell and check that only one control/chart view remains.

<NotebookLinks slug="first-chart" source-page />
<NotebookLinks slug="widget-controls" source-page />

Microsoft's widget documentation describes frontend script discovery and permitted CDN sources.
If the editor reports missing widget scripts, inspect its Jupyter output and the exact extension
version before changing script settings; a working local kernel alone does not prove frontend
loading. [VS Code widget architecture](https://github.com/microsoft/vscode-jupyter/wiki/Component:-IPyWidgets).

The bounded local attempt found VS Code **1.140.0**, Python extension **2026.8.0**, Jupyter extension
**2025.9.1** and notebook renderer **1.3.0**. An isolated profile launched, but the automation tool
could only observe the existing Welcome window. No notebook execution or chart was verified;
these are inspected installation versions, not a supported-version matrix.

## Colab: candidate setup, no verified launcher

Colab's own implementation exposes `output.enable_custom_widget_manager()` for custom widgets.
The candidate setup cell below has **not** been tested with Holochart in Colab.
[Colab custom widget implementation](https://github.com/googlecolab/colabtools/blob/main/google/colab/output/_widgets.py).

```python
# Colab-only candidate; run after installing a separately supplied development wheel.
from google.colab import output
output.enable_custom_widget_manager()
```

Colab can open uploaded notebooks, but each runtime still needs its packages installed. Runtime
files and availability are temporary, and sharing a notebook does not share its installed
environment. [Colab FAQ](https://research.google.com/colaboratory/faq.html).

Our current bridge is unpublished, and the source-install status does not name a public revision
containing it. A GitHub launch badge would therefore imply an install path that has not been
established. A future check must provide a built wheel with a recorded hash, record Colab's actual
Python/library versions, enable the manager, and verify initial render, updates and rerun cleanup.
The local pins include Jupyter host packages; they are **not a tested replacement for Colab's
managed runtime**. A separate host setup must be validated instead of overwriting it wholesale.

## Binder: artifact and image verification pending

Binder builds an environment from a public repository containing notebooks and environment
configuration. A launcher needs an actual public revision containing both the intended notebook
and reproducible package inputs. [Binder setup requirements](https://mybinder.readthedocs.io/en/latest/introduction.html).

The candidate image would pin Python and the notebook libraries, install a versioned bridge wheel
with its bundled renderer, and select JupyterLab. Building the bridge from source instead would
also require the documented Node/pnpm workspace build inputs. Neither image has been built or
tested remotely. The checked local Python pins do not by themselves supply a bridge artifact.

Binder startup includes image build, image pull and session creation; cache state affects which
stages run. Sessions are temporary. No Holochart cold or warm launch duration has been measured.
[Binder startup and session guidance](https://mybinder.readthedocs.io/en/latest/about/user-guidelines.html#performance-and-speed).

Before enabling a launcher, test its exact immutable revision from a fresh session, verify its
intended notebook and chart, repeat the run with the pinned setup, and record cold/warm startup
conditions separately. Until then, use the downloadable notebooks locally.

## Notebook startup issue observed

Notebook 7.6.3 logs a startup exception about reading `schema` from its own core module. The
same exception occurs in an empty notebook with no Holochart imports. It did not prevent the
tested charts or slider from rendering and updating. The evidence records it as a host warning;
JupyterLab did not emit it. This distinguishes chart verification from the health of the whole
notebook application.

## Try a verified learning path

[Start with your first chart](/getting-started/python-jupyter),
[download a learning notebook](/python/notebooks/), or
[check a missing output](/python/troubleshooting).

An active widget manager and WebGL2 are required. Python still needs a development checkout
containing the bridge; [source installation](/getting-started/installation#python-and-jupyter-from-source)
explains the environment and kernel selection.

<style>
.vp-doc .hc-environment-table {
  width: 100%;
  min-width: 0;
  margin: 16px 0;
}
.vp-doc .hc-environment-table > table {
  display: table;
  width: 100%;
  min-width: 720px;
  margin: 0;
  overflow: visible;
}
.vp-doc .hc-environment-table--comparison > table {
  min-width: 1200px;
}
.hc-environment-table:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 3px;
}
</style>
