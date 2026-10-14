import React from 'react';
import './redaction.css';

export default function RedactionControls({ marking, disabled, marks = [], totalMarks = 0,
  onMarkingChange, onRemove, onClear, onApply }) {
  return <div className="redaction-controls" role="group" aria-label="Redaction controls">
    <h3>Secure redaction</h3>
    <p>Drag over content to mark it. Red outlines are pending until you apply redaction.</p>
    <button disabled={disabled} aria-pressed={Boolean(marking)} onClick={() => onMarkingChange(!marking)}>
      {marking ? 'Finish marking' : 'Mark redaction areas'}
    </button>
    <p className="redaction-count" role="status">{totalMarks} pending {totalMarks === 1 ? 'area' : 'areas'} in this document</p>
    <ul className="redaction-mark-list" aria-label="Pending redactions on this page">
      {marks.map((mark, index) => <li key={mark.id}><span>Area {index + 1}</span>
        <button disabled={disabled} aria-label={`Delete pending redaction ${index + 1}`} onClick={() => onRemove(mark.id)}>Delete</button>
      </li>)}
    </ul>
    {!marks.length && <p className="muted">No pending areas on this page.</p>}
    <button disabled={disabled || !totalMarks} onClick={onClear}>Clear all pending areas</button>
    <p className="redaction-output-note">Applying creates an image-only document. Text selection, forms, links, and comments are removed from all pages. The original file on disk stays unchanged.</p>
    <button className="primary" disabled={disabled || !totalMarks} onClick={onApply}>Apply secure redaction</button>
  </div>;
}
