import { describe, expect, it } from 'vitest';

import { loadProjectFile, projectFilePath } from './files';
import type { DeclaredSuite } from './schema';
import { declaredStatusFor, stackToolName } from './stack-match';

// Design v7 item 8 (components.md, StackTagGroup "Match rule") with the owner's decision of
// 2026-09-29: a trailing version on the test-stack item is ignored when matching.

const project = (slug: string) => loadProjectFile(projectFilePath(slug));
const testStackItems = (slug: string) => project(slug).test_stack.flatMap((group) => group.items);
const statusesOf = (slug: string) => {
  const { declared_suites: suites } = project(slug);
  return Object.fromEntries(
    testStackItems(slug).flatMap((item) => {
      const status = declaredStatusFor(item, suites);
      return status === undefined ? [] : [[item, status]];
    }),
  );
};

const suite = (name: string, status: DeclaredSuite['status']): DeclaredSuite => ({
  name,
  layer: 'e2e',
  count: 1,
  status,
});

describe('declaredStatusFor, on the real project files', () => {
  it('Ostomate2 reports its Maestro flows and declares no suites, so no tool is marked', () => {
    expect(statusesOf('ostomate2')).toEqual({});
  });

  it('routeserve: "Maestro" matches its iOS suite, authored and never run; "Jest 30" nothing', () => {
    expect(statusesOf('routeserve')).toEqual({ Maestro: 'authored_not_executed' });
  });

  it('testpulse declares no suites, so no tool is marked', () => {
    expect(statusesOf('testpulse')).toEqual({});
  });
});

describe('declaredStatusFor', () => {
  const ios = suite('Maestro E2E (iOS)', 'authored_not_executed');

  it('matches a suite named the tool, or the tool then a space, trimmed and case-folded', () => {
    expect(declaredStatusFor('Maestro', [suite('maestro', 'authored_not_executed')])).toBe(
      'authored_not_executed',
    );
    expect(declaredStatusFor('  MAESTRO ', [ios])).toBe('authored_not_executed');
    expect(
      declaredStatusFor('Maestro', [suite('  maestro e2e (iOS)  ', 'authored_not_executed')]),
    ).toBe('authored_not_executed');
  });

  it('matches nothing else: no prefix without a space, no suffix, no substring', () => {
    expect(
      declaredStatusFor('Jest', [suite('jest-expo', 'authored_not_executed')]),
    ).toBeUndefined();
    expect(declaredStatusFor('Maest', [ios])).toBeUndefined();
    expect(declaredStatusFor('E2E', [ios])).toBeUndefined();
    expect(declaredStatusFor('Maestro E2E (iOS) extra', [ios])).toBeUndefined();
  });

  it('says "not yet reported" if any matching suite runs in CI, else "not yet executed"', () => {
    const android = suite('Maestro E2E (Android)', 'runs_in_ci_not_reported');
    expect(declaredStatusFor('Maestro', [ios, android])).toBe('runs_in_ci_not_reported');
    expect(declaredStatusFor('Maestro', [android, ios])).toBe('runs_in_ci_not_reported');
    expect(
      declaredStatusFor('Maestro', [ios, suite('Maestro smoke', 'authored_not_executed')]),
    ).toBe('authored_not_executed');
  });

  it('leaves a tool with no matching suite a normal tag', () => {
    expect(declaredStatusFor('Maestro', [])).toBeUndefined();
    expect(declaredStatusFor('Detox', [ios])).toBeUndefined();
  });
});

describe('stackToolName', () => {
  it('drops a trailing version, keeping the rest of the name', () => {
    expect(stackToolName('Maestro 2.6.1')).toBe('Maestro');
    expect(stackToolName('Jest 30')).toBe('Jest');
    expect(stackToolName('Robolectric 4.14.1')).toBe('Robolectric');
    expect(stackToolName('Playwright 1.63')).toBe('Playwright');
    expect(stackToolName('Maestro v2.6.1')).toBe('Maestro');
    expect(stackToolName('Maestro 2.0.0-beta.1')).toBe('Maestro');
  });

  it('keeps a name with no trailing version as it is, digits inside it included', () => {
    expect(stackToolName('Maestro')).toBe('Maestro');
    expect(stackToolName('V8 via Vitest')).toBe('V8 via Vitest');
    expect(stackToolName('kotlinx-coroutines-test')).toBe('kotlinx-coroutines-test');
    expect(stackToolName('Supabase CLI (local Postgres with RLS)')).toBe(
      'Supabase CLI (local Postgres with RLS)',
    );
    // A name that is only a version is not emptied.
    expect(stackToolName('2.6.1')).toBe('2.6.1');
  });
});
