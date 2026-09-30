---
title: 3D scenes
description: The 3D scene subplot — camera, projection, aspect ratio, 3D axes and walls, orbit, turntable, zoom and pan controls, and camera events.
status: complete
---

# 3D scenes

A **scene** is the subplot 3D traces draw in: `layout.scene` (and `scene2`, `scene3`, … for more).
It has its own camera, three axes (`xaxis`, `yaxis`, `zaxis`) drawn on the far walls of an axis
box, and mouse, wheel and touch controls. Scenes follow Plotly's `layout.scene` attributes and
events, so 3D figures written for Plotly keep their camera, aspect ratio and axis styling.

::: info 3D traces arrive in M6 wave 1
This page covers the scene itself (plan E14.1a–c). The 3D trace types (`scatter3d`, `surface`,
`mesh3d`, `cone`, …) land next; until then the examples here draw their points with a small
development trace.
:::

<Example id="_dev/scene-default" />

A 3D trace picks its scene with `scene: 'scene2'` (default `'scene'`), like cartesian traces pick
their axes with `xaxis` / `yaxis`. A scene exists when a visible 3D trace uses it.

::: tip Script tag
`@mk7s/holochart` includes 3D scenes. With a [script tag](/getting-started/installation#use-a-script-tag-cdn),
load the 3D add-on `holochart-3d.iife.min.js` after `holochart.iife.min.js`: the main script is
2D only.
:::

## Camera

`scene.camera` places the viewer, in **scene units**: the axis box spans `[-a/2, a/2]` on each
axis, `a` the aspect ratio in use, so with the default 1:1:1 ratio the box is the unit cube around
the origin.

| Attribute                | Default                         | Meaning                                                           |
| ------------------------ | ------------------------------- | ----------------------------------------------------------------- |
| `camera.eye`             | `{ x: 1.25, y: 1.25, z: 1.25 }` | Where the camera is.                                              |
| `camera.center`          | `{ x: 0, y: 0, z: 0 }`          | The point it looks at (panning moves it).                         |
| `camera.up`              | `{ x: 0, y: 0, z: 1 }`          | The direction that points up on screen.                           |
| `camera.projection.type` | `'perspective'`                 | `'perspective'` (45° vertical field of view) or `'orthographic'`. |

Move the eye further from the center to zoom out, and closer to zoom in:

```ts
const layout = {
  scene: {
    camera: {
      eye: { x: 2, y: -1.6, z: 0.9 },
      projection: { type: 'orthographic' },
    },
  },
};
```

<Example id="_dev/scene-orthographic" />

An orthographic camera keeps parallel lines parallel. It sees 2 scene units vertically whatever
the eye's distance, so, as in Plotly, zooming an orthographic scene scales its `aspectratio`
instead of moving the camera.

## Aspect ratio

`scene.aspectmode` decides how long each axis is drawn:

- `'cube'`: a cube, whatever the ranges.
- `'data'`: each axis as long as its data span, compared with the other axes of the same type (a
  log axis is not compared with a linear one).
- `'manual'`: `scene.aspectratio` (`{ x, y, z }`). Setting `aspectratio` implies `manual`.
- `'auto'` (default): `data`, unless one axis would be more than 4 times longer than another; then
  `cube`.

The full layout (`chart.fullLayout.scene.aspectratio`) holds the ratio in use for every mode. The
camera does not move when the box grows: a long `data` or `manual` box may need the eye further
away.

<Example id="_dev/scene-aspect" />

## Axes, walls and background

`scene.xaxis`, `yaxis` and `zaxis` take the cartesian axis attributes that make sense in 3D:
`type` (`linear`, `log`, `date`, `category`, detected from the data like cartesian axes), `range`
and `autorange` (with `autorangeoptions`, `rangemode`, `minallowed` / `maxallowed`), the tick
attributes (`tickmode`, `nticks`, `dtick`, `tickvals`, `ticktext`, `tickformat`, `tickfont`,
`tickangle`, …), `title`, `showgrid` / `gridcolor`, `zeroline` / `zerolinecolor`, `showline` /
`linecolor`, `mirror` and `ticks` / `ticklen` / `tickcolor`. A few are 3D-only:

| Attribute                                                  | Default                      | Meaning                                                   |
| ---------------------------------------------------------- | ---------------------------- | --------------------------------------------------------- |
| `showbackground`                                           | `false`                      | Fill the axis' wall (the back plane perpendicular to it). |
| `backgroundcolor`                                          | `'rgba(204, 204, 204, 0.5)'` | The wall's color.                                         |
| `showaxeslabels`                                           | `true`                       | Draw the axis title.                                      |
| `showspikes`, `spikesides`, `spikecolor`, `spikethickness` | on, 2 px                     | Hover spikes to the walls (3D hover, next wave).          |

Autorange pads the data by 1/32 of its span on each side (Plotly's 3D rule). Ticks come about one
per 40 px of the axis on screen, between 4 and 9, unless `nticks` or `dtick` say otherwise.

<Example id="_dev/scene-axis-types" />

The walls, grid lines and zero lines are always on the **far** faces of the box, chosen again
every time the camera moves, so they never hide the data. Tick labels and titles sit beside the
box's lower edges; they are billboards (always upright, in px), and labels that would overlap are
dropped. `scene.bgcolor` paints the scene's rect (transparent by default).

```ts
const layout = {
  scene: {
    bgcolor: '#101826',
    xaxis: { showbackground: true, backgroundcolor: 'rgba(94, 116, 213, 0.18)', showline: true },
    yaxis: { showbackground: true, zeroline: false, showticklabels: false },
    zaxis: { showbackground: true, title: { text: 'height' }, ticks: 'outside' },
  },
};
```

<Example id="_dev/scene-walls" />

In the default look, scenes get faint walls a step above the background, the dark grid and the
small labels of the cartesian axes. `template: 'plotly-classic'` gives Plotly's look: no walls,
a light grid and `#444` labels.

<Example id="_dev/scene-plotly-classic" />

Grid, axis, zero and tick lines are 1 device px wide for now; `gridwidth`, `linewidth`,
`zerolinewidth` and `tickwidth` apply once 3D lines move to the 3D line primitive.

## Several scenes

Each scene has its own camera and sits in its `domain` (`x`, `y` fractions of the plot area, or a
`layout.grid` cell with `row` / `column`); without one, scenes are placed side by side. Scenes mix
with cartesian and other subplots.

<Example id="_dev/scene-subplots" />

## Controls

| Input                         | Does                                                                                                                                                                                           |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Drag                          | `scene.dragmode`: `'turntable'` rotates about the z axis (z stays up), `'orbit'` rotates freely, `'zoom'` dollies (drag down to zoom in), `'pan'` slides the view; `false` turns dragging off. |
| Shift / Ctrl (⌘) / Alt + drag | Rotate / pan / zoom, whatever the mode.                                                                                                                                                        |
| Wheel                         | Zoom, when `config.scrollZoom` allows `'scene'` (the default `'scene+geo+map'` does).                                                                                                          |
| One finger                    | Drag as above.                                                                                                                                                                                 |
| Two fingers                   | Pinch to zoom, move to pan.                                                                                                                                                                    |
| Double-click / double-tap     | Back to the first view (unless `config.doubleClick` is `false`).                                                                                                                               |

`scene.dragmode` defaults to `layout.dragmode` when the figure has only 3D subplots and that is a
3D mode, else to `'turntable'` (`'orbit'` when `camera.up` isn't the z axis). The camera eases to
where the input asked (disabled with reduced motion, see [reduced motion](/guides/accessibility#reduced-motion)).

The modebar gets Plotly's 3D group: **Zoom**, **Pan**, **Orbital rotation** and **Turntable
rotation** set every scene's `dragmode`; **Reset camera to default** and **Reset camera to last
save** (the first drawn view) move the camera back. Remove them by name
(`modeBarButtonsToRemove: ['orbitRotation']`).

## Camera events

While a gesture moves the camera, the chart emits `relayouting`; when the camera comes to rest,
one `relayout` with the new camera, in Plotly's shape:

```ts
chart.on('relayout', (update) => {
  const camera = update['scene.camera'];
  // { up: { x, y, z }, center: { x, y, z }, eye: { x, y, z }, projection: { type } }
  if (camera) localStorage.setItem('camera', JSON.stringify(camera));
});
```

After an orthographic zoom the update also holds `'scene.aspectratio'` and
`'scene.aspectmode': 'manual'`. The camera is written to the figure's layout, so `chart.layout`
and `layout.uirevision` keep it like any other GUI change. Set it yourself with `relayout`:

```ts
await chart.relayout({ 'scene.camera.eye': { x: 0, y: -2.2, z: 0.4 } });
```

## Plotly compatibility

Scenes follow plotly.js `gl3d` (attributes, defaults, aspect rules, relayout payloads, modebar
buttons). Differences:

- Tick labels and titles are upright billboards; Plotly draws them along the axis in 3D.
- Double-click resets the camera (Plotly has no 3D double-click).
- `scene.uirevision` is accepted; `layout.uirevision` governs camera persistence.
- Holochart doesn't write the computed `aspectratio` and `aspectmode` back into your input layout
  (Plotly mutates it); the full layout has them.
- Hover, spikes and `scene.annotations` come with the 3D traces (next wave).
