import type { BuildOptions, BuildResult } from 'esbuild';
import { promises as fsp } from 'fs';
import { Document, Element, serialize, TextNode } from 'parse5';
import path from 'path';

import {
  createLinkElement,
  findLastChildIndex,
  getUrl,
  isElement,
  isLinkOrStyle,
  isScriptOrLinkOrStyle,
} from './html-utils';
import type { EsbuildHtmlOptions } from './types';
import { cachedCopyFile, calculateIntegrityHash } from './utils';

export interface WriteTemplateOptions extends EsbuildHtmlOptions {
  assets: [TextNode, string][];
  template: {
    document: Document;
    head: Element;
    body: Element;
    inputPath: string;
    outputPath: string;
  };
}

interface FileSystem {
  copyFile: typeof fsp['copyFile'];
  writeFile: typeof fsp['writeFile'];
}

export async function writeTemplate(
  result: BuildResult,
  buildOptions: BuildOptions,
  templateOptions: WriteTemplateOptions,
  fs: FileSystem,
): Promise<void> {
  const { absWorkingDir: basedir = process.cwd(), format, outdir, publicPath = '' } = buildOptions;
  const { assets, crossorigin, define, integrity, template } = templateOptions;

  const { metafile, outputFiles } = result;

  if (!outdir) {
    throw new Error('write-template: "outdir" esbuild build option is required');
  }
  if (!outputFiles) {
    throw new Error('write-template: esbuild "write" option must be "false"');
  }
  if (!metafile) {
    console.warn(
      'html-plugin: No "metafile" found on build result, possibly due to errors in another plugin.',
    );
    return;
  }

  const copyFile = cachedCopyFile(fs.copyFile);
  const outputCache = new Set<string>();

  const { document, head, body } = template;

  const absTemplateDir = path.dirname(template.inputPath);
  const absOutDir = path.resolve(basedir, outdir);
  const templateOutputPath = path.resolve(absOutDir, template.outputPath);
  const needsModuleType = format === 'esm';

  const outputs: [entryPoint: string, outputPath: string][] = Object.keys(metafile.outputs)
    .map(o => [metafile.outputs[o], o] as const)
    .filter(([output]) => !!output.entryPoint)
    .map(([output, outputPath]) => [path.resolve(basedir, output.entryPoint!), outputPath]);

  // Add any CSS files that were included in the output since they might not get
  // considered as entry points above
  const extraOutputs = outputFiles
    .filter(f => f.path.endsWith('.css'))
    .map(f => path.resolve(outdir, f.path));

  const cssOutput = new Map(outputs.filter(([, o]) => o.endsWith('.css')));
  const jsOutput = new Map(outputs.filter(([, o]) => o.endsWith('.js')));

  // Check whether any of the output file names have changed since the last
  // build finished
  let modified = false;
  const currentOutputs = new Set([
    ...Array.from(cssOutput.values()),
    ...Array.from(jsOutput.values()),
  ]);
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

  let lastCssEntry: Element | undefined;

  for (const node of [...head.childNodes, ...body.childNodes]) {
    if (isLinkOrStyle(node)) lastCssEntry = node;
    const url = getUrl(node);
    if (!url) continue;
    const absInputPath = path.resolve(absTemplateDir, url.value);
    const outputPath = cssOutput.get(absInputPath) ?? jsOutput.get(absInputPath);
    if (outputPath && isElement(node)) {
      const relativeOutputPath = path.relative(absOutDir, path.resolve(basedir, outputPath));
      const outputUrl = path.posix.join(publicPath, relativeOutputPath);

      node.attrs ??= [];
      if (node.nodeName === 'link') {
        const href = node.attrs.find(a => a.name === 'href');
        if (href) href.value = outputUrl;
      } else {
        const src = node.attrs.find(a => a.name === 'src');
        if (src) {
          src.value = outputUrl;
          if (needsModuleType) {
            const type = node.attrs.find(a => a.name === 'type');
            if (type) type.value = 'module';
            else node.attrs.push({ name: 'type', value: 'module' });
          }
        }
      }

      if (integrity) {
        node.attrs.push({
          name: 'integrity',
          value: await calculateIntegrityHash(path.resolve(absOutDir, outputUrl), integrity),
        });
      }
    }
  }

  const extraCss = extraOutputs.filter(out => out.endsWith('.css'));
  const extraLinks = await Promise.all(
    extraCss.map(outputPath =>
      createLinkElement({
        basedir,
        crossorigin,
        integrity,
        outputPath,
        parentNode: head,
        publicPath,
      }),
    ),
  );

  let insertIndex = lastCssEntry ? head.childNodes.indexOf(lastCssEntry) : -1;
  if (insertIndex < 0) insertIndex = findLastChildIndex(head, isScriptOrLinkOrStyle) || -1;
  head.childNodes.splice(insertIndex + 1, 0, ...extraLinks);

  const assetPaths: [string, string][] = [];
  for (const [text, url] of assets) {
    const { basename, inputPath, rebasedURL } = rebaseAssetURL(url, template.inputPath, publicPath);
    text.value = text.value.replace(url, rebasedURL);
    assetPaths.push([inputPath, path.resolve(absOutDir, basename)]);
  }

  let htmlOutput = serialize(document);
  if (define) {
    for (const def of Object.keys(define)) {
      const re = new RegExp(`\\{\\{\\s*${def}\\s*\\}\\}`, 'gi');
      htmlOutput = htmlOutput.replace(re, define[def]);
    }
  }

  const writeHTMLOutput = fsp
    .mkdir(absOutDir, { recursive: true })
    .then(() => fs.writeFile(templateOutputPath, htmlOutput));

  await Promise.all([writeHTMLOutput, ...assetPaths.map(paths => copyFile(...paths))]);
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
    : basename;

  return {
    rebasedURL: pathEnd < 0 ? rebased : rebased + inputURL.slice(pathEnd),
    inputPath,
    basename,
  };
}
