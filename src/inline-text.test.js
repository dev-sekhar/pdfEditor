import { it, expect } from 'vitest';
import { PDFDocument, StandardFonts, PDFName, degrees, decodePDFRawStream } from 'pdf-lib';
import { inspectInlineText, replaceInlineText } from './inline-text';
import { readFile } from 'node:fs/promises';
import { contentTokens, byteString } from './content-tokens';

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
it('edits embedded subset text over graphics without changing the font resources or other instructions', async()=>{
  const source=new Uint8Array(await readFile(new URL('../tests/fixtures/embedded-layout.pdf',import.meta.url)));
  const runs=await inspectInlineText(source,0),run=runs.find(item=>item.text==='When Excel stops');
  expect(run.base).toContain('BitstreamVera');
  const output=await replaceInlineText(source,0,run.id,run.text,'When Excel ends');
  expect((await inspectInlineText(output,0)).map(item=>item.text)).toContain('When Excel ends');
  const before=await PDFDocument.load(source),after=await PDFDocument.load(output);
  expect(after.getPage(0).node.Resources().toString()).toBe(before.getPage(0).node.Resources().toString());
  const contents=doc=>{const c=doc.getPage(0).node.Contents();return c.asArray?c.asArray().map(ref=>byteString(decodePDFRawStream(doc.context.lookup(ref)).decode())).join(''):byteString(decodePDFRawStream(c).decode());};
  const original=contents(before),updated=contents(after);
  expect(updated.slice(0,run.start)).toBe(original.slice(0,run.start));
  expect(updated.slice(updated.indexOf('>',run.start)+1)).toBe(original.slice(run.end));
  await expect(replaceInlineText(source,0,run.id,run.text,'患者')).rejects.toThrow(/glyph|font/);
});
it('tokenizes escaped operators, nested parentheses, hex and high bytes losslessly',()=>{
  const data='(BT (nested) \\) Tj) Tj [<80> -20 (ET)] TJ';
  const tokens=contentTokens(data);
  expect(tokens.filter(t=>t.kind==='operator').map(t=>t.raw)).toEqual(['Tj','TJ']);
  expect(byteString(Uint8Array.of(0x80,0xff)).split('').map(c=>c.charCodeAt(0))).toEqual([128,255]);
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
