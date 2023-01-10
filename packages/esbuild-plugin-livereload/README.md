# @jgoz/esbuild-plugin-livereload

An esbuild plugin that reloads the browser window after you make changes. CSS-only changes are hot reloaded (i.e., without a full page refresh) by default.

### Features

- Reloads the browser window when new JS assets are emitted
- Hot-reloads CSS files (configurable) without flashes of unstyled content
- Adds a dismissable error/warning overlay for esbuild output
  - Can be used by other plugins by importing the `notify` function

### Install

```console
$ npm i @jgoz/esbuild-plugin-livereload
```

### Usage

Add it to your esbuild plugins:

```js
const esbuild = require('esbuild');
const { livereloadPlugin } = require('@jgoz/esbuild-plugin-livereload');

await esbuild.build({
  // ...
  plugins: [livereloadPlugin()],
});
```

Note that this will have no effect for Node programs.

### Plugin API

#### `function livereloadPlugin(options?: LivereloadPluginOptions): Plugin`

**Plugin options:**

<!-- prettier-ignore-start -->
<!-- markdown-interpolate: node ../../scripts/docs.mjs ./src/livereload-plugin.ts LivereloadPluginOptions -->
| Name | Type | Default | Description |
| ---- | ---- | ------- | ----------- |
| fullReloadOnCssUpdates | `boolean` | `false` | Instead of hot-reloading CSS files, trigger a full page reload when CSS is updated. |
| host | `string` | `127.0.0.1` | Host that the livereload server will run on. |
| port | `number` | `53099` | Port that the livereload server will run on. |
<!-- end -->
<!-- prettier-ignore-end -->

### Notification API

If you are implementing an esbuild plugin that can emit its own errors or warnings, you may add this package as an optional `peerDependency` and use the `notify` function to send those messages to the error overlay.

#### `function notify(errorSource: string, msg: ClientMessage): void`

<!-- prettier-ignore-start -->
<!-- markdown-interpolate: node ../../scripts/docs.mjs ./src/livereload-plugin.ts notify -->
Notifies connected clients that errors or warnings occurred from
a given source. If there are no errors and the notification originates
from esbuild, the page will be sent a reload request.

| Name | Type | Default | Description |
| ---- | ---- | ------- | ----------- |
| errorSource (*) | `string` | - | Key to use when identifying these errors and warnings.                      Previous results will be overwritten for the same `errorSource`. |
| msg (*) | `ClientMessage` | - | Object containing errors and warnings from the given source |
| connectedClients | `Set<ServerResponse<IncomingMessage>>` | `clients` | Set of long-lived server responses representing                           clients currently connected to the livereload                           server. Only required if you are implementing your                           own livereload server.  |
<!-- end -->
<!-- prettier-ignore-end -->

#### `ClientMessage`

<!-- prettier-ignore-start -->
<!-- markdown-interpolate: node ../../scripts/docs.mjs ./src/livereload-plugin.ts ClientMessage -->
| Name | Type | Default | Description |
| ---- | ---- | ------- | ----------- |
| cssUpdate | `boolean` | - | Does the current message represent a CSS-only update? |
| errors | `readonly Message[]` | - | Error messages. |
| warnings | `readonly Message[]` | - | Warning messages. |
<!-- end -->
<!-- prettier-ignore-end -->
