---
title: Coming from d3
description: How to think about Holochart if you are used to building charts with d3.
status: stub
milestone: M2
---

# Coming from d3

This page will explain Holochart to d3 users: what the declarative figure replaces, and where you
still get d3-level control.

Planned topics:

- Declarative figures instead of data joins and DOM manipulation
- Scales, formats, and time handling (Holochart uses d3's micro-libraries, so format strings match)
- Style functions such as `(d, i) => color`, and their serializable alternative, style rules
- Direct access to the three.js scene for custom drawing
- Writing a custom trace when a chart type does not exist

See also [Core concepts](/getting-started/core-concepts) and
[Customization](/customization/).
