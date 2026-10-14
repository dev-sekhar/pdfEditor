import { describe, expect, it } from 'vitest';
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName } from 'pdf-lib';
import { addPageComment, createComment, exportComments } from './comments';
import { assemble } from './pdf';

const name = PDFName.of;
describe('native PDF comments', () => {
  it('exports Unicode contents and linked Text/Popup annotations that survive save/load', async () => {
    const document = await PDFDocument.create(); const page = document.addPage();
    const comment = createComment('Review résumé 漢字', 20, 700, 'note-1');
    exportComments(document, page, [comment, { type: 'highlight' }]);
    const loaded = await PDFDocument.load(await document.save());
    const outPage = loaded.getPage(0);
    const annotations = outPage.node.lookup(name('Annots'), PDFArray);
    expect(annotations.size()).toBe(2);
    const note = annotations.lookup(0, PDFDict);
    expect(note.lookup(name('Subtype'), PDFName).toString()).toBe('/Text');
    expect(note.lookup(name('Contents'), PDFHexString).decodeText()).toBe(comment.text);
    expect(note.lookup(name('NM'), PDFHexString).decodeText()).toBe('note-1');
    expect(note.lookup(name('Rect'), PDFArray).asArray().map(n => n.asNumber())).toEqual([20, 700, 40, 720]);
    const popup = annotations.lookup(1, PDFDict);
    expect(popup.lookup(name('Subtype'), PDFName).toString()).toBe('/Popup');
    expect(popup.get(name('Parent')).toString()).toBe(annotations.get(0).toString());
    expect(note.get(name('Popup')).toString()).toBe(annotations.get(1).toString());
    expect(note.get(name('P')).toString()).toBe(outPage.ref.toString());
  });
  it('preserves existing annotations and applies new comments by stable page record after reorder/extraction', async () => {
    const source = await PDFDocument.create(); source.addPage(); source.addPage();
    exportComments(source, source.getPage(1), [createComment('Existing', 10, 20, 'old')]);
    const bytes = await source.save();
    const pages = [{ id: 'a', source: 0, index: 0, rotation: 0 }, { id: 'b', source: 0, index: 1, rotation: 90 }];
    const next = addPageComment(pages, 'b', createComment('New', 50, 60, 'new'));
    expect(pages[1].annotations).toBeUndefined();
    expect(next[0]).toBe(pages[0]);
    const output = await PDFDocument.load(await assemble([{ bytes }], [next[1]]));
    expect(output.getPage(0).getRotation().angle).toBe(90);
    expect(output.getPage(0).node.lookup(name('Annots'), PDFArray).size()).toBe(4);
  });
  it('rejects blank comments and invalid coordinates', () => {
    expect(() => createComment(' ', 0, 0)).toThrow(/Enter/);
    expect(() => createComment('Note', NaN, 0)).toThrow(/position/);
  });
});
