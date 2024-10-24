# @jgoz/esbuild-plugin-livereload

## 2.1.2

### Patch Changes

- ec0ef7c: Expand esbuild peer dependency range

## 2.1.1

### Patch Changes

- 60ec0df: Expand esbuild peer dependency range

## 2.1.0

### Minor Changes

- b23f695: Expose urlHostname option

  Fixes #114

## 2.0.5

### Patch Changes

- 5a50176: Expand esbuild peer dep range

## 2.0.4

### Patch Changes

- 25c5d69: Support esbuild 0.20.x

## 2.0.3

### Patch Changes

- 2dcf438: esbuild 18 support

## 2.0.2

### Patch Changes

- 257acff: Update dependencies

## 2.0.1

### Patch Changes

- 8a685b5: Support esbuild 0.17.2 entry format

## 2.0.0

### Major Changes

- 3d5d90d: Host the LR server inline in esbd

  `esbd` now runs the livereload handler on the same port as the developement server in `serve` mode. This necessitated some internal changes to `esbuild-plugin-livereload`, including a small breaking change for anyone using the `createLivereloadServer` API, which has become an async function.

  Direct plugin usage remains unchanged.

### Minor Changes

- 3d5d90d: Use diff-based LR updates (matches esbuild 0.17.0)

  esbuild 0.17 introduced [livereload capabilities](https://esbuild.github.io/api/#live-reload) to the internal `serve()` API. `esbuild-plugin-livereload` now uses an event object format that is compatible with esbuild's for the sake of consistency.

## 1.1.1

### Patch Changes

- b577e27: Fix error when window is undefined #48

## 1.1.0

### Minor Changes

- a05325a: Allow configuring livereload host

  Thanks @huner2!

## 1.0.1

### Patch Changes

- 3246343: Update dependencies
