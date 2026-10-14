import { describe, expect, it } from 'vitest';
import { PDFDocument, PDFArray, PDFDict, PDFName, PDFHexString, degrees } from 'pdf-lib';
import { importStudioAnnotations } from './annotation-import';
import { assemble } from './pdf';
import { createComment } from './comments';

const note = createComment('Résumé 日本語 — saved note', 23, 351, 'stable-note');
const highlight = { id: 'stable-highlight', type: 'highlight', text: 'Hello 日本語', color: '#3366ff', rects: [[20, 200, 100, 225], [20, 170, 180, 190]] };
const underline = { id: 'stable-underline', type: 'underline', text: 'Underline', color: '#ff6600', rects: [[40, 90, 160, 110]] };
const native = doc => doc.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray);

async function fixture() {
  const original = await PDFDocument.create();
  const page = original.addPage([400, 500]); page.setRotation(degrees(90));
  const foreign = original.context.obj({ Type: 'Annot', Subtype: 'Text', Rect: [12, 13, 32, 33],
    T: PDFHexString.fromText('Another editor'), NM: PDFHexString.fromText('foreign'), Contents: PDFHexString.fromText('External note') });
  const foreignRef = original.context.register(foreign);
  const popupRef = original.context.register(original.context.obj({ Type: 'Annot', Subtype: 'Popup', Rect: [32, 13, 132, 113], Parent: foreignRef }));
  foreign.set(PDFName.of('Popup'), popupRef);
  const unknownRef = original.context.register(original.context.obj({ Type: 'Annot', Subtype: 'Square', Rect: [1, 2, 10, 11],
    T: PDFHexString.fromText('PDF Studio'), NM: PDFHexString.fromText('unsupported-studio'), Contents: PDFHexString.fromText('Unknown type') }));
  page.node.set(PDFName.of('Annots'), original.context.obj([foreignRef, popupRef, unknownRef]));
  return assemble([{ bytes: await original.save() }], [{ id: 'page-a', source: 0, index: 0, rotation: 0, annotations: [note, highlight, underline] }]);
}

describe('Studio native annotation import', () => {
  it('hydrates IDs, Unicode notes, colors and multiline geometry while preserving foreign notes/popups and unknown types', async () => {
    const bytes = await fixture();
    const imported = await importStudioAnnotations(bytes);
    expect(imported.annotations).toEqual([[highlight, underline, note]]);
    expect(imported.count).toBe(1);
    const stripped = await PDFDocument.load(imported.bytes);
    expect(stripped.getPage(0).getRotation().angle).toBe(90);
    const remaining = native(stripped);
    expect(remaining.size()).toBe(3);
    expect(remaining.lookup(0, PDFDict).lookup(PDFName.of('Contents')).decodeText()).toBe('External note');
    expect(remaining.lookup(1, PDFDict).lookup(PDFName.of('Subtype')).toString()).toBe('/Popup');
    expect(remaining.lookup(2, PDFDict).lookup(PDFName.of('Subtype')).toString()).toBe('/Square');
    // Loading/hydrating never mutates the caller's original PDF bytes.
    expect(native(await PDFDocument.load(bytes)).size()).toBe(7);
  });

  it('round trips twice without duplicating owned or external annotations', async () => {
    let bytes = await fixture();
    for (let iteration = 0; iteration < 2; iteration++) {
      const imported = await importStudioAnnotations(bytes);
      const pages = imported.annotations.map((annotations, index) => ({ id: `page-${index}`, source: 0, index, rotation: 0, annotations }));
      bytes = await assemble([{ bytes: imported.bytes }], pages);
      const output = await PDFDocument.load(bytes);
      expect(native(output).size()).toBe(7);
      const ids = native(output).asArray().map(ref => output.context.lookup(ref, PDFDict).lookup(PDFName.of('NM'))?.decodeText?.()).filter(Boolean);
      for (const id of ['stable-note', 'stable-highlight', 'stable-underline', 'foreign', 'unsupported-studio']) expect(ids.filter(value => value === id)).toHaveLength(1);
      expect((await importStudioAnnotations(bytes)).annotations[0]).toEqual([highlight, underline, note]);
    }
  });

  it('keeps malformed, missing-ownership and unsupported owned annotations in the source', async () => {
    const original = await PDFDocument.create(); const page = original.addPage();
    const unknown = [
      { Type: 'Annot', Subtype: 'Highlight', Rect: [1, 2, 3, 4], NM: PDFHexString.fromText('generic-id'), Contents: PDFHexString.fromText('Foreign') },
      { Type: 'Annot', Subtype: 'Highlight', T: PDFHexString.fromText('PDF Studio'), NM: PDFHexString.fromText('broken'), Contents: PDFHexString.fromText('Invalid'), QuadPoints: [1, 2], C: [1, 0, 0] },
      { Type: 'Annot', Subtype: 'Text', T: PDFHexString.fromText('PDF Studio'), Contents: PDFHexString.fromText('No stable ID'), Rect: [1, 2, 10, 20] },
    ].map(value => original.context.register(original.context.obj(value)));
    page.node.set(PDFName.of('Annots'), original.context.obj(unknown));
    const bytes = await original.save();
    const imported = await importStudioAnnotations(bytes);
    expect(imported.bytes).toBe(bytes);
    expect(imported.annotations).toEqual([[]]);
    expect(native(await PDFDocument.load(imported.bytes)).size()).toBe(3);
  });

  it('hydrates every source page before selected-page reorder/merge without transferring annotations to the wrong page', async () => {
    const original = await PDFDocument.create(); original.addPage([300, 400]); original.addPage([500, 600]);
    const bytes = await assemble([{ bytes: await original.save() }], [
      { source: 0, index: 0, rotation: 0, annotations: [note] },
      { source: 0, index: 1, rotation: 0, annotations: [underline] },
    ]);
    const imported = await importStudioAnnotations(bytes);
    const selected = [1, 0].map(index => ({ source: 0, index, rotation: 0, annotations: imported.annotations[index] }));
    const output = await PDFDocument.load(await assemble([{ bytes: imported.bytes }], selected));
    expect(output.getPage(0).getWidth()).toBe(500);
    expect(output.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray).lookup(0, PDFDict).lookup(PDFName.of('NM')).decodeText()).toBe(underline.id);
    expect(output.getPage(1).node.lookup(PDFName.of('Annots'), PDFArray).lookup(0, PDFDict).lookup(PDFName.of('NM')).decodeText()).toBe(note.id);
  });
});
