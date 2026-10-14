import { PDFArray, PDFName, PDFHexString } from 'pdf-lib';

const TYPES = new Set(['highlight', 'underline']);
export function createMarkup(type, selection, color = '#ffd43b') {
  if (!TYPES.has(type) || !selection?.text?.trim() || !selection.rects?.length) throw new Error('Select PDF text before applying markup.');
  return { id: crypto.randomUUID(), type, text: selection.text, color, rects: selection.rects.map(rect => [...rect]) };
}
export function colorComponents(hex = '#ffd43b') {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error('Invalid markup color.');
  return [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255);
}

// Native markup annotations include an appearance stream for readers that do
// not synthesize one. Metadata stays on page records so history remains editable.
export function exportMarkup(doc, page, annotations = []) {
  const context = doc.context;
  let array = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray);
  for (const annotation of annotations.filter(item => TYPES.has(item.type))) {
    const rects = annotation.rects;
    if (!rects?.length || rects.some(r => r.length !== 4 || r.some(n => !Number.isFinite(n)) || r[0] >= r[2] || r[1] >= r[3])) throw new Error('Invalid markup geometry.');
    const rect = [Math.min(...rects.map(r => r[0])), Math.min(...rects.map(r => r[1])), Math.max(...rects.map(r => r[2])), Math.max(...rects.map(r => r[3]))];
    const color = colorComponents(annotation.color);
    const rgb = color.map(n => n.toFixed(4)).join(' ');
    const appearance = annotation.type === 'highlight'
      ? `q /GS gs ${rgb} rg\n${rects.map(([x1,y1,x2,y2]) => `${x1} ${y1} ${x2-x1} ${y2-y1} re f`).join('\n')}\nQ`
      : `q ${rgb} RG 1 w\n${rects.map(([x1,y1,x2]) => `${x1} ${y1 + 0.5} m ${x2} ${y1 + 0.5} l S`).join('\n')}\nQ`;
    const stream = context.register(context.flateStream(appearance, {
      Type: 'XObject', Subtype: 'Form', BBox: rect,
      Resources: { ExtGState: { GS: { Type: 'ExtGState', ca: 0.35, CA: 0.35, BM: 'Multiply' } } },
    }));
    const dictionary = context.obj({
      Type: 'Annot', Subtype: annotation.type === 'highlight' ? 'Highlight' : 'Underline', Rect: rect,
      QuadPoints: rects.flatMap(([x1,y1,x2,y2]) => [x1,y2,x2,y2,x1,y1,x2,y1]),
      Contents: PDFHexString.fromText(annotation.text), NM: PDFHexString.fromText(annotation.id), T: PDFHexString.fromText('PDF Studio'),
      C: color, F: 4, AP: { N: stream },
    });
    if (!array) { array = context.obj([]); page.node.set(PDFName.of('Annots'), array); }
    array.push(context.register(dictionary));
  }
}
