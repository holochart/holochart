---
title: Materials, lighting & effects
description: Give traces lit materials, extrude 2D charts into 2.5D, inject shader code, and add post-processing.
status: stub
milestone: M6
---

# Materials, lighting & effects

This page will cover Holochart's 3D-native styling: materials, lights, extrusion, shader hooks,
and post-processing.

Planned topics:

- Materials: `trace.material` with `flat`, `lambert`, `phong`, `standard`, `physical`, `toon`, and
  `matcap` types
- Lighting: `layout.lighting` with ambient, directional, and hemisphere lights, environment maps,
  and shadows
- Extrusion and 2.5D: `depth` and `bevel` on bars, pies, areas, and treemaps, and `layout.view3d`
  to show a 2D subplot in perspective
- Shader hooks: injecting GLSL at points such as `fragment:color`, with custom uniforms
- Post-processing: bloom, outlines, ambient occlusion, and anti-aliasing via `layout.effects`

Shader hooks and post-processing are planned for M7; materials, lighting, and extrusion for M6.
