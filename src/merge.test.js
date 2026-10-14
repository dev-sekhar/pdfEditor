import { expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { assemble } from './pdf';
import { insertPages, mergeOffset } from './merge';

it('resolves all positions and validates one-based page numbers', () => {
  expect(mergeOffset('before', 3, 1)).toBe(1);
  expect(mergeOffset('after', 3, 1)).toBe(2);
  expect(mergeOffset('beginning', 3, 1)).toBe(0);
  expect(mergeOffset('end', 3, 1)).toBe(3);
  expect(mergeOffset('number', 3, 1, '3')).toBe(2);
  expect(mergeOffset('number', 3, 1, '4')).toBe(3);
  for (const value of ['', 0, 5, 1.5, 'invalid']) expect(() => mergeOffset('number', 3, 1, value)).toThrow();
});
it('exports incoming pages together at every offset without mutating original pages', async () => {
  const sources = [];
  for (const widths of [[200, 300, 400], [500, 600]]) {
    const document = await PDFDocument.create();
    widths.forEach(width => document.addPage([width, 700]));
    sources.push({ bytes: await document.save() });
  }
  const existing = [0, 1, 2].map(index => ({ source: 0, index, rotation: 0 }));
  const incoming = [0, 1].map(index => ({ source: 1, index, rotation: 0 }));
  const orders = [[500, 600, 200, 300, 400], [200, 500, 600, 300, 400], [200, 300, 500, 600, 400], [200, 300, 400, 500, 600]];
  for (let offset = 0; offset <= 3; offset++) {
    const result = await PDFDocument.load(await assemble(sources, insertPages(existing, incoming, offset)));
    expect(result.getPages().map(page => page.getWidth())).toEqual(orders[offset]);
  }
  expect(existing).toHaveLength(3);
  expect(incoming).toHaveLength(2);
  expect(insertPages([], incoming, 0)).toEqual(incoming);
});
