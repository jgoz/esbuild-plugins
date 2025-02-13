# @jgoz/esbuild-plugin-typecheck

## 4.0.3

### Patch Changes

- cb8851e: Support esbuild 0.25.x
- b59e53c: Support esbuild 0.25.0
- Updated dependencies [b59e53c]
  - @jgoz/esbuild-plugin-livereload@2.1.3

## 4.0.2

### Patch Changes

- ec0ef7c: Expand esbuild peer dependency range
- Updated dependencies [ec0ef7c]
  - @jgoz/esbuild-plugin-livereload@2.1.2

## 4.0.1

### Patch Changes

- 60ec0df: Expand esbuild peer dependency range
- Updated dependencies [60ec0df]
  - @jgoz/esbuild-plugin-livereload@2.1.1

## 4.0.0

### Patch Changes

- Updated dependencies [b23f695]
  - @jgoz/esbuild-plugin-livereload@2.1.0

## 3.1.3

### Patch Changes

- 5a50176: Expand esbuild peer dep range
- Updated dependencies [5a50176]
  - @jgoz/esbuild-plugin-livereload@2.0.5

## 3.1.2

### Patch Changes

- 43765db: Use proper basePath for relative 'extends' config
- 9976307: Ensure non-string messageText errors are reported
- 60af049: Avoid printing empty lines to console.error

## 3.1.1

### Patch Changes

- 25c5d69: Support esbuild 0.20.x
- Updated dependencies [25c5d69]
  - @jgoz/esbuild-plugin-livereload@2.0.4

## 3.1.0

### Minor Changes

- 64365b9: Support esbuild 0.19

## 3.0.3

### Patch Changes

- 2dcf438: esbuild 18 support
- Updated dependencies [2dcf438]
  - @jgoz/esbuild-plugin-livereload@2.0.3

## 3.0.2

### Patch Changes

- 257acff: Update dependencies
- Updated dependencies [257acff]
  - @jgoz/esbuild-plugin-livereload@2.0.2

## 3.0.1

### Patch Changes

- 8a685b5: Support esbuild 0.17.2 entry format
- Updated dependencies [8a685b5]
  - @jgoz/esbuild-plugin-livereload@2.0.1

## 3.0.0

### Major Changes

- 3d5d90d: Target esbuild 0.17; 'watch' must be specified explicitly

  As of esbuild 0.17, it is no longer possible to detect via esbuild options if watch mode has been requested ([issue](https://github.com/evanw/esbuild/issues/2823)). This prevents `esbuild-plugin-typecheck` from being able to infer whether to run TypeScript in watch mode.

### Patch Changes

- Updated dependencies [3d5d90d]
- Updated dependencies [3d5d90d]
  - @jgoz/esbuild-plugin-livereload@2.0.0

## 2.0.0

### Patch Changes

- Updated dependencies [a05325a]
  - @jgoz/esbuild-plugin-livereload@1.1.0

## 1.1.0

### Minor Changes

- a38d9c9: Extract TypecheckRunner for more fine-grained integration

### Patch Changes

- 3246343: Update dependencies
- Updated dependencies [3246343]
  - @jgoz/esbuild-plugin-livereload@1.0.1

## 1.0.2

### Patch Changes

- f8dbf49: Don't exclude js files (fix bad publish)

## 1.0.1

### Patch Changes

- f17a5f7: Fix typescript setup and bad publish
