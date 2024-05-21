import { createHash } from 'crypto';
import type { Metafile, Plugin } from 'esbuild';
import { createReadStream, promises as fsp } from 'fs';
import type { DefaultTreeAdapterMap, Token } from 'parse5';
import { parse, serialize } from 'parse5';
import path from 'path';

type DocumentType = DefaultTreeAdapterMap['documentType'];
type Element = DefaultTreeAdapterMap['element'];
type ChildNode = DefaultTreeAdapterMap['childNode'];
type ParentNode = DefaultTreeAdapterMap['parentNode'];
type TextNode = DefaultTreeAdapterMap['textNode'];
type Attribute = Token.Attribute;

/**
 * Possible values for `crossorigin` attribute.
 */
export type Crossorigin = 'anonymous' | 'use-credentials';

/**
 * Element into which entry point tags will be emitted.
 */
export type EmitTarget = 'head' | 'body';

/**
 * Positioning of emitted tags relative to existing tags.
 */
export type EmitPosition = 'above' | 'below';

/**
 * Valid 'integrity' attribute hash algorithms.
 */
export type HashAlgorithm = 'sha256' | 'sha384' | 'sha512';

/**
 * Defines possible placement options for emitted tags.
 */
export type TagPlacement = `${EmitTarget}-${EmitPosition}`;

/**
 * Output file metadata from esbuiid.
 */
export type MetafileOutput = Metafile['outputs'][string];

const defaultDoctype: DocumentType = {
  nodeName: '#documentType' as DocumentType['nodeName'],
  name: 'html',
  parentNode: null,
  publicId: '',
  systemId: '',
};

export interface HtmlPluginOptions {
  /**
   * Filters chunks that should be included as `<link>` or `<script>` tags in the HTML
   * output.
   *
   * If the string "entry" is given (default), all entry points defined in esbuild
   * options will be included. Note that CSS entry points will only be included if they
   * are specified explicitly in esbuild options; being dependencies of a JS entry point
   * is not sufficient.
   *
   * "chunks" may also be provided as a function that receives all outputs, not just
   * entry points. Returning true will include a reference to the chunk in HTML, false
   * will exclude it.
   *
   * @default "entry"
   */
  chunks?: 'entry' | ((outputPath: string, output: MetafileOutput) => boolean);

  /**
   * Defines how generated `<link>` and `<script>` tags handle cross-origin requests.
   *
   * If left undefined, no attribute will be emitted.
   *
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/crossorigin}
   * @default undefined
   */
  crossorigin?: Crossorigin;

  /**
   * Sets the `defer` attribute on generated script tags.
   *
   * If `scriptPlacement` is set to `head-*`, this will default to `true` but
   * it can be set explicitly to `false` to override that behavior.
   *
   * If esbuild is configured with `format: 'esm'`, `<script>` tags will be emitted
   * as `type="module"` which implicitly sets `defer`. In that case, this setting
   * will have no effect.
   *
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/HTML/Element/script#attr-defer}
   * @default undefined
   */
  defer?: boolean;

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
   * Output filename.
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
   *
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/Security/Subresource_Integrity}
   * @default undefined
   */
  integrity?: HashAlgorithm;

  /**
   * Where to emit `<link>` elements for CSS chunks.
   *
   * Possible values:
   * - `"above"` &mdash; inside `<head>` element, above existing `<link>`s and `<style>`s
   * - `"below"` &mdash; inside `<head>` element, below existing `<link>`s and `<style>`s
   *
   * `<link>` elements are always emitted to `<head>`.
   *
   * @default "below"
   */
  linkPosition?: EmitPosition;

  /**
   * Where to emit `<script>` elements for JS chunks.
   *
   * Possible values:
   * - `"head-above"` &mdash; inside `<head>` element, above existing `<script>`s
   * - `"head-below"` &mdash; inside `<head>` element, below existing `<script>`s
   * - `"body-above"` &mdash; inside `<body>` element, above existing `<script>`s
   * - `"body-below"` &mdash; inside `<body>` element, below existing `<script>`s
   *
   * When emitted to `<head>`, the `defer` option will be implicitly set to `true`.
   * If you wish to disable this behavior, set `defer: false`.
   *
   * @default "head-below"
   */
  scriptPlacement?: TagPlacement;

  /**
   * Path to the HTML template to use (required).
   *
   * If a relative path is provided, it will be resolved relative
   * to the `absWorkingDir` build option (falling back to `process.cwd()`).
   */
  template: string;
}

export function htmlPlugin(options: HtmlPluginOptions): Plugin {
  const {
    chunks = 'entry',
    crossorigin,
    defer,
    define,
    filename = path.basename(options.template),
    ignoreAssets = false,
    integrity,
    linkPosition = 'below',
    scriptPlacement = 'head-below',
    template,
  } = options;

  const copyFile = cachedCopyFile();
  const outputCache = new Set<string>();

  return {
    name: 'html-plugin',
    setup: build => {
      const {
        absWorkingDir: basedir = process.cwd(),
        entryPoints,
        format,
        publicPath,
        outdir,
      } = build.initialOptions;

      // Nothing to do if there are no entry points
      if (!entryPoints) return;

      if (!outdir) {
        throw new Error('html-plugin: "outdir" esbuild build option is required');
      }

      // We need metadata on build results in order to determine
      // which files should be added to the resulting HTML.
      if (!build.initialOptions.metafile) {
        throw new Error('html-plugin: "metafile" esbuild option must be set to "true"');
      }

      const absOutDir = path.resolve(basedir, outdir);
      const useModuleType = format === 'esm';
      const templatePath = path.resolve(basedir, template);
      const entries = Array.isArray(entryPoints)
        ? entryPoints.map(entry =>
            path.resolve(basedir, typeof entry === 'object' ? entry.in : entry),
          )
        : Object.keys(entryPoints).map(entry => path.resolve(basedir, entryPoints[entry]));

      build.onEnd(async result => {
        const { metafile } = result;
        if (!metafile) {
          // The build failed for some reason unrelated to this plugin, so we can't continue
          return;
        }

        let templateContent: string;
        try {
          templateContent = await fsp.readFile(templatePath, { encoding: 'utf-8' });
        } catch (e) {
          throw new Error(`html-plugin: Unable to read template at ${templatePath}`);
        }
        const document = parse(templateContent);

        // parse5 will create these for us if they're missing
        const html = findChildElement(document, 'html')!;
        const head = findChildElement(html, 'head')!;
        const body = findChildElement(html, 'body')!;

        // Add a doctype if it's missing
        const doctype = document.childNodes.find(node => node.nodeName === '#documentType');
        if (!doctype) (document.childNodes as any[]).unshift(defaultDoctype);

        const assets: [string, string][] = [];
        if (!ignoreAssets) {
          const tags = [
            ...head.childNodes.filter(node => node.nodeName === 'link'),
            ...head.childNodes.filter(node => node.nodeName === 'script'),
            ...body.childNodes.filter(node => node.nodeName === 'script'),
          ];

          for (const tag of tags) {
            const url = getUrl(tag);
            if (!url || isAbsoluteOrURL(url.value)) continue;

            const { basename, inputPath, rebasedURL } = rebaseAssetURL(
              url.value,
              templatePath,
              publicPath,
            );

            url.value = rebasedURL;
            assets.push([inputPath, path.resolve(absOutDir, basename)]);
          }

          for (const tag of head.childNodes.filter(node => node.nodeName === 'style')) {
            const text = isElement(tag) && tag.childNodes.find(isTextNode);
            if (!text) continue;
            for (const url of parseURLs(text.value)) {
              if (!url || isAbsoluteOrURL(url)) continue;

              const { basename, inputPath, rebasedURL } = rebaseAssetURL(
                url,
                templatePath,
                publicPath,
              );

              text.value = text.value.replace(url, rebasedURL);
              assets.push([inputPath, path.resolve(absOutDir, basename)]);
            }
          }
        }

        const outputs = Object.keys(metafile.outputs).filter(o => {
          const output = metafile.outputs[o];
          return chunks === 'entry'
            ? output.entryPoint && entries.includes(path.resolve(basedir, output.entryPoint))
            : chunks(o, output);
        });
        const cssOutput = outputs.filter(o => o.endsWith('.css'));
        const jsOutput = outputs.filter(o => o.endsWith('.js'));

        // Check whether any of the output file names have changed since the last
        // build finished
        let modified = false;
        const currentOutputs = new Set([...cssOutput, ...jsOutput]);
        for (const output of currentOutputs) {
          if (!outputCache.has(output)) {
            outputCache.add(output);
            modified = true;
          }
        }
        for (const output of outputCache) {
          if (!currentOutputs.has(output)) {
            outputCache.delete(output);
            modified = true;
          }
        }

        // If no output filenames have changed, then there is no need to emit
        // the HTML
        if (!modified) return;

        const links: Element[] = await Promise.all(
          cssOutput.map(filePath =>
            createLinkElement({
              basedir,
              crossorigin,
              defer,
              integrity,
              outputPath: filePath,
              parentNode: head,
              publicPath,
              useModuleType,
            }),
          ),
        );

        const scriptParent = scriptPlacement.startsWith('head') ? head : body;
        const scripts: Element[] = await Promise.all(
          jsOutput.map(filePath =>
            createScriptElement({
              basedir,
              crossorigin,
              defer,
              integrity,
              outputPath: filePath,
              parentNode: scriptParent,
              publicPath,
              useModuleType,
            }),
          ),
        );

        const linkIndex =
          linkPosition === 'below'
            ? findLastChildIndex(head, isLinkOrStyle) + 1
            : head.childNodes.findIndex(isLinkOrStyle);

        head.childNodes.splice(linkIndex, 0, ...links);

        const scriptIndex = scriptPlacement.endsWith('below')
          ? findLastChildIndex(scriptParent, isScriptOrLinkOrStyle) + 1
          : scriptParent.childNodes.findIndex(isScriptOrLinkOrStyle);

        scriptParent.childNodes.splice(scriptIndex, 0, ...scripts);

        let htmlOutput = serialize(document);
        if (define) {
          for (const def of Object.keys(define)) {
            const re = new RegExp(`\\{\\{\\s*${def}\\s*\\}\\}`, 'gi');
            htmlOutput = htmlOutput.replace(re, define[def]);
          }
        }

        const writeHTMLOutput = fsp
          .mkdir(absOutDir, { recursive: true })
          .then(() => fsp.writeFile(path.resolve(absOutDir, filename), htmlOutput));

        await Promise.all([writeHTMLOutput, ...assets.map(paths => copyFile(...paths))]);
      });
    },
  };
}

function cachedCopyFile(): (input: string, output: string) => Promise<void> {
  const modified = new Map<string, number>();
  return async (input, output) => {
    const stat = await fsp.stat(input);
    if (modified.get(input) === stat.mtimeMs) return;
    modified.set(input, stat.mtimeMs);
    await fsp.copyFile(input, output);
  };
}

function createElement(parentNode: ParentNode, tagName: string, attrs: Attribute[] = []): Element {
  return {
    attrs,
    childNodes: [],
    namespaceURI: 'http://www.w3.org/1999/xhtml' as Element['namespaceURI'],
    nodeName: tagName,
    parentNode,
    tagName,
  };
}

interface CreateElementOptions {
  basedir: string;
  crossorigin: Crossorigin | undefined;
  defer: boolean | undefined;
  integrity: HashAlgorithm | undefined;
  outputPath: string;
  parentNode: ParentNode;
  publicPath: string | undefined;
  useModuleType: boolean | undefined;
}

async function createLinkElement({
  basedir,
  crossorigin,
  integrity,
  outputPath,
  parentNode,
  publicPath,
}: CreateElementOptions): Promise<Element> {
  const absOutputPath = path.resolve(basedir, outputPath);
  const filename = path.basename(absOutputPath);
  const url = publicPath ? path.join(publicPath, filename) : `${filename}`;
  const attrs: Attribute[] = collect([
    { name: 'href', value: url },
    { name: 'rel', value: 'stylesheet' },
    crossorigin && { name: 'crossorigin', value: crossorigin },
    integrity && {
      name: 'integrity',
      value: await calculateIntegrityHash(absOutputPath, integrity),
    },
  ]);
  return createElement(parentNode, 'link', attrs);
}

async function createScriptElement({
  basedir,
  crossorigin,
  defer,
  integrity,
  outputPath,
  parentNode,
  publicPath,
  useModuleType,
}: CreateElementOptions): Promise<Element> {
  const absOutputPath = path.resolve(basedir, outputPath);
  const filename = path.basename(absOutputPath);
  const url = publicPath ? path.join(publicPath, filename) : `${filename}`;
  const attrs: Attribute[] = collect([
    { name: 'src', value: url },
    useModuleType && { name: 'type', value: 'module' },
    !useModuleType && defer && { name: 'defer', value: '' },
    crossorigin && { name: 'crossorigin', value: crossorigin },
    integrity && {
      name: 'integrity',
      value: await calculateIntegrityHash(absOutputPath, integrity),
    },
  ]);
  return createElement(parentNode, 'script', attrs);
}

function isElement(node: ChildNode | undefined): node is Element {
  return !!node && node.nodeName !== '#comment' && node.nodeName !== '#text';
}

function isTextNode(node: ChildNode): node is TextNode {
  return node.nodeName === '#text';
}

function isScriptOrLinkOrStyle(node: ChildNode): boolean {
  return (
    isElement(node) &&
    (node.tagName === 'style' || node.tagName === 'link' || node.tagName === 'script')
  );
}

function isLinkOrStyle(node: ChildNode): boolean {
  return isElement(node) && (node.tagName === 'style' || node.tagName === 'link');
}

function findChildElement(parentNode: ParentNode, tagName: string): Element | undefined {
  const found = parentNode.childNodes.find(node => isElement(node) && node.tagName === tagName);
  return found as Element | undefined;
}

function findLastChildIndex(
  parentNode: ParentNode,
  predicate: (node: ChildNode) => boolean,
): number {
  for (let i = parentNode.childNodes.length; i >= 0; i--) {
    const el = parentNode.childNodes[i];
    if (predicate(el)) return i;
  }
  return 0;
}

function getUrl(node: ChildNode): Attribute | undefined {
  return isElement(node)
    ? node.attrs.find(attr => attr.name === 'href' || attr.name === 'src')
    : undefined;
}

function isAbsoluteOrURL(src: string): boolean {
  return path.isAbsolute(src) || src.includes('://') || src.startsWith('data:');
}

async function calculateIntegrityHash(filePath: string, integrity: HashAlgorithm): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash(integrity);
    const stream = createReadStream(filePath);

    stream.on('data', d => hash.update(d));
    stream.on('end', () => {
      resolve(`${integrity}-${hash.digest('base64')}`);
    });
    stream.on('error', reject);
  });
}

function collect<T>(values: (T | false | undefined | null)[]): T[] {
  return values.filter((v): v is T => !!v);
}

function rebaseAssetURL(
  inputURL: string,
  templatePath: string,
  publicPath: string | undefined,
): {
  basename: string;
  rebasedURL: string;
  inputPath: string;
} {
  const queryPos = inputURL.indexOf('?');
  const hashPos = inputURL.indexOf('#');
  const pathEnd = queryPos < 0 ? hashPos : hashPos < 0 ? queryPos : Math.min(queryPos, hashPos);
  const url = pathEnd < 0 ? inputURL : inputURL.slice(0, pathEnd);

  // The input URL is relative to the template file, so
  // rebase it relative to publicPath
  const basename = path.basename(url);
  const inputPath = path.resolve(path.dirname(templatePath), url);
  const rebased = publicPath
    ? publicPath.includes('://')
      ? new URL(basename, publicPath).href
      : path.join(publicPath, basename)
    : `${basename}`;

  return {
    rebasedURL: pathEnd < 0 ? rebased : rebased + inputURL.slice(pathEnd),
    inputPath,
    basename,
  };
}

const closingToken: Record<string, string> = {
  '(': ')',
  '"': '"',
  "'": "'",
};

function parseURLs(text: string): string[] {
  const urls: string[] = [];
  const length = text.length;
  let index = 0;

  const stack: string[] = [];
  while ((index = text.indexOf('url', index)) > 0) {
    // Skip over "url"
    index += 3;
    index += skipWhitespace(text, index);

    // Find opening "("
    if (text[index] !== '(') continue;
    stack.push(text[index++]);
    index += skipWhitespace(text, index);

    // Quotes are optional, but need to balance
    switch (text[index]) {
      case `'`:
      case `"`:
        stack.push(text[index++]);
        break;
    }
    index += skipWhitespace(text, index);

    // Start capturing the actual URL
    const start = index;
    let end = index;
    while (stack.length > 0 && index < length) {
      if (text[index] === closingToken[stack[stack.length - 1]]) {
        stack.pop();
        index += skipWhitespace(text, index);
      } else {
        end++;
      }
      index++;
    }

    urls.push(text.slice(start, end).trim());
  }

  return urls;
}

function skipWhitespace(text: string, index: number): number {
  let offset = 0;
  while (/\s/.test(text[index + offset])) offset++;
  return offset;
}
