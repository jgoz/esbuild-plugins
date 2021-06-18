import { Plugin } from 'esbuild';
import fsp from 'fs/promises';
import { Attribute, ChildNode, Document, Element, ParentNode, parse, serialize } from 'parse5';
import path from 'path';

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

export interface HtmlPluginOptions {
  /**
   * Defines how generated `<link>` and `<script>` tags handle cross-origin requests.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/crossorigin}
   *
   * If left undefined, no attribute will be emitted.
   *
   * @default undefined
   */
  crossorigin?: Crossorigin;

  /**
   * Sets the `defer` attribute on generated script tags.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/HTML/Element/script#attr-defer}
   *
   * If `scriptPlacement` is set to `head-*`, this will default to `true` but
   * it can be set explicitly to `false` to override that behavior.
   *
   * If esbuild is configured with `format: 'esm'`, `<script>` tags will be emitted
   * as `type="module"` which implicitly sets `defer`. In that case, this setting
   * will have no effect.
   *
   * @default undefined
   */
  defer?: boolean;

  /**
   * By default, assets (images, manifests, scripts, etc.) referenced by `<link>` and `<script>`
   * tags in the HTML template will be collected as esbuild assets if their `src` attributes
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
   * If a relative path is provided, it will be resolved relation
   * to the `absWorkingDir` build option (falling back to `process.cwd()`).
   *
   * The minimum requirement for an HTML template is
   */
  template: string;
}

export function htmlPlugin(options: HtmlPluginOptions): Plugin {
  return {
    name: 'html-plugin',
    setup: async build => {
      const {
        crossorigin,
        defer,
        ignoreAssets = false,
        linkPosition = 'below',
        scriptPlacement = 'head-below',
        template,
      } = options;
      const {
        absWorkingDir: basedir = process.cwd(),
        format,
        publicPath,
        outdir,
      } = build.initialOptions;

      if (!outdir) {
        throw new Error('html-plugin: "outdir" esbuild build option is required');
      }

      const absOutDir = path.resolve(basedir, outdir);
      const useModuleType = format === 'esm';
      const templatePath = path.resolve(basedir, template);

      let templateContent: string;
      let assets: [string, string][] = [];
      let document: Document;
      let html: Element;
      let head: Element;
      let body: Element;

      try {
        templateContent = await fsp.readFile(templatePath, { encoding: 'utf-8' });
      } catch (e) {
        throw new Error(`html-plugin: Unable to read template at ${templatePath}`);
      }

      // We need metadata on build results in order to determine
      // which files should be added to the resulting HTML.
      build.initialOptions.metafile = true;

      build.onStart(() => {
        if (ignoreAssets) return;

        assets = [];
        document = parse(templateContent);
        html = findChildElement(document, 'html') ?? addEmptyElement(document, 'html');
        head = findChildElement(html, 'head') ?? addEmptyElement(html, 'head');
        body = findChildElement(html, 'body') ?? addEmptyElement(html, 'body');

        const tags = [
          ...head.childNodes.filter(node => node.nodeName === 'link'),
          ...head.childNodes.filter(node => node.nodeName === 'script'),
          ...body.childNodes.filter(node => node.nodeName === 'script'),
        ];

        for (const tag of tags) {
          const url = getUrl(tag);
          if (!url || isAbsoluteOrURL(url.value)) continue;
          const [inputPath, rebased, outputPath] = rebaseSrcPath(
            url.value,
            templatePath,
            absOutDir,
            publicPath,
          );
          url.value = rebased;
          assets.push([inputPath, outputPath]);
        }
      });

      build.onEnd(async result => {
        const { metafile } = result;
        if (!metafile) {
          throw new Error(
            'html-plugin: Expected "metafile" to be defined on build result. Did another esbuild plugin set metafile: false?',
          );
        }

        await Promise.all(assets.map(paths => fsp.copyFile(...paths)));

        const links: Element[] = [];
        const scripts: Element[] = [];
        const scriptParent = scriptPlacement.startsWith('head') ? head : body;

        for (const output of Object.keys(metafile.outputs)) {
          const outputPath = path.resolve(basedir, output);
          const outputName = path.basename(outputPath);
          const url = publicPath ? path.join(publicPath, outputName) : `/${outputName}`;
          const attrs: Attribute[] = [];

          if (crossorigin) attrs.push({ name: 'crossorigin', value: crossorigin });

          if (output.endsWith('.css')) {
            attrs.push({ name: 'href', value: url });
            links.push(createElement(head, 'link', attrs));
          } else if (output.endsWith('.js')) {
            attrs.push({ name: 'src', value: url });
            if (useModuleType) attrs.push({ name: 'type', value: 'module' });
            if (!useModuleType && defer) attrs.push({ name: 'defer', value: '' });
            scripts.push(createElement(scriptParent, 'script', attrs));
          }
        }

        const linkIndex =
          linkPosition === 'below'
            ? findLastChildIndex(head, ['link', 'style'])
            : head.childNodes.findIndex(
                node => isElement(node) && ['link', 'style'].includes(node.tagName),
              );
        head.childNodes.splice(linkIndex + 1, 0, ...links);

        const scriptIndex = scriptPlacement.endsWith('below')
          ? findLastChildIndex(scriptParent, ['script']) + 1
          : scriptParent.childNodes.findIndex(node => isElement(node) && node.tagName === 'script');
        scriptParent.childNodes.splice(scriptIndex + 1, 0, ...scripts);

        await fsp.writeFile(path.resolve(absOutDir, path.basename(template)), serialize(document));
      });
    },
  };
}

function createElement(parentNode: ParentNode, tagName: string, attrs: Attribute[] = []): Element {
  return {
    attrs,
    childNodes: [],
    namespaceURI: '',
    nodeName: tagName,
    parentNode,
    tagName,
  };
}

function isElement(node: ChildNode | undefined): node is Element {
  return !!node && node.nodeName !== '#comment' && node.nodeName !== '#text';
}

function findChildElement(parentNode: ParentNode, tagName: string): Element | undefined {
  const found = parentNode.childNodes.find(node => isElement(node) && node.tagName === tagName);
  return found as Element | undefined;
}

function findLastChildIndex(parentNode: ParentNode, tagNames: string[]): number {
  for (let i = parentNode.childNodes.length; i >= 0; i--) {
    const el = parentNode.childNodes[i];
    if (isElement(el) && tagNames.includes(el.tagName)) return i;
  }
  return 0;
}

function addEmptyElement(parentNode: ParentNode, tagName: string): Element {
  const element = createElement(parentNode, tagName);
  parentNode.childNodes.push(element);
  return element;
}

function getUrl(node: ChildNode): Attribute | undefined {
  return isElement(node)
    ? node.attrs.find(attr => attr.name === 'href' || attr.name === 'src')
    : undefined;
}

function isAbsoluteOrURL(src: string): boolean {
  return path.isAbsolute(src) || src.includes('://') || src.startsWith('data:');
}

function rebaseSrcPath(
  src: string,
  templatePath: string,
  outdir: string,
  publicPath: string | undefined,
): [inputPath: string, rebased: string, outputPath: string] {
  const absolutePath = path.resolve(path.dirname(templatePath), src);
  const basename = path.basename(absolutePath);
  const rebased = publicPath
    ? publicPath.includes('://')
      ? new URL(basename, publicPath).href
      : path.join(publicPath, basename)
    : `/${basename}`;
  const outputPath = path.resolve(outdir, basename);
  return [absolutePath, rebased, outputPath];
}
