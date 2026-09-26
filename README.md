# Holochart

Declarative, GPU-rendered charts built on three.js.

> **Status: pre-alpha.** Milestone M0 (Foundation) is in progress. Nothing is published to npm yet,
> and every API described here is planned and will change.

Holochart aims for Plotly-level chart coverage with d3-level control. You describe a figure as
plain JSON (`{ data, layout, config, frames }`) using Plotly-compatible semantics and attribute
names, and Holochart renders it through a single three.js/WebGL pipeline. There is no SVG vs GL
split: markers, lines, bars, and cells are GPU-native instanced primitives (never one object per
data point), and 2D is treated as a special case of 3D, so any 2D chart can be extruded, tilted,
lit, and animated with the same axes, legends, hover, and theming.

## A taste of the API (planned)

This is the target API from [plan.md section 7](plan.md#7-public-api-design). It does not run yet.

```ts
import { createChart } from '@mk7s/holochart';

const chart = createChart(el, {
  data: [
    { type: 'scatter', x: [1, 2, 3], y: [4, 1, 7], mode: 'lines+markers', name: 'A' },
    { type: 'bar', x: [1, 2, 3], y: [2, 5, 3], name: 'B' },
  ],
  layout: { title: { text: 'Hello Holochart' } },
  config: { responsive: true },
});

chart.relayout({ 'xaxis.range': [0, 10] });
chart.on('click', (e) => console.log(e.points));
chart.destroy();
```

A Plotly-style functional API (`Holochart.newPlot`, `restyle`, `relayout`, `react`) is planned
alongside it.

## Packages

All packages are `0.0.0` placeholders in this monorepo; none are published yet.

| Package                        | Path                    | Purpose                                                               |
| ------------------------------ | ----------------------- | --------------------------------------------------------------------- |
| `@mk7s/holochart`              | `packages/holochart`    | Full bundle: re-exports and registers everything                      |
| `@mk7s/holochart-core`         | `packages/core`         | Figure model, attribute schema, validation, defaults, update planning |
| `@mk7s/holochart-render`       | `packages/render`       | three.js engine: renderer, viewports, GPU primitives, picking         |
| `@mk7s/holochart-components`   | `packages/components`   | Axes, legend, colorbar, annotations, shapes, hover labels, modebar    |
| `@mk7s/holochart-traces-basic` | `packages/traces-basic` | Basic traces: scatter, bar, pie, table                                |
| `@mk7s/holochart-themes`       | `packages/themes`       | Built-in templates, palettes, colorscales                             |
| `@mk7s/holochart-express`      | `packages/express`      | Express API: charts from tables, facets, animation frames (`hx.*`)    |

`three` is a peer dependency. More trace packages and framework wrappers are planned; see
[ARCHITECTURE.md](ARCHITECTURE.md).

## Development quickstart

Requires Node 22 or newer and pnpm 11 (via Corepack).

```sh
corepack enable
pnpm install
pnpm exec playwright install chromium   # for visual tests
pnpm dev                                # sandbox, e.g. ?example=_dev/hello-cube
pnpm test && pnpm typecheck && pnpm lint
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full command reference and workflow.

## Links

- [plan.md](plan.md): the full project plan (vision, architecture, epics, milestones)
- [ARCHITECTURE.md](ARCHITECTURE.md): architecture summary
- [CONTRIBUTING.md](CONTRIBUTING.md): setup, conventions, and PR process
- [docs/adr/](docs/adr/): Architecture Decision Records
- Documentation site: [mk7s.dev/holochart](https://mk7s.dev/holochart) (coming soon)
- Repository: [github.com/holochart/holochart](https://github.com/holochart/holochart)

## License

[MIT](LICENSE). Third-party components and their licenses are listed in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
