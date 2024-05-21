# @jgoz/esbuild-plugin-html

An esbuild plugin that populates an HTML template with `<script>` and `<link>` tags based on build output.

Note that this plugin is not necessary if you are using `esbd`, which has native support for HTML entry points.

### Features

- Adds tags for JS and CSS output files
- Copies and rebases assets referenced by `<link>` tags and inline `<style>` elements to output folder

### Install

```console
$ npm i @jgoz/esbuild-plugin-html
```

### Usage

Add it to your esbuild plugins:

```js
const esbuild = require('esbuild');
const { htmlPlugin } = require('@jgoz/esbuild-plugin-html');

await esbuild.build({
  // ...
  plugins: [
    htmlPlugin({
      template: './src/index.html',
    }),
  ],
});
```

At the bare minimum, the provided template should have a `doctype`, `html`, `head`, and `body`, tags. `script` and `link` tags will be inserted appropriately depending on the `scriptPlacement` and `linkPosition` option values.

### Plugin API

#### `function htmlPlugin(options?: HtmlPluginOptions): Plugin`

**Plugin options:**

<!-- prettier-ignore-start -->
<!-- markdown-interpolate: node ../../scripts/docs.mjs ./src/html-plugin.ts HtmlPluginOptions -->
| Name | Type | Default | Description |
| ---- | ---- | ------- | ----------- |
| template (*) | `string` | - | Path to the HTML template to use (required).<br><br>If a relative path is provided, it will be resolved relative to the `absWorkingDir` build option (falling back to `process.cwd()`). |
| chunks | `"entry" \| (outputPath: string, output: Object) => boolean` | `"entry"` | Filters chunks that should be included as `<link>` or `<script>` tags in the HTML output.<br><br>If the string "entry" is given (default), all entry points defined in esbuild options will be included. Note that CSS entry points will only be included if they are specified explicitly in esbuild options; being dependencies of a JS entry point is not sufficient.<br><br>"chunks" may also be provided as a function that receives all outputs, not just entry points. Returning true will include a reference to the chunk in HTML, false will exclude it. |
| [crossorigin](https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/crossorigin) | `"anonymous" \| "use-credentials"` | - | Defines how generated `<link>` and `<script>` tags handle cross-origin requests.<br><br>If left undefined, no attribute will be emitted. |
| [defer](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/script#attr-defer) | `boolean` | - | Sets the `defer` attribute on generated script tags.<br><br>If `scriptPlacement` is set to `head-*`, this will default to `true` but it can be set explicitly to `false` to override that behavior.<br><br>If esbuild is configured with `format: 'esm'`, `<script>` tags will be emitted as `type="module"` which implicitly sets `defer`. In that case, this setting will have no effect. |
| define | `Record<string, string>` | - | Values that will be substituted in the HTML output.<br><br>Given the following value for `define`:<br><br>``` define: {  FOO: 'foo',  BAR: 'bar', } ```<br><br>The HTML template may use `{{FOO}}` and `{{BAR}}` wherever those values should be substituted.<br><br>Note that unlike the `define` option in esbuild, strings should not be wrapped in `JSON.stringify`, since values will be substituted directly into the output. This means if any values are used in strings inside of inline `<script>` elements, they should be wrapped in quotes inside of the script. E.g.,<br><br>```html <script>   const foo = "{{FOO}}"; </script> ``` |
| filename | `string` | - | Output filename.<br><br>By default, the filename will be the same as the basename of the template file. |
| ignoreAssets | `boolean` | - | By default, assets (images, manifests, scripts, etc.) referenced by `<link>`, `<style>` and `<script>` tags in the HTML template will be collected as esbuild assets if their `src` attributes are specified as relative paths. The asset paths will be resolved relative to the *template file* and will be copied to the output directory, taking `publicPath` into consideration if it has been set.<br><br>Absolute paths or URIs will be ignored.<br><br>To ignore all `src` attributes and avoid collecting discovered assets, set this option to `true`. |
| [integrity](https://developer.mozilla.org/en-US/docs/Web/Security/Subresource_Integrity) | `"sha256" \| "sha384" \| "sha512"` | - | If specified, a cryptographic digest for each file referenced by a `<link>` or `<script>` tag will be calculated using the specified algorithm and added as an `integrity` attribute on the associated tag. |
| linkPosition | `"above" \| "below"` | `"below"` | Where to emit `<link>` elements for CSS chunks.<br><br>Possible values:<li>`"above"` &mdash; inside `<head>` element, above existing `<link>`s and `<style>`s<li>`"below"` &mdash; inside `<head>` element, below existing `<link>`s and `<style>`s<br><br>`<link>` elements are always emitted to `<head>`. |
| scriptPlacement | `"head-above" \| "head-below" \| "body-above" \| "body-below"` | `"head-below"` | Where to emit `<script>` elements for JS chunks.<br><br>Possible values:<li>`"head-above"` &mdash; inside `<head>` element, above existing `<script>`s<li>`"head-below"` &mdash; inside `<head>` element, below existing `<script>`s<li>`"body-above"` &mdash; inside `<body>` element, above existing `<script>`s<li>`"body-below"` &mdash; inside `<body>` element, below existing `<script>`s<br><br>When emitted to `<head>`, the `defer` option will be implicitly set to `true`. If you wish to disable this behavior, set `defer: false`. |
<!-- end -->
<!-- prettier-ignore-end -->

### Example templates

#### Bare Minimum:

```html
<!doctype html>
<html>
  <head></head>
  <body></body>
</html>
```

#### With external referenced assets (will not be copied):

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="description" content="Description" />
    <meta name="author" content="Me" />
    <meta name="google" value="notranslate" />
    <link
      rel="apple-touch-icon"
      sizes="180x180"
      href="http://icons.com/icon.png"
    />
    <meta name="theme-color" content="#ffffff" />
    <meta
      name="viewport"
      content="width=device-width, user-scalable=no, initial-scale=1, maximum-scale=1, minimum-scale=1"
    />
    <title>Complex Template</title>
    <style type="text/css" media="screen, print"></style>
    <link rel="stylesheet" href="https://google.com/fonts" />
    <script>
      window.global = window;
    </script>
  </head>
  <body>
    <div class="app-container"></div>
    <script src="http://google.com/analytics"></script>
  </body>
</html>
```

#### With local referenced assets (will be copied):

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="description" content="Description" />
    <meta name="author" content="Me" />
    <meta name="google" value="notranslate" />
    <link rel="apple-touch-icon" sizes="180x180" href="./assets/icon.png" />
    <link rel="mask-icon" href="./assets/mask.svg" color="#5bbad5" />
    <meta name="theme-color" content="#ffffff" />
    <meta
      name="viewport"
      content="width=device-width, user-scalable=no, initial-scale=1, maximum-scale=1, minimum-scale=1"
    />
    <title>Local Assets Template</title>
    <style type="text/css" media="screen, print">
      @font-face {
        font-family: 'Open Sans';
        font-weight: 400;
        font-style: normal;
        src: url('./assets/font.svg#OpenSans') format('svg');
      }
      body {
        background: url(./assets/bg.png?test#foo);
        content: 'url';
      }
    </style>
    <link rel="stylesheet" href="https://google.com/fonts" />
    <link rel="stylesheet" href="./assets/custom.css" />
    <script>
      window.global = window;
    </script>
  </head>
  <body>
    <div class="app-container"></div>
    <script src="http://google.com/analytics"></script>
  </body>
</html>
```

#### With values that will be replaced by `define` option:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="description" content="Description" />
    <meta name="author" content="Me" />
    <meta name="google" value="notranslate" />
    <link
      rel="apple-touch-icon"
      sizes="180x180"
      href="http://icons.com/icon.png?{{ process.env.NODE_ENV }}"
    />
    <meta name="theme-color" content="#ffffff" />
    <meta
      name="viewport"
      content="width=device-width, user-scalable=no, initial-scale=1, maximum-scale=1, minimum-scale=1"
    />
    <title>Complex Template</title>
    <style type="text/css" media="screen, print"></style>
    <link rel="stylesheet" href="https://google.com/fonts?{{ VERSION }}" />
    <script>
      window.global = window;
      window.version = '{{VERSION}}';
      window.environment = '{{process.env.NODE_ENV}}';
    </script>
  </head>
  <body>
    <div class="app-container"></div>
    <script src="http://google.com/analytics"></script>
  </body>
</html>
```
