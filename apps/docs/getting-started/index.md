---
title: Get started
description: Choose a Python notebook or browser workflow, check the prerequisites, and render your first Holochart chart.
status: complete
aside: false
pageClass: hc-catalog
---

# Get started

Choose the environment where your chart will run. Holochart needs a browser with WebGL2;
notebook outputs also need an ipywidgets manager. The JavaScript packages are on npm and a CDN.
The Python bridge is not on PyPI yet; install it from a clone of the repository.

<InstallStatus />

<div class="hc-card-grid">
<section class="hc-card">

## Python & Jupyter

Display a Plotly figure or a Python dictionary in an interactive notebook output. Start with
Python 3.10+, a notebook kernel, Git, Node.js 22+ and pnpm 11.15.1. `holochart-py` is not on
PyPI yet, so you install it from a clone of the repository; Node.js and pnpm build its browser
assets. The expected result is a Plotly line widget, styling, and a replacement update in one
output.

[Set up Python from a clone](/getting-started/installation#python-and-jupyter-from-source) ·
[Complete Python quick start](/getting-started/python-jupyter) ·
[Python learning path](/python/)

</section>
<section class="hc-card">

## JavaScript & TypeScript

Mount a chart into a browser application, update it, and dispose it when the view closes.
Start with Node.js, npm and a bundler such as Vite, and install the packages from npm. The
expected result is a line/bar chart with working update and disposal buttons.

[Install from npm](/getting-started/installation#install-from-npm) ·
[Complete browser quick start](/getting-started/javascript) ·
[Understand figures and traces](/getting-started/core-concepts)

</section>
<section class="hc-card">

## Plain HTML

Load the script-tag build from a CDN in a page with a sized chart container. No install or build
step is needed. The main script is 2D; add the 3D script of the same version only when your
figure needs it. The expected result is the same line/bar chart, with its default fonts.

[Use a script tag](/getting-started/installation#use-a-script-tag) ·
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
