import path from 'path';

import type { Attribute, ChildNode, DocumentType, Element, ParentNode, TextNode } from './parse5';
import type { Crossorigin, HashAlgorithm } from './types';
import { calculateFileIntegrityHash, collect } from './utils';

export const defaultDoctype: DocumentType = {
  nodeName: '#documentType' as DocumentType['nodeName'],
  name: 'html',
  parentNode: null,
  publicId: '',
  systemId: '',
};

export function findLastChildIndex(
  parentNode: ParentNode,
  predicate: (node: ChildNode) => boolean,
): number {
  for (let i = parentNode.childNodes.length; i >= 0; i--) {
    const el = parentNode.childNodes[i];
    if (predicate(el)) return i;
  }
  return 0;
}

export function findChildElement(parentNode: ParentNode, tagName: string): Element | undefined {
  const found = parentNode.childNodes.find(node => isElement(node) && node.tagName === tagName);
  return found as Element | undefined;
}

export function getAttribute(node: ChildNode, name: string): Attribute | undefined {
  return isElement(node) ? node.attrs.find(attr => attr.name === name) : undefined;
}

export function getUrl(node: ChildNode): Attribute | undefined {
  return isElement(node)
    ? node.attrs.find(attr => attr.name === 'href' || attr.name === 'src')
    : undefined;
}

export function isAbsoluteOrURL(src: string): boolean {
  return path.isAbsolute(src) || src.includes('://') || src.startsWith('data:');
}

export function isElement(node: ChildNode | undefined): node is Element {
  return !!node && node.nodeName !== '#comment' && node.nodeName !== '#text';
}

export function isLinkOrStyle(node: ChildNode): node is Element {
  return isElement(node) && (node.tagName === 'style' || node.tagName === 'link');
}

export function isNonStylesheetLink(node: ChildNode): node is Element {
  return (
    isElement(node) &&
    node.tagName === 'link' &&
    node.attrs.some(attr => attr.name === 'rel' && attr.value !== 'stylesheet')
  );
}

export function isScriptOrLinkOrStyle(node: ChildNode): node is Element {
  return (
    isElement(node) &&
    (node.tagName === 'style' || node.tagName === 'link' || node.tagName === 'script')
  );
}

export function isTextNode(node: ChildNode): node is TextNode {
  return node.nodeName === '#text';
}

export function createElement(
  parentNode: ParentNode,
  tagName: string,
  attrs: Attribute[] = [],
): Element {
  return {
    attrs,
    childNodes: [],
    namespaceURI: 'http://www.w3.org/1999/xhtml' as Element['namespaceURI'],
    nodeName: tagName,
    parentNode,
    tagName,
  };
}

interface CreateLinkElementOptions {
  basedir: string;
  crossorigin: Crossorigin | undefined;
  integrity: HashAlgorithm | undefined;
  outputPath: string;
  parentNode: ParentNode;
  publicPath: string;
}

export async function createLinkElement({
  basedir,
  crossorigin,
  integrity,
  outputPath,
  parentNode,
  publicPath,
}: CreateLinkElementOptions): Promise<Element> {
  const absOutputPath = path.resolve(basedir, outputPath);
  const filename = path.basename(absOutputPath);
  const url = path.posix.join(publicPath, filename);
  const attrs: Attribute[] = collect([
    { name: 'href', value: url },
    { name: 'rel', value: 'stylesheet' },
    crossorigin && { name: 'crossorigin', value: crossorigin },
    integrity && {
      name: 'integrity',
      value: await calculateFileIntegrityHash(absOutputPath, integrity),
    },
  ]);
  return createElement(parentNode, 'link', attrs);
}
