import { describe, it, expect } from 'vitest';
import { selectionRects } from './text-selection';

function fixture(rotation = 0) {
  const container = { contains: node => node === 'inside', getBoundingClientRect: () => ({ left: 100, top: 200 }) };
  const selection = { rangeCount: 1, isCollapsed: false, getRangeAt: () => ({ startContainer: 'inside', endContainer: 'inside', getClientRects: () => [{ left: 120, top: 220, right: 160, bottom: 240, width: 40, height: 20 }] }) };
  const viewport = { convertToPdfPoint: (x,y) => rotation ? [y / 2, x / 2] : [x / 2, 300 - y / 2] };
  return { container, selection, viewport };
}
describe('PDF text selection coordinates', () => {
  it('converts display selection to PDF coordinates accounting for scroll offset and zoom', () => {
    const { selection, container, viewport } = fixture();
    expect(selectionRects(selection, container, viewport)).toEqual([[10, 280, 30, 290]]);
  });
  it('normalizes rotated rectangle bounds', () => {
    const { selection, container, viewport } = fixture(90);
    expect(selectionRects(selection, container, viewport)).toEqual([[10, 10, 20, 30]]);
  });
  it('rejects collapsed, external and unavailable selections', () => {
    const { selection, container, viewport } = fixture();
    expect(selectionRects(null, container, viewport)).toEqual([]);
    expect(selectionRects({ ...selection, isCollapsed: true }, container, viewport)).toEqual([]);
    expect(selectionRects({ ...selection, getRangeAt: () => ({ startContainer: 'outside' }) }, container, viewport)).toEqual([]);
  });
});
