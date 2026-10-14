import React, { useEffect, useRef, useState } from 'react';
import { mergeOffset } from './merge';

export default function MergeDialog({ files, count, selectedIndex, onConfirm, onCancel }) {
  const dialog = useRef(null);
  const [mode, setMode] = useState('end');
  const [pageNumber, setPageNumber] = useState(selectedIndex + 1);
  const [error, setError] = useState('');
  useEffect(() => { dialog.current.showModal(); }, []);
  function submit(event) {
    event.preventDefault();
    try { onConfirm(mergeOffset(mode, count, selectedIndex, pageNumber)); }
    catch (cause) { setError(cause.message); }
  }
  return <dialog ref={dialog} className="merge-dialog" aria-labelledby="merge-title"
    onCancel={event => { event.preventDefault(); onCancel(); }}>
    <form onSubmit={submit}>
      <h2 id="merge-title">Insert PDF pages</h2>
      <p>{files.length === 1 ? files[0].name : `${files.length} PDFs in selected file order`}</p>
      <p className="muted">Current document: {count} pages · Selected page: {selectedIndex + 1}</p>
      <label htmlFor="merge-position">Insert position</label>
      <select id="merge-position" value={mode} onChange={event => { setMode(event.target.value); setError(''); }} autoFocus>
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
        <button type="submit" className="primary">Insert PDFs</button></div>
    </form>
  </dialog>;
}
