import { expect, it } from 'vitest';
import { APP_VERSION, RELEASES, RELEASE_STORAGE_KEY, markReleaseSeen, shouldShowRelease } from './releases';

it('requires concise feature notes for the current version before release', () => {
  expect(RELEASES[APP_VERSION]?.length).toBeGreaterThan(0);
  expect(RELEASES[APP_VERSION].every(feature => feature.length <= 100)).toBe(true);
});
it('shows a new release once and shows again after a version update', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  expect(shouldShowRelease(storage)).toBe(true);
  markReleaseSeen(storage);
  expect(shouldShowRelease(storage)).toBe(false);
  storage.setItem(RELEASE_STORAGE_KEY, '0.2.0');
  expect(shouldShowRelease(storage)).toBe(true);
});
it('does not crash if local storage is unavailable', () => {
  const storage = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  expect(shouldShowRelease(storage)).toBe(true);
  expect(() => markReleaseSeen(storage)).not.toThrow();
});
