import { PDFDocument, PDFArray, PDFDict, PDFName, PDFString, PDFHexString } from 'pdf-lib';

function text(dictionary, key) {
  const value = dictionary.lookup(PDFName.of(key));
  return value instanceof PDFString || value instanceof PDFHexString ? value.decodeText() : null;
}
function numbers(dictionary, key, length) {
  const array = dictionary.lookupMaybe(PDFName.of(key), PDFArray);
  if (!array || (length && array.size() !== length)) return null;
  const values = array.asArray().map(item => dictionary.context.lookup(item)?.asNumber?.());
  return values.every(Number.isFinite) ? values : null;
}
function hydrate(dictionary) {
  // A generic annotation ID is not proof of ownership. Our exporter identifies
  // Studio notes/markup with T, and NM supplies the stable editable ID.
  if (text(dictionary, 'T') !== 'PDF Studio') return null;
  const id = text(dictionary, 'NM');
  const content = text(dictionary, 'Contents');
  if (!id || !content?.trim()) return null;
  const subtype = dictionary.lookup(PDFName.of('Subtype'))?.toString();
  if (subtype === '/Text') {
    const rect = numbers(dictionary, 'Rect', 4);
    if (!rect || rect[0] >= rect[2] || rect[1] >= rect[3]) return null;
    return { id, type: 'comment', text: content, x: rect[0], y: rect[1] };
  }
  if (subtype !== '/Highlight' && subtype !== '/Underline') return null;
  const quads = numbers(dictionary, 'QuadPoints');
  const color = numbers(dictionary, 'C', 3);
  if (!quads?.length || quads.length % 8 || !color || color.some(value => value < 0 || value > 1)) return null;
  const rects = [];
  for (let i = 0; i < quads.length; i += 8) {
    const quad = quads.slice(i, i + 8);
    const xs = [quad[0], quad[2], quad[4], quad[6]];
    const ys = [quad[1], quad[3], quad[5], quad[7]];
    const rect = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    if (rect[0] >= rect[2] || rect[1] >= rect[3]) return null;
    rects.push(rect);
  }
  return { id, type: subtype === '/Highlight' ? 'highlight' : 'underline', text: content,
    color: `#${color.map(value => Math.round(value * 255).toString(16).padStart(2, '0')).join('')}`, rects };
}

export async function importStudioAnnotations(bytes) {
  const document = await PDFDocument.load(bytes, { updateMetadata: false });
  let stripped = false;
  const annotations = document.getPages().map(page => {
    let existing;
    try { existing = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray); }
    catch { return []; }
    if (!existing) return [];
    const entries = existing.asArray();
    const hydrated = [];
    const removed = new Set();
    const ownedNotes = new Set();
    for (const entry of entries) {
      try {
        const dictionary = document.context.lookup(entry, PDFDict);
        const value = hydrate(dictionary);
        if (!value) continue;
        hydrated.push(value); removed.add(entry);
        if (value.type === 'comment') ownedNotes.add(entry.toString());
      } catch { /* Preserve unsupported, malformed, and external annotations. */ }
    }
    // Popup nodes have no T/NM of their own. Remove only popups whose Parent
    // points at a note successfully hydrated from this page's Annots array.
    for (const entry of entries) {
      try {
        const dictionary = document.context.lookup(entry, PDFDict);
        if (dictionary.lookup(PDFName.of('Subtype'))?.toString() === '/Popup' &&
          ownedNotes.has(dictionary.get(PDFName.of('Parent'))?.toString())) removed.add(entry);
      } catch { /* Unknown annotation objects remain in the stored source. */ }
    }
    if (removed.size) {
      stripped = true;
      const retained = entries.filter(entry => !removed.has(entry));
      if (retained.length) page.node.set(PDFName.of('Annots'), document.context.obj(retained));
      else page.node.delete(PDFName.of('Annots'));
    }
    return hydrated;
  });
  return { bytes: stripped ? await document.save({ addDefaultPage: false }) : bytes,
    count: document.getPageCount(), annotations };
}
