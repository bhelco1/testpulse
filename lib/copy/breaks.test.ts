import { describe, expect, it } from 'vitest';

import { breakPieces } from './breaks';

// Design v21 item 8 (components.md, "Wrapping mono text"; tp-kit.js breakPieces): where a mono
// key or name may break. The pieces join back to the text exactly, so nothing is added to what is
// copied or read aloud; the page puts a <wbr> between pieces.
describe('breakPieces', () => {
  it('breaks a report key or path after each "/"', () => {
    expect(breakPieces('ios/composeApp/ios-sim', 'key')).toEqual([
      'ios/',
      'composeApp/',
      'ios-sim',
    ]);
  });

  it('breaks a suite after each "." and "/"', () => {
    expect(breakPieces('com.ostomate.app.ui.HomeViewModelTest', 'suite')).toEqual([
      'com.',
      'ostomate.',
      'app.',
      'ui.',
      'HomeViewModelTest',
    ]);
    expect(breakPieces('apps/backend/src/jobs.test.ts', 'suite')).toEqual([
      'apps/',
      'backend/',
      'src/',
      'jobs.',
      'test.',
      'ts',
    ]);
  });

  it('breaks a test name also at camelCase humps, never inside a word', () => {
    expect(breakPieces('fromTagsReturnsUserTags', 'name')).toEqual([
      'from',
      'Tags',
      'Returns',
      'User',
      'Tags',
    ]);
    expect(breakPieces('HomeViewModelTest.renders2Today', 'name')).toEqual([
      'Home',
      'View',
      'Model',
      'Test.',
      'renders2',
      'Today',
    ]);
    // Capitals in a row are one piece, and prose names break at their spaces on their own.
    expect(breakPieces('parsesHTMLReport', 'name')).toEqual(['parses', 'HTMLReport']);
    expect(breakPieces('returns 409 when job overlaps', 'name')).toEqual([
      'returns 409 when job overlaps',
    ]);
  });

  it('breaks a requested path after "/" and "."', () => {
    expect(breakPieces('/p/ostomate2/tests/com.ostomate.Home', 'path')).toEqual([
      '/',
      'p/',
      'ostomate2/',
      'tests/',
      'com.',
      'ostomate.',
      'Home',
    ]);
  });

  it('joins back to the text unchanged', () => {
    for (const rule of ['key', 'suite', 'name', 'path'] as const) {
      const text = 'a.b/cDe f.Gh/';
      expect(breakPieces(text, rule).join('')).toBe(text);
    }
    expect(breakPieces('', 'name')).toEqual(['']);
  });
});
