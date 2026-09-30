# @mk7s/holochart

The full Holochart bundle: declarative, GPU-rendered charts built on three.js. It re-exports
`@mk7s/holochart-core` and exposes the low-level renderer as the `render` namespace.

> **Status: pre-alpha.** Not published to npm yet; every API will change.

## Builds

The package ships two builds (see [ADR-015](../../docs/adr/015-tsup-js-tsc-declarations.md)); the
script-tag build comes in two files.

| File                            | Format                 | `three`                   | Use it from                    |
| ------------------------------- | ---------------------- | ------------------------- | ------------------------------ |
| `dist/index.js` + `.d.ts`       | ESM + bundled types    | peer dependency, external | bundlers (Vite, webpack, …)    |
| `dist/holochart.iife.min.js`    | minified IIFE + `.map` | **bundled**               | a `<script>` tag, CDN, no tool |
| `dist/holochart-3d.iife.min.js` | minified IIFE + `.map` | the script above's        | after it, for 3D scenes        |

### Bundlers (ESM)

```sh
pnpm add @mk7s/holochart three
```

```ts
import { createRegistry, supplyDefaults, render } from '@mk7s/holochart';
```

`three` is a peer dependency (`>=0.180.0`), so your app and Holochart share one copy of three.js
([ADR-003](../../docs/adr/003-three-peer-dependency.md)).

### Script tag / CDN (IIFE)

```html
<script src="https://cdn.jsdelivr.net/npm/@mk7s/holochart/dist/holochart.iife.min.js"></script>
<script>
  const { createRegistry, supplyDefaults, render } = window.Holochart;
</script>
```

The IIFE is self-contained: it bundles its own copy of three.js, because three.js no longer ships a
UMD or global (`window.THREE`) build that a script-tag bundle could rely on. It needs no import map
and makes no further requests (but for the default font's faces, `dist/fonts/`, on first text). It
is the whole bundle but for 3D: add the 3D add-on after it for 3D scenes and traces.

```html
<script src="https://cdn.jsdelivr.net/npm/@mk7s/holochart/dist/holochart.iife.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@mk7s/holochart/dist/holochart-3d.iife.min.js"></script>
```

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
