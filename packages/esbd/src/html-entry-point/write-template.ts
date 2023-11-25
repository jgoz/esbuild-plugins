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
import {
  cachedCopyFile,
  calculateContentIntegrityHash,
  calculateFileIntegrityHash,
  substituteDefines,
} from './utils';

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
  copyFile: (typeof fsp)['copyFile'];
  writeFile: (typeof fsp)['writeFile'];
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

  const { document, head, body } = template;

  const absTemplateDir = path.dirname(template.inputPath);
  const absOutDir = path.resolve(basedir, outdir);
  const templateOutputPath = path.resolve(absOutDir, template.outputPath);
  const needsModuleType = format === 'esm';

  const outputFilenames = Object.keys(metafile.outputs);

  // Find emitted entry points and convert them to absolute paths
  const entryOutputs: [entryPoint: string, outputPath: string][] = outputFilenames
    .map(o => [metafile.outputs[o], o] as const)
    .filter(([output]) => !!output.entryPoint)
    .map(([output, outputPath]) => [
      path.resolve(basedir, output.entryPoint!),
      path.relative(absTemplateDir, path.resolve(basedir, outputPath)),
    ]);

  // Find any output files that were produced from inputs with matching "href"
  // attributes in any <link> or <style> tags. If any are found, this indicates
  // that the files were referenced elsewhere in the dependency graph and esbuild
  // has copied them to the output directory, possibly with a different basename.
  // But if they _also_ appear in the HTML template, it might be for preloading/
  // prefetching purposes. In that case, we don't want to copy them again; rather,
  // we want to use the output path that esbuild has already produced.
  const tagOutputs = tagAssets.map(([element, url]) => {
    const matchingOutput = outputFilenames.find(o => {
      const inputs = Object.keys(metafile.outputs[o].inputs);
      if (inputs.length !== 1) return false;

      const absInputPath = path.resolve(basedir, inputs[0]);
      const absHrefPath = path.resolve(absTemplateDir, url);
      return absInputPath === absHrefPath;
    });
    return [element, url, matchingOutput] as const;
  });

  const cssOutput = new Map(entryOutputs.filter(([, o]) => o.endsWith('.css')));
  const jsOutput = new Map(entryOutputs.filter(([, o]) => o.endsWith('.js')));

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

    for (const absSourceFilePath of htmlEntryPathsAbs) {
      const outputFilePath = jsOutput.get(absSourceFilePath);
      if (!outputFilePath) continue;

      const outputFilePathKey = path.relative(
        basedir,
        path.resolve(absTemplateDir, outputFilePath),
      );

      // esbuild >= 0.15.10
      // Check "cssBundle" on the output file. This will be set if a JS entry point imports
      // a CSS file and therefore produces a CSS bundle.
      if (metafile.outputs[outputFilePathKey]?.cssBundle === candidatePathKey) {
        return true;
      }

      // esbuild < 0.15.10
      // A candidate is a "CSS from JS" entry point if at least one input of the CSS output file
      // overlaps with an input from a JS entry point referenced in the HTML. This roundabout
      // heuristic is necessary because esbuild doesn't indicate which CSS files are bound to
      // JS entry points. We also can't rely on input/output filename matching because the user
      // might be using [hash], [dir], etc., in the "entryNames" option.
      const inputs = Object.keys(metafile.outputs[outputFilePathKey]?.inputs ?? {});
      if (!inputs.length) continue;

      const intersection = new Set(inputs.filter(input => candidateInputs.has(input)));
      if (intersection.size >= 1) {
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

      node.attrs = node.attrs?.filter(a => a.name !== 'data-entry-name') ?? [];
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
  for (const [node, url, outputPath] of tagOutputs) {
    const href = node.attrs.find(a => a.name === 'href');
    if (!href) continue;

    const { basename, inputPath, rebasedURL } = rebaseAssetURL(
      outputPath ?? substituteDefines(url, define),
      template.inputPath,
      publicPath,
    );

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
      // If outputPath is defined, this file was already copied to the output directory
      // by esbuild, so we don't need to copy it again.
      if (!outputPath) {
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
    .mkdir(path.dirname(templateOutputPath), { recursive: true })
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
