---
title: Reference
description: Generated attribute and API references, the events list, and the machine-readable schema.
status: draft
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
- One page per trace type, such as [scatter](/reference/scatter). Trace pages appear in the
  sidebar as trace types are registered.

## JavaScript API reference

The [API reference](/reference/api/) documents every public function, class, and type, generated
from the TypeScript sources with TypeDoc.

## Events

The [events reference](/reference/events) lists every event a chart emits and its payload.

## plot-schema.json

The whole schema is published as [plot-schema.json](/plot-schema.json). Tools can use it to
validate figures or to autocomplete figure JSON in an editor. A JSON Schema version for editor
autocomplete will be published with each release.

## Planned

These reference pages will be generated from Holochart's registries:

- [Colorscales & palettes](/reference/colorscales)
- [Marker symbols](/reference/marker-symbols)
- [Plotly compatibility table](/reference/plotly-compat)
