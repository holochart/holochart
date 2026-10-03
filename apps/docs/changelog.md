---
title: Changelog
description: What changed in each Holochart version, and what is merged but not released yet.
status: complete
---

# Changelog

All Holochart packages (`@mk7s/holochart` and every `@mk7s/holochart-*`) share one version
number and are released together, so one list covers them all. Each entry names the packages it
changed.

Under each version, changes are grouped by the size of the bump they ask for:

- **Minor changes** add something (an attribute, a trace type, an export, an event, an option)
  or deprecate something. Before 1.0 a minor change may also break existing code; such an entry
  starts with "BREAKING:".
- **Patch changes** are bug fixes, performance work, rendering fixes and documentation. They
  never contain a breaking API change. Rendered pixels may still differ (anti-aliasing, tick
  placement, text metrics).

The list is generated from the project's [changesets](https://changesets.dev): one note per
change, written by the author of the change when it is merged.

<!--@include: ./.vitepress/generated/changelog.md-->
