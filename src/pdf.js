import { PDFDocument, degrees, StandardFonts } from 'pdf-lib';
import { exportMarkup } from './markup';
import { exportComments } from './comments';

export async function assemble(sources, pages, overlay) {
  const out = await PDFDocument.create();
  const docs = await Promise.all(sources.map(source => PDFDocument.load(source.bytes)));
  for (const record of pages) {
    const [page] = await out.copyPages(docs[record.source], [record.index]);
    page.setRotation(degrees((page.getRotation().angle + record.rotation) % 360));
    out.addPage(page);
    exportMarkup(out, page, record.annotations);
    exportComments(out, page, record.annotations);
  }
  if (overlay) {
    const font = await out.embedFont(StandardFonts.Helvetica);
    out.getPage(overlay.page).drawText(overlay.text, { x: overlay.x, y: overlay.y, size: overlay.size, font });
  }
  return out.save();
}
export function move(a, from, to) {
  const b = [...a];
  if (from < 0 || to < 0 || from >= b.length || to >= b.length) return b;
  b.splice(to, 0, b.splice(from, 1)[0]); return b;
}
export function download(bytes, name) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
