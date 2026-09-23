---
title: Per-point styling, style rules & style functions
description: Style individual points with arrays, serializable style rules, or JavaScript functions.
status: stub
milestone: M4
---

# Per-point styling, style rules & style functions

This page will cover the three ways to style individual points, and when to use each.

Planned topics:

- Per-point arrays on `arrayOk` attributes (`marker.color`, `marker.size`, `marker.symbol`, ...)
- Style rules: `styleRules: [{ when, set }]` with operators such as `gt`, `in`, `between`, and
  `regex`. Rules are plain JSON and survive serialization.
- Style functions: `marker.color: (point, i, trace) => ...`, and why they make a figure
  non-serializable
- How each option is turned into per-point GPU data

See also [Customization](/customization/).
