---
title: Writing a custom trace
description: A step-by-step tutorial for adding a new chart type as a trace module.
status: stub
milestone: M7
---

# Writing a custom trace

This tutorial will walk through building a new trace type from scratch, using the same public
contract the built-in traces use.

Planned topics:

- Declaring the trace's attribute schema
- `supplyDefaults` and `calc`: turning input into computed data
- Rendering with the GPU primitives (markers, lines, rects, fills, text)
- Hover, selection, and the legend glyph
- Registering the trace and publishing it as a package
- Testing: unit tests for calc and visual tests for rendering

See the [trace module contract](/extending/trace-module-contract) for the interface itself.
