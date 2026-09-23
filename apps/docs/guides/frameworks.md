---
title: Framework integration
description: Use Holochart with React, Vue, Svelte, Angular, or as a web component.
status: stub
milestone: M7
---

# Framework integration

This guide will cover the official framework wrappers.

Planned topics:

- `@mk7s/holochart-react`: a `Chart` component with event props and a `useChart` hook
- `@mk7s/holochart-vue` and `@mk7s/holochart-svelte`
- `@mk7s/holochart-angular`
- The `holo-chart` web component
- Efficient updates through `react`-style figure diffing and `uirevision`
- Server-side rendering and client-only loading

Until the wrappers ship, create the chart in a mount hook and destroy it on unmount. See
[Installation](/getting-started/installation#use-with-a-framework).
