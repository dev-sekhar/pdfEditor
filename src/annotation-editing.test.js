import { describe, it, expect } from 'vitest';
import { updateAnnotation, removeAnnotation } from './annotation-editing';
import { createHistory, historyReducer } from './history';
import { PDFDocument, PDFArray, PDFName, PDFHexString } from 'pdf-lib';
import { assemble } from './pdf';

const pages = [{ id: 'p1', annotations: [
  { id: 'text', type: 'text', text: 'Before', x: 30, y: 50, font: 'Helvetica', size: 14, color: '#000000' },
  { id: 'comment', type: 'comment', text: 'Original comment', x: 80, y: 90 },
  { id: 'highlight', type: 'highlight', text: 'Selected text', rects: [[10,20,40,30]], color: '#ffd43b' },
  { id: 'underline', type: 'underline', text: 'Underlined text', rects: [[10,40,40,50]], color: '#ffd43b' },
] }, { id: 'p2', annotations: [] }];

describe('annotation editing', () => {
  it('edits text/comment content without changing IDs, coordinates or styles', () => {
    for (const id of ['text', 'comment']) {
      const updated = updateAnnotation(pages,'p1',id,{ text: 'After', x: 500, id:'tampered', type:'text', color:'#ffffff' });
      expect(updated[0].annotations.find(a => a.id === id)).toEqual({ ...pages[0].annotations.find(a => a.id === id), text:'After' });
      expect(updated[1]).toBe(pages[1]);
      expect(pages[0].annotations.find(a => a.id === id).text).not.toBe('After');
    }
  });
  it('edits markup colors without changing selected text or geometry', () => {
    for (const id of ['highlight', 'underline']) {
      const updated = updateAnnotation(pages,'p1',id,{ color:'#3366ff', text:'tampered' });
      expect(updated[0].annotations.find(a => a.id === id)).toEqual({ ...pages[0].annotations.find(a => a.id === id), color:'#3366ff' });
    }
  });
  it('applies a content edit as one undoable snapshot preserving multiline whitespace', () => {
    const next = updateAnnotation(pages,'p1','text',{ text:'  First line\nSecond line  ' });
    expect(next[0].annotations[0].text).toBe('  First line\nSecond line  ');
    const history = historyReducer({ ...createHistory(),present:{...createHistory().present,pages} }, {
      type:'commit',document:{...createHistory().present,pages:next,label:'Edit annotation'},
    });
    expect(history.past).toHaveLength(1);
    expect(historyReducer(history,{type:'undo'}).present.pages).toBe(pages);
    expect(historyReducer(historyReducer(history,{type:'undo'}),{type:'redo'}).present.pages).toBe(next);
  });
  it('deletes every annotation type and restores edits/deletions through history', () => {
    for (const annotation of pages[0].annotations) {
      const document = { ...createHistory().present, pages, index:0 };
      let history = { ...createHistory(), present:document };
      const updated = removeAnnotation(pages,'p1',annotation.id);
      history = historyReducer(history,{ type:'commit',document:{...document,pages:updated,label:'Delete annotation'} });
      expect(history.present.pages[0].annotations).toHaveLength(3);
      history = historyReducer(history,{ type:'undo' });
      expect(history.present.pages).toBe(pages);
      expect(historyReducer(history,{ type:'redo' }).present.pages).toBe(updated);
    }
  });
  it('rejects invalid inputs and avoids history changes for unchanged edits or missing deletions', () => {
    expect(() => updateAnnotation(pages,'p1','comment',{ text:' ' })).toThrow('empty');
    expect(() => updateAnnotation(pages,'p1','highlight',{ color:'red' })).toThrow('color');
    expect(() => updateAnnotation(pages,'p1','missing',{ text:'new' })).toThrow('Select');
    expect(updateAnnotation(pages,'p1','text',{ text:'Before' })).toBe(pages);
    expect(removeAnnotation(pages,'p1','missing')).toBe(pages);
  });
  it('preserves native imported annotations while deleting a session overlay from export', async () => {
    const source = await PDFDocument.create(); const page = source.addPage([400,500]);
    const annotation = source.context.register(source.context.obj({ Type:'Annot',Subtype:'Text',Rect:[10,10,30,30],Contents:PDFHexString.fromText('Imported note') }));
    page.node.set(PDFName.of('Annots'),source.context.obj([annotation]));
    const session = [{ id:'p1',source:0,index:0,rotation:0,annotations:[pages[0].annotations[0]] }];
    const output = await assemble([{bytes:await source.save()}],removeAnnotation(session,'p1','text'));
    const doc = await PDFDocument.load(output);
    const imported = doc.getPage(0).node.lookup(PDFName.of('Annots'),PDFArray);
    expect(imported.size()).toBe(1);
    expect(doc.context.lookup(imported.get(0)).lookup(PDFName.of('Contents')).decodeText()).toBe('Imported note');
    expect(doc.getPage(0).node.has(PDFName.of('Contents'))).toBe(false);
  });
});
