import { describe, expect, it } from 'vitest';
import { previewScale, reorderAt, stepZoom } from './view';

describe('zoom and drag insertion', () => {
  it('fits width or whole page and bounds numeric zoom', () => {
    const page = { width: 600, height: 800 };
    const viewport = { width: 900, height: 400 };
    expect(previewScale('fit-width', page, viewport)).toBe(1.5);
    expect(previewScale('fit-page', page, viewport)).toBe(0.5);
    expect(previewScale(500, page, viewport)).toBe(3);
    expect(previewScale(0, page, viewport)).toBe(0.25);
    expect(stepZoom(123, 1)).toBe(125);
    expect(stepZoom(123, -1)).toBe(100);
    expect(stepZoom(300, 1)).toBe(300);
    expect(stepZoom(25, -1)).toBe(25);
  });
  it('inserts before/after targets moving in both directions without mutation', () => {
    const pages = ['a', 'b', 'c', 'd'].map(id => ({ id }));
    const ids = result => result.map(page => page.id);
    expect(ids(reorderAt(pages, 'a', 'c', 'after'))).toEqual(['b', 'c', 'a', 'd']);
    expect(ids(reorderAt(pages, 'a', 'c', 'before'))).toEqual(['b', 'a', 'c', 'd']);
    expect(ids(reorderAt(pages, 'd', 'b', 'before'))).toEqual(['a', 'd', 'b', 'c']);
    expect(ids(reorderAt(pages, 'd', 'b', 'after'))).toEqual(['a', 'b', 'd', 'c']);
    expect(ids(pages)).toEqual(['a', 'b', 'c', 'd']);
    expect(reorderAt(pages, 'a', 'b', 'before')).toBe(pages);
    expect(reorderAt(pages, 'a', 'a', 'after')).toBe(pages);
    expect(reorderAt(pages, 'foreign', 'b', 'after')).toBe(pages);
  });
});
