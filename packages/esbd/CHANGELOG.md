# esbd

## 2.2.5

### Patch Changes

- 38438f9: Always re-create HTML templates in 'serve' mode

## 2.2.4

### Patch Changes

- 22c642c: Allow multiple overlaps for css candidate

## 2.2.3

### Patch Changes

- dcee09d: Allow deference to default css chunk inclusion behavior
- ef54607: Inject defines before rebasing asset URLs

## 2.2.2

### Patch Changes

- a21ecd1: Improve CSS entry point detection algorithm
- d7b7bab: Fix integrity hash calculation for unwritten files
- 486b077: Ensure full output dirname exists before write

## 2.2.1

### Patch Changes

- 6fe444f: Fix build options

## 2.2.0

### Minor Changes

- 0021d1f: Add htmlChunkFilter option

## 2.1.0

### Minor Changes

- a05325a: Add --livereload-host CLI argument

### Patch Changes

- dd828b4: Remove chromium sourcemap workarouond
- Updated dependencies [a05325a]
  - @jgoz/esbuild-plugin-livereload@1.1.0
  - @jgoz/esbuild-plugin-typecheck@2.0.0

## 2.0.0

### Major Changes

- 62d81bd: Remove built-in jsx-automatic handling in favor of esbuild's

  This change sets the minimum version of esbuild to be `>= 0.14.51` and removes
  the old SWC plugin, since esbuild now supports the automatic runtime natively.

## 1.0.14

### Patch Changes

- 454bf73: Bump parse5 to version 7

## 1.0.13

### Patch Changes

- d8cd1e6: Add workaround for chromium sourcemap issue

## 1.0.12

### Patch Changes

- 50570c2: Fix invalid sourcemap generation with jsx-runtime

## 1.0.11

### Patch Changes

- 129a44c: Fix watch behavior on error

## 1.0.10

### Patch Changes

- f552f3d: Fix copying on html build

## 1.0.9

### Patch Changes

- 9317670: Support non-html entry points in 'serve'
- e4ebb7b: Better error handling for argument parsing

## 1.0.8

### Patch Changes

- 2398db3: Don't watch entire scope, just the specific modules being used

## 1.0.7

### Patch Changes

- dbdcd49: Run type checking out-of-band, deduping on config path
- 3246343: Update dependencies
- Updated dependencies [a38d9c9]
- Updated dependencies [3246343]
  - @jgoz/esbuild-plugin-typecheck@1.1.0
  - @jgoz/esbuild-plugin-livereload@1.0.1

## 1.0.6

### Patch Changes

- Updated dependencies [f8dbf49]
  - @jgoz/esbuild-plugin-typecheck@1.0.2

## 1.0.5

### Patch Changes

- Updated dependencies [f17a5f7]
  - @jgoz/esbuild-plugin-typecheck@1.0.1

## 1.0.4

### Patch Changes

- d8c9e67: Allow both html and source entry points

## 1.0.3

### Patch Changes

- 949887d: Set default log level to 'info' for serve

## 1.0.2

### Patch Changes

- 8ef0b56: Log written output for HTML builds too

## 1.0.1

### Patch Changes

- 7a99be4: Patch bump because I'm dumb
