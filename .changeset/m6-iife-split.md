---
'@mk7s/holochart': minor
---

The script-tag build is split in two: `holochart.iife.min.js` is now the whole bundle but for 3D (681 kB gzipped, back under its 690 kB budget), and the new `holochart-3d.iife.min.js` add-on (31 kB gzipped, also exported as `@mk7s/holochart/holochart-3d.iife.min.js`), loaded after it, adds 3D scenes and traces: it registers `traces3d` into the main script's registry and adds the exports of `@mk7s/holochart-traces-3d` to `window.Holochart`. The add-on bundles no three.js, core, runtime or render code of its own: it uses the main script's, so a page keeps one three.js and one registry. It throws when the main script isn't loaded first or has a different version. The ESM bundle (`@mk7s/holochart`) still includes 3D.
