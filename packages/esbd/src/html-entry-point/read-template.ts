import { promises as fsp } from 'fs';
import { parse } from 'parse5';
import path from 'path';

import {
  defaultDoctype,
  findChildElement,
  getAttribute,
  getUrl,
  isAbsoluteOrURL,
  isElement,
  isNonStylesheetLink,
  isTextNode,
} from './html-utils';
import { parseURLs } from './parse-urls';
import type { Element, TextNode } from './parse5';
import type { EntryPoints, EsbuildHtmlOptions } from './types';
import { substituteDefines } from './utils';
import type { WriteTemplateOptions } from './write-template';

export async function readTemplate(
  templatePath: string,
  {
    basedir = process.cwd(),
    define,
    cssChunkFilter,
    filename = path.basename(templatePath),
    ignoreAssets,
    integrity,
  }: EsbuildHtmlOptions,
): Promise<WriteTemplateOptions> {
  const absTemplatePath = path.resolve(basedir, templatePath);
  const absTemplateDir = path.dirname(absTemplatePath);

  let templateContent: string;
  try {
    templateContent = await fsp.readFile(absTemplatePath, 'utf-8');
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

  const tags = [
    ...head.childNodes.filter(node => node.nodeName === 'link'),
    ...head.childNodes.filter(node => node.nodeName === 'script'),
    ...body.childNodes.filter(node => node.nodeName === 'script'),
  ];

  // Collect entry points from script/link tags, grouping by file basename
  // if multiple tags reference a file with the same basename
  const entryPointsWithDuplicates: Record<string, string[]> = {};
  for (const tag of tags) {
    const url = getUrl(tag);
    if (!url || isAbsoluteOrURL(url.value) || isNonStylesheetLink(tag)) continue;

    const entryName = substituteDefines(
      getAttribute(tag, 'data-entry-name')?.value ??
        path.basename(url.value, path.extname(url.value)),
      define,
    );
    const entryPath = path.relative(basedir, path.resolve(absTemplateDir, url.value));
    entryPointsWithDuplicates[entryName] ??= [];
    entryPointsWithDuplicates[entryName].push(entryPath);
  }

  // Write entry points to a map with no duplicates. Any duplicated basenames will
  // have an index appended to the basename, e.g. `foo.js` becomes `foo.1.js`.
  const entryPoints: EntryPoints = {};
  for (const [entryName, entryPaths] of Object.entries(entryPointsWithDuplicates)) {
    if (entryPaths.length === 1) {
      entryPoints[entryName] = entryPaths[0];
    } else {
      for (let i = 0; i < entryPaths.length; i++) {
        entryPoints[`${entryName}.${i}`] = entryPaths[i];
      }
    }
  }

  // Collect assets referenced inline by `<style>` and `<link>` tags
  const tagAssets: [Element, string][] = [];
  const textAssets: [TextNode, string][] = [];
  if (!ignoreAssets) {
    for (const tag of head.childNodes.filter(node => node.nodeName === 'style')) {
      const text = isElement(tag) && tag.childNodes.find(isTextNode);
      if (!text) continue;
      for (const url of parseURLs(text.value)) {
        if (!url || isAbsoluteOrURL(url)) continue;

        textAssets.push([text, url]);
      }
    }
    for (const tag of head.childNodes.filter(isNonStylesheetLink)) {
      const url = getUrl(tag);
      if (!url || isAbsoluteOrURL(url.value)) continue;
      tagAssets.push([tag, url.value]);
    }
  }

  return {
    tagAssets,
    textAssets,
    define,
    cssChunkFilter,
    htmlEntryPoints: entryPoints,
    filename,
    ignoreAssets,
    integrity,
    template: {
      document,
      head,
      body,
      inputPath: absTemplatePath,
      outputPath: filename,
    },
  };
}
