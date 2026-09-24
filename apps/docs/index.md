---
layout: home
title: Holochart
description: Declarative GPU charts on three.js, with Plotly-compatible figures rendered through one WebGL pipeline.
status: complete

hero:
  name: Holochart
  text: Declarative GPU charts on three.js
  tagline: Describe a figure as Plotly-compatible JSON. Holochart renders every trace through one WebGL pipeline.
  image:
    src: /hero-chart.svg
    alt: A line chart in Holochart's default look, four thin colored lines on a near-black background
  actions:
    - theme: brand
      text: Get started
      link: /getting-started/installation
    - theme: alt
      text: Core concepts
      link: /getting-started/core-concepts
    - theme: alt
      text: GitHub
      link: https://github.com/holochart/holochart

features:
  - title: Schema-first reference
    details: Every attribute is declared once with its type, default, and description. TypeScript types, validation, defaults, and the attribute reference are all generated from that declaration.
  - title: GPU-native primitives
    details: Markers, lines, bars, and cells are instanced GPU geometry with custom shaders. There is no SVG vs WebGL split and never one object per data point.
  - title: 2D is a special case of 3D
    details: 2D subplots use a pixel-space orthographic camera, so the same primitives render in both modes and a 2D chart can be extruded, tilted, and lit.
  - title: Plotly-compatible JSON
    details: A figure is data, layout, config, and frames, with Plotly's semantics and attribute names wherever reasonable. Existing knowledge carries over.
  - title: Accessible by default
    details: The canvas renders the chart, and a DOM mirror describes it for screen readers and keyboard users.
  - title: Dark and dense by default
    details: The default look is built for dashboards, with small crisp text, thin lines and a colorway that reads on near-black. Plotly's look is one setting away, and themes, templates, style rules, materials and shader hooks go further.
---
