---
title: Learning notebooks
description: Download fourteen self-contained notebooks grouped by learning task and chart family, with matching Python source.
status: complete
---

<script setup>
import NotebookLinks from '../../.vitepress/theme/components/NotebookLinks.vue';
</script>

# Learning notebooks

These fourteen notebooks use explicit sample data and have matching Python source and web cells.
Start from the [development-checkout setup](/getting-started/python-jupyter), choose its kernel,
restart and run all cells. Dependencies below are in addition to a notebook host with a widget
manager and WebGL2. See [tested environments and verification scope](/python/environments).
The category starters use complete dictionary figures. The API introductions also cover Plotly,
NumPy and pandas. Each gallery Python download creates its named figure in one output; related
learning notebooks may display several figures. A kernel check and a browser-host check have
different scopes, reported in the linked environment evidence.

<InstallStatus ecosystem="python" />

## Start and choose an API

### First notebook chart · Lines & relationships

Five observations, explicit Plotly renderer selection, styling and a replacement update.
Dependencies: `holochart-py[plotly]`. [Guide](/getting-started/python-jupyter).

<NotebookLinks slug="first-chart" />

### Plotly Express · Five chart families

DataFrame scatter, ordered bars, a date line with missing data, NumPy histogram and scalar
heatmap. Dependencies: `holochart-py[plotly]`, `pandas`, `numpy`. [Guide](/python/plotly).

<NotebookLinks slug="plotly-express" />

### graph_objects · Mixed lines and bars

The browser tutorial's complete weekly traffic chart and per-output configuration.
Dependencies: `holochart-py[plotly]`. [Guide](/python/plotly#graph-objects-and-mixed-traces).

<NotebookLinks slug="graph-objects" />

### Bars and comparison · Basic charts

Horizontal bars, stacks, signed contributions and text labels. Four complete figures with
explicit categories and values. Dependencies: `holochart-py`.

<NotebookLinks slug="comparison-bars" />

### Time series · Gaps and interpolation

Frozen sensor readings, missing observations, step shapes, line dashes and UTC datetimes.
Four figures show how rendering choices differ from their data. Dependencies: `holochart-py`.

<NotebookLinks slug="time-series-gaps" />

## Update existing outputs

### Direct widgets · Comparison and relationships

Dictionary, JSON-string and Plotly Figure inputs, rounded bars and replacement state.
Dependencies for the full notebook: `holochart-py[plotly]`. [Guide](/python/widgets).

<NotebookLinks slug="widgets" />

### Python-driven slider · Comparison

One Multiplier slider replaces data in the existing bar chart and cleans up on repeated
execution. Dependencies: `holochart-py`, `ipywidgets`. [Guide](/python/widgets#python-driven-controls).

<NotebookLinks slug="widget-controls" />

## Statistical data

### Small sample histogram · Distributions

Seven observations counted in five explicit bins. JavaScript and Python use the same figure.
Dependencies: `holochart-py`. [Python source](/python/notebooks/histogram).

<NotebookLinks slug="histogram" />

### Distributions · Summaries and samples

Precomputed quartiles, horizontal boxes, violins and cumulative histograms. Four exact gallery
counterparts with their sample values included. Dependencies: `holochart-py`.

<NotebookLinks slug="distribution-starters" />

## Layout and presentation

### Subplots · Relationships

Independent six-panel axes and a coupled four-panel scatter grid. Explicit trace-axis references
make subplot routing visible. Dependencies: `holochart-py`.

<NotebookLinks slug="subplot-layouts" />

### Themes and labels · Presentation

Two public templates style the same sampler; a third figure places point labels. Every figure
retains its explicit labels, axes and marker options. Dependencies: `holochart-py`.

<NotebookLinks slug="themes-labels" />

## Scientific data

### NumPy field · Scientific heatmaps

The exact gallery heatmap field: two bumps and one trough on a 60 × 40 grid.
Dependencies: `holochart-py[plotly]`, `numpy`. [Python source](/python/notebooks/heatmap-field).

<NotebookLinks slug="heatmap-field" />

### Data checks · Scientific and relationships

Irregular heatmap edges, missing cells and scatter error arrays. Check row lengths and edge
counts before treating a display issue as a host problem. Dependencies: `holochart-py`.

<NotebookLinks slug="data-troubleshooting" />

## Three-dimensional charts

### Points and surfaces · 3D

A deterministic clustered point cloud and a sampled height field, with explicit camera settings.
Both use the bundled 3D add-on. Dependencies: `holochart-py`.

<NotebookLinks slug="spatial-starters" />

Canonical sources live under `examples/notebooks`. The generator creates `.ipynb` files,
download copies and web cells from the same `.py` cells; source, data and dependencies remain
visible. The [gallery](/gallery/) labels Python variants only where a matching artifact exists.
The [API reference](/python/api) explains synchronized properties and lifecycle. If the first
display fails, follow the [symptom/check/fix guide](/python/troubleshooting).
