import { describe, it, expect } from 'vitest';
import { PDFDocument, PDFArray, PDFDict, PDFName, PDFStream } from 'pdf-lib';
import { assemble } from './pdf';
import { createMarkup, exportMarkup } from './markup';

async function source() { const doc = await PDFDocument.create(); doc.addPage([400, 500]); return { bytes: await doc.save() }; }
function annotations(doc, index = 0) { return doc.getPage(index).node.lookup(PDFName.of('Annots'), PDFArray); }

describe('native PDF highlights and underlines', () => {
  it('exports native annotations, multiline quadpoints, Unicode content, color and appearance streams', async () => {
    const selected = { text: 'Résumé 日本語', rects: [[20,400,100,420], [20,370,180,390]] };
    const highlight = createMarkup('highlight', selected);
    const underline = createMarkup('underline', selected, '#3366ff');
    const original = [highlight, underline];
    const bytes = await assemble([await source()], [{ id: 'page', source: 0, index: 0, rotation: 0, annotations: original }]);
    const doc = await PDFDocument.load(bytes);
    const annots = annotations(doc);
    expect(annots.size()).toBe(2);
    const first = annots.lookup(0, PDFDict);
    expect(first.lookup(PDFName.of('Subtype')).toString()).toBe('/Highlight');
    expect(first.lookup(PDFName.of('Contents')).decodeText()).toBe(selected.text);
    expect(first.lookup(PDFName.of('QuadPoints'), PDFArray).size()).toBe(16);
    expect(first.lookup(PDFName.of('Rect'), PDFArray).asArray().map(n => n.asNumber())).toEqual([20,370,180,420]);
    const appearance = first.lookup(PDFName.of('AP'), PDFDict).lookup(PDFName.of('N'), PDFStream);
    expect(appearance.dict.lookup(PDFName.of('Subtype')).toString()).toBe('/Form');
    expect(annots.lookup(1, PDFDict).lookup(PDFName.of('Subtype')).toString()).toBe('/Underline');
    expect(original[0].rects).toEqual(selected.rects);
  });
  it('keeps annotations on their page when moved/rotated and does not duplicate on repeated assembly', async () => {
    const annotation = createMarkup('highlight', { text: 'sample', rects: [[10,20,40,35]] });
    const sources = [await source()];
    const pages = [{ id: 'one', source: 0, index: 0, rotation: 90, annotations: [annotation] }, { id: 'two', source: 0, index: 0, rotation: 0 }];
    const doc = await PDFDocument.load(await assemble(sources, [...pages].reverse()));
    expect(doc.getPage(0).node.has(PDFName.of('Annots'))).toBe(false);
    expect(annotations(doc, 1).size()).toBe(1);
    expect(doc.getPage(1).getRotation().angle).toBe(90);
    expect(annotations(await PDFDocument.load(await assemble(sources,pages))).size()).toBe(1);
  });
  it('rejects invalid selection/geometry and preserves unrelated imported annotations', async () => {
    expect(() => createMarkup('highlight', null)).toThrow('Select PDF text');
    const doc = await PDFDocument.create(); const page = doc.addPage();
    const original = doc.context.obj([{ Type: 'Annot', Subtype: 'Text', Rect: [0,0,10,10] }]);
    page.node.set(PDFName.of('Annots'), original);
    exportMarkup(doc, page, [createMarkup('underline', { text: 'sample', rects: [[10,20,40,35]] })]);
    expect(original.size()).toBe(2);
    expect(() => exportMarkup(doc,page,[{ type:'highlight',rects:[[5,5,2,2]] }])).toThrow('geometry');
  });
});
