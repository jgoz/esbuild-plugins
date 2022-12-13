# @jgoz/jest-esbuild

An esbuild transform for Jest that supports mock hoisting.

### Features

- Supports mock hoisting via [babel-plugin-jest-hoist](https://www.npmjs.com/package/babel-plugin-jest-hoist)
- Accepts esbuild transform options

### Install

```console
$ npm i @jgoz/jest-esbuild
```

### Usage

Add it to your jest config:

```json
{
  "transform": {
    "^.+\\.tsx?$": ["@jgoz/jest-esbuild"]
  }
}
```

Or with options:

```json
{
  "transform": {
    "^.+\\.tsx?$": [
      "@jgoz/jest-esbuild",
      {
        "esbuild": {
          "jsx": "automatic",
          "target": "es2017"
        }
      }
    ]
  }
}
```

### Options

<!-- prettier-ignore-start -->
<!-- markdown-interpolate: node ../../scripts/docs.mjs ./src/index.ts TransformerConfig -->
| Name | Type | Default | Description |
| ---- | ---- | ------- | ----------- |
| [esbuild](https://esbuild.github.io/api/#transform-api) | `TransformOptions` | - | Esbuild transform options. |
| hoistMatch | `string[]` | `testMatch` | Alternate glob patterns for files that should be transformed with Babel for mock hoisting. If specified, only files matching this pattern will be transformed with Babel after being transformed with esbuild. |
<!-- end -->
<!-- prettier-ignore-end -->
