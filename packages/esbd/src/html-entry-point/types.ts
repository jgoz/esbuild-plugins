/**
 * Possible values for `crossorigin` attribute.
 */
export type Crossorigin = 'anonymous' | 'use-credentials';

/**
 * Valid 'integrity' attribute hash algorithms.
 */
export type HashAlgorithm = 'sha256' | 'sha384' | 'sha512';

/**
 * Entry points parsed from the HTML template.
 */
export type EntryPoints = Record<string, string>;

export interface EsbuildHtmlOptions {
  /**
   * Base directory used for resolving the HTML template if it's specified as
   * a relative path.
   *
   * @default "process.cwd()"
   */
  basedir?: string;

  /**
   * Defines how generated `<link>` and `<script>` elements handle cross-origin requests.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/crossorigin}
   *
   * If specified, this attribute will be added both to elements that were already part of
   * the HTML template and to elements that were added as part of the entry point discovery
   * process.
   *
   * If left undefined, no attribute will be emitted.
   *
   * @default undefined
   */
  crossorigin?: Crossorigin;

  /**
   * Predicate function that determines whether a CSS output file should be added to the written HTML entry point.
   *
   * This function receives an absolute output file path and should return a value indicating
   * whether that file should be referenced in the HTML output.
   *
   * By default, CSS output files will be cross-referenced with CSS and JS entry points, as
   * specified in the HTML template. CSS files that are referenced directly in HTML and those
   * that are referenced indirectly from JS entry points will be included.
   */
  cssChunkFilter?: (absFilePath: string) => boolean;

  /**
   * Values that will be substituted in the HTML output.
   *
   * Given the following value for `define`:
   *
   * ```
   * define: {
   *  FOO: 'foo',
   *  BAR: 'bar',
   * }
   * ```
   *
   * The HTML template may use `{{FOO}}` and `{{BAR}}` wherever those
   * values should be substituted.
   *
   * Note that unlike the `define` option in esbuild, strings should not be
   * wrapped in `JSON.stringify`, since values will be substituted directly into
   * the output. This means if any values are used in strings inside of inline `<script>`
   * elements, they should be wrapped in quotes inside of the script. E.g.,
   *
   * ```html
   * <script>
   *   const foo = "{{FOO}}";
   * </script>
   * ```
   *
   * @default undefined
   */
  define?: Record<string, string>;

  /**
   * Output filename for the HTML template.
   *
   * By default, the filename will be the same as the basename of the template file.
   *
   * @default undefined
   */
  filename?: string;

  /**
   * By default, assets (images, manifests, scripts, etc.) referenced by `<link>`, `<style>` and
   * `<script>` tags in the HTML template will be collected as esbuild assets if their `src` attributes
   * are specified as relative paths. The asset paths will be resolved relative to the *template file*
   * and will be copied to the output directory, taking `publicPath` into consideration if it has
   * been set.
   *
   * Absolute paths or URIs will be ignored.
   *
   * To ignore all `src` attributes and avoid collecting discovered assets, set this option to `true`.
   *
   * @default undefined
   */
  ignoreAssets?: boolean;

  /**
   * If specified, a cryptographic digest for each file referenced by a `<link>` or
   * `<script>` tag will be calculated using the specified algorithm and added as an
   * `integrity` attribute on the associated tag.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/Security/Subresource_Integrity}
   *
   * @default undefined
   */
  integrity?: HashAlgorithm;
}
