---
title: Plain HTML quick start
description: Build a local browser bundle, serve a complete HTML chart, update data, and clean up.
status: complete
---

# Plain HTML quick start

Create an HTML page with a line, bars and update/dispose controls. The locally built 2D script
exposes `window.Holochart`; this example needs no 3D add-on. Allow additional time for the
one-time source build before the chart steps.

<InstallStatus ecosystem="javascript" />

## 1. Build and copy the browser files

You need Git, Node.js 22+, pnpm 11.15.1, Python 3 to serve files, and browser WebGL2. Complete
the [source build](/getting-started/installation#build-from-source-today). Then, from the
repository root, copy the complete browser distribution, including its default fonts:

```sh
mkdir -p preview
cp -R packages/holochart/dist/. preview/
```

## 2. Save a complete page

Save this as `preview/index.html`. It contains all sample data, a sized container, first render,
one data update and cleanup. Both buttons are ordinary HTML controls.

<<< @/public/quickstarts/html.html

The initial figure matches the browser tutorial:

<Example id="line/with-bars" />

## 3. Serve and test

In a terminal at the repository root:

```sh
python3 -m http.server 8000 --directory preview
```

Open the local HTTP server on port 8000. The line and bars should appear with the status
**Chart ready**. Click **Update visits**: the last line point becomes 6. Click **Dispose chart**:
the canvas is removed; reload to recreate it. Serve over HTTP instead of `file://` so browser
font requests can load. Stop the server with Ctrl+C.

Keep the `fonts` directory alongside `holochart.iife.min.js`. For a future 3D chart, load the
matching `holochart-3d.iife.min.js` after the main bundle and before your chart code; the current
example uses only 2D traces. The IIFE has its own three.js instance, so applications sharing
three.js objects should use the [bundler path](/getting-started/javascript).

Continue with [the figure model](/getting-started/core-concepts),
[chart families](/charts/), or [browser troubleshooting](/guides/troubleshooting).
