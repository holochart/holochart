---
title: Python & Jupyter
description: Install the notebook bridge, render Plotly figures, update widgets, download learning notebooks and check tested environments.
status: complete
aside: false
pageClass: hc-catalog
---

<script setup>
import NotebookLinks from '../.vitepress/theme/components/NotebookLinks.vue';
</script>

# Python & Jupyter

Create GPU charts in notebook outputs using Plotly figures or Python dictionaries. The Python
distribution is **`holochart-py`**; import **`holochart`**. The bridge uses anywidget, an
ipywidgets manager and browser WebGL2. Python and browser examples share figure semantics.

<InstallStatus ecosystem="python" />

## Start with one notebook

The [Python quick start](/getting-started/python-jupyter) supplies five observations, imports,
renderer registration, the first chart, styling and a replacement update. Complete the source
setup first: it currently requires a development checkout containing `packages/holochart-py`.
A public-main clone alone cannot install the bridge.

<NotebookLinks slug="first-chart" />

## Follow the learning path

<div class="hc-card-grid">
<section class="hc-card">

### 1. Install and select a kernel

[Development setup](/getting-started/installation#python-and-jupyter-from-source) provides
prerequisites, browser build, virtual environment, kernel registration/selection and restart
instructions. Install into the same Python environment as the notebook kernel.

</section>
<section class="hc-card">

### 2. Render the first chart

[Python quick start](/getting-started/python-jupyter) uses built-in data and complete cells.
Import alone does not select Holochart: register the Plotly renderer once per kernel.

</section>
<section class="hc-card">

### 3. Use familiar Plotly APIs

[Plotly Express and graph_objects](/python/plotly) cover DataFrames, NumPy, dates, categories,
missing values and mixed traces. Python's `plotly.express` is separate from TypeScript Express.

</section>
<section class="hc-card">

### 4. Update a widget

[Direct widgets and Python controls](/python/widgets) accept dictionaries, JSON strings and
figures. Replace state to redraw one output; try the Multiplier slider with explicit cleanup.

</section>
<section class="hc-card">

### 5. Explore notebooks and chart families

[Fourteen learning notebooks](/python/notebooks/) have matching `.py` sources and web cells. Find
[gallery examples](/gallery/) with an actual Python variant or compare [chart guides](/charts/).

</section>
<section class="hc-card">

### 6. Check the host and fix failures

[Verified environments](/python/environments) record exact versions and test scope.
[Troubleshooting](/python/troubleshooting) covers kernel mismatch, widget manager, WebGL2,
missing assets, state replacement and unsupported features.

</section>
</div>

## Dependencies and limits

Python **3.10+** is the declared minimum. The base package needs anywidget and traitlets;
anywidget brings ipywidgets. Plotly is optional for JSON-safe dictionary/string inputs.
Install the `[plotly]` extra for Plotly Figures or its NumPy/date encoder, and add pandas/NumPy
when your example imports them. All learning examples declare these dependencies and their data.

The wheel embeds the matching 2D runtime, 3D add-on and default fonts. Installing a complete
wheel needs no npm/CDN; building it from source currently needs Node/pnpm. Unicode fallback
characters can still cause font requests. Geo and graph extensions are absent from these
notebook bundles. Static notebook exports and browser-to-Python interaction events are outside
current support. Review the [compatibility table](/reference/plotly-compat) before migration.

JupyterLab and Jupyter Notebook have their own host verification records. VS Code, Colab,
Binder and other notebook editors remain unverified until exercised; consult the
[environment matrix](/python/environments) rather than assuming every widget host behaves alike.

The [Python API reference](/python/api) documents public imports, inputs, dimensions and cleanup.
For a compact refresher, keep the existing [notebook bridge guide](/guides/notebooks) handy.
