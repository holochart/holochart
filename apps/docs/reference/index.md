---
title: Reference
description: Generated attribute and API references, events, errors, colorscales, marker symbols, Plotly compatibility, and the machine-readable schema.
status: complete
---

# Reference

The reference is generated from the source wherever possible, so it always matches the code.

## Attribute reference

Every attribute of every trace type, of `layout`, and of `config` is declared in Holochart's
schema. The attribute reference is generated from that schema at build time. Each entry shows the
attribute's full path, type, default, allowed values, whether it accepts per-point arrays
(`arrayOk`), its edit type, and its description. Entries have deep-linkable anchors, such as
[`layout#xaxis.range`](/reference/layout#xaxis.range).

The defaults listed are the schema's, which are Plotly's. A chart without `layout.template` also
applies the [`holochart` template](/customization/themes-templates#the-default-look) on top of
them, so what it shows can differ; `chart.fullLayout` and `chart.fullData` have the final values.

- [Layout](/reference/layout): axes, subplots, title, legend, and other figure-wide attributes
- [Config](/reference/config): per-chart behavior
- One page per trace type, such as [scatter](/reference/scatter), listed in the sidebar.

## JavaScript API reference

The [API reference](/reference/api/) documents the exported functions, classes, and types of
every published package, generated from the TypeScript sources with TypeDoc.

## Events and errors

- The [events reference](/reference/events) lists every event a chart emits and its payload.
- [Errors and warnings](/reference/errors) lists what warns, what rejects, and the error classes.

## Colorscales and marker symbols

Both pages are generated from the library's registries:

- [Colorscales & palettes](/reference/colorscales): every built-in colorscale and qualitative
  palette, with a swatch.
- [Marker symbols](/reference/marker-symbols): every marker symbol with its name, code and
  variants.

## Plotly compatibility

[Plotly compatibility](/reference/plotly-compat) compares Holochart's schema with plotly.js':
which trace types, attributes, layout keys and config options are supported, partial or missing,
and the known deviations.

## plot-schema.json

The whole schema is published as [plot-schema.json](/plot-schema.json), with the keys `traces`,
`layout`, `config` and `defs`. The attribute reference is generated from the same data.
