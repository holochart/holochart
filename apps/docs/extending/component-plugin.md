---
title: Writing a component plugin
description: Add a layout-level component, such as a watermark or brush, to Holochart figures.
status: stub
milestone: M7
---

# Writing a component plugin

This page will explain how to add a layout-level component: something drawn once per figure
rather than once per trace, like a watermark, a custom legend, or a brush.

Planned topics:

- The component contract: `name`, `layoutSchema`, `supplyLayoutDefaults`, `draw`, `pushMargin`,
  and `onInteraction`
- Adding layout attributes that validate and appear in the generated reference
- Reserving margin space
- Handling pointer input
- Lifecycle hooks (`beforePlot`, `afterPlot`, `beforerender`, `afterrender`, `destroy`)
- A worked example: a watermark component
