---
title: Traces & trace types
description: What a trace is, how trace types are chosen and registered, and the attributes all traces share.
status: stub
milestone: M1
---

# Traces & trace types

This page will explain traces, the unit of data in a figure: how a trace's `type` selects a trace
module, which attributes every trace shares, and how traces map onto subplots.

Planned topics:

- The `type` attribute and the trace type catalogue ([chart types](/charts/))
- Attributes shared by all traces: `name`, `visible`, `opacity`, `showlegend`, `legendgroup`,
  `uid`, `ids`, `customdata`, `meta`
- Modes and conditional attributes (for example `marker.*` only when `mode` includes `markers`)
- Placing traces on axes (`xaxis: 'x2'`) and in domain-based subplots
- Trace order, `zorder`, and trace identity with `uid`
- Registering trace types when using partial bundles

See also [Core concepts](/getting-started/core-concepts).
