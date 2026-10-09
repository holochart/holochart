---
title: Python & Jupyter quick start
description: Install the development bridge, select its kernel, display a Plotly figure, style it, and update one widget output.
status: complete
---

<script setup>
import NotebookLinks from '../.vitepress/theme/components/NotebookLinks.vue';
</script>

# Python & Jupyter quick start

Use five built-in observations to create a line chart. No data download, account or previous
notebook is needed. The notebook and web cells below come from the same Python source.
The chart steps take a few minutes after the one-time environment and browser build.

<InstallStatus ecosystem="python" />

## 1. Set up the environment in a terminal

Start from an **existing development checkout containing `packages/holochart-py`**; the public
main clone does not currently include the bridge. You need Node.js 22+, pnpm 11.15.1, Python
3.10+, a notebook widget manager and browser WebGL2. On macOS/Linux, run:

```sh
cd /absolute/path/to/development-checkout
pnpm install
pnpm build:packages
python3 -m venv .venv-holochart
source .venv-holochart/bin/activate
python -m pip install 'packages/holochart-py[plotly]' jupyterlab ipykernel
python -m ipykernel install --user --name holochart --display-name "Python (Holochart)"
python -m jupyterlab
```

These are **terminal commands**, not notebook cells. The
[installation guide](/getting-started/installation#python-and-jupyter-from-source) includes
Windows activation, active-kernel `%pip` installation and when to rebuild/reinstall assets.
A built wheel has its scripts/fonts inside it; Node/pnpm are needed for the source build.

## 2. Open the notebook and choose its kernel

Download and open `first-chart.ipynb`, then choose **Python (Holochart)**. Restart the kernel and
run all cells. For a fresh notebook, copy the following cells in their displayed order. Imports
alone do not register the Plotly renderer: the explicit `register_renderer(default=True)` call
selects Holochart for subsequent figures in this kernel.

<NotebookLinks slug="first-chart" />

<!--@include: ../.vitepress/generated/notebooks/first-chart.md-->

## 3. Confirm the result

The first output contains a line through five observations. The styled output has larger
purple markers and no modebar. The direct-widget output updates in place: its last point is 6.
Hover a point to see its values; drag to zoom. Seeing widget MIME output in Python is not enough:
the notebook page must actually draw the canvas. Consult the
[environment matrix](/python/environments) for tested host versions and verification scope.

If the output is missing:

- Print `sys.executable` in a cell and select the `.venv-holochart` kernel if it differs from the
  environment where you installed the bridge. Restart after install changes and rerun imports.
- If you see widget text or an empty output, check that the notebook has an ipywidgets manager;
  installing the Python package alone does not add one to every notebook editor.
- If an alert mentions WebGL2, enable browser hardware acceleration and check WebGL2 support.
  Holochart has no Canvas/SVG rendering fallback.

The [Python troubleshooting guide](/python/troubleshooting) gives concrete checks for those
cases, unsupported traces and missing bundled assets.

## Continue with a concrete task

1. [Use a pandas DataFrame](/python/plotly) for a scatter, ordered bar or date line.
2. [Change the chart to bars](/python/widgets) using a direct dictionary widget.
3. [Change data from a slider](/python/widgets#python-driven-controls) without recreating its output.
