# @mk7s/holochart-render

The three.js rendering engine under Holochart: the render root and viewports, GPU primitives
(lines, markers, fills, rects, text, meshes), colorscale textures and picking. Part of
[Holochart](https://github.com/holochart/holochart), declarative GPU charts on three.js.

> **Alpha.** Released as `0.1.0-alpha` on the npm `alpha` tag; APIs can change between 0.x
> releases. Most apps should install the full bundle,
> [`@mk7s/holochart`](https://github.com/holochart/holochart/tree/main/packages/holochart), which
> includes this package (as the `render` namespace).

The low-level API (primitives, viewports, picking) is **experimental** until the plugin API
stabilises; the `fonts` and `symbols` registries are the parts meant for apps.

## Install

```sh
pnpm add @mk7s/holochart-render@alpha three
```

`three` is a peer dependency, so your app and Holochart share one copy. ESM-only; Node 22 and
newer can also `require()` it.

## What it exports

- **Registries:** `fonts` (register font families for chart text) and `symbols` (custom marker
  symbols from SVG paths)
- **Engine:** `createRenderRoot`, `RenderRoot`, `Viewport`, `RenderLoop`, `createResourceManager`
- **Primitives:** `LinePrimitive`, `createMarkers`, `createFillPrimitive`, `createRectPrimitive`,
  `createTextPrimitive`, `createMeshPrimitive`, `createHeatmapPrimitive`, `createMarkers3D`
- **Picking:** `createPicker`, `GpuPicker`
- **Fonts:** the default font's files, under the `@mk7s/holochart-render/fonts/*` subpath

## Usage

```ts
import { fonts, symbols } from '@mk7s/holochart-render';

fonts.register('Inter', { regular: '/fonts/Inter.woff', bold: '/fonts/Inter-Bold.woff' });
symbols.register('pin', { path: 'M12 2C8 2 5 5 5 9c0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7z' });
// marker.symbol: 'pin' and layout.font.family: 'Inter' now work in every chart
```

## Docs

- [Styling & themes](https://mk7s.dev/holochart/fundamentals/styling-themes) (fonts)
- [Custom markers](https://mk7s.dev/holochart/customization/custom-markers)
- [Writing a custom trace](https://mk7s.dev/holochart/extending/custom-trace)
- [API reference](https://mk7s.dev/holochart/reference/api/holochart-render/)

## License

MIT (see [LICENSE](LICENSE)). The default font, TeX Gyre Heros (in `fonts/`, and as `data:` URLs in
the lazy `dist/texgyreheros-*.js` chunks), is under the GUST Font License; see
[fonts/GUST-FONT-LICENSE.txt](fonts/GUST-FONT-LICENSE.txt).
