import React, { useEffect, useRef } from 'react';
import './redaction.css';

export default function RedactionDialog({ count, pages, busy, error, progress, onApply, onCancel }) {
  const dialog = useRef(null);
  useEffect(() => { dialog.current.showModal(); }, []);
  return <dialog ref={dialog} className="redaction-dialog" aria-labelledby="redaction-title"
    onCancel={event => { event.preventDefault(); onCancel(); }}>
    <h2 id="redaction-title">Apply secure redaction</h2>
    <p>Apply {count} marked {count === 1 ? 'area' : 'areas'} and create a fresh image-only PDF of all {pages} pages?</p>
    <ul>
      <li>Marked pixels are replaced with black. Original PDF text, images, and hidden objects are not copied.</li>
      <li>All pages become images at 216 DPI. Selectable text, editable comments, forms, links, attachments, and original metadata are removed.</li>
      <li>Application cannot be undone. The editor clears its source and undo history after success.</li>
      <li>Your file on disk is unchanged. Save the redacted document as a separate copy and review it before sharing.</li>
    </ul>
    {error && <p className="error" role="alert">{error}</p>}
    {progress && <p role="status">{progress}</p>}
    <div className="dialog-actions">
      <button autoFocus onClick={onCancel}>{busy ? 'Cancel processing' : 'Cancel'}</button>
      <button className="primary" disabled={busy} onClick={onApply}>Apply redactions</button>
    </div>
  </dialog>;
}