---
title: 3D scenes
description: The 3D scene subplot — camera, projection, aspect ratio, 3D axes and walls, orbit, turntable, zoom and pan controls, camera animation, auto-rotation, camera events, hover, spikes and annotations.
status: complete
---

# 3D scenes

A **scene** is the subplot 3D traces draw in: `layout.scene` (and `scene2`, `scene3`, … for more).
It has its own camera, three axes (`xaxis`, `yaxis`, `zaxis`) drawn on the far walls of an axis
box, and mouse, wheel and touch controls. Scenes follow Plotly's `layout.scene` attributes and
events, so 3D figures written for Plotly keep their camera, aspect ratio and axis styling.

::: info 3D traces
3D traces such as [`scatter3d`](/charts/3d/scatter3d) are available: they draw in the scenes this
page describes. Most scene examples below still draw their points with a small development
trace (the `_dev/scene-*` examples), which keeps the focus on the scene itself.
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
| `showspikes`, `spikesides`, `spikecolor`, `spikethickness` | on, 2 px                     | Hover spikes to the walls (see [spikes](#spikes)).        |

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

## Camera animation

`chart.animateCamera(camera, options)` flies the camera to a new view (a Holochart extension).
`camera` has Plotly's `scene.camera` shape; what it leaves out keeps its current value:

```ts
// A guided tour: each flight resolves when the camera arrives.
for (const eye of [
  { x: 2, y: 0, z: 0.4 },
  { x: 0, y: -2, z: 1.2 },
  { x: 1.25, y: 1.25, z: 1.25 },
]) {
  await chart.animateCamera({ eye }, { duration: 1200, easing: 'cubic-in-out' });
}
```

| Option     | Default          | Meaning                                                              |
| ---------- | ---------------- | -------------------------------------------------------------------- |
| `duration` | 500              | Milliseconds (0 jumps).                                              |
| `easing`   | `'cubic-in-out'` | Any of Plotly's transition easings (`'linear'`, `'elastic-out'`, …). |
| `subplot`  | the first scene  | Which scene: `'scene2'`, …                                           |

The camera **orbits**: `center` moves in a straight line, the eye's distance from it changes
smoothly (zooming 4× feels the same at every step), and its direction turns along an arc — about
`up` the short way round when both views share their `up` (as Plotly's z-up cameras do), else by
the one rotation that takes the first view to the second. It never cuts through the scene the way
a straight eye path would, and never flips over the top. The functional form is
`animateCamera(el, camera, options)`.

<Example id="_dev/scene-camera-tween" />

When the camera arrives, one `relayout` commits it (`'scene.camera'`, see
[camera events](#camera-events)) and the promise resolves. Dragging, scrolling or double-clicking
the scene, a `relayout` of its camera, a camera transition or another `animateCamera` interrupts
a flight: its promise rejects with an `AnimationInterrupted` error (like `animate`), so a tour
written as above stops when the user takes over. With reduced motion (see
[reduced motion](/guides/accessibility#reduced-motion)) the camera jumps.

**Transitions.** `react` with a `layout.transition` and the frames of `animate` animate a change of
`scene.camera` along the same path, from the view shown, over the transition's duration and
easing; `ordering` doesn't hold them back. A drag during the transition keeps the dragged view.
`relayout` never animates (as in Plotly): use `animateCamera`.

## Auto-rotation

`scene.autorotate` turns the scene continuously, like a turntable (a Holochart extension):

```ts
const layout = {
  scene: { autorotate: { speed: 20, axis: 'z' } }, // `autorotate: {}` turns at 15°/s about z
};
```

| Attribute          | Default                          | Meaning                                                                                            |
| ------------------ | -------------------------------- | -------------------------------------------------------------------------------------------------- |
| `autorotate.speed` | 15 when `autorotate` is given, 0 | Degrees per second, counterclockwise seen from the positive end of the axis (negative: clockwise). |
| `autorotate.axis`  | `'z'`                            | `'x'`, `'y'` or `'z'`, through the camera's `center`.                                              |
| `autorotate.time`  | —                                | Freeze the rotation this many seconds in: a fixed frame for exports and tests.                     |

The rotation pauses while you drag, scroll or pinch the scene (and during a flight or a camera
transition) and carries on from where the camera came to rest. It runs only while the chart is on
screen and stops with reduced motion. The layout's camera doesn't follow it, so it emits no event
per frame: when the rotation stops (`speed: 0`, or reduced motion switched on) one `relayout`
reports the view it left; a gesture reports its own view as usual.

<Example id="_dev/scene-autorotate" />

With `time`, the frame is the layout camera turned by `speed × time` (here 30°/s × 3 s = 90°). Try
the live motion, tours and interruptions in the `_dev/interaction-scene-animation` sandbox example.

## Lights

`scene.lighting` sets the scene's lights — ambient, directional (with shadows), hemisphere and an
environment map — for 3D meshes; see [materials & lighting](/customization/materials-lighting).

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

## Hover and picking

Hovering a 3D trace shows the point under the pointer. Markers and lines are **picked on the
GPU**: one pick per pointer position, within 10 px of it, finds what is drawn there for every
trace of the scene at once. Picking respects depth, so what you see is what you hover: a point
hidden behind other data is not picked.

- Hover in a scene is always `closest`, as in Plotly (`x` and `y` hover modes don't apply).
  `scene.hovermode: false` turns it off in that scene, and `layout.hovermode: false` everywhere.
- The label sits at the point's projection and reads `x: …`, `y: …`, `z: …` (plus the point's
  `text`). Each value is formatted like its scene axis: dates and categories as on the axis,
  numbers with `scene.xaxis.hoverformat` (and `yaxis`, `zaxis`) or the trace's `xhoverformat`,
  `yhoverformat`, `zhoverformat`. `hoverinfo`, `hovertemplate` (`%{x}`, `%{y}`, `%{z}`, …) and
  `hovertext` work as in 2D.
- While the camera moves (a drag, the wheel, a pinch) the label is hidden; it comes back at the
  point's new place once the camera rests.
- `hover`, `unhover` and `click` events carry the point's `x`, `y`, `z`, `curveNumber`,
  `pointNumber`, `customdata`, … as in Plotly. A press on the scene starts a camera gesture;
  releasing it without dragging emits `click` with the hovered point:

```ts
chart.on('hover', (e) => {
  const p = e.points[0];
  if (p) console.log(`trace ${p.curveNumber}, point ${p.pointNumber}:`, p.x, p.y, p.z);
});
```

<Example id="scatter3d/basic" />

## Spikes

On hover, **spikes** run from the hovered point to the far wall of each axis, so you can read its
position against the grid. With `spikesides` (default `true`), the spikes are also projected onto
the other two walls and run to the edges of the box. Each axis has its own settings:

| Attribute        | Default        | Meaning                                                         |
| ---------------- | -------------- | --------------------------------------------------------------- |
| `showspikes`     | `true`         | Draw the spike to this axis' wall.                              |
| `spikesides`     | `true`         | Also draw it along the other two walls, out to the box's edges. |
| `spikecolor`     | the axis color | The spike's color.                                              |
| `spikethickness` | `2`            | Its width, px.                                                  |

```ts
const layout = {
  scene: {
    xaxis: { spikecolor: '#e4572e', spikethickness: 1 },
    yaxis: { spikesides: false },
    zaxis: { showspikes: false },
  },
};
```

## Annotations

`scene.annotations` (Plotly's 3D annotations) are labels anchored at a point of the scene:
`x`, `y`, `z` in the data of the scene's axes. `ax` and `ay` offset the text from the point, in
px (default −10 and −30), and every styling attribute of
[2D annotations](/reference/layout#annotations) applies: `text` (rich text), `font`, `textangle`,
`bgcolor`, `bordercolor`, `borderwidth`, `borderpad`, `width`, `height`, `align`, `valign`,
`opacity`, the arrow (`showarrow`, `arrowhead`, `startarrowhead`, `arrowside`, `arrowsize`,
`startarrowsize`, `arrowwidth`, `arrowcolor`, `standoff`, `startstandoff`), `xanchor`, `yanchor`,
`xshift` and `yshift`. `scene.annotationdefaults` (or `layout.annotationdefaults`) sets defaults
for all of them; the [`scene.annotations` reference](/reference/layout#scene.annotations) lists
every attribute.

```ts
const layout = {
  scene: {
    annotations: [
      { x: 0, y: 0, z: 1, text: '<b>Peak</b>', ax: -40, ay: -40, arrowhead: 2 },
      { x: -2, y: 2, z: 0, text: 'Corner', showarrow: false, xanchor: 'left' },
    ],
  },
};
```

Annotations are drawn in the chart's overlay at the projected point and follow the camera as it
turns. An annotation is hidden while its point is outside the axis ranges or behind the camera.
With `captureevents: true`, clicking one emits `clickannotation`.

<Example id="scatter3d/annotations" />

## Plotly compatibility

Scenes follow plotly.js `gl3d` (attributes, defaults, aspect rules, relayout payloads, modebar
buttons). Differences:

- Tick labels and titles are upright billboards; Plotly draws them along the axis in 3D.
- Double-click resets the camera (Plotly has no 3D double-click).
- `scene.uirevision` is accepted; `layout.uirevision` governs camera persistence.
- Holochart doesn't write the computed `aspectratio` and `aspectmode` back into your input layout
  (Plotly mutates it); the full layout has them.
- Hover labels and their formats, spikes and `scene.annotations` follow gl3d. Picking is on the
  GPU and respects depth (what you see is what you hover).
- Not supported yet: programmatic hover of 3D points (`Fx.hover` / `chart.hover`), hover on
  text-only traces (no markers or lines), and drawing the `hovertext` label of scene annotations
  (as in 2D).
- Extensions: `chart.animateCamera`, `scene.autorotate` and `scene.lighting`. Camera changes in
  `react` with `layout.transition` and in `animate` frames animate (plotly.js redraws gl3d
  scenes without a transition).
