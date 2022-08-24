import type { BuildOptions, BuildResult } from 'esbuild';
import { promises as fsp } from 'fs';
import { serialize } from 'parse5';
import path from 'path';

import {
  createLinkElement,
  findLastChildIndex,
  getUrl,
  isElement,
  isLinkOrStyle,
  isScriptOrLinkOrStyle,
} from './html-utils';
import type { Document, Element, TextNode } from './parse5';
import type { EntryPoints, EsbuildHtmlOptions } from './types';
import { cachedCopyFile, calculateContentIntegrityHash, calculateFileIntegrityHash } from './utils';

export interface WriteTemplateOptions extends EsbuildHtmlOptions {
  htmlEntryPoints: EntryPoints;
  tagAssets: [Element, string][];
  textAssets: [TextNode, string][];
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
  const { crossorigin, define, htmlEntryPoints, integrity, tagAssets, template, textAssets } =
    templateOptions;

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
    .map(([output, outputPath]) => [
      path.resolve(basedir, output.entryPoint!),
      path.relative(absTemplateDir, path.resolve(basedir, outputPath)),
    ]);

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

  const htmlEntryPathsAbs = Object.values(htmlEntryPoints).map(filePath =>
    path.resolve(basedir, filePath),
  );

  // The default chunk filter will include any CSS files directly referenced
  // as entry points as well as those that are referenced by JS entry points.
  // This is tricky because esbuild doesn't give us a direct mapping between
  // JS entries and their CSS _output_ files, so we have to make some intelligent
  // guesses based on corresponding "input" keys in the metafile.
  const defaultCssChunkFilter = (absCandidatePath: string) => {
    const candidatePath = path.relative(absTemplateDir, absCandidatePath);
    for (const [, outputFilePath] of cssOutput) {
      if (candidatePath === outputFilePath) {
        // This is the simple case -- the candidate is a CSS file that is directly
        // referenced as an entry point.
        return true;
      }
    }

    // Complex case -- the candidate might be a CSS file that is referenced by a JS entry point.

    // First, look for the candidate in the metafile "outputs" and extracts its inputs (if any).
    const candidatePathKey = path.relative(basedir, absCandidatePath);
    const candidateInputs = new Set(Object.keys(metafile.outputs[candidatePathKey]?.inputs ?? {}));
    if (!candidateInputs.size) return false;

    // A candidate is a "CSS from JS" entry point if exactly one input of the CSS output file
    // overlaps with an input from a JS entry point referenced in the HTML. This roundabout
    // heuristic is necessary because esbuild doesn't indicate which CSS files are bound to
    // JS entry points. We also can't rely on input/output filename matching because the user
    // might be using [hash], [dir], etc., in the "entryNames" option.
    for (const absSourceFilePath of htmlEntryPathsAbs) {
      const outputFilePath = jsOutput.get(absSourceFilePath);
      if (!outputFilePath) continue;

      const outputFilePathKey = path.relative(
        basedir,
        path.resolve(absTemplateDir, outputFilePath),
      );
      const inputs = Object.keys(metafile.outputs[outputFilePathKey]?.inputs ?? {});
      if (!inputs.length) continue;

      const intersection = new Set(inputs.filter(input => candidateInputs.has(input)));
      if (intersection.size === 1) {
        return true;
      }
    }

    return false;
  };

  const cssChunkFilter = templateOptions.cssChunkFilter
    ? (absCandidatePath: string) => {
        const include = templateOptions.cssChunkFilter?.(absCandidatePath);
        if (include) return true;
        if (include === false) return false;
        return defaultCssChunkFilter(absCandidatePath);
      }
    : defaultCssChunkFilter;

  const absOutputFiles = new Map(
    outputFiles.map(outfile => [path.resolve(outdir, outfile.path), outfile]),
  );

  const extraCss = new Set(
    Array.from(absOutputFiles.keys())
      .filter(absFilePath => absFilePath.endsWith('.css'))
      .filter(cssChunkFilter),
  );

  let lastCssEntry: Element | undefined;

  for (const node of [...head.childNodes, ...body.childNodes]) {
    if (isLinkOrStyle(node)) lastCssEntry = node;
    const url = getUrl(node);
    if (!url) continue;
    const absInputPath = path.resolve(absTemplateDir, url.value);
    const outputPath = cssOutput.get(absInputPath) ?? jsOutput.get(absInputPath);
    if (outputPath && isElement(node)) {
      const absOutputPath = path.resolve(absTemplateDir, outputPath);
      const relativeOutputPath = path.relative(absOutDir, absOutputPath);
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
        const file = absOutputFiles.get(absOutputPath);
        if (file) {
          node.attrs.push({
            name: 'integrity',
            value: calculateContentIntegrityHash(file.contents, integrity),
          });
        }
      }

      // File was an entry point, so remove it from the list of extra CSS files
      extraCss.delete(absOutputPath);
    }
  }

  const extraLinks = await Promise.all(
    Array.from(extraCss.values()).map(outputPath =>
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

  // Rebase collected asset paths for tag assets (from <link> tags) and
  // text assets (from <style> tags)
  const assetPaths: [string, string][] = [];
  for (const [node, url] of tagAssets) {
    const { basename, inputPath, rebasedURL } = rebaseAssetURL(
      substituteDefines(url, define),
      template.inputPath,
      publicPath,
    );
    const href = node.attrs.find(a => a.name === 'href');
    if (href) {
      href.value = rebasedURL;

      if (inputPath && basename) {
        // TODO: parallelize this?
        if (integrity) {
          node.attrs.push({
            name: 'integrity',
            value: await calculateFileIntegrityHash(
              path.resolve(absTemplateDir, inputPath),
              integrity,
            ),
          });
        }
        assetPaths.push([inputPath, path.resolve(absOutDir, basename)]);
      }
    }
  }
  for (const [text, url] of textAssets) {
    const { basename, inputPath, rebasedURL } = rebaseAssetURL(
      substituteDefines(url, define),
      template.inputPath,
      publicPath,
    );
    text.value = text.value.replace(url, rebasedURL);
    if (inputPath && basename) {
      assetPaths.push([inputPath, path.resolve(absOutDir, basename)]);
    }
  }

  const htmlOutput = substituteDefines(serialize(document), define);

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
  basename: string | undefined;
  rebasedURL: string;
  inputPath: string | undefined;
} {
  if (path.isAbsolute(inputURL) || inputURL.includes('://')) {
    // Don't rebase absolute/schemed URLs
    return {
      rebasedURL: inputURL,
      inputPath: undefined,
      basename: undefined,
    };
  }

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

function substituteDefines(value: string, define: Record<string, string> | undefined): string {
  if (define) {
    for (const def of Object.keys(define)) {
      const re = new RegExp(`\\{\\{\\s*${def}\\s*\\}\\}`, 'gi');
      value = value.replace(re, define[def]);
    }
  }
  return value;
}
