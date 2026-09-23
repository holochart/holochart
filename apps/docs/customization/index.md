---
title: Customization
description: The customization cascade, from theme defaults to custom traces, and which layer to use when.
status: stub
milestone: M2
---

# Customization

Holochart's styling works as a cascade. Each layer overrides the one above it, so you can start
with a theme and reach for more control only where you need it. This section will get one page
per layer, with a runnable example each.

1. **Library defaults**: the `dflt` value of each attribute in the schema.
2. **Theme or template**: `layout.template = 'dark'`, or an object with layout and per-trace-type
   defaults. See [Themes & templates](/customization/themes-templates).
3. **Layout-level defaults**: `layout.colorway`, `layout.font`, `layout.hoverlabel`.
4. **Trace attributes**: `{ marker: { color: 'red', size: 8 } }`.
5. **Per-point arrays**: `{ marker: { color: [...], size: [...] } }`. See
   [Per-point styling](/customization/per-point-styling).
6. **Style rules**: serializable conditions such as
   `styleRules: [{ when: { y: { gt: 10 } }, set: { 'marker.color': 'gold' } }]`.
7. **Style functions**: `{ marker: { color: (d, i) => (d.y > 10 ? 'gold' : 'gray') } }`. Not
   serializable.
8. **Material overrides**: `{ material: { type: 'standard', metalness: 0.4 } }`. See
   [Materials & lighting](/customization/materials-lighting).
9. **Shader hooks**: GLSL injected at named points in a trace's shaders.
10. **Render hooks and scene access**: `chart.on('beforerender', ...)` and `chart.three.scene`.
    See [Adding your own three.js objects](/customization/three-objects).
11. **Custom traces and components**: `register(myTraceModule)`. See
    [Writing a custom trace](/extending/custom-trace).

Holochart also adds **3D-native** options: any 2D trace can take `depth`, `material`, and
`castShadow`, and any 2D subplot can be shown in perspective with `layout.view3d`.

See also [Custom markers, patterns & textures](/customization/markers-patterns).
