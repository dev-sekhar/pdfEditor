import React, { useEffect, useRef } from 'react';

export default function UnsavedDialog({ onSave, onDiscard, onCancel, saving, error, status, browser }) {
  const dialog = useRef(null);
  useEffect(() => { dialog.current.showModal(); }, []);
  return <dialog ref={dialog} className="unsaved-dialog" aria-labelledby="unsaved-title" onCancel={event => { event.preventDefault(); if (!saving) onCancel(); }}>
    <h2 id="unsaved-title">Unsaved changes</h2>
    <p>Save your changes before continuing?</p>
    {browser && <p className="muted">Browser downloads cannot confirm saving. Check your download before choosing Discard changes.</p>}
    {error && <p className="error" role="alert">{error}</p>}
    {status && <p role="status">{status}</p>}
    <div className="dialog-actions">
      <button disabled={saving} onClick={onCancel}>Cancel</button>
      <button disabled={saving} onClick={onDiscard}>Discard changes</button>
      <button className="primary" disabled={saving} onClick={onSave}>Save and continue</button>
    </div>
  </dialog>;
}
