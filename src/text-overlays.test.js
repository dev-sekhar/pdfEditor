import { describe, it, expect } from 'vitest';
import { PDFDocument, PDFName, PDFArray, PDFDict, decodePDFRawStream } from 'pdf-lib';
import { assemble } from './pdf';
import { editPageAnnotation, validateTextOverlay } from './text-overlays';
import { createHistory, historyReducer } from './history';

const text = { id: 'text-1', type: 'text', text: 'Overlay', x: 50, y: 90, size: 18, font: 'Helvetica', color: '#ff0000' };
describe('editable text overlays', () => {
  it('keeps source metadata intact when moving and history restores coordinates', () => {
    const pages = [{ id: 'a', source: 0, index: 0, rotation: 0, annotations: [text] }];
    const next = editPageAnnotation(pages, 'a', 'text-1', { x: 80, y: 120 });
    expect(pages[0].annotations[0].x).toBe(50);
    let history = historyReducer(createHistory(), { type: 'commit', document: { sources: [], pages, index: 0, bytes: null, label: 'Add text' } });
    history = historyReducer(history, { type: 'commit', document: { ...history.present, pages: next, label: 'Move text' } });
    expect(historyReducer(history, { type: 'undo' }).present.pages[0].annotations[0].x).toBe(50);
    expect(history.present.pages[0].annotations[0].x).toBe(80);
  });
  it('exports overlay streams after movement without mutating original PDF, including rotated pages', async () => {
    const document = await PDFDocument.create(); document.addPage([200, 300]);
    const bytes = await document.save();
    const result = await PDFDocument.load(await assemble([{ bytes }], [{ id: 'a', source: 0, index: 0, rotation: 90, annotations: [text] }]));
    expect(result.getPage(0).getRotation().angle).toBe(90);
    expect(result.getPage(0).node.lookup(PDFName.of('Contents'), PDFArray).size()).toBeGreaterThan(0);
    const streams = result.getPage(0).node.lookup(PDFName.of('Contents'), PDFArray);
    const commands = Array.from({ length: streams.size() }, (_, i) =>
      new TextDecoder().decode(decodePDFRawStream(result.context.lookup(streams.get(i))).decode())).join('\n');
    expect(commands).toContain('1 0 0 1 50 90 Tm');
    expect(commands).toContain('1 0 0 rg');
    expect((await PDFDocument.load(bytes)).getPage(0).node.get(PDFName.of('Contents'))).toBeUndefined();
  });
  it('rejects unsupported glyphs and invalid styles instead of exporting corrupt text', async () => {
    expect(() => validateTextOverlay({ ...text, size: 0 })).toThrow(/Font size/);
    const document = await PDFDocument.create(); document.addPage();
    const bytes = await document.save();
    await expect(assemble([{ bytes }], [{ source: 0, index: 0, rotation: 0, annotations: [{ ...text, text: '漢' }] }])).rejects.toThrow();
  });
  it('exports the chosen font, size and RGB color while preserving id, position and undo state', async () => {
    const document = await PDFDocument.create(); document.addPage([200, 300]);
    const sources = [{ bytes: await document.save() }];
    const pages = [{ id: 'a', source: 0, index: 0, rotation: 0, annotations: [text] }];
    const next = editPageAnnotation(pages, 'a', text.id, { font: 'Courier', size: 32, color: '#00ff00' });
    expect(next[0].annotations[0]).toEqual({ ...text, font: 'Courier', size: 32, color: '#00ff00' });
    expect(pages[0].annotations[0]).toEqual(text);
    const bytes = await assemble(sources, next);
    const result = await PDFDocument.load(bytes);
    const fontResources = result.getPage(0).node.Resources().lookup(PDFName.of('Font'), PDFDict);
    expect(fontResources.values().map(ref => result.context.lookup(ref, PDFDict).get(PDFName.of('BaseFont')).toString())).toContain('/Courier');
    const streams = result.getPage(0).node.lookup(PDFName.of('Contents'), PDFArray);
    const commands = Array.from({ length: streams.size() }, (_, i) =>
      new TextDecoder().decode(decodePDFRawStream(result.context.lookup(streams.get(i))).decode())).join('\n');
    expect(commands).toContain('0 1 0 rg');
    expect(commands).toMatch(/\/Courier-[\w-]+ 32 Tf/);
    expect(commands).toContain('1 0 0 1 50 90 Tm');
    let history = historyReducer(createHistory(), { type: 'commit', document: { sources, pages, index: 0, bytes: await assemble(sources, pages), label: 'Add text' } });
    history = historyReducer(history, { type: 'commit', document: { sources, pages: next, index: 0, bytes, label: 'Style text' } });
    expect(historyReducer(history, { type: 'undo' }).present.pages[0].annotations[0]).toEqual(text);
    expect(historyReducer(historyReducer(history, { type: 'undo' }), { type: 'redo' }).present.pages[0].annotations[0]).toEqual(next[0].annotations[0]);
  });
});
