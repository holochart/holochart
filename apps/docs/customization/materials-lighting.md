---
title: Materials, lighting & effects
description: Light 3D traces with Plotly's lighting model or three.js materials, set up scene lights, shadows and environments, and draw translucent meshes in the right order.
status: draft
---

# Materials, lighting & effects

3D surfaces and meshes (`surface`, `mesh3d`, `isosurface`, `volume`, and later extruded 2D charts)
are drawn by one mesh primitive. By default it lights them exactly like Plotly, so Plotly figures
look the same. On top of that, Holochart adds three.js materials per trace, scene lights with
shadows and environment maps, and correct compositing of translucent meshes.

::: info Status
The renderer side is in place (M6 wave 0): the mesh primitive, Plotly's lighting model, the
material types, light rigs and transparency sorting. The trace and layout attributes below arrive
with the 3D traces (M6 wave 1). Extrusion and 2.5D views follow in M6 wave 3; shader hooks and
post-processing in M7.
:::

The 3D code loads the first time a figure draws a 3D mesh, so 2D charts don't pay for it.

## Plotly's lighting: `lighting` and `lightposition`

Every trace drawn with a mesh takes Plotly's `lighting` and `lightposition`:

<!-- docs-gates: no-typecheck -->

```ts
createChart(el, {
  data: [
    {
      type: 'surface',
      z: heights,
      lighting: { ambient: 0.6, diffuse: 0.9, specular: 1.2, roughness: 0.2, fresnel: 0.5 },
      lightposition: { x: -1e5, y: 1e5, z: 0 },
      flatshading: false,
    },
  ],
});
```

| Attribute                       | Default                  | What it does                                                                                               |
| ------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `lighting.ambient`              | 0.8                      | Light reaching every face, 0–1.                                                                            |
| `lighting.diffuse`              | 0.8                      | Light from the light position, by the angle of the face (Lambert), 0–1. Ambient + diffuse is capped at 1.  |
| `lighting.specular`             | 0.05                     | Strength of the white highlight, 0–2.                                                                      |
| `lighting.roughness`            | 0.5                      | Width of the highlight (Beckmann roughness), 0–1: small values give a small, sharp highlight.              |
| `lighting.fresnel`              | 0.2                      | Exponent of the Fresnel factor `(1 − V·N)^fresnel`, 0–5: larger values keep the highlight near the edges.  |
| `lighting.facenormalsepsilon`   | 1e-6                     | With `flatshading`, faces smaller than this get no normal and only ambient light.                          |
| `lighting.vertexnormalsepsilon` | 1e-12                    | Smooth shading: tiny corners are left out of vertex normals, and vertices whose normal vanishes are unlit. |
| `lightposition`                 | `{x: 1e5, y: 1e5, z: 0}` | Where the light is, in clip space: the default is far to the upper right of the screen.                    |

The model is Plotly's (gl-mesh3d and gl-surface3d): `min(ambient + diffuse · max(N·L, 0), 1) ·
color + specular · cookTorrance(L, V, N, roughness, fresnel)`, computed on the sRGB colors and on
both sides of the surface. Because `lightposition` is in clip space, the light moves with the
camera: when you rotate the scene, the lit side stays the one facing the upper right of the
screen. Colorscales (`intensity`, surface `z`) are sampled per pixel, so color bands stay sharp on
coarse meshes; `intensitymode: 'cell'` colors each face with one value.

<Example id="_dev/mesh-lighting" />

<Example id="_dev/mesh-shading" />

## Material types: `trace.material`

`material.type` switches a trace from Plotly's model to another way of shading. Any other entry
of `material` sets the matching property of the three.js material:

<!-- docs-gates: no-typecheck -->

```ts
{
  type: 'mesh3d',
  x, y, z, i, j, k,
  color: '#1f77b4',
  material: { type: 'physical', roughness: 0.3, metalness: 0.2, clearcoat: 1 },
}
```

| `type`       | Drawn with                            | Notes                                                                                   |
| ------------ | ------------------------------------- | --------------------------------------------------------------------------------------- |
| `'plotly'`   | Plotly's lighting model (the default) | Uses `lighting` and `lightposition`.                                                    |
| `'flat'`     | No lighting                           | Colors exactly as given, like a 2D chart.                                               |
| `'basic'`    | `MeshBasicMaterial`                   | Unlit, but reflects an environment map.                                                 |
| `'lambert'`  | `MeshLambertMaterial`                 | Diffuse light only.                                                                     |
| `'phong'`    | `MeshPhongMaterial`                   | `shininess` defaults from `lighting.roughness`, `specular` from `lighting.specular`.    |
| `'standard'` | `MeshStandardMaterial`                | Physically based: `roughness` (default `lighting.roughness`), `metalness`, environment. |
| `'physical'` | `MeshPhysicalMaterial`                | Adds `clearcoat`, `sheen`, `transmission`, `ior`, `iridescence`, …                      |
| `'toon'`     | `MeshToonMaterial`                    | `steps` shading bands (default 3).                                                      |
| `'matcap'`   | `MeshMatcapMaterial`                  | Pass a `matcap` texture; without one, three.js' default gradient.                       |

Numbers, booleans and textures are set as they are; colors (`emissive`, `specular`, `sheenColor`,
…) take a CSS color. The three.js types are lit by the scene's lights (`layout.lighting` below)
and receive shadows; they map colorscales per vertex (or per face) rather than per pixel.

<Example id="_dev/mesh-materials" />

## Scene lights: `layout.lighting`

`layout.lighting` replaces Plotly's single light with a light rig for every 3D scene:

<!-- docs-gates: no-typecheck -->

```ts
layout: {
  lighting: {
    ambient: { color: '#ffffff', intensity: 0.4 },
    directional: [
      { position: [1, -1, 3], intensity: 0.9, castShadow: true },
      { position: [1, 1, 0], space: 'camera', color: '#ffe8cc', intensity: 0.3 },
    ],
    hemisphere: { skyColor: '#dde8ff', groundColor: '#443322', intensity: 0.3 },
    environment: 'studio',
    shadows: { ground: true, opacity: 0.3 },
  },
}
```

- **`ambient`**, **`directional`**, **`hemisphere`**: intensities are in Plotly's units, 1 is the
  full color. A directional light's `position` is in scene space by default (it shines toward the
  scene's center), in view space with `space: 'camera'` (x right, y up, z toward you: it moves with
  the camera), or Plotly's clip space with `space: 'clip'`.
- **`environment`**: image-based light and reflections for `standard`, `physical`, `phong` and
  `basic`: a built-in `'studio'` or `'city'` room, or the URL of an equirectangular image.
- **`shadows`**: lights with `castShadow` cast shadow maps onto three.js material types and onto a
  `ground` plane (`true` puts it below the scene, a number sets its offset along the scene's up
  axis). `extent` sets the shadowed region's half-size, `mapSize` the shadow map's size.

With `layout.lighting`, traces drawn with Plotly's model use the rig's lights too, scaled by their
`lighting` coefficients (`ambient` scales the ambient and hemisphere lights, `diffuse` and
`specular` the directional ones). Without it, three.js material types get Plotly's default light:
ambient 0.8 and a light at `lightposition`.

## Translucent meshes

A trace with `opacity` below 1 (or translucent colors) is drawn after the opaque ones, farthest
first, without writing depth, so what is behind it shows through. Inside one mesh, triangles are
sorted back to front too each time the view changes (up to 500,000 triangles), so a translucent
surface that folds over itself, or a closed isosurface, composites correctly. Both sides of a
double-sided translucent mesh are drawn: the back faces first, then the front faces.

<Example id="_dev/mesh-transparency" />

Order-independent transparency for very dense translucent meshes is planned.

## For plugin authors: the mesh primitive

The primitive is available from `@mk7s/holochart-render` for custom 3D traces. It loads its code
on first use; `ready` resolves once it draws:

```ts
import { createLazyMeshPrimitive, createRenderRoot, loadMeshModule } from '@mk7s/holochart-render';

const root = createRenderRoot(el);
const viewport = root.addViewport({ kind: '3d' });
const mesh = createLazyMeshPrimitive(root.context, {
  // xyz per vertex, relative to `origin` (float64) for precision
  positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0.5]),
  indices: new Uint32Array([0, 1, 2, 2, 1, 3]),
  intensity: [0, 1, 2, 3],
  colorscale: [
    [0, [0.27, 0.0, 0.33, 1]],
    [1, [0.99, 0.91, 0.15, 1]],
  ],
  lighting: { specular: 0.5 },
});
viewport.add(mesh);

// A scene-wide light rig (layout.lighting), shared by three.js materials and Plotly's model.
const { createLightRig } = await loadMeshModule();
const rig = createLightRig({ ambient: { intensity: 0.5 }, directional: [{ position: [1, 1, 2] }] });
rig.setCamera(viewport.camera);
viewport.scene.add(rig.object);
rig.attach(root.renderer, viewport.scene);
mesh.setLightRig(rig);
await mesh.ready;
```

Updates are partial: new colors, intensities or alpha rewrite only their buffer, and `cmin` /
`cmax`, `opacity`, `lighting`, `lightposition` and the clip box are uniforms. The primitive picks
per vertex (or per triangle) through the GPU picker, and `hooks` inject GLSL into its shader, for
example contour lines on a surface.
