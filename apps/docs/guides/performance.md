---
title: Performance guide
description: Keep charts fast with large data, streaming updates, decimation, and workers.
status: stub
milestone: M7
---

# Performance guide

This guide will explain how Holochart stays fast and what you can do to keep it that way with
large or fast-changing data.

Planned topics:

- Performance targets: 1M-point scatter panning at 50 fps or more, 100k points rendered in under
  300 ms
- Typed arrays and the zero-copy data path
- Cheap and expensive updates: edit types and partial GPU buffer uploads
- Streaming with `extendTraces` and rolling windows
- Decimation and level of detail for long lines
- Running calc in a Web Worker (`config.worker`)
- Measuring: draw calls, GPU memory, and the benchmark harness
