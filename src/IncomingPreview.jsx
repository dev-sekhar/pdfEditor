import React, { useRef, useState } from 'react';
import { PageCanvas, usePreviewDocument } from './PdfPreview';
import { parsePageSelection } from './merge';

export default function IncomingPreview({ item, range, onSelectionChange }) {
  const preview = usePreviewDocument(item.bytes);
  const grid = useRef(null);
  const selectionGrid = useRef(null);
  const viewer = useRef(null);
  const [inspected, setInspected] = useState(null);
  let indices;
  try { indices = parsePageSelection(range, item.count); }
  catch (cause) { return <p className="muted">Preview unavailable until the page selection is valid: {cause.message}</p>; }
  const active = inspected !== null && indices.includes(inspected) ? inspected : null;
  return <div className="incoming-preview" role="group" aria-label={`Merge preview for ${item.name}`}>
    <p className="preview-selection-count">{indices.length} {indices.length === 1 ? 'page' : 'pages'} selected · Click a preview to inspect it.</p>
    {preview.error ? <p className="error">Could not render preview: {preview.error}</p> : preview.pdf ? <>
      <div className="selection-actions">
        <button type="button" onClick={() => onSelectionChange(Array.from({ length: item.count }, (_, i) => i))}>Select all</button>
        <button type="button" onClick={() => onSelectionChange([])}>Clear selection</button>
      </div>
      <p className="muted">Choose pages to include. Selected pages are previewed below in merge order.</p>
      <div ref={selectionGrid} className="incoming-selection-grid">
        {Array.from({ length: item.count }, (_, index) => <label className="incoming-selection-page" key={index}>
          <input type="checkbox" aria-label={`Include ${item.name} page ${index + 1}`} checked={indices.includes(index)}
            onChange={event => onSelectionChange(event.target.checked ? [...indices, index] : indices.filter(page => page !== index))} />
          <PageCanvas pdf={preview.pdf} index={index} thumbnail scrollRoot={selectionGrid} />
          <span>Page {index + 1}</span>
        </label>)}
      </div>
      <p className="muted">Merge order: {indices.length ? indices.map(index => index + 1).join(', ') : 'No pages selected'}</p>
      <div ref={grid} className="incoming-preview-grid">
        {indices.map(index => <button type="button" key={index} className={`incoming-preview-page ${active === index ? 'inspected' : ''}`}
          aria-label={`Inspect ${item.name} page ${index + 1}`} aria-pressed={active === index}
          onClick={() => setInspected(index)}>
          <PageCanvas pdf={preview.pdf} index={index} thumbnail scrollRoot={grid} />
          <span>Page {index + 1}</span>
        </button>)}
      </div>
      {active !== null && <div className="incoming-inspection">
        <div className="inspection-heading"><strong>{item.name} · Page {active + 1}</strong>
          <button type="button" onClick={() => setInspected(null)}>Close preview</button></div>
        <div ref={viewer} className="incoming-large-preview">
          <PageCanvas key={`${preview.id}-${active}`} pdf={preview.pdf} index={active} zoom={100} viewportRef={viewer} />
        </div>
      </div>}
    </> : <p role="status">Loading page previews…</p>}
  </div>;
}
