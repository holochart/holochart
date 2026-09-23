---
layout: home
title: Holochart
description: Declarative GPU charts on three.js, with Plotly-compatible figures rendered through one WebGL pipeline.
status: complete

hero:
  name: Holochart
  text: Declarative GPU charts on three.js
  tagline: Describe a figure as Plotly-compatible JSON. Holochart renders every trace through one WebGL pipeline.
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
  - title: Deep customization
    details: Style charts through themes, templates, per-point arrays, style rules, materials, shader hooks, or direct access to the three.js scene.
---
