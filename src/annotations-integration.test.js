import { expect, it } from 'vitest';
import { PDFArray, PDFDict, PDFDocument, PDFName } from 'pdf-lib';
import { assemble, stampDocument } from './pdf';
import { createComment } from './comments';
import { createMarkup } from './markup';

it('exports highlights, underlines, and comments together on a reordered rotated page', async () => {
  const source = await PDFDocument.create(); source.addPage(); source.addPage();
  const selection = { text: 'Review', rects: [[20, 200, 80, 220]] };
  const record = { id: 'marked', source: 0, index: 1, rotation: 90, annotations: [
    createMarkup('highlight', selection), createMarkup('underline', selection),
    createComment('Check wording', 30, 300, 'note'),
  ] };
  const result = await PDFDocument.load(await assemble([{ bytes: await source.save() }], [record]));
  expect(result.getPage(0).getRotation().angle).toBe(90);
  const annotations = result.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray);
  expect(Array.from({ length: annotations.size() }, (_, index) => annotations.lookup(index, PDFDict)
    .lookup(PDFName.of('Subtype'), PDFName).toString())).toEqual(['/Highlight', '/Underline', '/Text', '/Popup']);
  expect(record.annotations).toHaveLength(3);
});

it('legacy text stamping retains editable comments and markup without duplicating exported annotations', async () => {
  const source = await PDFDocument.create(); source.addPage();
  const annotation = createMarkup('highlight', { text: 'Review', rects: [[20, 200, 80, 220]] });
  const comment = createComment('Keep this note', 30, 300, 'note');
  const pages = [{ id: 'original', source: 0, index: 0, rotation: 90, annotations: [annotation, comment] }];
  const rebased = await stampDocument([{ bytes: await source.save() }], pages,
    { page: 0, text: 'Added text', x: 50, y: 700, size: 14 });
  expect(rebased.pages[0].annotations).toBe(pages[0].annotations);
  expect((await PDFDocument.load(rebased.sources[0].bytes)).getPage(0).node.lookupMaybe(PDFName.of('Annots'), PDFArray)?.size() ?? 0).toBe(0);
  const output = await PDFDocument.load(await assemble(rebased.sources, rebased.pages));
  expect(output.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray).size()).toBe(3);
  expect(output.getPage(0).getRotation().angle).toBe(90);
});
