import React, { useEffect, useId, useRef, useState } from 'react';
import './word-export.css';

export default function WordExportDialog({ busy, saving = false, error, progress, onExport, onCancel }) {
  const dialog = useRef(null);
  const titleId = useId();
  const [mode, setMode] = useState('text');
  useEffect(() => { if (!dialog.current.open) dialog.current.showModal(); }, []);

  return <dialog ref={dialog} className="word-export-dialog" aria-labelledby={titleId} aria-busy={Boolean(busy || saving)}
    onCancel={event => { event.preventDefault(); if (!saving) onCancel(); }}>
    <h2 id={titleId}>Export to Word</h2>
    <p>Create a separate .docx document. Your PDF stays unchanged.</p>
    <fieldset disabled={busy || saving}>
      <legend>Choose the Word document format</legend>
      <label className="word-export-mode">
        <input autoFocus type="radio" name="word-export-mode" value="text" aria-label="Editable text"
          checked={mode === 'text'} onChange={() => setMode('text')} />
        <span><strong>Editable text</strong><span>Turn selectable PDF text into editable paragraphs. Complex layouts, tables, and images are not preserved.</span></span>
      </label>
      <label className="word-export-mode">
        <input type="radio" name="word-export-mode" value="images" aria-label="Page images"
          checked={mode === 'images'} onChange={() => setMode('images')} />
        <span><strong>Page images</strong><span>Keep each page's appearance as a picture. Text will not be editable.</span></span>
      </label>
    </fieldset>
    <p className="word-export-note">Image-only pages are included as pictures, even in text mode. No OCR is performed.</p>
    {error && <p className="error" role="alert">{error}</p>}
    {progress && <p role="status">{progress}</p>}
    <div className="dialog-actions">
      <button disabled={saving} onClick={onCancel}>{saving ? 'Saving Word document…' : busy ? 'Cancel export' : 'Cancel'}</button>
      <button className="primary" disabled={busy || saving} onClick={() => onExport(mode)}>Export Word document</button>
    </div>
  </dialog>;
}
