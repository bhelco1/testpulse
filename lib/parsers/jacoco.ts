import { ParseError, type NormalizedCoverage } from './types';
import { assertNoDoctype, asNode, attribute, children, parseXml, type XmlNode } from './xml';

// Every JaCoCo report opens with exactly this external-identifier DOCTYPE. It carries no internal
// subset, so nothing can be declared in it; it is removed from the prolog only, and any other
// DOCTYPE, or this one anywhere else, is rejected like any other.
const JACOCO_PROLOG =
  /^(\s*(?:<\?xml[^>]*\?>)?\s*)<!DOCTYPE report PUBLIC "-\/\/JACOCO\/\/DTD Report 1\.1\/\/EN" "report\.dtd">/;

function counterValue(counter: XmlNode, field: 'covered' | 'missed', type: string): number {
  const value = attribute(counter, field) ?? '';
  if (!/^\d+$/.test(value)) {
    throw new ParseError(`${type} counter ${field}="${value}" is not a whole number`, { field });
  }
  return Number(value);
}

export function parseJacoco(xml: string): NormalizedCoverage {
  const withoutDoctype = xml.replace(JACOCO_PROLOG, '$1');
  assertNoDoctype(withoutDoctype);
  const report = asNode(parseXml(withoutDoctype)['report']);
  if (report === undefined) {
    throw new ParseError('Expected a report root element');
  }

  // Only the counters that are direct children of <report> are totals; package, class and
  // method counters are nested one or more levels down and are not read.
  const counters = children(report, 'counter');
  const counterOfType = (type: string): XmlNode | undefined =>
    counters.find((counter) => attribute(counter, 'type') === type);

  const line = counterOfType('LINE');
  if (line === undefined) {
    throw new ParseError('Report has no LINE counter');
  }
  const linesCovered = counterValue(line, 'covered', 'LINE');
  const coverage: NormalizedCoverage = {
    linesCovered,
    linesTotal: linesCovered + counterValue(line, 'missed', 'LINE'),
  };

  const branch = counterOfType('BRANCH');
  if (branch !== undefined) {
    coverage.branchesCovered = counterValue(branch, 'covered', 'BRANCH');
    coverage.branchesTotal = coverage.branchesCovered + counterValue(branch, 'missed', 'BRANCH');
  }
  return coverage;
}
