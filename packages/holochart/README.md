# @mk7s/holochart

The full Holochart bundle: declarative, GPU-rendered charts built on three.js. It re-exports
`@mk7s/holochart-core` and exposes the low-level renderer as the `render` namespace.

> **Status: pre-alpha.** Not published to npm yet; every API will change.

## Builds

The package ships two builds (see [ADR-015](../../docs/adr/015-tsup-js-tsc-declarations.md)).

| File                         | Format                 | `three`                   | Use it from                    |
| ---------------------------- | ---------------------- | ------------------------- | ------------------------------ |
| `dist/index.js` + `.d.ts`    | ESM + bundled types    | peer dependency, external | bundlers (Vite, webpack, …)    |
| `dist/holochart.iife.min.js` | minified IIFE + `.map` | **bundled**               | a `<script>` tag, CDN, no tool |

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
and makes no further requests. The trade-offs:

- It is larger (about 835 kB minified, 237 kB gzipped).
- Its three.js is private. Do not mix three.js objects (materials, textures, `Object3D`s) created by
  a separate copy of three.js on the page with Holochart's; `instanceof` checks will fail across the
  two copies. If you need to share three.js with your own code, use the ESM build: with a bundler,
  or from an ESM CDN with an import map that points `three` (and Holochart's other dependencies)
  at one shared copy.

The subpath `@mk7s/holochart/holochart.iife.min.js` resolves to the IIFE file, which is useful for
copying it into a static-assets folder.
