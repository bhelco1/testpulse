import { describe, expect, it } from 'vitest';

import { platformSplit } from './platform-split';

// Design v4 item 18 (TPKit.platformSplit): platform is the last segment of the report key.
describe('platformSplit', () => {
  it('sums totals per platform in first-seen order, always with counts', () => {
    expect(
      platformSplit([
        { key: 'test/apps-backend/node', total: 240 },
        { key: 'e2e/apps-web/chromium', total: 38 },
        { key: 'test/packages-shared/node', total: 44 },
      ]),
    ).toBe('node 284 · chromium 38');
  });

  it('names one platform with its count', () => {
    expect(platformSplit([{ key: 'test/routeserve/node', total: 1045 }])).toBe('node 1,045');
  });

  it('keeps the order platforms first appear in', () => {
    expect(
      platformSplit([
        { key: 'android/app/jvm', total: 142 },
        { key: 'ios/app/ios-sim', total: 132 },
      ]),
    ).toBe('jvm 142 · ios-sim 132');
  });

  it('reads a key with no slash as the platform itself', () => {
    expect(platformSplit([{ key: 'node', total: 3 }])).toBe('node 3');
  });

  it('is empty for no reports', () => {
    expect(platformSplit([])).toBe('');
  });
});
