---
'@mk7s/holochart': patch
'@mk7s/holochart-core': patch
'@mk7s/holochart-render': patch
'@mk7s/holochart-runtime': patch
'@mk7s/holochart-components': patch
'@mk7s/holochart-traces-basic': patch
'@mk7s/holochart-traces-stats': patch
'@mk7s/holochart-traces-sci': patch
'@mk7s/holochart-traces-finance': patch
'@mk7s/holochart-traces-hier': patch
'@mk7s/holochart-traces-3d': patch
'@mk7s/holochart-themes': patch
'@mk7s/holochart-express': patch
'@mk7s/holochart-locales': patch
---

Package metadata for publishing. The packages stay ESM-only, but every export now has a `default` condition after `import`, so Node 22's `require()` of ESM and tools that only know `default` resolve them, and `./package.json` is exported. The `three` peer range is now `>=0.180.0 <0.187.0` (the upper bound follows the newest three tested in CI and is widened per release), and the packages whose types expose three's (`@mk7s/holochart`, `-render`, `-runtime`, `-components`, `-traces-3d`) declare `@types/three` as an optional peer with the same range. The published `.d.ts` files leave out `@internal` members and no longer ship declaration maps that pointed at unpublished sources. `@mk7s/holochart` adds `unpkg`/`jsdelivr` fields (the bare CDN URL serves `dist/holochart.iife.min.js`), a `global.d.ts` for `window.Holochart` (`@mk7s/holochart/global`), and smaller IIFE sourcemaps (without embedded sources). `@mk7s/holochart-core` ships a `THIRD_PARTY_NOTICES.md` for the plotly.py color data it contains. All packages gain `keywords`, `bugs`, `author` and `publishConfig` (`access: public`, `provenance: true`).
