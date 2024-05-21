# @jgoz/esbuild-overlay

A dismissable error overlay for reporting esbuild errors to a web browser.

### Features

- Supports esbuild's message format
- Dismissable

### Install

This package isn't really intended to be used on its own because it's bundled with `@jgoz/esbuild-plugin-livereload` and will be used without any configuration.

```console
$ npm i @jgoz/esbuild-overlay
```

### Usage with an EventSource

```js
async function init() {
  const { overlay } = await import('@jgoz/esbuild-overlay');

  const evt = new EventSource('/my-event-source');
  let removeOverlay;

  evt.addEventListener('build-result', e => {
    const result = JSON.parse(e?.data ?? '{}');
    if (removeOverlay && !result.errors.length) {
      removeOverlay();
      removeOverlay = undefined;
    }
    if (result.errors?.length) {
      removeOverlay = overlay({ errors: result.errors });
    }
  });
}
```

### API

#### `function overlay(props: OverlayProps): () => void`

Displays an overlay with the supplied error messages and returns a function that removes the overlay.

<!-- prettier-ignore-start -->
<!-- markdown-interpolate: node ../../scripts/docs.mjs ./src/overlay.ts OverlayProps -->
| Name | Type | Default | Description |
| ---- | ---- | ------- | ----------- |
| errors (*) | `Message[]` | - | Error messages to display. |
| openFileURL | `string` | - | If provided, this URL will be opened when the user clicks on the overlay.<br><br>This can be used to open the source file of the error or warning. |
<!-- end -->
<!-- prettier-ignore-end -->
