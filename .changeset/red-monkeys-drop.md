---
'@jgoz/esbuild-plugin-typecheck': major
---

Target esbuild 0.17; 'watch' must be specified explicitly

As of esbuild 0.17, it is no longer possible to detect via esbuild options if watch mode has been requested ([issue](https://github.com/evanw/esbuild/issues/2823)). This prevents `esbuild-plugin-typecheck` from being able to infer whether to run TypeScript in watch mode.
