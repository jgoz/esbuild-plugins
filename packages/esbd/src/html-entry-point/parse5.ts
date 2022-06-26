import type { DefaultTreeAdapterMap, Token } from 'parse5';

export type Document = DefaultTreeAdapterMap['document'];
export type DocumentType = DefaultTreeAdapterMap['documentType'];
export type Element = DefaultTreeAdapterMap['element'];
export type ChildNode = DefaultTreeAdapterMap['childNode'];
export type ParentNode = DefaultTreeAdapterMap['parentNode'];
export type TextNode = DefaultTreeAdapterMap['textNode'];
export type Attribute = Token.Attribute;
