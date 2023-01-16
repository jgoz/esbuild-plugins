---
'@jgoz/esbuild-plugin-livereload': major
'esbd': major
---

Host the LR server inline in esbd

`esbd` now runs the livereload handler on the same port as the developement server in `serve` mode. This necessitated some internal changes to `esbuild-plugin-livereload`, including a small breaking change for anyone using the `createLivereloadServer` API, which has become an async function.

Direct plugin usage remains unchanged.
