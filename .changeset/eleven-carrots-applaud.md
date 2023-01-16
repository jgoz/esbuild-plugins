---
'@jgoz/esbuild-plugin-livereload': minor
---

Use diff-based LR updates (matches esbuild 0.17.0)

esbuild 0.17 introduced [livereload capabilities](https://esbuild.github.io/api/#live-reload) to the internal `serve()` API. `esbuild-plugin-livereload` now uses an event object format that is compatible with esbuild's for the sake of consistency.
