import { describe, it, expect } from 'vitest';
import { PDFDocument, degrees, PDFName, PDFDict } from 'pdf-lib';
import { assemble, move } from './pdf';

async function source(sizes, rotation = 0) {
  const doc = await PDFDocument.create();
  for (const size of sizes) doc.addPage(size).setRotation(degrees(rotation));
  return { bytes: await doc.save() };
}

const page = (source, index, rotation = 0) => ({ source, index, rotation });

describe('PDF engine', () => {
  it('reorders without mutating the input and ignores invalid moves', () => {
    const input = [1, 2, 3];
    expect(move(input, 0, 2)).toEqual([2, 3, 1]);
    expect(input).toEqual([1, 2, 3]);
    expect(move(input, -1, 2)).toEqual(input);
    expect(move(input, 0, 3)).toEqual(input);
  });

  it('merges, deletes, and rearranges pages in a reloadable export', async () => {
    const sources = [await source([[200, 300], [400, 500]]), await source([[600, 700]])];
    // Omit the first page of source 0 and put source 1 before source 0.
    const result = await PDFDocument.load(await assemble(sources, [page(1, 0), page(0, 1)]));
    expect(result.getPageCount()).toBe(2);
    expect(result.getPages().map(p => p.getSize())).toEqual([
      { width: 600, height: 700 }, { width: 400, height: 500 },
    ]);
    expect((await PDFDocument.load(sources[0].bytes)).getPageCount()).toBe(2);
  });

  it('preserves original rotation and wraps additional rotation', async () => {
    const sources = [await source([[200, 300]], 270)];
    const result = await PDFDocument.load(await assemble(sources, [page(0, 0, 180)]));
    expect(result.getPage(0).getRotation().angle).toBe(90);
  });

  it('extracts only the selected page', async () => {
    const sources = [await source([[200, 300], [400, 500]])];
    const result = await PDFDocument.load(await assemble(sources, [page(0, 1)]));
    expect(result.getPageCount()).toBe(1);
    expect(result.getPage(0).getSize()).toEqual({ width: 400, height: 500 });
  });

  it('adds a text overlay to a reloadable PDF', async () => {
    const sources = [await source([[600, 800]])];
    const result = await PDFDocument.load(await assemble(sources, [page(0, 0)], {
      page: 0, text: 'Test', x: 50, y: 100, size: 12,
    }));
    expect(result.getPageCount()).toBe(1);
    const fonts = result.getPage(0).node.Resources().lookup(PDFName.of('Font'), PDFDict);
    expect(fonts.keys().length).toBeGreaterThan(0);
  });
});
