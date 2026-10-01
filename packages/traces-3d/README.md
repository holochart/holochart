# @mk7s/holochart-traces-3d

The 3D scene subplot and 3D trace types of Holochart: `scatter3d`, `surface`, `mesh3d`, `cone`,
`streamtube`, `volume`, `isosurface` and `bar3d`. Part of
[Holochart](https://github.com/holochart/holochart), declarative GPU charts on three.js.

> **Alpha.** Released as `0.1.0-alpha` on the npm `alpha` tag; APIs can change between 0.x
> releases. Most apps should install the full bundle,
> [`@mk7s/holochart`](https://github.com/holochart/holochart/tree/main/packages/holochart), which
> includes this package.

## Install

```sh
pnpm add @mk7s/holochart-traces-3d@alpha three
```

`three` is a peer dependency, so your app and Holochart share one copy. ESM-only; Node 22 and
newer can also `require()` it.

For a script tag, the full bundle ships this package as a separate add-on file,
`holochart-3d.iife.min.js`, to load after `holochart.iife.min.js` (see
[`@mk7s/holochart`](https://github.com/holochart/holochart/tree/main/packages/holochart)).

## What it exports

- **`traces3d`:** the scene component and every trace module below, to register at once
- **Scene subplot:** `sceneComponent` (declares and draws `layout.scene`: camera, aspect ratio, 3D
  axes, controls), `sceneAttributes`
- **Trace modules:** `scatter3d`, `surface`, `mesh3d`, `cone`, `streamtube`, `volume`,
  `isosurface`, `bar3d`

Register `sceneComponent` with any 3D trace you register on its own; `traces3d` includes it.

## Usage

```ts
import { createChart, register } from '@mk7s/holochart-runtime';
import { builtinComponents } from '@mk7s/holochart-components';
import { traces3d } from '@mk7s/holochart-traces-3d';

register(...traces3d, ...builtinComponents);

createChart(el, {
  data: [{ type: 'scatter3d', mode: 'markers', x: [1, 2, 3], y: [3, 1, 2], z: [2, 3, 1] }],
});
```

## Docs

- [3D scenes](https://mk7s.dev/holochart/fundamentals/3d-scenes)
- [3D charts](https://mk7s.dev/holochart/charts/3d/)
- Attribute reference: [scatter3d](https://mk7s.dev/holochart/reference/scatter3d),
  [surface](https://mk7s.dev/holochart/reference/surface),
  [mesh3d](https://mk7s.dev/holochart/reference/mesh3d)
- [API reference](https://mk7s.dev/holochart/reference/api/)

## License

MIT (see [LICENSE](LICENSE)).
