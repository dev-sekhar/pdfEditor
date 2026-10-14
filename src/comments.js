import { PDFArray, PDFHexString, PDFName } from 'pdf-lib';

export function createComment(text, x, y, id = crypto.randomUUID()) {
  if (!text.trim()) throw new Error('Enter a comment.');
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('Choose a valid comment position.');
  return { id, type: 'comment', text: text.trim(), x, y };
}

export function addPageComment(pages, pageId, comment) {
  return pages.map(page => page.id !== pageId ? page : { ...page,
    annotations: [...(page.annotations ?? []), comment] });
}

// Native PDF notes, rather than text burned into page content. The Popup's
// Parent points to the Text annotation; readers expose Contents as the note.
export function exportComments(document, page, annotations = []) {
  const context = document.context;
  for (const item of annotations.filter(item => item.type === 'comment')) {
    const comment = createComment(item.text, item.x, item.y, item.id);
    const note = context.obj({ Type: 'Annot', Subtype: 'Text',
      Rect: [comment.x, comment.y, comment.x + 20, comment.y + 20],
      P: page.ref, Contents: PDFHexString.fromText(comment.text),
      T: PDFHexString.fromText('PDF Studio'), NM: PDFHexString.fromText(comment.id),
      Name: 'Comment', C: [1, 0.85, 0.15], F: 4, Open: false });
    const noteRef = context.register(note);
    const popup = context.obj({ Type: 'Annot', Subtype: 'Popup', P: page.ref,
      Rect: [comment.x + 24, comment.y - 100, comment.x + 224, comment.y + 20],
      Parent: noteRef, Open: false });
    const popupRef = context.register(popup);
    note.set(PDFName.of('Popup'), popupRef);
    const existing = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray) ?? context.obj([]);
    existing.push(noteRef); existing.push(popupRef);
    page.node.set(PDFName.of('Annots'), existing);
  }
}
