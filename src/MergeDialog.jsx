import React, { useEffect, useRef, useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import { mergeOffset, parsePageSelection } from './merge';

export default function MergeDialog({ files, count, selectedIndex, onConfirm, onCancel }) {
  const dialog = useRef(null);
  const [mode, setMode] = useState('end');
  const [pageNumber, setPageNumber] = useState(selectedIndex + 1);
  const [ranges, setRanges] = useState(() => files.map(() => ''));
  const [prepared, setPrepared] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { dialog.current.showModal(); }, []);
  useEffect(() => {
    let cancelled = false;
    Promise.all(files.map(async file => {
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const document = await PDFDocument.load(bytes);
        return { name: file.name, bytes, count: document.getPageCount() };
      } catch (cause) { throw new Error(`${file.name}: ${String(cause)}`); }
    })).then(items => { if (!cancelled) setPrepared(items); }, cause => { if (!cancelled) setError(cause.message); });
    return () => { cancelled = true; };
  }, [files]);
  function submit(event) {
    event.preventDefault();
    if (!prepared) return;
    try {
      const selections = prepared.map((item, index) => {
        try { return { ...item, indices: parsePageSelection(ranges[index], item.count) }; }
        catch (cause) { throw new Error(`${item.name}: ${cause.message}`); }
      });
      onConfirm(mergeOffset(mode, count, selectedIndex, pageNumber), selections);
    } catch (cause) { setError(cause.message); }
  }
  return <dialog ref={dialog} className="merge-dialog" aria-labelledby="merge-title"
    onCancel={event => { event.preventDefault(); onCancel(); }}>
    <form onSubmit={submit}>
      <h2 id="merge-title">Insert PDF pages</h2>
      <p className="muted">Current document: {count} pages · Selected page: {selectedIndex + 1}</p>
      {!prepared && !error && <p role="status">Reading incoming PDFs…</p>}
      {files.map((file, index) => <div className="incoming-pages" key={index}>
        <label htmlFor={`incoming-${index}`}>Pages from {file.name}</label>
        <input id={`incoming-${index}`} type="text" value={ranges[index]} placeholder="All pages, or 1, 3-5, 8"
          disabled={!prepared} aria-describedby={`incoming-help-${index}`}
          onChange={event => { setRanges(previous => previous.map((value, i) => i === index ? event.target.value : value)); setError(''); }} />
        <p id={`incoming-help-${index}`} className="muted">{prepared ? `${prepared[index].count} pages. ` : ''}Leave blank for all pages.</p>
      </div>)}
      <p className="muted">Pages follow the order entered. Repeated pages are included once. PDFs follow selected file order.</p>
      <label htmlFor="merge-position">Insert position</label>
      <select id="merge-position" value={mode} onChange={event => setMode(event.target.value)}>
        <option value="before">Before selected page ({selectedIndex + 1})</option>
        <option value="after">After selected page ({selectedIndex + 1})</option>
        <option value="beginning">Beginning of document</option>
        <option value="end">End of document</option>
        <option value="number">Specific page number</option>
      </select>
      {mode === 'number' && <>
        <label htmlFor="merge-page">Insert before page number</label>
        <input id="merge-page" type="number" min="1" max={count + 1} step="1" required
          value={pageNumber} onChange={event => setPageNumber(event.target.value)} />
        <p className="muted">Choose 1–{count + 1}. Page 1 means the beginning; {count + 1} means the end.</p>
      </>}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="dialog-actions"><button type="button" onClick={onCancel}>Cancel</button>
        <button type="submit" className="primary" disabled={!prepared}>Insert PDFs</button></div>
    </form>
  </dialog>;
}
