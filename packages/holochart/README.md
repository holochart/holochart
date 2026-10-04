# @mk7s/holochart

The full [Holochart](https://github.com/holochart/holochart) bundle: declarative, GPU-rendered
charts built on three.js, with Plotly's figure format (`{ data, layout, config }`). It registers
every trace type, component and theme, 2D and 3D, and re-exports the whole API.

> **Alpha.** Released as `0.1.0-alpha` on the npm `alpha` tag; APIs can change between 0.x
> releases.

## Install

```sh
pnpm add @mk7s/holochart@alpha three
```

`three` is a peer dependency (`>=0.180.0 <0.187.0`), so your app and Holochart share one copy of
three.js ([ADR-003](https://github.com/holochart/holochart/blob/main/docs/adr/003-three-peer-dependency.md)).

Locales are not part of this bundle: install `@mk7s/holochart-locales` separately
(`pnpm add @mk7s/holochart-locales`) and register the ones you need; for the script tag, load its
`dist/scripts/holochart-locale-<name>.js` files after the main script.

The package is ESM-only (ES2022), for bundlers such as Vite, webpack or Rollup; Node 22 and newer
can also `require()` it. Types are included.

## Usage

```ts
import { createChart } from '@mk7s/holochart';

const chart = createChart(document.getElementById('chart')!, {
  data: [
    { type: 'scatter', x: [1, 2, 3, 4], y: [3, 1, 4, 2], mode: 'lines+markers', name: 'Visits' },
    { type: 'bar', x: [1, 2, 3, 4], y: [2, 2, 3, 1], name: 'Signups' },
  ],
  layout: { title: { text: 'Hello Holochart' } },
});

chart.on('click', (event) => console.log(event.points));
await chart.relayout({ 'xaxis.range': [0, 5] });
chart.destroy(); // when you remove it: frees the WebGL context
```

The Plotly-style functional API is exported too: `newPlot`, `react`, `restyle`, `relayout`,
`update`, `extendTraces`, `purge`, `toImage`, ….

## What it exports

- The stable and experimental exports of `@mk7s/holochart-runtime` (charts, updates, events,
  `register`) and `@mk7s/holochart-core` (figure model, schema, validation, colors).
- Every trace module and component, with their types and helpers, from the `traces-*` and
  `components` packages.
- Not the plumbing those packages share with each other (tagged `@internal`): the bundle lists
  its exports by name.
- Namespaces: `themes` (`@mk7s/holochart-themes`), `express` (`@mk7s/holochart-express`:
  `express.scatter(rows, { x, y })`), `render` (the low-level three.js primitives; experimental
  until the plugin API is stable), `fonts` and `symbols`.

For a smaller bundle, depend on `@mk7s/holochart-runtime` and register only the packages you use
([partial bundles](https://mk7s.dev/holochart/getting-started/installation#smaller-bundles-with-partial-packages)).

## Builds

The package ships two builds (see
[ADR-015](https://github.com/holochart/holochart/blob/main/docs/adr/015-tsup-js-tsc-declarations.md));
the script-tag build comes in two files.

| File                            | Format                 | `three`                   | Use it from                    |
| ------------------------------- | ---------------------- | ------------------------- | ------------------------------ |
| `dist/index.js` + `.d.ts`       | ESM + bundled types    | peer dependency, external | bundlers (Vite, webpack, …)    |
| `dist/holochart.iife.min.js`    | minified IIFE + `.map` | **bundled**               | a `<script>` tag, CDN, no tool |
| `dist/holochart-3d.iife.min.js` | minified IIFE + `.map` | the script above's        | after it, for 3D scenes        |

### Script tag / CDN (IIFE)

```html
<script src="https://cdn.jsdelivr.net/npm/@mk7s/holochart@0.1/dist/holochart.iife.min.js"></script>
<!-- Optional: 3D scenes and traces. Same version, after the main script. -->
<script src="https://cdn.jsdelivr.net/npm/@mk7s/holochart@0.1/dist/holochart-3d.iife.min.js"></script>
<script>
  Holochart.newPlot(document.getElementById('chart'), [{ type: 'bar', y: [2, 5, 3] }]);
</script>
```

jsDelivr version ranges such as `@0.1` skip pre-releases: during the alpha, pin the exact version
(for example `@0.1.0-alpha.0`).

The IIFE is self-contained: it bundles its own copy of three.js, because three.js no longer ships a
UMD or global (`window.THREE`) build that a script-tag bundle could rely on. It needs no import map
and makes no further requests (but for the default font's faces, `dist/fonts/`, on first text). It
is the whole bundle but for 3D: add the 3D add-on after it for 3D scenes and traces.

The add-on registers the 3D modules into the main script's registry and adds the exports of
`@mk7s/holochart-traces-3d` (`traces3d`, …) to `window.Holochart`. It contains no three.js, core,
runtime or render code of its own: it uses the main script's, so load it after the main script,
from the same version (it throws otherwise). The trade-offs:

- The main script is large (about 2.2 MB minified, 682 kB gzipped; the add-on 31 kB gzipped).
- Its three.js is private. Do not mix three.js objects (materials, textures, `Object3D`s) created by
  a separate copy of three.js on the page with Holochart's; `instanceof` checks will fail across the
  two copies. If you need to share three.js with your own code, use the ESM build: with a bundler,
  or from an ESM CDN with an import map that points `three` (and Holochart's other dependencies)
  at one shared copy.

The subpaths `@mk7s/holochart/holochart.iife.min.js` and `@mk7s/holochart/holochart-3d.iife.min.js`
resolve to the IIFE files, which is useful for copying them into a static-assets folder.

For type checking script-tag code, `global.d.ts` declares `window.Holochart` (the 3D add-on's
exports are optional): add `/// <reference types="@mk7s/holochart/global" />`, or
`"types": ["@mk7s/holochart/global"]` in `tsconfig.json` / `jsconfig.json`.

## Browser support

Any browser with WebGL2. CI tests Chromium only so far; Firefox and Safari are not tested yet.

## Docs

- [Documentation](https://mk7s.dev/holochart/) and [your first chart](https://mk7s.dev/holochart/getting-started/first-chart)
- [Installation](https://mk7s.dev/holochart/getting-started/installation): bundles, script tag, frameworks
- [Gallery](https://mk7s.dev/holochart/gallery/) and the [API reference](https://mk7s.dev/holochart/reference/api/)

## License

MIT (see [LICENSE](LICENSE)). The script-tag builds bundle third-party code (three.js and others);
their licenses are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
