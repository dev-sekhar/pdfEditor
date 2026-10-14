import React, { useRef, useState } from 'react';
import { PageCanvas, usePreviewDocument } from './PdfPreview';
import { parsePageSelection } from './merge';

export default function IncomingPreview({ item, range }) {
  const preview = usePreviewDocument(item.bytes);
  const grid = useRef(null);
  const viewer = useRef(null);
  const [inspected, setInspected] = useState(null);
  let indices;
  try { indices = parsePageSelection(range, item.count); }
  catch (cause) { return <p className="muted">Preview unavailable until the page selection is valid: {cause.message}</p>; }
  const active = inspected !== null && indices.includes(inspected) ? inspected : null;
  return <div className="incoming-preview" role="group" aria-label={`Merge preview for ${item.name}`}>
    <p className="preview-selection-count">{indices.length} {indices.length === 1 ? 'page' : 'pages'} selected · Click a preview to inspect it.</p>
    {preview.error ? <p className="error">Could not render preview: {preview.error}</p> : preview.pdf ? <>
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
