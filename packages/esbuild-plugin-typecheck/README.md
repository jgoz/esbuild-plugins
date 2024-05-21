# @jgoz/esbuild-plugin-typecheck

An esbuild plugin for TypeScript type checking and side-channel compilation.

### Features

- Runs asynchronously in a worker thread
- Supports project references and build mode
- Reports errors to `@jgoz/esbuild-plugin-livereload`

### Install

```console
$ npm i @jgoz/esbuild-plugin-typecheck
```

### Usage

Add it to your esbuild plugins:

```js
const esbuild = require('esbuild');
const { typecheckPlugin } = require('@jgoz/esbuild-plugin-typecheck');

await esbuild.build({
  // ...
  plugins: [typecheckPlugin()],
});
```

### API

#### `function typecheckPlugin(options?: TypecheckPluginOptions): Plugin`

**Plugin options:**

<!-- prettier-ignore-start -->
<!-- markdown-interpolate: node ../../scripts/docs.mjs ./src/types.ts TypecheckPluginOptions -->
| Name | Type | Default | Description |
| ---- | ---- | ------- | ----------- |
| [build](https://www.typescriptlang.org/docs/handbook/project-references.html#tsc--b-commandline) | `boolean \| BuildOptions` | - | Run the compiler in build mode, equivalent to running `tsc --build`. Normally, this will be inferred if `tsconfig.json` sets `"composite": true` but it can be overridden by this option.<br><br>This option also accepts an object, which implicitly turns build mode on. The object accepts build-mode-specific options that will be passed to the TypeScript compiler API. |
| buildMode | `"readonly" \| "write-output"` | `"readonly"` | Changes the behavior of build mode with respect to program output (JavaScript, type definitions, sourcemaps, and .tsbuildinfo files).<li>`readonly` (default) &mdash; output files will be written to an in-memory   file system and discared after esbuild exits<li>`write-output` &mdash; output files will be written to disk as though you   had invoked `tsc --build`<br><br>There are tradeoffs between the two modes. In `readonly` mode, the initial typecheck may be slower, especially if the output/.tsbuildinfo files do not match the source files. However, subsequent incremental typechecks may be slightly faster since no I/O is involved. This mode is also the least surprising because typechecking implies a different intent than compilation, but TypeScript's build mode needs to produce output in order to remain fast for incremental compilation.<br><br>In `write-output` mode, the output files will always be in sync with the input files, so the initial compilation may be slightly faster. However, subsequent incremental typechecks might be slightly slower due to I/O overhead. This mode would be appropriate to enable as an alternative to invoking `tsc --build` manually, e.g., in the case where the TypeScript output itself may be used outside of esbuild. |
| [compilerOptions](https://www.typescriptlang.org/tsconfig) | `CompilerOptions` | `{}` | TypeScript compiler option overrides that will be merged into the options in "tsconfig.json". |
| configFile | `string` | - | Path to "tsconfig.json". If not specified, this will use ESBuild's "tsconfig" option, finally falling back to TypeScript's config file resolution algorithm. |
| logger | `Logger` | - | Logger to use instead of the default. |
| omitStartLog | `boolean` | `false` | Omit "Typecheck started" messages. |
| watch | `boolean` | - | Enable typescript's watch mode |
<!-- end -->
<!-- prettier-ignore-end -->
