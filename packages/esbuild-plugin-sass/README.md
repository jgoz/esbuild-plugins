# `@jgoz/esbuild-plugin-sass`

An esbuild plugin for loading [Sass/SCSS](https://sass-lang.com) files using the [CSS content type](https://esbuild.github.io/content-types/#css).

This plugin was forked from [esbuild-sass-plugin](https://github.com/glromeo/esbuild-sass-plugin) to facilitate migrations from Webpack. Libraries that rely on [sass-loader](https://github.com/webpack-contrib/sass-loader)'s import resolution logic should mostly just work.

### Features

- Uses same module resolution algorithm as Webpack's `sass-loader`, including `~` as a prefix for `node_modules` in imports
- Provides a separate transform stage on the resulting CSS that may be used to apply PostCSS/Autoprefixer processing (mimics chained loaders in Webpack)
- Supports the same options as Dart Sass

### Install

```console
$ npm i @goz/esbuild-plugin-sass
```

### Usage

Add it to your esbuild plugins:

```js
const esbuild = require('esbuild');
const { sassPlugin } = require('@jgoz/esbuild-plugin-sass');

await esbuild.build({
  // ...
  plugins: [sassPlugin()],
});
```

This will produce a separate CSS output file for each entry point you define containing the transpiled Sass output.

#### Usage with PostCSS/Autoprefixer

The `transform` option can be used to process CSS output using PostCSS or any other utility.

```ts
const esbuild = require('esbuild');
const { sassPlugin } = require('@jgoz/esbuild-plugin-sass');
const autoprefixer = require('autoprefixer');
const presetEnv = require('postcss-preset-env');
const postcss = require('postcss');

const processor = postcss([autoprefixer, presetEnv()]);

await esbuild.build({
  // ...
  plugins: [
    sassPlugin({
      async transform(source, resolveDir) {
        const { css } = await processor.process(source, { from: resolveDir });
        return css;
      },
    }),
  ],
});
```

### API

#### `function sassPlugin(options?: SassPluginOptions): Plugin`

**Plugin options:**

<!-- prettier-ignore-start -->
<!-- markdown-interpolate: node ../../scripts/docs.mjs ./src/sass-plugin.ts SassPluginOptions -->
| Name | Type | Default | Description |
| ---- | ---- | ------- | ----------- |
| alias | `Record<string, string \| string[]>` | - | Import aliases to use when resolving imports from within sass files.<br><br>These will not be used when esbuild resolves imports from other module types.  |
| basedir | `string` | `process.cwd()` | Base directory to use when resolving the sass implementation. |
| [functions](https://sass-lang.com/documentation/js-api/interfaces/LegacyFileOptions#functions) | `Record<string, LegacySyncFunction>` | - | Holds a collection of custom functions that may be invoked by the sass files being compiled. |
| [importer](https://sass-lang.com/documentation/js-api/interfaces/LegacyFileOptions#importer) | `LegacySyncImporter \| LegacySyncImporter[]` | - | Resolves `@import` directives *between sass files*.<br><br>This is not used when esbuild resolves imports from other module types, e.g., when importing from JS/TS files or when defining a Sass file as an entry point.<br><br>If left undefined, a default importer will be used that closely mimics webpack's sass-loader resolution algorithm, which itself closely mimic's the default resolution algorithm of dart-sass.<br><br>If you want to extend the import algorithm while keeping the default, you can import it like so: <br><br><details><summary>Example</summary><pre>import { createSassImporter } from '@jgoz/esbuild-plugin-sass';<br><br>const defaultImporter = createSassImporter(<br>  [], // includePaths<br>  {}, // aliases<br>);<br><br>sassPlugin({<br>  importer: [myImporter, defaultImporter]<br>})</pre></details> |
| [includePaths](https://sass-lang.com/documentation/js-api/interfaces/LegacyFileOptions#includePaths) | `string[]` | `[]` | An array of paths that should be looked in to attempt to resolve your @import declarations. When using `data`, it is recommended that you use this. |
| [indentType](https://sass-lang.com/documentation/js-api/interfaces/LegacyFileOptions#indentType) | `"space" \| "tab"` | `'space'` | Used to determine whether to use space or tab character for indentation. |
| [indentWidth](https://sass-lang.com/documentation/js-api/interfaces/LegacyFileOptions#indentWidth) | `number` | `2` | Used to determine the number of spaces or tabs to be used for indentation. |
| [indentedSyntax](https://sass-lang.com/documentation/js-api/interfaces/LegacyStringOptions#indentedSyntax) | `boolean` | `false` | Enable Sass Indented Syntax for parsing the data string or file. |
| [linefeed](https://sass-lang.com/documentation/js-api/interfaces/LegacyFileOptions#linefeed) | `"cr" \| "crlf" \| "lf" \| "lfcr"` | `'lf'` | Used to determine which sequence to use for line breaks. |
| [outputStyle](https://sass-lang.com/documentation/js-api/interfaces/LegacyFileOptions#outputStyle) | `"compressed" \| "expanded"` | `'expanded'` | Determines the output format of the final CSS style. |
| [sourceMap](https://sass-lang.com/documentation/js-api/interfaces/LegacyFileOptions#sourceMap) | `boolean` | - | Enables the outputting of a source map. |
| [sourceMapContents](https://sass-lang.com/documentation/js-api/interfaces/LegacyFileOptions#sourceMapContents) | `boolean` | `false` | Includes the contents in the source map information. |
| [sourceMapEmbed](https://sass-lang.com/documentation/js-api/interfaces/LegacyFileOptions#sourceMapEmbed) | `boolean` | `false` | Embeds the source map as a data URI. |
| [sourceMapRoot](https://sass-lang.com/documentation/js-api/interfaces/LegacyFileOptions#sourceMapRoot) | `string` | - | The value will be emitted as `sourceRoot` in the source map information. |
| transform | `(css: string, resolveDir: string) => string \| Promise<string>` | - | A function that will post-process the css output before wrapping it in a module.<br><br>This might be useful for, e.g., processing CSS output with PostCSS/autoprefixer. <br><br><details><summary>Example</summary><pre>const postCSS = require("postcss")([<br> require("autoprefixer"),<br> require("postcss-preset-env")({ stage:0 })<br>]);<br><br>sassPlugin({<br> async transform(source, resolveDir) {<br>   const { css } = await postCSS.process(<br>     source,<br>     { from: resolveDir }<br>   );<br>   return css;<br> }<br>})</pre></details> |
<!-- end -->
<!-- prettier-ignore-end -->
