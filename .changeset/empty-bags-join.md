---
'esbd': major
---

Target esbuild 0.17.x

`esbd` now uses esbuild's `context` API internally, which means the minimum required esbuild version is now 0.17.0.
This is a breaking change because it requires a peer dependency update, but usage of `esbd` itself is largely unaffected.

Switching to `context` provided opportunities to simplify some internals. Notably, the custom source file watcher implementation
based on chokidar has been replaced with esbuild's native file watching. There are a few implications of this change:

- If there are errors detected on the initial `serve` or `node-dev` build, fixing them will now result in a new build without having to re-run the bundler script. This wasn't possible with the previous implementation because esbd needed at least one successful build in order to determine which files to watch.
- esbd no longer prints which file(s) changed at the start of a new build because esbuild does not emit this information.
- esbuild's watcher implementation is strictly polling based and is designed for low CPU usage, which means it could take up to 2 seconds for a file change to trigger a new build (see the [esbuild documentation](https://esbuild.github.io/api/#watch) for details).
