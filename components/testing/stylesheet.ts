import { readFileSync } from 'node:fs';

export type Declarations = Readonly<Record<string, string>>;

function parse(css: string): CSSRuleList {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.append(style);
  const sheet = style.sheet;
  style.remove();
  if (!sheet) throw new Error('the stylesheet did not parse');
  return sheet.cssRules;
}

// Taken from the serialized rule rather than item(), which also lists every longhand a shorthand
// expands to; this keeps each declaration as the stylesheet writes it.
function declarationsOf(rule: CSSStyleRule): Declarations {
  const body = rule.cssText.slice(rule.cssText.indexOf('{') + 1, rule.cssText.lastIndexOf('}'));
  const entries = body
    .split(';')
    .map((declaration) => declaration.trim())
    .filter(Boolean)
    .map((declaration) => {
      const colon = declaration.indexOf(':');
      return [declaration.slice(0, colon).trim(), declaration.slice(colon + 1).trim()];
    });
  return Object.fromEntries(entries);
}

// Selector lists are compared as written on one line: ".a, .b" matches ".a,\n.b".
const oneLine = (selector: string) =>
  selector
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
const sameSelector = (a: string, b: string) => oneLine(a) === oneLine(b);

// Reads a component's CSS module as the browser would (jsdom's parser), so a test can prove a
// value the design fixes. It takes a path: under jsdom, URL resolves against the page, not file:. Module class names are unhashed in the source, so selectors are written
// as they appear in the file. `media` picks a rule inside that @media condition instead of a
// top-level one; it also picks from an @container rule with that condition.
export function ruleFor(file: string, selector: string, media?: string): Declarations {
  const rules = parse(readFileSync(file, 'utf8'));
  const scope =
    media === undefined
      ? [...rules]
      : [...rules]
          .filter(
            (rule): rule is CSSMediaRule | CSSContainerRule =>
              rule instanceof CSSMediaRule || rule instanceof CSSContainerRule,
          )
          .filter((rule) => rule.conditionText === media)
          .flatMap((rule) => [...rule.cssRules]);
  const matches = scope.filter(
    (rule): rule is CSSStyleRule =>
      rule instanceof CSSStyleRule && sameSelector(rule.selectorText, selector),
  );
  if (matches.length !== 1) {
    throw new Error(`expected one rule for "${selector}", found ${matches.length}`);
  }
  // The filter above leaves exactly one rule.
  return declarationsOf(matches[0]!);
}

export function keyframesIn(file: string): string[] {
  return [...parse(readFileSync(file, 'utf8'))]
    .filter((rule): rule is CSSKeyframesRule => rule instanceof CSSKeyframesRule)
    .map((rule) => rule.name);
}
