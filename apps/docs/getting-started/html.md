---
title: Plain HTML quick start
description: Load Holochart from a script tag, serve a complete HTML chart, update data, and clean up.
status: complete
---

# Plain HTML quick start

Create an HTML page with a line, bars and update/dispose controls. The 2D script, loaded from a
CDN, exposes `window.Holochart`; this example needs no 3D add-on, no install and no build step.

<InstallStatus ecosystem="javascript" />

## 1. Create a directory for the page

You need Python 3 to serve files and a browser with WebGL2. In a terminal:

```sh
mkdir -p preview
```

## 2. Save a complete page

Save this as `preview/index.html`. It contains all sample data, a sized container, first render,
one data update and cleanup. Both buttons are ordinary HTML controls.

<<< @/public/quickstarts/html.html

The page loads Holochart from a CDN. Keep the exact version in the URL: Holochart is in alpha,
and APIs can change between 0.x releases. The script loads its default fonts from the same place
it was loaded from.

To serve the script from your own origin instead, change the script's `src` to
`./holochart.iife.min.js` and copy the package's whole `dist` directory into `preview/`, as in
[Host the scripts yourself](/getting-started/installation#host-the-scripts-yourself). Keep the
`fonts` directory alongside `holochart.iife.min.js`.

The initial figure matches the browser tutorial:

<Example id="line/with-bars" />

## 3. Serve and test

In the same terminal:

```sh
python3 -m http.server 8000 --directory preview
```

Open the local HTTP server on port 8000. The line and bars should appear with the status
**Chart ready**. Click **Update visits**: the last line point becomes 6. Click **Dispose chart**:
the canvas is removed; reload to recreate it. Serve over HTTP instead of `file://`: with scripts
you host yourself, `file://` can prevent the font requests. Stop the server with Ctrl+C.

For a 3D chart, add the 3D script after the main one and before your chart code, from the same
version; this example uses only 2D traces:

```html
<script src="https://cdn.jsdelivr.net/npm/@mk7s/holochart@0.1.0-alpha.0/dist/holochart-3d.iife.min.js"></script>
```

The script-tag build has no maps and no network graphs. It has its own three.js instance, so
applications sharing three.js objects should use the [bundler path](/getting-started/javascript).

Continue with [the figure model](/getting-started/core-concepts),
[chart families](/charts/), or [browser troubleshooting](/guides/troubleshooting).
