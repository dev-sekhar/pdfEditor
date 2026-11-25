import { it, expect } from 'vitest';
import { PDFDocument, StandardFonts, PDFName, degrees, decodePDFRawStream } from 'pdf-lib';
import { inspectInlineText, replaceInlineText } from './inline-text';

async function fixture(options = {}) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 500]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('Patient Name', { x: 40, y: 400, size: 14, font, ...options });
  return doc.save();
}
it('replaces actual content and reopens with the original font, geometry and no overlay', async () => {
  const source = await fixture();
  const [run] = await inspectInlineText(source, 0);
  const output = await replaceInlineText(source, 0, run.id, run.text, 'Alex');
  const [next] = await inspectInlineText(output, 0);
  expect(next).toMatchObject({ text: 'Alex', x: run.x, y: run.y, base: run.base, size: run.size });
  expect((await inspectInlineText(source, 0))[0].text).toBe('Patient Name');
  const doc = await PDFDocument.load(output);
  const stream = doc.context.lookup(doc.getPage(0).node.Contents().get(0));
  const text = new TextDecoder().decode(decodePDFRawStream(stream).decode());
  expect(text).not.toContain('50617469656E74204E616D65');
  expect(doc.getPage(0).node.Annots()?.size() ?? 0).toBe(0);
});
it('rejects overflow, stale selections, unsupported characters and rotated text', async () => {
  const source = await fixture();
  await expect(replaceInlineText(source, 0, 0, 'Patient Name', 'X'.repeat(80))).rejects.toThrow(/fit/);
  await expect(replaceInlineText(source, 0, 0, 'old', 'Alex')).rejects.toThrow(/changed/);
  await expect(replaceInlineText(source, 0, 0, 'Patient Name', '患者')).rejects.toThrow(/Latin/);
  await expect(inspectInlineText(await fixture({ rotate: degrees(20) }), 0)).rejects.toThrow(/unsupported/);
});
it('blocks kerning arrays, transformed graphics and unknown operators without changing input', async () => {
  for (const content of ['BT [(test) 2 (text)] TJ ET', '1 0 0 1 20 30 cm', 'BX EX', 'q']) {
    const doc = await PDFDocument.create(); const page = doc.addPage();
    page.node.set(PDFName.of('Contents'), doc.context.register(doc.context.flateStream(content)));
    await expect(inspectInlineText(await doc.save(), 0)).rejects.toThrow(/unsupported/);
  }
});
