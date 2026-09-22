import { XMLParser, XMLValidator } from 'fast-xml-parser';

import { ParseError } from './types';

export type XmlNode = Record<string, unknown>;

const ATTRIBUTE_PREFIX = '@_';
const TEXT_KEY = '#text';
const CDATA_KEY = '#cdata';

// The prolog ends at the root element: the first "<" followed by an XML NameStartChar.
const ROOT_ELEMENT_START =
  /<[A-Za-z_:\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\u{10000}-\u{EFFFF}]/u;
const DOCTYPE = /<!DOCTYPE/i;
const CDATA_OR_COMMENT = /<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->/g;

// Entity processing is off (spec section 15), so only the predefined XML entities and
// numeric character references are decoded here, in a single non-recursive pass.
const PREDEFINED_ENTITIES: Readonly<Record<string, string>> = {
  lt: '<',
  gt: '>',
  amp: '&',
  quot: '"',
  apos: "'",
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: ATTRIBUTE_PREFIX,
  textNodeName: TEXT_KEY,
  cdataPropName: CDATA_KEY,
  alwaysCreateTextNode: true,
  parseTagValue: false,
  parseAttributeValue: false,
  processEntities: false,
  ignoreDeclaration: true,
  ignorePiTags: true,
});

function describeOffset(text: string, offset: number): string {
  const before = text.slice(0, offset);
  const line = before.split('\n').length;
  const col = offset - before.lastIndexOf('\n');
  return `line ${line}, col ${col}`;
}

/**
 * Rejects a DOCTYPE anywhere it could be markup: any mention in the prolog, and any occurrence
 * after the root element outside CDATA and comments (which is invalid XML that fast-xml-parser's
 * validator does not catch). Inside CDATA or a comment after the root it is data and stays.
 */
export function assertNoDoctype(xml: string): void {
  const rootIndex = xml.search(ROOT_ELEMENT_START);
  const prolog = rootIndex === -1 ? xml : xml.slice(0, rootIndex);
  const prologOffset = prolog.search(DOCTYPE);
  if (prologOffset !== -1) {
    throw new ParseError('XML with a DOCTYPE declaration is not accepted', {
      location: describeOffset(xml, prologOffset),
    });
  }
  if (rootIndex === -1) return;

  // Data sections are blanked rather than removed so the reported offset stays accurate.
  const body = xml
    .slice(rootIndex)
    .replace(CDATA_OR_COMMENT, (section) => section.replace(/[^\n]/g, ' '));
  const bodyOffset = body.search(DOCTYPE);
  if (bodyOffset !== -1) {
    throw new ParseError('A DOCTYPE after the root element is not valid XML', {
      location: describeOffset(xml, rootIndex + bodyOffset),
    });
  }
}

/** Validates and parses XML that has already passed {@link assertNoDoctype}. */
export function parseXml(xml: string): XmlNode {
  const validation = XMLValidator.validate(xml);
  if (validation !== true) {
    const { msg, line, col } = validation.err;
    const location = col === undefined ? `line ${line}` : `line ${line}, col ${col}`;
    throw new ParseError(msg, { location });
  }
  const parsed: unknown = parser.parse(xml);
  return isNode(parsed) ? parsed : {};
}

// The XML 1.0 Char production; a reference to anything else is not well-formed.
function isXmlChar(codePoint: number): boolean {
  return (
    codePoint === 0x9 ||
    codePoint === 0xa ||
    codePoint === 0xd ||
    (codePoint >= 0x20 && codePoint <= 0xd7ff) ||
    (codePoint >= 0xe000 && codePoint <= 0xfffd) ||
    (codePoint >= 0x10000 && codePoint <= 0x10ffff)
  );
}

export function decodeXmlEntities(value: string): string {
  return value.replace(
    /&(lt|gt|amp|quot|apos|#[0-9]+|#x[0-9a-fA-F]+);/g,
    (match: string, entity: string): string => {
      const predefined = PREDEFINED_ENTITIES[entity];
      if (predefined !== undefined) return predefined;
      const codePoint = entity.startsWith('#x')
        ? Number.parseInt(entity.slice(2), 16)
        : Number.parseInt(entity.slice(1), 10);
      if (!isXmlChar(codePoint)) {
        throw new ParseError(`Character reference ${match} is not an XML character`);
      }
      return String.fromCodePoint(codePoint);
    },
  );
}

function isNode(value: unknown): value is XmlNode {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function asNode(value: unknown): XmlNode | undefined {
  return isNode(value) ? value : undefined;
}

export function children(node: XmlNode, tag: string): XmlNode[] {
  const value = node[tag];
  const list = Array.isArray(value) ? value : [value];
  return list.flatMap((entry: unknown) => {
    const child = asNode(entry);
    return child === undefined ? [] : [child];
  });
}

export function attribute(node: XmlNode, name: string): string | undefined {
  const value = node[`${ATTRIBUTE_PREFIX}${name}`];
  return typeof value === 'string' ? decodeXmlEntities(value) : undefined;
}

function rawText(value: unknown): string {
  if (!isNode(value)) return '';
  const text = value[TEXT_KEY];
  return typeof text === 'string' ? text : '';
}

/**
 * Character data of an element: its text with entities decoded, followed by its CDATA sections
 * verbatim, since nothing inside CDATA is a reference. The relative order of text and CDATA is
 * not kept; the tools that report here use one or the other for a failure body, never both.
 */
export function textOf(node: XmlNode): string {
  const text = node[TEXT_KEY];
  const decoded = typeof text === 'string' ? decodeXmlEntities(text) : '';
  const cdata = node[CDATA_KEY];
  const sections = Array.isArray(cdata) ? cdata : [cdata];
  return decoded + sections.map(rawText).join('');
}
