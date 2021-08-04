import { promises as fsp } from 'fs';
import { parse, TextNode } from 'parse5';
import path from 'path';

import {
  defaultDoctype,
  findChildElement,
  getUrl,
  isAbsoluteOrURL,
  isElement,
  isTextNode,
} from './html-utils';
import { parseURLs } from './parse-urls';
import type { EntryPoints, EsbuildHtmlOptions } from './types';
import { WriteTemplateOptions } from './write-template';

export async function readTemplate(
  templatePath: string,
  {
    basedir = process.cwd(),
    define,
    filename = path.basename(templatePath),
    ignoreAssets,
    integrity,
  }: EsbuildHtmlOptions,
): Promise<[EntryPoints, WriteTemplateOptions]> {
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

  const entryPoints: EntryPoints = {};
  for (const tag of tags) {
    const url = getUrl(tag);
    if (!url || isAbsoluteOrURL(url.value)) continue;

    const entryName = path.basename(url.value, path.extname(url.value));
    entryPoints[entryName] = path.resolve(absTemplateDir, url.value);
  }

  const assets: [TextNode, string][] = [];
  if (!ignoreAssets) {
    for (const tag of head.childNodes.filter(node => node.nodeName === 'style')) {
      const text = isElement(tag) && tag.childNodes.find(isTextNode);
      if (!text) continue;
      for (const url of parseURLs(text.value)) {
        if (!url || isAbsoluteOrURL(url)) continue;

        assets.push([text, url]);
      }
    }
  }

  return [
    entryPoints,
    {
      assets,
      define,
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
    },
  ];
}
