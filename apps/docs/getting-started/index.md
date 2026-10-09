---
title: Get started
description: Choose a Python notebook or browser workflow, check the prerequisites, and render your first Holochart chart.
status: complete
aside: false
pageClass: hc-catalog
---

# Get started

Choose the environment where your chart will run. Holochart needs a browser with WebGL2;
notebook outputs also need an ipywidgets manager. Source setup is the current installation path.

<InstallStatus />

<div class="hc-card-grid">
<section class="hc-card">

## Python & Jupyter

Display a Plotly figure or a Python dictionary in an interactive notebook output. Start with
Python 3.10+, a notebook kernel, Node.js and pnpm. A development checkout containing
`packages/holochart-py` is currently required; the public main branch has no verified bridge ref.
The expected result is a Plotly line widget, styling, and a replacement update in one output.

[Set up Python from a development checkout](/getting-started/installation#python-and-jupyter-from-source) ·
[Complete Python quick start](/getting-started/python-jupyter) ·
[Python learning path](/python/)

</section>
<section class="hc-card">

## JavaScript & TypeScript

Mount a chart into a browser application, update it, and dispose it when the view closes.
Start with Node.js 22+, pnpm 11.15.1 and the source checkout. The expected result is a
line/bar chart with working update and disposal buttons.

[Install from source](/getting-started/installation#build-from-source-today) ·
[Complete browser quick start](/getting-started/javascript) ·
[Understand figures and traces](/getting-started/core-concepts)

</section>
<section class="hc-card">

## Plain HTML

Use the built browser bundle in a page with a sized chart container. The 2D bundle is the starting
point; add the matching 3D bundle only when your figure needs it. The expected result is the same
line/bar chart, served locally with its default fonts.

[Build the browser bundles](/getting-started/installation#browser-bundles-from-source) ·
[Complete HTML quick start](/getting-started/html)

</section>
<section class="hc-card">

## Existing Plotly figures

Keep a supported figure specification and change the renderer. Review compatibility before
migrating features, especially separate browser extensions.

[Python Plotly workflows](/python/plotly) ·
[JavaScript migration](/getting-started/from-plotly) ·
[Compatibility table](/reference/plotly-compat)

</section>
</div>

## Choose a chart

[Browse examples by chart family](/gallery/) or [compare chart guides](/charts/).
For application setup, continue with [frameworks](/guides/frameworks),
[responsive dashboards](/guides/dashboards), or [troubleshooting](/guides/troubleshooting).
