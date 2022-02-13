# esbd

Turn your esbuild config files into CLIs with enhanced DX for browser and Node application development.

- [Motivation](#motivation)
- [Install](#install)
- [Usage](#usage)
- [Configuration](#configuration)
- [CLI commands](#cli-commands)
- [HTML entry points](#html-entry-points)
- [JSX runtime mode](#jsx-runtime-mode)
- [Copying static assets](#copying-static-assets)
- [API](#api)

### Motivation

Esbuild is an incredible tool with the potential to supplant Webpack as the dominant bundler in the JS ecosystem. But for many, it lacks a handful of features that prevent full adoption.

Tools like [Vite](https://vitejs.dev), [Parcel](https://parceljs.org), [Snowpack](https://www.snowpack.dev), and others have embraced esbuild largely as a transpiler for JS dialects, i.e., as an alternative to Babel or TypeScript. These tools offer a diverse set of features, such as fast startup, HMR, low/zero configuration, and the option to eschew bundling altogether and serve ES modules directly to the browser.

But by only using esbuild as a transpiler, these tools exist in the same performance ballpark as Webpack with [esbuild-loader](https://github.com/privatenumber/esbuild-loader). For smaller projects, this might be more than sufficient. And with a small enough internal dependency graph, unbundled development (or even production!) might offer better performance over bundled development via webpack-dev-server + esbuild-loader without losing any features.

Esbd uses a different approach. It delegates as much as possible to esbuild's (incredibly fast) bundler and augments it with a few nice-to-have DX enhancements that the core tool currently lacks. Features such as live-reload, error reporting, HTML entry points, and sideband type-checking enrich the core featureset without slowing esbuild down in any meaningful way.

The difference in performance is staggering. The quoted "10-100x" figure on esbuild's website is not exaggeration, but it's only true when using esbuild as both a bundler and a transpiler. By fully embracing esbuild's bundler, however, esbd is limited in what features it can reasonably offer without sacrificing build performance or significantly increasing complexity. This means HMR or other advanced features that involve source-level transformations that aren't suppored by esbuild can never be supported by esbd.

In an ideal world, esbd would not exist. If any of its extended features get added to esbuild itself, they will be happily removed from esbd. Until then, this project exists to add _just enough_ on top to reduce boilerplate for medium-to-large projects.

### Features

- Uses esbuild's bundler for incredibly fast builds in both dev and prod
- Every config file becomes a CLI
- `serve` mode for web applications and `node-dev` mode for Node applications
- HTML entry points
- Live-reload for web applications and restart-on-change for Node applications
- Opt-in sideband type checking for TypeScript projects
- In-browser error overlay for esbuild and TypeScript errors (dismissable)
- Optional support for React's `"jsxRuntime": "automatic"` mode via a small [SWC](https://swc.rs) plugin
- Copy static assets into the build folder
- Full support for other esbuild plugins (JS only)

### Non-features

Due to esbd's design and philosophy (see [Motivation](#Motivation)), the following features cannot be supported unless they are added to esbuild:

- Hot module reloading (HMR)
- "Unbundled" bundling (traversing dependency graph as though bundling, but simply producing transpiled files)

### Install

```console
$ npm i -D esbd esbuild
```

### Usage

Create a `bundle.js` file (or whatever you would like to name it). This will become both your configuration file and a CLI for running build commands.

The following example will produce a build configuration/script for a single HTML entry point.

```js
#!/usr/bin/env node
const { configure } = require('esbd');

configure({
  entryPoints: ['./index.html'],
  absWorkingDir: __dirname,
  outdir: './build',
});
```

Make the file executable:

```console
$ chmod +x bundle.js
```

Now you can run the development server:

```console
$ ./bundle.js serve
```

You can also produce a production build:

```console
$ ./bundle.js build --mode production
```

### Configuration

In order to restrict the number of available CLI options, build parameters must be specified via a configuration file. All of [esbuild's build API options](https://esbuild.github.io/api/#build-api) may be specified in addition to some custom options described in the [API](#API) section.

Esbd exports a single function called `configure` that accepts various configuration formats:

- Object &mdash; configures the build for a single application (i.e., web, node, or library)
- Array &mdash; configures builds for multiple applications (each element should be a configuration object)
- Function &mdash; function that accepts two parameters, `mode` (`"development"` or `"production"`) and `commandName` (`"build"`, `"serve"`, or `"node-dev"`) and returns either a configuration object or array. The function may be `async`.

Configuration objects in an array must have a `name` property to distinguish between them.

**Configuration object**:

```js
#!/usr/bin/env node
const { configure } = require('esbd');

configure({
  absWorkingDir: __dirname,
  entryPoints: ['./src/app.ts', './src/styles.css'],
  outdir: './build',
});
```

**Configuration array**:

```js
#!/usr/bin/env node
const { configure } = require('esbd');

configure([
  {
    name: 'web',
    absWorkingDir: __dirname,
    entryPoints: ['./src/client/index.html'],
    outdir: './build/web',
  },
  {
    name: 'server',
    absWorkingDir: __dirname,
    entryPoints: ['./src/server/app.ts'],
    outdir: './build/server',
    platform: 'node',
  },
]);
```

```console
$ ./bundle.js serve web
$ ./bundle.js node-dev server
$ ./bundle.js build
```

**Configuration function**:

```js
#!/usr/bin/env node
const { configure } = require('esbd');

configure(async (mode, command) => {
  const VERSION = (
    await fs.readFile(__dirname + '/../VERSION', {
      encoding: 'utf8',
    })
  ).trim();
  const NODE_ENV = mode === 'production' ? 'production' : 'development';
  const define = {
    '__APP_VERSION__': JSON.stringify(VERSION),
    'process.env': JSON.stringify({ NODE_ENV }),
    'NODE_ENV': JSON.stringify(NODE_ENV),
  };

  return [
    {
      name: 'web',
      absWorkingDir: __dirname,
      define,
      entryPoints: ['./src/client/index.html'],
      outdir: './build/web',
    },
    {
      name: 'server',
      absWorkingDir: __dirname,
      define,
      entryPoints: { www: './src/server/app.ts' },
      outdir: './build/server',
      platform: 'node',
    },
  ];
});
```

### CLI commands

Build scripts define three commands with specific and global flags.

#### Global flags

- `--log-level, -l` &mdash; Logging level (`verbose`, `debug`, `info`, `warning`, `error`, `silent`) (default: `info`)
- `--mode, -m` &mdash; Build mode (`development`, `production`) (default: `development`)
- `--check, -t` &mdash; Check types asynchronously with the TypeScript compiler
- `--ts-build-mode` &mdash; TypeScript "build" mode behavior (`readonly`, `write-output`) (default: `write-output`) &mdash; see [API](#API) for details

#### `build [name]`

Produces output for one or all of the defined configurations.

Parameters:

- `name` &mdash; (optional) configuration name to build. If not specified, all configurations will be built.

Flags:

- `--watch, -w` &mdash; Rebuild when source files change

#### `node-dev [name]`

Starts a Node application and a file watcher that recompiles the application on source change.

Parameters:

- `name` &mdash; (optional) configuration name to build. If not specified, the first configuration with `platform="node"` will be chosen

Flags:

- `--respawn, -r` &mdash; Restart program on exit/error (but quit if 3 restarts happen within 5s)

#### `serve [name]`

Starts a web server and a file watcher that serves build output in development mode.

Parameters:

- `name` &mdash; (optional) configuration name to build. If not specified, the first configuration with `platform="web"` (or undefined) will be chosen

Flags:

- `--host, -s` &mdash; Development server IP/host name (default: `localhost`)
- `--port, -p` &mdash; Development server port (default: `8000`)
- `--livereload, -r` &mdash; Reload the current page when source changes cause a rebuild. Build errors (and TypeScript errors if using `--check`) will be piped to the browser.
- `--no-rewrite` &mdash; Disable rewriting of all requests to "index.html" (SPA mode). When disabled, any request that doesn't match a physical file on disk (either served from the build output directory or servedir) will return a 404.
- `--servedir, -d <path>` &mdash; Directory of additional static assets to serve from the server root

### HTML entry points

With esbd, you can use an HTML file as the entry point for a web project.

- Scripts and styles that use relative paths will be passed to esbuild as entry points. The HTML file will be written to the output directory and the script/style paths will be replaced with their corresponding output paths.
- Any non-source assets referenced via relative paths, either from inline styles or from link elements, will be copied to the output folder and their paths will be rebased in the HTML output.
- Scripts, styles, or assets that use absolute paths or URLs will be left as-is.

Take the following HTML entry point as an example:

`index.html`:

```html
<!-- index.html entry point -->
<!DOCTYPE html>
<html>
  <head>
    <link rel="apple-touch-icon" href="./assets/favicon.png" />
    <link rel="stylesheet" href="./styles/entry.css" />
    <script defer type="module" src="./src/entry.tsx"></script>
    <script async src="https://google.com/gtag.js"></script>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
```

Assuming an output directory of `/out`, this will create 4 files:

- `out/index.html`
- `out/entry.0.css`
- `out/entry.1.js`
- `out/favicon.png`

The output for `index.html` will look something like this:

```html
<!-- index.html output -->
<!DOCTYPE html>
<html>
  <head>
    <link rel="apple-touch-icon" href="favicon.png" />
    <link rel="stylesheet" href="entry.0.css" />
    <script defer="" type="module" src="entry.1.js"></script>
    <script async="" src="https://google.com/gtag.js"></script>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
```

If `src/entry.tsx` included any CSS assets, either directly or indirectly via its dependency graph, the corresponding CSS output generated by esbuild would be included via a `<link>` tag below the other entry points. It is not currently possible to control where the extra link elements are inserted.

There are two configuration options that affect HTML entry point behavior: `ignoreAssets` and `integrity`. You can read about them in the [API](#api) section.

### JSX runtime mode

React 17 introduced a new [JSX transform](https://reactjs.org/blog/2020/09/22/introducing-the-new-jsx-transform.html) that enables some internal performance optimizations and obviates having to import 'React' in every module. Unfortunately, esbuild does not support this transform natively, even though both Babel and the TypeScript compiler do support it.

Esbd adds optional support for the new transform on top of esbuild through the use of [SWC](https://swc.rs). If you set the `jsxRuntime` configuration option to `automatic` and have `@swc/core` installed as a dependency in your project, esbd will transform `.jsx` and `.tsx` files first using SWC to transform JSX elements and then again using esbuild to transpile or downlevel according to the build target.

This adds minimal time to each build because SWC is a very fast transpiler and because only files that use JSX will be processed twice. And again, this is entirely opt-in.

If you are using TypeScript, note that you should set the "jsx" tsconfig option to "react-jsx" so that your editor does not require the "React" import. Esbd does not currently read this option from tsconfig.json, so `jsxRuntime` must be set to `automatic` explicitly for the new transform to be used.

### Copying static assets

Esbd can copy static assets to the output directory that would not otherwise be discovered through esbuild's dependency resolution. This works for files referenced by [HTML entry points](#html-entry-points) and also via the `copy` [configuration option](#api).

The `copy` configuration option is specified as an array of entries. Each entry is a tuple representing the source file path and, optionally, the destination file path.

Source paths may be absolute or relative to `absWorkingDir`. Destination paths may be absolute or relative to `outdir`. If no destination path is provided, the source file will be copied to `outdir` with the same name.

For example:

```js
#!/usr/bin/env node
const { configure } = require('esbd');

configure({
  absWorkingDir: __dirname,
  entryPoints: ['./src/app.ts', './src/styles.css'],
  outdir: './build',
  copy: [
    ['./assets/cat.png'], // -> ./build/cat.png
    ['./assets/dog.png', 'assets/horse.png'], // -> ./build/assets/horse.png
    [
      '/Users/me/path/to/repo/src/assets/pig.png',
      '/Users/me/path/to/repo/build/assets/pig.png',
    ], // -> ./build/assets/pig.png
  ],
});
```

Note that _glob patterns are not supported_, so if you need to copy an unknown number of assets that match a pattern, you will need to use a glob library like `glob` or `globby`.

### API

#### `function configure(config: EsbdConfigResult | ConfigFn): void`

See [esbuild's build API](https://esbuild.github.io/api/#build-api) for descriptions of all supported options (use the JS API toggle). There are also some `esbd`-specific options described below.

Note that these esbuild options are ignored:

- `metafile`
- `watch`
- `write`

**esbd-specific options:**

<!-- prettier-ignore-start -->
<!-- markdown-interpolate: node ../../scripts/docs.mjs ./src/config.ts EsbdSpecificOptions -->
| Name | Type | Default | Description |
| ---- | ---- | ------- | ----------- |
| copy | `[from: string, to?: string][]` | - | Files to copy to the output directory during the build.<br><br>Each entry is a tuple representing the source file path to copy and, optionally, the destination file path.<br><br>Source paths may be absolute or relative to `absWorkingDir`. Destination paths may be absolute or relative to `outdir`. If no destination path is provided, the source file will be copied to `outdir` with the same name.<br><br>If `esbd` is started in a watch mode (serve, node-dev, or build --watch), source files will be watched and copied whenever they change.<br><br>Note that `copy` does not support glob patterns.  |
| ignoreAssets | `boolean` | - | By default, assets (images, manifests, scripts, etc.) referenced by `<link>`, `<style>` and `<script>` tags in the HTML template will be collected as esbuild assets if their `src` attributes are specified as relative paths. The asset paths will be resolved relative to the *template file* and will be copied to the output directory, taking `publicPath` into consideration if it has been set.<br><br>Absolute paths or URIs will be ignored.<br><br>To ignore all `src` attributes and avoid collecting discovered assets, set this option to `true`.  |
| [integrity](https://developer.mozilla.org/en-US/docs/Web/Security/Subresource_Integrity) | `"sha256" \| "sha384" \| "sha512"` | - | If specified, a cryptographic digest for each file referenced by a `<link>` or `<script>` tag will be calculated using the specified algorithm and added as an `integrity` attribute on the associated tag. |
| [jsxRuntime](https://reactjs.org/blog/2020/09/22/introducing-the-new-jsx-transform.html) | `"automatic" \| "classic"` | `"classic"` | React 17 introduced a new JSX transform that enables some internal performance optimizations and obviates having to import 'React' in every module.<br><br>Though esbuild does not support this new transform natively, setting this option to `automatic` will add a load plugin (powered by SWC) for ".jsx" and ".tsx" files so they use the new tranform as expected.<br><br>If you are using TypeScript, note that you should set the "jsx" tsconfig option to "react-jsx" so that your editor does not require the "React" import. esbd does not currently read this option from tsconfig.json, so "jsxRuntime" must be set to "automatic" explicitly for the new transform to be used.  |
| name | `string` | - | Name of this configuration.<br><br>This is required for configurations that appear in an array.  |
<!-- end -->
<!-- prettier-ignore-end -->
