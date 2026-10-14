import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { assemble } from './pdf';
import { createHistory, historyReducer, historyShortcut, HISTORY_LIMIT } from './history';

describe('document history', () => {
  it('restores imported pages, rotations, bytes, and selection through undo/redo', async () => {
    const source = await PDFDocument.create();
    source.addPage([200, 300]);
    source.addPage([400, 500]);
    const sources = [{ bytes: await source.save() }];
    const pages = [0, 1].map(index => ({ id: String(index), source: 0, index, rotation: 0 }));
    const opened = { sources, pages, index: 1, bytes: await assemble(sources, pages), label: 'Open PDFs' };
    const rotatedPages = pages.map((p, i) => i === 1 ? { ...p, rotation: 90 } : p);
    const rotated = { ...opened, pages: rotatedPages, bytes: await assemble(sources, rotatedPages), label: 'Rotate page' };
    let history = createHistory();
    for (const document of [opened, rotated]) history = historyReducer(history, { type: 'commit', document });
    const deleted = { ...rotated, pages: [rotatedPages[0]], index: 0,
      bytes: await assemble(sources, [rotatedPages[0]]), label: 'Delete page' };
    history = historyReducer(history, { type: 'commit', document: deleted });
    history = historyReducer(history, { type: 'undo' });
    const restored = await PDFDocument.load(history.present.bytes);
    expect(restored.getPageCount()).toBe(2);
    expect(restored.getPage(1).getRotation().angle).toBe(90);
    expect(history.present.index).toBe(1);
    history = historyReducer(history, { type: 'undo' });
    expect((await PDFDocument.load(history.present.bytes)).getPage(1).getRotation().angle).toBe(0);
    history = historyReducer(history, { type: 'undo' });
    expect(history.present.pages).toHaveLength(0);
    expect(history.present.bytes).toBeNull();
    for (let i = 0; i < 3; i++) history = historyReducer(history, { type: 'redo' });
    expect((await PDFDocument.load(history.present.bytes)).getPageCount()).toBe(1);
    expect(opened.pages[1].rotation).toBe(0);
  });

  it('clears redo after a new edit, without discarding redo when selecting a page', () => {
    const start = createHistory();
    const opened = { ...start.present, pages: [{ id: 'a' }, { id: 'b' }], label: 'Open PDFs' };
    let history = historyReducer(start, { type: 'commit', document: opened });
    history = historyReducer(history, { type: 'commit', document: { ...opened, label: 'Rotate page' } });
    history = historyReducer(history, { type: 'undo' });
    history = historyReducer(history, { type: 'select', index: 1 });
    expect(history.past).toHaveLength(1);
    expect(history.future).toHaveLength(1);
    history = historyReducer(history, { type: 'commit', document: { ...history.present, label: 'Delete page' } });
    expect(history.future).toHaveLength(0);
    expect(historyReducer(history, { type: 'redo' })).toBe(history);
  });

  it('bounds history and treats undo at an empty boundary as a no-op', () => {
    let history = createHistory();
    expect(historyReducer(history, { type: 'undo' })).toBe(history);
    for (let i = 0; i < HISTORY_LIMIT + 10; i++) {
      history = historyReducer(history, { type: 'commit', document: { ...history.present, label: String(i) } });
    }
    expect(history.past).toHaveLength(HISTORY_LIMIT);
    for (let i = 0; i < HISTORY_LIMIT; i++) history = historyReducer(history, { type: 'undo' });
    expect(history.present.label).toBe('9');
    expect(historyReducer(history, { type: 'undo' })).toBe(history);
    for (let i = 0; i < HISTORY_LIMIT; i++) history = historyReducer(history, { type: 'redo' });
    expect(history.present.label).toBe('39');
  });

  it('supports Windows shortcuts while preserving native text-field undo', () => {
    const event = { key: 'z', ctrlKey: true, target: { closest: () => null } };
    expect(historyShortcut(event)).toBe('undo');
    expect(historyShortcut({ ...event, shiftKey: true })).toBe('redo');
    expect(historyShortcut({ ...event, key: 'y' })).toBe('redo');
    expect(historyShortcut({ ...event, ctrlKey: false, metaKey: true })).toBe('undo');
    expect(historyShortcut({ ...event, target: { closest: () => ({}) } })).toBeNull();
    expect(historyShortcut({ ...event, altKey: true })).toBeNull();
  });
});
