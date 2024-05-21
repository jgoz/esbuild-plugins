# esbd

## 3.3.6

### Patch Changes

- Updated dependencies [b23f695]
  - @jgoz/esbuild-plugin-livereload@2.1.0
  - @jgoz/esbuild-plugin-typecheck@4.0.0

## 3.3.5

### Patch Changes

- 5a50176: Expand esbuild peer dep range
- Updated dependencies [5a50176]
  - @jgoz/esbuild-plugin-livereload@2.0.5
  - @jgoz/esbuild-plugin-typecheck@3.1.3

## 3.3.4

### Patch Changes

- Updated dependencies [43765db]
- Updated dependencies [9976307]
- Updated dependencies [60af049]
  - @jgoz/esbuild-plugin-typecheck@3.1.2

## 3.3.3

### Patch Changes

- 25c5d69: Support esbuild 0.20.x
- Updated dependencies [25c5d69]
  - @jgoz/esbuild-plugin-livereload@2.0.4
  - @jgoz/esbuild-plugin-typecheck@3.1.1

## 3.3.2

### Patch Changes

- f09a43a: Add cors header to static assets
- 1bf8999: Fix URL joining in html

## 3.3.1

### Patch Changes

- f087a83: Fix html output paths in "build"

## 3.3.0

### Minor Changes

- 316a835: Rewrite to appropriate HTML file based on longest matching pathname prefix

### Patch Changes

- a84a597: Ensure full path to HTML output file is created

## 3.2.0

### Minor Changes

- 64365b9: Support esbuild 0.19

### Patch Changes

- Updated dependencies [64365b9]
  - @jgoz/esbuild-plugin-typecheck@3.1.0

## 3.1.0

### Minor Changes

- af3b259: Rewrite asset paths if they reference actual esbuild outputs

## 3.0.4

### Patch Changes

- 2a7f404: Add Content-Type header to static responses
- 2dcf438: esbuild 18 support
- Updated dependencies [2dcf438]
  - @jgoz/esbuild-plugin-livereload@2.0.3
  - @jgoz/esbuild-plugin-typecheck@3.0.3

## 3.0.3

### Patch Changes

- 257acff: Update dependencies
- Updated dependencies [257acff]
  - @jgoz/esbuild-plugin-livereload@2.0.2
  - @jgoz/esbuild-plugin-typecheck@3.0.2

## 3.0.2

### Patch Changes

- 18ba6ab: Emit livereload script directly to html

## 3.0.1

### Patch Changes

- 8a685b5: Remove mkdirp dependency
- 8a685b5: Support esbuild 0.17.2 entry format
- Updated dependencies [8a685b5]
  - @jgoz/esbuild-plugin-livereload@2.0.1
  - @jgoz/esbuild-plugin-typecheck@3.0.1

## 3.0.0

### Major Changes

- 3d5d90d: Target esbuild 0.17.x

  `esbd` now uses esbuild's `context` API internally, which means the minimum required esbuild version is now 0.17.0.
  This is a breaking change because it requires a peer dependency update, but usage of `esbd` itself is largely unaffected.

  Switching to `context` provided opportunities to simplify some internals. Notably, the custom source file watcher implementation based on chokidar has been replaced with esbuild's native file watching. There are a few implications of this change:

  - If there are errors detected on the initial `serve` or `node-dev` build, fixing them will now result in a new build without having to re-run the bundler script. This wasn't possible with the previous implementation because esbd needed at least one successful build in order to determine which files to watch.
  - esbd no longer prints which file(s) changed at the start of a new build because esbuild does not emit this information.
  - esbuild's watcher implementation is strictly polling based and is designed for low CPU usage, which means it could take up to 2 seconds for a file change to trigger a new build (see the [esbuild documentation](https://esbuild.github.io/api/#watch) for details).

- 3d5d90d: Host the LR server inline in esbd

  `esbd` now runs the livereload handler on the same port as the developement server in `serve` mode. This necessitated some internal changes to `esbuild-plugin-livereload`, including a small breaking change for anyone using the `createLivereloadServer` API, which has become an async function.

  Direct plugin usage remains unchanged.

### Patch Changes

- Updated dependencies [3d5d90d]
- Updated dependencies [3d5d90d]
- Updated dependencies [3d5d90d]
  - @jgoz/esbuild-plugin-livereload@2.0.0
  - @jgoz/esbuild-plugin-typecheck@3.0.0

## 2.7.0

### Minor Changes

- 660212a: Add cleanOutdir option

## 2.6.2

### Patch Changes

- Updated dependencies [b577e27]
  - @jgoz/esbuild-plugin-livereload@1.1.1
  - @jgoz/esbuild-plugin-typecheck@2.0.0

## 2.6.1

### Patch Changes

- cb500cf: Allow shutdown if server already closed

## 2.6.0

### Minor Changes

- c87f0a4: Add node 18 support

## 2.5.3

### Patch Changes

- ed67a98: Don't check for extensions when rewriting requests

## 2.5.2

### Patch Changes

- b596cac: Use 'cssBundle' if available on metafile output

## 2.5.1

### Patch Changes

- b49c1e6: Allow overriding some options

## 2.5.0

### Minor Changes

- 9014e49: Pass NODE_OPTIONS through to node-dev process

## 2.4.1

### Patch Changes

- 3da0dd9: Ensure node-dev restarts after error

## 2.4.0

### Minor Changes

- b1eb226: Throttle builds and queue watch events while building

## 2.3.1

### Patch Changes

- c68385d: Wait for process exit before restart

## 2.3.0

### Minor Changes

- a2bfd12: Accept data-entry-name for entryname customization

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
